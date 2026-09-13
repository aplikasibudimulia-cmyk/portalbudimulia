import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import KartuPelajarCard, { formatAlamatLengkap, formatIndonesianDate } from './KartuPelajarCard'
import { exportCardAsImage, exportCardAsPdf } from '../utils/kartuPelajarExporter'
import { Capacitor } from '@capacitor/core'
import { splitAlamatAndRtRw, combineAlamatAndRtRw } from '../utils/studentExcelHelper'

// Helper format nomor telepon ke 62...
const formatPhoneNumber = (phone) => {
  if (!phone) return ''
  let clean = String(phone).replace(/\D/g, '')
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1)
  } else if (clean.startsWith('8')) {
    clean = '628' + clean.slice(1)
  }
  return clean
}

/**
 * Memeriksa kelengkapan 13 data wajib untuk kartu pelajar digital:
 * 1. Nama
 * 2. Tempat Lahir
 * 3. Tanggal Lahir
 * 4. Jenis Kelamin ('L' / 'P')
 * 5. Alamat (Jalan / Rumah)
 * 6. RT
 * 7. RW
 * 8. Kelurahan
 * 9. Kecamatan
 * 10. Kota/Kabupaten
 * 11. Nomor HP / WhatsApp Siswa
 * 12. Nomor Orang Tua (minimal 1 kontak orang tua/wali valid)
 * 13. Tinggal Bersama Siapa (Kedua Orang Tua, Ayah, Ibu, Wali, Lainnya)
 */
export const auditStudentCompleteness = (student) => {
  if (!student) {
    return {
      isComplete: false,
      completedCount: 0,
      totalCount: 13,
      percent: 0,
      checklist: [],
      missingList: [],
      initialValues: {}
    }
  }

  // 1. Nama
  const nama = String(student.nama_lengkap || student.nama || '').trim()
  const hasNama = Boolean(nama && nama !== '-')

  // 2. Tempat Lahir
  const tempatLahir = String(student.tempat_lahir || '').trim()
  const hasTempatLahir = Boolean(tempatLahir && tempatLahir !== '-')

  // 3. Tanggal Lahir
  let tanggalLahir = ''
  if (student.tanggal_lahir) {
    try {
      const d = new Date(student.tanggal_lahir)
      if (!isNaN(d.getTime())) {
        tanggalLahir = d.toISOString().split('T')[0]
      }
    } catch {
      tanggalLahir = ''
    }
  }
  const hasTanggalLahir = Boolean(tanggalLahir)

  // 4. Jenis Kelamin
  const rawJk = String(student.jenis_kelamin || student.gender || '').trim().toUpperCase()
  const jk = rawJk.startsWith('L') ? 'L' : rawJk.startsWith('P') ? 'P' : ''
  const hasJenisKelamin = Boolean(jk)

  // 5. Alamat (Jalan / Rumah)
  const { jalan, rtRw } = splitAlamatAndRtRw(student.alamat, student.rt_rw)
  const hasAlamat = Boolean(jalan && jalan.trim() !== '' && jalan !== '-')

  // 6 & 7. RT dan RW
  let rtVal = ''
  let rwVal = ''
  if (student.rt && String(student.rt).trim() && student.rt !== '-') {
    rtVal = String(student.rt).trim()
  }
  if (student.rw && String(student.rw).trim() && student.rw !== '-') {
    rwVal = String(student.rw).trim()
  }
  if (!rtVal || !rwVal) {
    const rawSearch = `${rtRw || ''} ${student.alamat || ''}`
    const rtMatch = rawSearch.match(/(?:RT[\/\.]?RW|RT)[\s\.:]*(\d+)/i) || rawSearch.match(/\b(\d{1,3})\s*[\/\-]\s*\d{1,3}\b/)
    if (rtMatch && !rtVal) rtVal = rtMatch[1]
    const rwMatch = rawSearch.match(/RW[\s\.:]*(\d+)/i) || rawSearch.match(/\b\d{1,3}\s*[\/\-]\s*(\d{1,3})\b/)
    if (rwMatch && !rwVal) rwVal = rwMatch[1]
  }
  const hasRt = Boolean(rtVal && rtVal !== '-')
  const hasRw = Boolean(rwVal && rwVal !== '-')

  // 8. Kelurahan
  const kelurahan = String(student.kelurahan || '').trim()
  const hasKelurahan = Boolean(kelurahan && kelurahan !== '-')

  // 9. Kecamatan
  const kecamatan = String(student.kecamatan || '').trim()
  const hasKecamatan = Boolean(kecamatan && kecamatan !== '-')

  // 10. Kota / Kabupaten
  const kota = String(student.kota || '').trim()
  const hasKota = Boolean(kota && kota !== '-')

  // 11. Nomor Orang Tua
  // 11. Nomor HP Siswa (Wajib diisi)
  const studentPhone = String(student.no_whatsapp || student.no_hp || '').trim()
  const cleanStudentDigits = studentPhone.replace(/\D/g, '')
  const hasStudentPhone = Boolean(cleanStudentDigits.length >= 7)

  // 12. Nomor Orang Tua
  let parentPhone = ''
  let parentTag = 'Ayah'
  let parentNama = ''
  if (Array.isArray(student.kontak_ortu) && student.kontak_ortu.length > 0) {
    const valid = student.kontak_ortu.find(k => k && k.nomor && String(k.nomor).replace(/\D/g, '').length >= 7)
    if (valid) {
      parentPhone = valid.nomor
      parentTag = valid.tag || 'Ayah'
      parentNama = valid.nama || ''
    }
  }
  if (!parentPhone && student.no_hp_ortu && String(student.no_hp_ortu).replace(/\D/g, '').length >= 7) {
    parentPhone = student.no_hp_ortu
    parentTag = 'Orang Tua'
    parentNama = student.nama_ortu || ''
  }
  const hasKontakOrtu = Boolean(parentPhone)

  // 13. Tinggal Bersama
  const tinggalBersama = String(student.tinggal_bersama || '').trim()
  const hasTinggalBersama = Boolean(tinggalBersama && tinggalBersama !== '-')

  const checklist = [
    { key: 'nama_lengkap', label: 'Nama Lengkap', isComplete: hasNama, value: nama },
    { key: 'tempat_lahir', label: 'Tempat Lahir', isComplete: hasTempatLahir, value: tempatLahir },
    { key: 'tanggal_lahir', label: 'Tanggal Lahir', isComplete: hasTanggalLahir, value: tanggalLahir },
    { key: 'jenis_kelamin', label: 'Jenis Kelamin', isComplete: hasJenisKelamin, value: jk === 'L' ? 'Laki-laki (L)' : jk === 'P' ? 'Perempuan (P)' : '' },
    { key: 'alamat', label: 'Alamat (Jalan / Rumah)', isComplete: hasAlamat, value: jalan },
    { key: 'rt', label: 'RT', isComplete: hasRt, value: rtVal },
    { key: 'rw', label: 'RW', isComplete: hasRw, value: rwVal },
    { key: 'kelurahan', label: 'Kelurahan / Desa', isComplete: hasKelurahan, value: kelurahan },
    { key: 'kecamatan', label: 'Kecamatan', isComplete: hasKecamatan, value: kecamatan },
    { key: 'kota', label: 'Kota / Kabupaten', isComplete: hasKota, value: kota },
    { key: 'no_whatsapp', label: 'Nomor HP / WA Siswa', isComplete: hasStudentPhone, value: studentPhone },
    { key: 'kontak_ortu', label: 'Nomor HP Orang Tua/Wali', isComplete: hasKontakOrtu, value: parentPhone },
    { key: 'tinggal_bersama', label: 'Tinggal Bersama Siapa', isComplete: hasTinggalBersama, value: tinggalBersama }
  ]

  const completedCount = checklist.filter(i => i.isComplete).length
  const totalCount = checklist.length
  const isComplete = completedCount === totalCount
  const percent = Math.round((completedCount / totalCount) * 100)
  const missingList = checklist.filter(i => !i.isComplete)

  // Parsing tinggal bersama dropdown & custom text
  let initialTinggalDropdown = 'Kedua Orang Tua'
  let initialTinggalCustom = ''
  if (hasTinggalBersama) {
    if (['Kedua Orang Tua', 'Ayah', 'Ibu', 'Wali'].includes(tinggalBersama)) {
      initialTinggalDropdown = tinggalBersama
    } else if (tinggalBersama.startsWith('Lainnya:')) {
      initialTinggalDropdown = 'Lainnya'
      initialTinggalCustom = tinggalBersama.replace(/^Lainnya:\s*/, '').trim()
    } else {
      initialTinggalDropdown = 'Lainnya'
      initialTinggalCustom = tinggalBersama
    }
  }

  return {
    isComplete,
    completedCount,
    totalCount,
    percent,
    checklist,
    missingList,
    initialValues: {
      nama_lengkap: nama,
      tempat_lahir: tempatLahir,
      tanggal_lahir: tanggalLahir,
      jenis_kelamin: jk,
      alamat: jalan,
      rt: rtVal,
      rw: rwVal,
      kelurahan: kelurahan,
      kecamatan: kecamatan,
      kota: kota,
      no_whatsapp: studentPhone,
      parent_tag: parentTag,
      parent_nama: parentNama,
      parent_phone: parentPhone,
      tinggal_dropdown: initialTinggalDropdown,
      tinggal_custom: initialTinggalCustom
    }
  }
}

export const CARD_SETTINGS_STORAGE_KEY = 'ebm_kartu_pelajar_settings_cache'

export const DEFAULT_CARD_SETTINGS = {
  kartu_nama_sekolah: 'SMP BUDI MULIA',
  kartu_npsn_sekolah: '20106353',
  kartu_instansi_sekolah: 'YAYASAN BUDI MULIA LOURDES',
  kartu_akreditasi: 'TERAKREDITASI ',
  kartu_judul: 'KARTU PELAJAR',
  kartu_subjudul: 'SMP Budi Mulia Jakarta',
  kartu_alamat_sekolah: 'Jl. Mangga Besar Raya No. 135, RT.3/RW.1, Mangga Dua Selatan, Kecamatan Sawah Besar, Kota Jakarta Pusat, DKI Jakarta 10730',
  kartu_nama_kepsek: 'Septian Ruswadi, S.Pd',
  kartu_nip_kepsek: '-',
  kartu_jabatan_kepsek: 'Kepala Sekolah',
  kartu_tema_warna: 'budi_mulia_resmi',
  kartu_logo_url: '/logo_budimulia.png',
  kartu_tanggal_terbit: 'Jakarta, 1 Juli 2026',
  kartu_web_sekolah: 'smpbudimuliajakarta.sch.id',
  kartu_masa_berlaku: '',
  kartu_badge_teks: '#CERDAS BERKUALITAS!',
  kartu_footer_teks: 'KARTU IDENTITAS RESMI SISWA • SMP BUDI MULIA JAKARTA',
  kartu_visi_sekolah: 'Terwujudnya Murid yang Unggul, Memiliki Kecerdasan Holistik, Berkarakter Mandiri, Inovatif, serta Berwawasan Global yang Berpijak pada Nilai-Nilai Budi Mulia.',
  kartu_misi_sekolah: `1. Menanamkan keimanan, ketakwaan, dan budi pekerti luhur melalui pembiasaan dan pengamalan nilai-nilai keagamaan.
2. Menyelenggarakan proses pembelajaran yang aktif, inovatif, kreatif, efektif, menyenangkan, dan berbasis teknologi.
3. Mengembangkan potensi bakat, minat, dan prestasi peserta didik secara optimal di bidang akademik maupun non-akademik.
4. Menumbuhkan budaya disiplin, cinta tanah air, kepedulian sosial, serta kelestarian lingkungan hidup.`,
  kartu_ttd_url: '',
  kartu_ttd_size: 114,
  kartu_ttd_x: 18,
  kartu_ttd_y: 1,
  kartu_ttd_rotate: 0,
  kartu_cap_url: '',
  kartu_cap_size: 118,
  kartu_cap_x: 22,
  kartu_cap_y: 3,
  kartu_cap_rotate: 0,
  kartu_cap_opacity: 95,
  kartu_bg_logo_size: 100,
  kartu_bg_logo_x: -8,
  kartu_bg_logo_y: 0,
  kartu_bg_logo_opacity: 8,
  kartu_glossy_effect: false,
  kartu_foto_x: -11,
  kartu_foto_y: 3,
  kartu_foto_size: 100,
  kartu_foto_rotate: 0,
  kartu_qr_x: -1,
  kartu_qr_y: 167,
  kartu_qr_size: 146,
  kartu_qr_rotate: 0,
  kartu_barcode_x: -11,
  kartu_barcode_y: -199,
  kartu_barcode_size: 99,
  kartu_barcode_rotate: 0,
  kartu_barcode_width: 355,
  kartu_biodata_x: -9,
  kartu_biodata_y: -17,
  kartu_biodata_size: 100,
  kartu_biodata_width: 340,
  kartu_biodata_label_width: 86,
  kartu_biodata_font_size: 10.5,
  kartu_badge_x: -12,
  kartu_badge_y: 3,
  kartu_badge_size: 100,
  kartu_header_logo_x: 12,
  kartu_header_logo_y: 4,
  kartu_header_logo_size: 88,
  kartu_header_title_x: 9,
  kartu_header_title_y: -5,
  kartu_header_title_size: 123,
  kartu_kepsek_x: 8,
  kartu_kepsek_y: 4,
  kartu_kepsek_size: 108,
  kartu_code_display: 'both',
  kartu_custom_components: '[]',
  kartu_belakang_teks: `1. Kartu ini adalah tanda pengenal sah siswa SMP Budi Mulia Jakarta.
2. Wajib dibawa saat berada di lingkungan sekolah dan kegiatan resmi.
3. Kartu ini tidak dapat dipindahtangankan kepada orang lain.
4. Apabila kartu ini hilang atau rusak, segera lapor ke bagian Tata Usaha / Kesiswaan.
5. Jika menemukan kartu ini, mohon kembalikan ke alamat sekolah di bawah ini.`
}

export default function SiswaKartuPelajarSection({ studentData, photoUrls = [], onUpdateStudentData }) {
  // Status apakah pengaturan sudah dimuat (dari cache lokal instan atau Supabase)
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(() => {
    try {
      const cached = localStorage.getItem(CARD_SETTINGS_STORAGE_KEY)
      if (cached) return true
    } catch {}
    return false
  })

  // Pengaturan Tampilan Kartu Pelajar dari Admin (dengan cache lokal instan)
  const [settings, setSettings] = useState(() => {
    try {
      const cached = localStorage.getItem(CARD_SETTINGS_STORAGE_KEY)
      if (cached) {
        return { ...DEFAULT_CARD_SETTINGS, ...JSON.parse(cached) }
      }
    } catch {}
    return DEFAULT_CARD_SETTINGS
  })

  // Responsive scale untuk kartu preview agar pas sempurna di layar HP / Desktop
  const [cardScale, setCardScale] = useState(() => {
    if (typeof window !== 'undefined') {
      const w = window.innerWidth
      if (w < 380) return 0.62
      if (w < 480) return 0.70
      if (w < 640) return 0.80
    }
    return 1
  })

  useEffect(() => {
    const updateScale = () => {
      const w = window.innerWidth
      if (w < 380) setCardScale(0.62)
      else if (w < 480) setCardScale(0.70)
      else if (w < 640) setCardScale(0.80)
      else setCardScale(1)
    }
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])
  const [currentSide, setCurrentSide] = useState('front') // 'front' | 'back'
  const [isFlipping, setIsFlipping] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadMessage, setDownloadMessage] = useState(null)

  // Mode Edit / Form Kelengkapan Data
  const [isEditingData, setIsEditingData] = useState(false)
  const [isSavingForm, setIsSavingForm] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccessMessage, setFormSuccessMessage] = useState('')
  const [showConfirmLockModal, setShowConfirmLockModal] = useState(false)
  const [showAdminContactModal, setShowAdminContactModal] = useState(false)
  const [highlightedField, setHighlightedField] = useState(null)
  const highlightTimeoutRef = useRef(null)

  // Scroll otomatis dan highlight kolom form saat item checklist diklik
  const scrollToField = useCallback((fieldKey) => {
    const fieldIdMap = {
      nama_lengkap: 'input-siswa-nama_lengkap',
      tempat_lahir: 'input-siswa-tempat_lahir',
      tanggal_lahir: 'input-siswa-tanggal_lahir',
      jenis_kelamin: 'input-siswa-jenis_kelamin',
      alamat: 'input-siswa-alamat',
      rt: 'input-siswa-rt',
      rw: 'input-siswa-rw',
      kelurahan: 'input-siswa-kelurahan',
      kecamatan: 'input-siswa-kecamatan',
      kota: 'input-siswa-kota',
      no_whatsapp: 'input-siswa-no_whatsapp',
      kontak_ortu: 'input-siswa-parent_phone',
      tinggal_bersama: 'input-siswa-tinggal_dropdown'
    }

    const targetId = fieldIdMap[fieldKey] || `input-siswa-${fieldKey}`
    const el = document.getElementById(targetId)

    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })

      setTimeout(() => {
        try {
          if (typeof el.focus === 'function') {
            el.focus({ preventScroll: true })
          }
        } catch (err) {
          // ignore focus errors on container elements
        }
      }, 300)

      setHighlightedField(fieldKey)
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current)
      }
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightedField(null)
      }, 2500)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current)
      }
    }
  }, [])

  const frontCardRef = useRef(null)
  const backCardRef = useRef(null)

  // State data siswa terkini langsung dari tabel database siswa_permanent
  const [liveStudent, setLiveStudent] = useState(studentData)

  useEffect(() => {
    setLiveStudent(studentData)
  }, [studentData])

  const activeStudent = liveStudent || studentData

  // Inisialisasi draft dari sessionStorage agar data ketikan tidak pernah hilang jika ada render ulang
  const getDraftKey = (nisn) => `draft_kartu_pelajar_${nisn || 'anonymous'}`

  // Hitung status kelengkapan data berdasarkan activeStudent terkini
  const audit = useMemo(() => auditStudentCompleteness(activeStudent), [activeStudent])

  // Data biodata terkunci jika sudah lengkap tersimpan di sistem
  const isLocked = audit.isComplete

  // Helper styling untuk kolom form: jika locked maka abu-abu non-edit, jika belum terisi highlight merah, dan efek glow saat diklik dari checklist
  const getFieldHighlightClass = (fieldKey, isEmpty) => {
    if (isLocked) {
      return 'border-slate-200 bg-slate-100/80 text-slate-700 cursor-not-allowed select-none'
    }
    if (highlightedField === fieldKey) {
      return 'border-rose-500 ring-4 ring-rose-400/80 bg-rose-50/40 animate-pulse shadow-sm'
    }
    if (isEmpty) {
      return 'border-rose-300 bg-rose-50/25 placeholder-rose-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-200'
    }
    return 'border-slate-300 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
  }

  const isDirtyRef = useRef(false)
  const currentNisnRef = useRef(activeStudent?.nisn)
  const modalScrollRef = useRef(null)

  // Otomatis reset posisi scroll modal ke paling atas saat modal konfirmasi dibuka
  useEffect(() => {
    if (showConfirmLockModal) {
      if (modalScrollRef.current) {
        modalScrollRef.current.scrollTop = 0
      }
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = originalOverflow
      }
    }
  }, [showConfirmLockModal])

  // Ambil biodata siswa terbaru dari database secara live untuk memastikan kelengkapan data akurat
  const fetchFreshStudent = useCallback(async (forceUpdateParent = false) => {
    const nisn = studentData?.nisn
    if (!nisn) return
    try {
      const { data: fresh, error } = await supabase
        .from('siswa_permanent')
        .select('*')
        .eq('nisn', nisn)
        .maybeSingle()

      if (error) {
        console.warn('Gagal memuat biodata siswa terbaru:', error)
      } else if (fresh) {
        // Ambil data fresh dari database. Jika di database nilainya null / kosong (karena dihapus admin),
        // pastikan nilainya benar-benar terhapus di aplikasi siswa!
        const updated = {
          ...studentData,
          ...fresh,
          alamat: fresh.alamat || '',
          rt: fresh.rt || '',
          rw: fresh.rw || '',
          rt_rw: fresh.rt_rw || '',
          kelurahan: fresh.kelurahan || '',
          kecamatan: fresh.kecamatan || '',
          kota: fresh.kota || '',
          tempat_lahir: fresh.tempat_lahir || '',
          tanggal_lahir: fresh.tanggal_lahir || '',
          jenis_kelamin: fresh.jenis_kelamin || '',
          kontak_ortu: fresh.kontak_ortu || [],
          no_hp_ortu: fresh.no_hp_ortu || '',
          nama_ortu: fresh.nama_ortu || '',
          no_whatsapp: fresh.no_whatsapp || fresh.no_hp || '',
          no_hp: fresh.no_hp || fresh.no_whatsapp || '',
          tinggal_bersama: fresh.tinggal_bersama || ''
        }
        setLiveStudent(prev => {
          if (!prev) return updated
          if (JSON.stringify(prev) === JSON.stringify(updated)) return prev
          return updated
        })

        // Bandingkan apakah data benar-benar berbeda dari studentData saat ini sebelum trigger update ke parent
        const isDifferent = Object.keys(fresh).some(k => {
          if (typeof fresh[k] === 'object') return JSON.stringify(fresh[k]) !== JSON.stringify(studentData?.[k])
          return fresh[k] !== studentData?.[k]
        })

        if (isDifferent || forceUpdateParent) {
          onUpdateStudentData?.(updated)
        }

        // Jika data yang baru diambil belum lengkap, bersihkan draft lokal lama agar form menampilkan kolom kosong
        const freshAudit = auditStudentCompleteness(updated)
        if (!freshAudit.isComplete) {
          isDirtyRef.current = false
          try {
            sessionStorage.removeItem(getDraftKey(nisn))
          } catch {}
          if (freshAudit.initialValues) {
            setFormData(prev => {
              const diff = Object.keys(freshAudit.initialValues).some(k => prev[k] !== freshAudit.initialValues[k])
              return diff ? { ...prev, ...freshAudit.initialValues } : prev
            })
          }
        }
      } else {
        // Data siswa telah dihapus dari tabel siswa_permanent oleh admin!
        // Langsung kosongkan data wajib agar kartu terkunci dan menampilkan form
        const cleared = {
          ...studentData,
          alamat: '',
          rt: '',
          rw: '',
          rt_rw: '',
          kelurahan: '',
          kecamatan: '',
          kota: '',
          tempat_lahir: '',
          tanggal_lahir: '',
          kontak_ortu: [],
          no_hp_ortu: '',
          nama_ortu: '',
          no_whatsapp: '',
          no_hp: '',
          tinggal_bersama: ''
        }
        setLiveStudent(cleared)
        onUpdateStudentData?.(cleared)
        isDirtyRef.current = false
        try {
          sessionStorage.removeItem(getDraftKey(nisn))
        } catch {}
        const clearedAudit = auditStudentCompleteness(cleared)
        if (clearedAudit.initialValues) {
          setFormData(clearedAudit.initialValues)
        }
      }
    } catch (e) {
      console.warn('Error fetchFreshStudent:', e)
    }
  }, [studentData?.nisn])

  useEffect(() => {
    // Hanya fetch saat mount jika data siswa belum memiliki biodata
    // Jika data sudah dimuat oleh Dashboard init, hindari query duplikat yang memperlambat reload
    const hasExistingData = studentData?.alamat || (Array.isArray(studentData?.kontak_ortu) && studentData.kontak_ortu.length > 0)
    if (!hasExistingData) {
      fetchFreshStudent()
    }
  }, [fetchFreshStudent])

  // Realtime subscription agar saat admin mengedit atau menghapus di Admin, HP siswa langsung terkunci otomatis!
  useEffect(() => {
    const nisn = studentData?.nisn
    if (!nisn) return

    const channel = supabase
      .channel(`realtime_siswa_permanent_kartu_${nisn}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'siswa_permanent',
        filter: `nisn=eq.${nisn}`
      }, (payload) => {
        console.log('[Realtime Siswa Kartu] Perubahan biodata terdeteksi:', payload.eventType)
        fetchFreshStudent(true)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [studentData?.nisn, fetchFreshStudent])

  const [formData, setFormData] = useState(() => {
    const draftKey = getDraftKey(studentData?.nisn)
    try {
      const savedDraft = sessionStorage.getItem(draftKey)
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft)
        if (parsed && typeof parsed === 'object') {
          isDirtyRef.current = true
          return {
            nama_lengkap: '',
            tempat_lahir: '',
            tanggal_lahir: '',
            jenis_kelamin: '',
            alamat: '',
            rt: '',
            rw: '',
            kelurahan: '',
            kecamatan: '',
            kota: '',
            no_whatsapp: '',
            parent_tag: 'Ayah',
            parent_nama: '',
            parent_phone: '',
            tinggal_dropdown: 'Kedua Orang Tua',
            tinggal_custom: '',
            ...(audit.initialValues || {}),
            ...parsed
          }
        }
      }
    } catch {}
    return {
      nama_lengkap: '',
      tempat_lahir: '',
      tanggal_lahir: '',
      jenis_kelamin: '',
      alamat: '',
      rt: '',
      rw: '',
      kelurahan: '',
      kecamatan: '',
      kota: '',
      no_whatsapp: '',
      parent_tag: 'Ayah',
      parent_nama: '',
      parent_phone: '',
      tinggal_dropdown: 'Kedua Orang Tua',
      tinggal_custom: '',
      ...(audit.initialValues || {})
    }
  })

  // Sinkronisasi data awal HANYA jika akun berganti NISN atau user belum mengetik apapun
  useEffect(() => {
    if (activeStudent?.nisn && activeStudent.nisn !== currentNisnRef.current) {
      currentNisnRef.current = activeStudent.nisn
      isDirtyRef.current = false
      const draftKey = getDraftKey(activeStudent.nisn)
      try {
        sessionStorage.removeItem(draftKey)
      } catch {}
      if (audit.initialValues) {
        setFormData(audit.initialValues)
      }
    } else if (!isDirtyRef.current && audit.initialValues) {
      setFormData(prev => {
        const needsUpdate = Object.keys(audit.initialValues).some(k => !prev[k] && audit.initialValues[k])
        if (!needsUpdate) return prev
        return {
          ...audit.initialValues,
          ...prev
        }
      })
    }
  }, [activeStudent?.nisn])

  const handleFieldChange = (key, value) => {
    isDirtyRef.current = true
    setFormData(prev => {
      const next = { ...prev, [key]: value }
      try {
        sessionStorage.setItem(getDraftKey(activeStudent?.nisn), JSON.stringify(next))
      } catch {}
      return next
    })
  }

  // Fetch pengaturan kartu sekolah
  useEffect(() => {
    let isMounted = true
    const fetchSettings = async () => {
      try {
        const { data } = await supabase
          .from('pengaturan_sekolah')
          .select('setting_key, setting_value')
          .like('setting_key', 'kartu_%')

        if (!isMounted) return

        if (data && data.length > 0) {
          setSettings(prev => {
            const next = { ...prev }
            data.forEach(item => {
              next[item.setting_key] = item.setting_value
            })
            if (!next.kartu_tema_warna || next.kartu_tema_warna !== 'budi_mulia_resmi') {
              next.kartu_tema_warna = 'budi_mulia_resmi'
            }
            if (!next.kartu_logo_url || next.kartu_logo_url === '/logo.png') {
              next.kartu_logo_url = '/logo_budimulia.png'
            }
            if (!next.kartu_alamat_sekolah || next.kartu_alamat_sekolah.includes('Jl. Mangga Besar No. 2M')) {
              next.kartu_alamat_sekolah = 'Jl. Mangga Besar Raya No. 135, RT.3/RW.1, Mangga Dua Selatan, Kecamatan Sawah Besar, Kota Jakarta Pusat, DKI Jakarta 10730'
            }
            if (!next.kartu_tanggal_terbit || next.kartu_tanggal_terbit.includes('15 Juli 2025')) {
              next.kartu_tanggal_terbit = 'Jakarta, 1 Juli 2026'
            }
            if (!next.kartu_web_sekolah || next.kartu_web_sekolah.includes('ebudimulia.com')) {
              next.kartu_web_sekolah = 'smpbudimuliajakarta.sch.id'
            }
            if (!next.kartu_npsn_sekolah || next.kartu_npsn_sekolah === '20100223') {
              next.kartu_npsn_sekolah = '20106353'
            }
            try {
              localStorage.setItem(CARD_SETTINGS_STORAGE_KEY, JSON.stringify(next))
            } catch {}
            return next
          })
          setIsSettingsLoaded(true)
        } else {
          setIsSettingsLoaded(true)
        }
      } catch (err) {
        console.warn('Gagal memuat pengaturan kartu pelajar:', err)
        if (isMounted) setIsSettingsLoaded(true)
      }
    }
    fetchSettings()
    return () => {
      isMounted = false
    }
  }, [])

  const handleFlip = () => {
    setIsFlipping(true)
    setTimeout(() => {
      setCurrentSide(prev => (prev === 'front' ? 'back' : 'front'))
      setIsFlipping(false)
    }, 150)
  }

  // Resolusi Foto Siswa
  const photoUrl = (photoUrls && photoUrls.length > 0) ? photoUrls[0] : null

  // Unduh PDF
  const handleDownloadPdf = async () => {
    setIsDownloading(true)
    setDownloadMessage('Menyiapkan file PDF kartu pelajar...')
    try {
      const fileName = `kartu_pelajar_${activeStudent?.nisn || 'siswa'}.pdf`
      await exportCardAsPdf(frontCardRef.current, backCardRef.current, fileName)
      setDownloadMessage('Berhasil mengunduh PDF!')
    } catch (err) {
      console.error(err)
      setDownloadMessage('Gagal mengunduh PDF. Silakan coba lagi.')
    } finally {
      setIsDownloading(false)
      setTimeout(() => setDownloadMessage(null), 3000)
    }
  }

  // Unduh Gambar PNG
  const handleDownloadImage = async () => {
    setIsDownloading(true)
    setDownloadMessage(`Menyiapkan gambar kartu sisi ${currentSide === 'front' ? 'depan' : 'belakang'}...`)
    try {
      const targetElem = currentSide === 'front' ? frontCardRef.current : backCardRef.current
      const fileName = `kartu_pelajar_${activeStudent?.nisn || 'siswa'}_${currentSide}.png`
      await exportCardAsImage(targetElem, fileName)
      setDownloadMessage('Berhasil mengunduh gambar!')
    } catch (err) {
      console.error(err)
      setDownloadMessage('Gagal mengunduh gambar. Silakan coba lagi.')
    } finally {
      setIsDownloading(false)
      setTimeout(() => setDownloadMessage(null), 3000)
    }
  }

  // Cetak Langsung (Web: window.print(), Android/iOS: export PDF & buka dialog Cetak/Share sistem)
  const handlePrint = async () => {
    if (Capacitor.isNativePlatform()) {
      setIsDownloading(true)
      setDownloadMessage('Menyiapkan kartu pelajar untuk dicetak...')
      try {
        const fileName = `cetak_kartu_pelajar_${activeStudent?.nisn || 'siswa'}.pdf`
        await exportCardAsPdf(frontCardRef.current, backCardRef.current, fileName)
      } catch (err) {
        console.error(err)
        setDownloadMessage('Gagal menyiapkan cetak kartu. Silakan coba lagi.')
      } finally {
        setIsDownloading(false)
        setTimeout(() => setDownloadMessage(null), 3000)
      }
    } else {
      window.print()
    }
  }

  // Validasi form data sebelum membuka modal konfirmasi penguncian
  const validateFormBeforeConfirm = () => {
    setFormError('')
    setFormSuccessMessage('')

    if (!formData.nama_lengkap || !formData.nama_lengkap.trim()) {
      setFormError('Nama Lengkap wajib diisi.')
      scrollToField('nama_lengkap')
      return false
    }
    if (!formData.tempat_lahir || !formData.tempat_lahir.trim()) {
      setFormError('Tempat Lahir wajib diisi.')
      scrollToField('tempat_lahir')
      return false
    }
    if (!formData.tanggal_lahir) {
      setFormError('Tanggal Lahir wajib dipilih.')
      scrollToField('tanggal_lahir')
      return false
    }
    if (!formData.jenis_kelamin) {
      setFormError('Jenis Kelamin (Laki-laki / Perempuan) wajib dipilih.')
      scrollToField('jenis_kelamin')
      return false
    }
    if (!formData.alamat || !formData.alamat.trim()) {
      setFormError('Alamat (Nama Jalan / Rumah) wajib diisi.')
      scrollToField('alamat')
      return false
    }
    if (!formData.rt || !String(formData.rt).trim()) {
      setFormError('RT wajib diisi.')
      scrollToField('rt')
      return false
    }
    if (!formData.rw || !String(formData.rw).trim()) {
      setFormError('RW wajib diisi.')
      scrollToField('rw')
      return false
    }
    if (!formData.kelurahan || !formData.kelurahan.trim()) {
      setFormError('Kelurahan / Desa wajib diisi.')
      scrollToField('kelurahan')
      return false
    }
    if (!formData.kecamatan || !formData.kecamatan.trim()) {
      setFormError('Kecamatan wajib diisi.')
      scrollToField('kecamatan')
      return false
    }
    if (!formData.kota || !formData.kota.trim()) {
      setFormError('Kota / Kabupaten wajib diisi.')
      scrollToField('kota')
      return false
    }
    if (!formData.no_whatsapp || !formData.no_whatsapp.trim()) {
      setFormError('Nomor WhatsApp / HP Siswa wajib diisi.')
      scrollToField('no_whatsapp')
      return false
    }
    const cleanStudentPhone = formatPhoneNumber(formData.no_whatsapp)
    if (cleanStudentPhone.length < 8) {
      setFormError('Nomor WhatsApp / HP Siswa tidak valid (minimal 8 angka).')
      scrollToField('no_whatsapp')
      return false
    }
    if (!formData.parent_phone || !formData.parent_phone.trim()) {
      setFormError('Nomor WhatsApp / HP Orang Tua wajib diisi.')
      scrollToField('kontak_ortu')
      return false
    }
    const cleanParentPhone = formatPhoneNumber(formData.parent_phone)
    if (cleanParentPhone.length < 8) {
      setFormError('Nomor WhatsApp / HP Orang Tua tidak valid (minimal 8 angka).')
      scrollToField('kontak_ortu')
      return false
    }

    if (formData.tinggal_dropdown === 'Lainnya') {
      if (!formData.tinggal_custom || !formData.tinggal_custom.trim()) {
        setFormError('Mohon sebutkan tinggal bersama siapa jika memilih "Lainnya".')
        scrollToField('tinggal_bersama')
        return false
      }
    }

    return true
  }

  // Submit Handler: Validasi lalu buka modal peringatan penguncian data
  const handleSaveCompletenessForm = (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault()
    }
    if (isLocked) {
      setShowAdminContactModal(true)
      return
    }
    if (validateFormBeforeConfirm()) {
      setShowConfirmLockModal(true)
      setTimeout(() => {
        if (modalScrollRef.current) {
          modalScrollRef.current.scrollTop = 0
        }
      }, 20)
    }
  }

  // Eksekusi penyimpanan ke Supabase setelah siswa setuju di modal konfirmasi
  const executeSaveBiodata = async () => {
    setIsSavingForm(true)
    setFormError('')
    setFormSuccessMessage('')

    try {
      const cleanStudentPhone = formatPhoneNumber(formData.no_whatsapp)
      const cleanParentPhone = formatPhoneNumber(formData.parent_phone)
      let finalTinggalBersama = formData.tinggal_dropdown
      if (formData.tinggal_dropdown === 'Lainnya') {
        finalTinggalBersama = `Lainnya: ${formData.tinggal_custom.trim()}`
      }

      // 1. Rangkai Alamat + RT/RW
      const cleanRt = String(formData.rt).trim().padStart(3, '0')
      const cleanRw = String(formData.rw).trim().padStart(3, '0')
      const rtRwCombined = `RT. ${cleanRt}/RW. ${cleanRw}`
      const combinedAlamat = combineAlamatAndRtRw(formData.alamat.trim(), rtRwCombined)

      // 2. Rangkai Kontak Ortu
      const cleanKontakList = [
        {
          tag: formData.parent_tag || 'Ayah',
          nomor: cleanParentPhone,
          nama: formData.parent_nama ? formData.parent_nama.trim() : ''
        }
      ]

      const payload = {
        nama_lengkap: formData.nama_lengkap.trim(),
        tempat_lahir: formData.tempat_lahir.trim(),
        tanggal_lahir: formData.tanggal_lahir,
        jenis_kelamin: formData.jenis_kelamin,
        alamat: combinedAlamat,
        kelurahan: formData.kelurahan.trim(),
        kecamatan: formData.kecamatan.trim(),
        kota: formData.kota.trim(),
        tinggal_bersama: finalTinggalBersama,
        no_whatsapp: cleanStudentPhone,
        no_hp: cleanStudentPhone,
        kontak_ortu: cleanKontakList,
        no_hp_ortu: cleanParentPhone,
        nama_ortu: formData.parent_nama ? formData.parent_nama.trim() : null
      }

      // Update tabel siswa_permanent
      const { error: dbError } = await supabase
        .from('siswa_permanent')
        .update(payload)
        .eq('nisn', activeStudent.nisn)

      if (dbError) {
        throw dbError
      }

      // Jalankan RPC update_kontak_ortu_siswa jika tersedia sebagai fallback sinkronisasi
      try {
        await supabase.rpc('update_kontak_ortu_siswa', {
          p_nisn: String(activeStudent.nisn),
          p_kontak_list: cleanKontakList
        })
      } catch (rpcEx) {
        // Toleransi jika RPC tidak wajib
      }

      // Buat objek siswa yang sudah diperbarui
      const updatedStudent = {
        ...activeStudent,
        ...payload,
        no_whatsapp: cleanStudentPhone,
        no_hp: cleanStudentPhone,
        rt: cleanRt,
        rw: cleanRw,
        rt_rw: rtRwCombined
      }

      setLiveStudent(updatedStudent)

      // Panggil callback agar state di parent (Dashboard) langsung terupdate
      if (typeof onUpdateStudentData === 'function') {
        onUpdateStudentData(updatedStudent)
      }

      // Hapus draft sesi karena data sudah tersimpan di database
      try {
        sessionStorage.removeItem(getDraftKey(activeStudent?.nisn))
      } catch {}
      isDirtyRef.current = false

      setShowConfirmLockModal(false)
      setFormSuccessMessage('Biodata berhasil disimpan & dikunci! Membuka Kartu Pelajar Digital...')
      setTimeout(() => {
        setIsEditingData(false)
        setFormSuccessMessage('')
      }, 1200)

    } catch (err) {
      console.error('Gagal menyimpan biodata kartu pelajar:', err)
      setFormError(err.message || 'Gagal menyimpan biodata. Silakan periksa koneksi internet Anda.')
    } finally {
      setIsSavingForm(false)
    }
  }

  // Komponen Modal Peringatan Kunci & Hubungi Admin (Menggunakan React Portal ke document.body)
  const renderModals = () => {
    if (typeof document === 'undefined') return null

    return createPortal(
      <>
        {/* Modal Peringatan & Konfirmasi Penguncian Biodata (Full Screen 100vw 100vh) */}
        {showConfirmLockModal && (
          <div className="fixed inset-0 z-[99999] bg-slate-900/70 backdrop-blur-sm flex flex-col overflow-hidden animate-fade-in">
            <div className="w-full h-full bg-slate-50 flex flex-col overflow-hidden">
              {/* Top Bar Header */}
              <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 md:px-8 py-3.5 sm:py-4 flex items-center justify-between shadow-xs shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-amber-500/15 border border-amber-300 text-amber-700 flex items-center justify-center text-xl sm:text-2xl shrink-0 shadow-xs">
                    ⚠️
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wide">
                      <span>🔒</span> Perhatian: Penguncian Biodata Siswa
                    </div>
                    <h3 className="text-base sm:text-lg md:text-xl font-black text-slate-800 leading-tight">
                      Simpan & Kunci Data Permanen?
                    </h3>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isSavingForm}
                  onClick={() => setShowConfirmLockModal(false)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span className="hidden sm:inline">Periksa Kembali</span>
                </button>
              </div>

              {/* Main Scrollable Body */}
              <div ref={modalScrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 bg-slate-100/60">
                <div className="max-w-4xl w-full mx-auto space-y-6 pb-6">
                  {/* Warning Card */}
                  <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-rose-50 via-rose-50/80 to-amber-50 border-2 border-rose-200/90 text-rose-900 shadow-sm space-y-2">
                    <div className="flex items-center gap-2 text-rose-700 font-black text-xs sm:text-sm">
                      <div className="w-6 h-6 rounded-lg bg-rose-200/60 flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4 text-rose-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <span>PERINGATAN PENTING PENGUNCIAN DATA:</span>
                    </div>
                    <p className="text-xs sm:text-sm text-rose-900 leading-relaxed font-medium">
                      Ketika Anda menekan tombol <b>Simpan & Kunci Data</b>, seluruh data biodata siswa di bawah ini akan <b>terkunci secara permanen dan hanya bisa dilihat</b>. Jika di kemudian hari Anda ingin mengubah data, Anda <b>harus menghubungi Admin / Tata Usaha Sekolah</b>.
                    </p>
                    <p className="text-[11px] sm:text-xs text-rose-700 italic">
                      *Mohon teliti dan pastikan seluruh ejaan nama, tanggal lahir, dan kontak di bawah ini sudah sesuai dokumen resmi (Akta Kelahiran / KK).
                    </p>
                  </div>

                  {/* Comprehensive Data Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    {/* Card 1: Identitas Pribadi Siswa */}
                    <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-4">
                      <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                        <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm font-bold">
                          1
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-800">Identitas Pribadi Siswa</h4>
                          <p className="text-[11px] text-slate-400">Data resmi siswa sesuai akta / ijazah</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">NISN Siswa</span>
                          <span className="font-mono font-bold text-slate-800 text-sm">{activeStudent?.nisn || formData.nisn || '-'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Jenis Kelamin</span>
                          <span className="font-bold text-slate-800">
                            {formData.jenis_kelamin === 'L' ? '👦 Laki-laki (L)' : formData.jenis_kelamin === 'P' ? '👧 Perempuan (P)' : '-'}
                          </span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Nama Lengkap</span>
                          <span className="font-black text-slate-900 text-sm sm:text-base leading-snug">{formData.nama_lengkap || '-'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Tempat Lahir</span>
                          <span className="font-semibold text-slate-800">{formData.tempat_lahir || '-'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Tanggal Lahir</span>
                          <span className="font-semibold text-slate-800">{formData.tanggal_lahir || '-'}</span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Nomor WhatsApp Siswa</span>
                          <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 inline-block mt-0.5">
                            {formData.no_whatsapp ? `+${formData.no_whatsapp}` : '-'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Card 2: Status Tempat Tinggal & Domisili */}
                    <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-4">
                      <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                        <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm font-bold">
                          2
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-800">Status Tempat Tinggal & Domisili</h4>
                          <p className="text-[11px] text-slate-400">Informasi alamat tempat tinggal saat ini</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                        <div className="sm:col-span-2">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Tinggal Bersama</span>
                          <span className="font-bold text-indigo-800 bg-indigo-50/70 px-2.5 py-1 rounded-lg border border-indigo-100 inline-block mt-0.5">
                            {formData.tinggal_dropdown === 'Lainnya' ? (formData.tinggal_custom || 'Lainnya') : (formData.tinggal_dropdown || '-')}
                          </span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Nama Jalan / Rumah</span>
                          <span className="font-bold text-slate-800 leading-snug">{formData.alamat || '-'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">RT / RW</span>
                          <span className="font-semibold text-slate-800">RT {formData.rt || '-'} / RW {formData.rw || '-'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Kelurahan / Desa</span>
                          <span className="font-semibold text-slate-800">{formData.kelurahan || '-'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Kecamatan</span>
                          <span className="font-semibold text-slate-800">{formData.kecamatan || '-'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Kota / Kabupaten</span>
                          <span className="font-semibold text-slate-800">{formData.kota || '-'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Card 3: Kontak Orang Tua / Wali */}
                    <div className="md:col-span-2 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-4">
                      <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                        <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm font-bold">
                          3
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-800">Kontak Orang Tua / Wali</h4>
                          <p className="text-[11px] text-slate-400">Kontak resmi orang tua untuk komunikasi sekolah</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Peran Kontak</span>
                          <span className="font-bold text-slate-800">{formData.parent_tag || 'Orang Tua'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Nama Orang Tua / Wali</span>
                          <span className="font-bold text-slate-800">{formData.parent_nama || '-'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">No. WhatsApp / Telepon Ortu</span>
                          <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 inline-block mt-0.5">
                            {formData.parent_phone ? `+${formData.parent_phone}` : '-'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Checklist Box */}
                  <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 flex items-start gap-3">
                    <span className="text-lg">ℹ️</span>
                    <div className="text-xs text-indigo-900 space-y-1 leading-relaxed">
                      <p className="font-bold">Pastikan sebelum menekan tombol "Ya, Simpan & Kunci Data":</p>
                      <ul className="list-disc list-inside space-y-0.5 text-indigo-800 text-[11px]">
                        <li>Nama lengkap dan tanggal lahir sudah sesuai dengan Akta Kelahiran atau Kartu Keluarga.</li>
                        <li>Nomor WhatsApp siswa dan orang tua aktif agar tidak tertinggal informasi penting dari sekolah.</li>
                        <li>Setelah tersimpan, kartu pelajar digital Anda akan langsung terbit dan dapat diunduh.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sticky Bottom Action Bar */}
              <div className="sticky bottom-0 z-20 bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-4 sm:px-6 md:px-8 py-3.5 sm:py-4 shadow-lg shrink-0">
                <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
                  <p className="text-[11px] sm:text-xs text-slate-500 text-center sm:text-left leading-tight">
                    🔒 Data akan tersimpan aman dan terkunci permanen di server sekolah.
                  </p>
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                      type="button"
                      disabled={isSavingForm}
                      onClick={() => setShowConfirmLockModal(false)}
                      className="flex-1 sm:flex-initial px-5 py-2.5 rounded-2xl border border-slate-300 bg-white text-slate-700 font-bold text-xs hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-50 cursor-pointer text-center"
                    >
                      Periksa Kembali
                    </button>
                    <button
                      type="button"
                      disabled={isSavingForm}
                      onClick={executeSaveBiodata}
                      className="flex-1 sm:flex-initial px-6 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 active:scale-95 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/30 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {isSavingForm ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span>Menyimpan & Mengunci...</span>
                        </>
                      ) : (
                        <>
                          <span>🔒</span>
                          <span>Ya, Simpan & Kunci Data</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Kontak Admin (Jika Siswa Ingin Mengubah Biodata yang Terkunci) */}
        {showAdminContactModal && (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
            <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-scale-up">
              <div className="p-6 space-y-5 text-center sm:text-left">
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center text-2xl shrink-0">
                    🔒
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-800">
                      Biodata Siswa Terkunci
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Perubahan data hanya dapat dilakukan oleh Admin
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 space-y-2.5 leading-relaxed">
                  <p>
                    Data identitas dan domisili Anda telah disimpan dan <b>terkunci secara resmi</b> demi keabsahan kartu pelajar dan administrasi sekolah.
                  </p>
                  <p>
                    Jika Anda ingin memperbarui data (seperti perbaikan nama, tempat/tanggal lahir, alamat domisili, atau nomor kontak), silakan:
                  </p>
                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2 text-slate-700 font-medium">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🏫</span>
                      <span>Hubungi <b>Petugas Tata Usaha (TU)</b> Sekolah</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-base">👨‍🏫</span>
                      <span>Atau beritahukan kepada <b>Wali Kelas</b> Anda</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAdminContactModal(false)}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs transition-all shadow-sm cursor-pointer"
                  >
                    Saya Mengerti
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </>,
      document.body
    )
  }

  const alamatTeks = formatAlamatLengkap(activeStudent)

  // =========================================================================
  // VIEW A: JIKA DATA BELUM LENGKAP (ATAU SEDANG DALAM MODE EDIT DATA)
  // Menampilkan instruksi ramah + form pengisian data langsung
  // =========================================================================
  if (!audit.isComplete || isEditingData) {
    return (
      <div className="animate-slide-up space-y-6 w-full pb-12">
        {/* Banner Status Kelengkapan Data / Terkunci */}
        {isLocked ? (
          <div className="bg-gradient-to-r from-amber-50/90 via-orange-50/60 to-amber-50/90 rounded-2xl shadow-sm border border-amber-200 p-6 md:p-7 relative overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold shadow-2xs">
                  <span>🔒</span>
                  <span>Data Terkunci (Mode Hanya Dilihat)</span>
                </div>
                <h1 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">
                  Biodata Siswa Resmi
                </h1>
                <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">
                  Data biodata ini telah tersimpan dan <b>terkunci secara resmi</b> demi keabsahan kartu pelajar dan dokumen sekolah. Anda hanya dapat melihat data. Apabila terdapat perubahan data, Anda <b>harus menghubungi Admin / Tata Usaha Sekolah</b>.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAdminContactModal(true)}
                  className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span>Hubungi Admin</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingData(false)}
                  className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 active:scale-95 text-slate-700 border border-slate-300 font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                >
                  <span>Kembali ke Kartu Pelajar</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-7 relative overflow-hidden">
            <div className="absolute -right-8 -top-8 w-44 h-44 bg-amber-50 rounded-full blur-2xl pointer-events-none" />

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold mb-3 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  Perhatian: Data Identitas Belum Lengkap
                </div>
                <h1 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">
                  Lengkapi Biodata untuk Menampilkan Kartu
                </h1>
                <p className="text-sm text-slate-600 mt-2 max-w-2xl leading-relaxed">
                  Sesuai dengan ketentuan resmi sekolah, Kartu Pelajar Digital hanya dapat diterbitkan dan diunduh setelah biodata diri, alamat domisili lengkap, kontak orang tua, dan status tempat tinggal telah terisi 100%.
                </p>
              </div>

              {/* Progress Bar Widget */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4.5 min-w-[240px] shrink-0 shadow-xs">
                <div className="flex items-center justify-between text-xs font-bold mb-2">
                  <span className="text-slate-500 uppercase tracking-wider text-[11px]">Kelengkapan Data</span>
                  <span className="text-sm text-amber-600">
                    {audit.completedCount} / {audit.totalCount} ({audit.percent}%)
                  </span>
                </div>
                <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                  <div 
                    className="h-full transition-all duration-500 rounded-full bg-gradient-to-r from-amber-500 to-orange-500"
                    style={{ width: `${audit.percent}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  {audit.missingList.length} data masih perlu dilengkapi
                </p>
              </div>
            </div>

            {/* Checklist Tag List */}
            <div className="mt-6 pt-6 border-t border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Daftar Pengecekan Data Wajib:
                </span>
                <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                  <span>💡</span> Klik item merah untuk langsung menuju kolom pengisian
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {audit.checklist.map((item) => (
                  <button
                    type="button"
                    key={item.key}
                    onClick={() => scrollToField(item.key)}
                    title={`Klik untuk menuju ke pengisian ${item.label}`}
                    className={`group flex items-center justify-between gap-2 p-2.5 rounded-xl border text-xs text-left transition-all duration-200 cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-[0.98] ${
                      item.isComplete
                        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800 hover:bg-emerald-100/70 hover:border-emerald-300'
                        : 'bg-rose-50 border-rose-300 text-rose-800 font-semibold hover:bg-rose-100 hover:border-rose-400 shadow-xs ring-1 ring-rose-200/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {item.isComplete ? (
                        <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-rose-500 shrink-0 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                      <span className="truncate">{item.label}</span>
                    </div>
                    {!item.isComplete && (
                      <svg className="w-3.5 h-3.5 text-rose-400 group-hover:translate-x-0.5 group-hover:text-rose-600 transition-all shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Form Lengkapi Biodata */}
        <form onSubmit={handleSaveCompletenessForm} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8 space-y-8">
          {formError && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-3 animate-shake">
              <svg className="w-5 h-5 text-rose-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{formError}</span>
            </div>
          )}

          {formSuccessMessage && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-3 animate-fade-in">
              <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>{formSuccessMessage}</span>
            </div>
          )}

          {/* Bagian 1: Identitas Pribadi Siswa */}
          <div>
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 mb-5">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-sm">
                1
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Identitas Pribadi Siswa</h3>
                <p className="text-xs text-slate-400">Data identitas resmi sesuai akta kelahiran / ijazah.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* NISN (Read Only) */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  NISN (Nomor Induk Siswa Nasional)
                </label>
                <input
                  type="text"
                  value={studentData?.nisn || '-'}
                  disabled
                  className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-mono text-xs cursor-not-allowed"
                />
              </div>

              {/* Nama Lengkap */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nama Lengkap Siswa <span className="text-rose-500">*</span>
                </label>
                <input
                  id="input-siswa-nama_lengkap"
                  type="text"
                  required
                  disabled={isLocked}
                  placeholder="Contoh: Muhammad Budi Santoso"
                  value={formData.nama_lengkap}
                  onChange={(e) => handleFieldChange('nama_lengkap', e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden border ${getFieldHighlightClass(
                    'nama_lengkap',
                    !formData.nama_lengkap?.trim()
                  )}`}
                />
              </div>

              {/* Tempat Lahir */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Tempat Lahir <span className="text-rose-500">*</span>
                </label>
                <input
                  id="input-siswa-tempat_lahir"
                  type="text"
                  required
                  disabled={isLocked}
                  placeholder="Contoh: Jakarta"
                  value={formData.tempat_lahir}
                  onChange={(e) => handleFieldChange('tempat_lahir', e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden border ${getFieldHighlightClass(
                    'tempat_lahir',
                    !formData.tempat_lahir?.trim()
                  )}`}
                />
              </div>

              {/* Tanggal Lahir */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Tanggal Lahir <span className="text-rose-500">*</span>
                </label>
                <input
                  id="input-siswa-tanggal_lahir"
                  type="date"
                  required
                  disabled={isLocked}
                  value={formData.tanggal_lahir}
                  onChange={(e) => handleFieldChange('tanggal_lahir', e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden border ${getFieldHighlightClass(
                    'tanggal_lahir',
                    !formData.tanggal_lahir
                  )}`}
                />
              </div>

              {/* Jenis Kelamin */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Jenis Kelamin <span className="text-rose-500">*</span>
                </label>
                <div 
                  id="input-siswa-jenis_kelamin"
                  tabIndex={-1}
                  className={`grid grid-cols-2 gap-3 sm:max-w-md p-1.5 rounded-2xl transition-all ${
                    highlightedField === 'jenis_kelamin'
                      ? 'ring-4 ring-rose-300/70 bg-rose-50/30'
                      : (!formData.jenis_kelamin ? 'border-2 border-dashed border-rose-300 bg-rose-50/20' : '')
                  }`}
                >
                  <label
                    className={`flex items-center justify-center gap-2.5 p-3 rounded-xl border transition-all ${
                      isLocked ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'
                    } ${
                      formData.jenis_kelamin === 'L'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-900 font-bold shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="jenis_kelamin"
                      value="L"
                      disabled={isLocked}
                      checked={formData.jenis_kelamin === 'L'}
                      onChange={() => !isLocked && handleFieldChange('jenis_kelamin', 'L')}
                      className="sr-only"
                    />
                    <span className="text-base">👦</span>
                    <span className="text-xs">Laki-laki (L)</span>
                  </label>

                  <label
                    className={`flex items-center justify-center gap-2.5 p-3 rounded-xl border transition-all ${
                      isLocked ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'
                    } ${
                      formData.jenis_kelamin === 'P'
                        ? 'bg-rose-50 border-rose-500 text-rose-900 font-bold shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="jenis_kelamin"
                      value="P"
                      disabled={isLocked}
                      checked={formData.jenis_kelamin === 'P'}
                      onChange={() => !isLocked && handleFieldChange('jenis_kelamin', 'P')}
                      className="sr-only"
                    />
                    <span className="text-base">👧</span>
                    <span className="text-xs">Perempuan (P)</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Bagian 2: Status Domisili & Tempat Tinggal */}
          <div>
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 mb-5">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-sm">
                2
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Status Tempat Tinggal & Domisili</h3>
                <p className="text-xs text-slate-400">Informasi bersama siapa siswa tinggal dan alamat tempat tinggal saat ini.</p>
              </div>
            </div>

            <div className="space-y-5">
              {/* Dropdown Tinggal Bersama Siapa */}
              <div 
                id="input-siswa-tinggal_bersama"
                className={`p-4.5 rounded-2xl border transition-all ${
                  highlightedField === 'tinggal_bersama'
                    ? 'bg-rose-50/30 border-rose-400 ring-4 ring-rose-300/70'
                    : (formData.tinggal_dropdown === 'Lainnya' && !formData.tinggal_custom?.trim()
                        ? 'bg-rose-50/15 border-rose-300'
                        : 'bg-slate-50 border-slate-200/80')
                }`}
              >
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Tinggal Bersama Siapa? <span className="text-rose-500">*</span>
                </label>
                <p className="text-[11px] text-slate-500 mb-3">
                  Pilih status keberadaan tempat tinggal Anda sehari-hari saat menempuh pendidikan.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <select
                      id="input-siswa-tinggal_dropdown"
                      disabled={isLocked}
                      value={formData.tinggal_dropdown}
                      onChange={(e) => handleFieldChange('tinggal_dropdown', e.target.value)}
                      className={`w-full px-4 py-2.5 border rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden ${
                        isLocked
                          ? 'bg-slate-100/90 text-slate-700 border-slate-200 cursor-not-allowed'
                          : highlightedField === 'tinggal_bersama'
                          ? 'bg-white border-rose-500 ring-2 ring-rose-300/60'
                          : 'bg-white border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
                      }`}
                    >
                      <option value="Kedua Orang Tua">Kedua Orang Tua</option>
                      <option value="Ayah">Ayah</option>
                      <option value="Ibu">Ibu</option>
                      <option value="Wali">Wali</option>
                      <option value="Lainnya">Lainnya (Tuliskan sendiri)</option>
                    </select>
                  </div>

                  {formData.tinggal_dropdown === 'Lainnya' && (
                    <div className="animate-fade-in">
                      <input
                        type="text"
                        required
                        disabled={isLocked}
                        placeholder="Contoh: Kakek dan Nenek / Paman / Asrama"
                        value={formData.tinggal_custom}
                        onChange={(e) => handleFieldChange('tinggal_custom', e.target.value)}
                        className={`w-full px-4 py-2.5 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden border ${getFieldHighlightClass(
                          'tinggal_bersama',
                          !formData.tinggal_custom?.trim()
                        )}`}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Alamat Lengkap (Jalan & Nomor Rumah) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nama Jalan / Gang / Nomor Rumah <span className="text-rose-500">*</span>
                </label>
                <input
                  id="input-siswa-alamat"
                  type="text"
                  required
                  disabled={isLocked}
                  placeholder="Contoh: Jl. Mangga Besar II No. 15 Blok C"
                  value={formData.alamat}
                  onChange={(e) => handleFieldChange('alamat', e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden border ${getFieldHighlightClass(
                    'alamat',
                    !formData.alamat?.trim()
                  )}`}
                />
              </div>

              {/* RT, RW, Kelurahan, Kecamatan, Kota/Kabupaten */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5">
                {/* RT */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    RT <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="input-siswa-rt"
                    type="text"
                    required
                    disabled={isLocked}
                    placeholder="Contoh: 002"
                    maxLength={4}
                    value={formData.rt}
                    onChange={(e) => handleFieldChange('rt', e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden border ${getFieldHighlightClass(
                      'rt',
                      !formData.rt?.trim()
                    )}`}
                  />
                </div>

                {/* RW */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    RW <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="input-siswa-rw"
                    type="text"
                    required
                    disabled={isLocked}
                    placeholder="Contoh: 005"
                    maxLength={4}
                    value={formData.rw}
                    onChange={(e) => handleFieldChange('rw', e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden border ${getFieldHighlightClass(
                      'rw',
                      !formData.rw?.trim()
                    )}`}
                  />
                </div>

                {/* Kelurahan */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Kelurahan / Desa <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="input-siswa-kelurahan"
                    type="text"
                    required
                    disabled={isLocked}
                    placeholder="Contoh: Maphar"
                    value={formData.kelurahan}
                    onChange={(e) => handleFieldChange('kelurahan', e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden border ${getFieldHighlightClass(
                      'kelurahan',
                      !formData.kelurahan?.trim()
                    )}`}
                  />
                </div>

                {/* Kecamatan */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Kecamatan <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="input-siswa-kecamatan"
                    type="text"
                    required
                    disabled={isLocked}
                    placeholder="Contoh: Taman Sari"
                    value={formData.kecamatan}
                    onChange={(e) => handleFieldChange('kecamatan', e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden border ${getFieldHighlightClass(
                      'kecamatan',
                      !formData.kecamatan?.trim()
                    )}`}
                  />
                </div>

                {/* Kota/Kabupaten */}
                <div className="col-span-2 sm:col-span-1 md:col-span-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Kota / Kabupaten <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="input-siswa-kota"
                    type="text"
                    required
                    disabled={isLocked}
                    placeholder="Contoh: Jakarta Barat"
                    value={formData.kota}
                    onChange={(e) => handleFieldChange('kota', e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden border ${getFieldHighlightClass(
                      'kota',
                      !formData.kota?.trim()
                    )}`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Bagian 3: Kontak Siswa & Orang Tua / Wali */}
          <div>
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 mb-5">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-sm">
                3
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Kontak Siswa & Orang Tua / Wali</h3>
                <p className="text-xs text-slate-400">Nomor kontak aktif siswa dan minimal 1 kontak orang tua/wali untuk komunikasi darurat dan informasi sekolah.</p>
              </div>
            </div>

            <div className="space-y-5">
              {/* Kontak Siswa */}
              <div className="p-4.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-800">
                    Nomor WhatsApp / HP Siswa <span className="text-rose-500">*</span>
                  </label>
                  {(!formData.no_whatsapp || formData.no_whatsapp.replace(/\D/g, '').length < 7) ? (
                    <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 animate-pulse">
                      Belum Diisi
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Terisi
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mb-2.5">
                  Nomor handphone aktif siswa untuk pengiriman notifikasi akademik, absensi harian, dan koordinasi sekolah.
                </p>
                <div className="max-w-md">
                  <input
                    id="input-siswa-no_whatsapp"
                    type="tel"
                    required
                    disabled={isLocked}
                    placeholder="Contoh: 081234567890"
                    value={formData.no_whatsapp}
                    onChange={(e) => handleFieldChange('no_whatsapp', e.target.value)}
                    className={`w-full px-4 py-2.5 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden border ${getFieldHighlightClass(
                      'no_whatsapp',
                      !formData.no_whatsapp?.trim() || formData.no_whatsapp.replace(/\D/g, '').length < 7
                    )}`}
                  />
                </div>
              </div>

              {/* Kontak Orang Tua / Wali */}
              <div className="p-4.5 rounded-2xl bg-white border border-slate-200/80">
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Kontak Orang Tua / Wali <span className="text-rose-500">*</span>
                </label>
                <p className="text-[11px] text-slate-500 mb-3">
                  Minimal 1 nomor HP / WhatsApp orang tua atau wali untuk komunikasi darurat dan pelaporan sekolah.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Hubungan / Tag */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Hubungan <span className="text-rose-500">*</span>
                    </label>
                    <select
                      disabled={isLocked}
                      value={formData.parent_tag}
                      onChange={(e) => handleFieldChange('parent_tag', e.target.value)}
                      className={`w-full px-4 py-2.5 border rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden ${
                        isLocked
                          ? 'bg-slate-100/90 text-slate-700 border-slate-200 cursor-not-allowed'
                          : 'bg-white border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
                      }`}
                    >
                      <option value="Ayah">Ayah</option>
                      <option value="Ibu">Ibu</option>
                      <option value="Wali">Wali</option>
                      <option value="Orang Tua">Orang Tua</option>
                    </select>
                  </div>

                  {/* Nama Orang Tua (Opsional) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Nama Orang Tua / Wali <span className="text-slate-400 font-normal">(opsional)</span>
                    </label>
                    <input
                      type="text"
                      disabled={isLocked}
                      placeholder="Contoh: Hendro Pratama"
                      value={formData.parent_nama}
                      onChange={(e) => handleFieldChange('parent_nama', e.target.value)}
                      className={`w-full px-4 py-2.5 border rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden ${
                        isLocked
                          ? 'bg-slate-100/90 text-slate-700 border-slate-200 cursor-not-allowed'
                          : 'bg-white border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
                      }`}
                    />
                  </div>

                  {/* Nomor WhatsApp / HP Orang Tua */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Nomor WhatsApp / HP Ortu <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="input-siswa-parent_phone"
                      type="tel"
                      required
                      disabled={isLocked}
                      placeholder="Contoh: 081234567890"
                      value={formData.parent_phone}
                      onChange={(e) => handleFieldChange('parent_phone', e.target.value)}
                      className={`w-full px-4 py-2.5 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden border ${getFieldHighlightClass(
                        'kontak_ortu',
                        !formData.parent_phone?.trim() || formData.parent_phone.replace(/\D/g, '').length < 7
                      )}`}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {isLocked ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
                <div className="flex items-center gap-2 text-xs text-amber-800 font-semibold bg-amber-50 px-4 py-2.5 rounded-xl border border-amber-200">
                  <span>🔒</span>
                  <span>Data Terkunci — Siswa hanya dapat melihat data. Untuk perubahan, hubungi Admin Sekolah.</span>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowAdminContactModal(true)}
                    className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span>Hubungi Admin untuk Ubah Data</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingData(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 active:scale-95 text-white font-bold text-xs transition-all shadow-xs cursor-pointer"
                  >
                    Kembali ke Kartu Pelajar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <span className="text-rose-500 font-bold">*</span> Wajib diisi lengkap untuk mengaktifkan kartu pelajar.
                </div>

                <button
                  type="submit"
                  disabled={isSavingForm}
                  className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Simpan & Tampilkan Kartu Pelajar</span>
                </button>
              </>
            )}
          </div>
        </form>

        {renderModals()}
      </div>
    )
  }

  // =========================================================================
  // VIEW B: DATA LENGKAP -> MENAMPILKAN KARTU PELAJAR DIGITAL INTERAKTIF
  // =========================================================================
  return (
    <div className="animate-slide-up space-y-6 w-full pb-12">
      {/* Container Utama Kartu Pelajar (Sesuai Tema Aplikasi) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-7 space-y-6">
        {/* Bar Status Aktif & Tombol Ubah Biodata */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center text-lg shrink-0">
              🪪
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Status: Aktif Berlaku
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-bold">
                  🔒 Data Terkunci
                </span>
                <span className="text-xs font-bold text-slate-500">
                  • Kelas {activeStudent?.kelas || '-'} ({activeStudent?.tahun_ajaran || '-'})
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-medium">
                {activeStudent?.nama_lengkap || activeStudent?.nama || '-'} • NISN: {activeStudent?.nisn || '-'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              type="button"
              onClick={() => setIsEditingData(true)}
              className="px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 active:scale-95 text-slate-700 hover:text-slate-900 border border-slate-200 text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span>Lihat Biodata</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAdminContactModal(true)}
              className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 active:scale-95 text-amber-800 border border-amber-200 text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
              title="Biodata terkunci. Hubungi admin untuk perubahan data"
            >
              <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Ubah Biodata</span>
            </button>
          </div>
        </div>

        {/* Card View Switcher & Display Area */}
        <div className="flex flex-col items-center justify-center space-y-6">
          {/* Switcher Tab Bagian Depan / Belakang */}
          <div className="inline-flex items-center gap-1.5 p-1 rounded-2xl bg-slate-100 border border-slate-200/80 shadow-inner">
            <button
              type="button"
              onClick={() => setCurrentSide('front')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                currentSide === 'front'
                  ? 'bg-white text-indigo-700 shadow-sm scale-100'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Halaman Depan
            </button>
            <button
              type="button"
              onClick={() => setCurrentSide('back')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                currentSide === 'back'
                  ? 'bg-white text-indigo-700 shadow-sm scale-100'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Halaman Belakang
            </button>
            <button
              type="button"
              onClick={handleFlip}
              title="Balik Kartu"
              className="p-2 rounded-xl bg-white hover:bg-slate-50 active:scale-95 text-slate-700 border border-slate-200 transition-all shadow-2xs"
            >
              <svg className="w-4 h-4 transition-transform duration-300 transform active:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {/* Kartu Pelajar Render */}
          <div className="w-full bg-slate-50/80 border border-slate-200/70 rounded-2xl p-2 sm:p-8 flex items-center justify-center overflow-x-auto shadow-inner min-h-[220px]">
            {!isSettingsLoaded ? (
              <div 
                className="rounded-2xl border border-slate-200/80 bg-white shadow-xs flex flex-col items-center justify-center p-6 animate-pulse"
                style={{
                  width: cardScale < 1 ? `${Math.round(510 * cardScale)}px` : '510px',
                  height: cardScale < 1 ? `${Math.round(322 * cardScale)}px` : '322px'
                }}
              >
                <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                <span className="text-xs font-semibold text-slate-500">Memuat Kartu Pelajar Digital...</span>
              </div>
            ) : (
              <div 
                className={`transition-all duration-300 transform ${
                  isFlipping ? 'scale-95 opacity-50 rotate-y-90' : 'scale-100 opacity-100 rotate-y-0'
                }`}
                style={{
                  width: cardScale < 1 ? `${Math.round(510 * cardScale)}px` : '510px',
                  height: cardScale < 1 ? `${Math.round(322 * cardScale)}px` : '322px',
                  position: 'relative'
                }}
              >
                <KartuPelajarCard
                  student={activeStudent}
                  photoUrl={photoUrl}
                  settings={settings}
                  side={currentSide}
                  scale={cardScale}
                />
              </div>
            )}
          </div>

          {/* Toast Notification jika sedang unduh */}
          {downloadMessage && (
            <div className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-md animate-fade-in">
              {downloadMessage}
            </div>
          )}

          {/* Tombol Aksi: Unduh PDF & Cetak Kartu Langsung */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={!isSettingsLoaded || isDownloading}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Unduh PDF Kartu Pelajar</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={!isSettingsLoaded}
              className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-50 active:scale-95 text-slate-700 border border-slate-200 font-bold text-xs flex items-center gap-2 shadow-2xs transition-all disabled:opacity-50"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>Cetak Kartu (Print)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Hidden high-res DOM elements for full PDF/PNG capture */}
      <div 
        id="student-card-printable" 
        className="fixed top-0 left-0 -z-50 opacity-0 pointer-events-none"
        style={{ position: 'fixed', top: 0, left: 0, overflow: 'visible' }}
      >
        <KartuPelajarCard
          ref={frontCardRef}
          student={activeStudent}
          photoUrl={photoUrl}
          settings={settings}
          side="front"
          scale={1}
        />
        <KartuPelajarCard
          ref={backCardRef}
          student={activeStudent}
          photoUrl={photoUrl}
          settings={settings}
          side="back"
          scale={1}
        />
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #student-card-printable, #student-card-printable * {
            visibility: visible !important;
          }
          #student-card-printable {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            max-height: none !important;
            min-height: auto !important;
            max-width: none !important;
            overflow: visible !important;
            opacity: 1 !important;
            z-index: 999999 !important;
            padding: 10mm !important;
            background: white !important;
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 10mm !important;
            justify-content: center !important;
            align-items: flex-start !important;
            pointer-events: auto !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          .glossy-overlay, [data-html2canvas-ignore="true"] {
            display: none !important;
          }
        }
        @page {
          size: A4 portrait;
          margin: 10mm;
        }
      `}</style>

      {renderModals()}
    </div>
  )
}
