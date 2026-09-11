import React, { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import KartuPelajarCard, { formatAlamatLengkap, formatIndonesianDate } from './KartuPelajarCard'
import { exportCardAsImage, exportCardAsPdf } from '../utils/kartuPelajarExporter'
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
 * Memeriksa kelengkapan 12 data wajib untuk kartu pelajar digital:
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
 * 11. Nomor Orang Tua (minimal 1 kontak orang tua/wali valid)
 * 12. Tinggal Bersama Siapa (Kedua Orang Tua, Ayah, Ibu, Wali, Lainnya)
 */
export const auditStudentCompleteness = (student) => {
  if (!student) {
    return {
      isComplete: false,
      completedCount: 0,
      totalCount: 12,
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

  // 12. Tinggal Bersama
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
      parent_tag: parentTag,
      parent_nama: parentNama,
      parent_phone: parentPhone,
      tinggal_dropdown: initialTinggalDropdown,
      tinggal_custom: initialTinggalCustom
    }
  }
}

export default function SiswaKartuPelajarSection({ studentData, photoUrls = [], onUpdateStudentData }) {
  const [settings, setSettings] = useState({})
  const [currentSide, setCurrentSide] = useState('front') // 'front' | 'back'
  const [isFlipping, setIsFlipping] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadMessage, setDownloadMessage] = useState(null)

  // Mode Edit / Form Kelengkapan Data
  const [isEditingData, setIsEditingData] = useState(false)
  const [isSavingForm, setIsSavingForm] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccessMessage, setFormSuccessMessage] = useState('')

  const frontCardRef = useRef(null)
  const backCardRef = useRef(null)

  // Hitung status kelengkapan data
  const audit = useMemo(() => auditStudentCompleteness(studentData), [studentData])

  const isDirtyRef = useRef(false)
  const currentNisnRef = useRef(studentData?.nisn)

  // Inisialisasi draft dari sessionStorage agar data ketikan tidak pernah hilang jika ada render ulang
  const getDraftKey = (nisn) => `draft_kartu_pelajar_${nisn || 'anonymous'}`

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
    if (studentData?.nisn && studentData.nisn !== currentNisnRef.current) {
      currentNisnRef.current = studentData.nisn
      isDirtyRef.current = false
      const draftKey = getDraftKey(studentData.nisn)
      try {
        sessionStorage.removeItem(draftKey)
      } catch {}
      if (audit.initialValues) {
        setFormData(audit.initialValues)
      }
    } else if (!isDirtyRef.current && audit.initialValues) {
      setFormData(prev => ({
        ...audit.initialValues,
        ...prev
      }))
    }
  }, [studentData?.nisn])

  const handleFieldChange = (key, value) => {
    isDirtyRef.current = true
    setFormData(prev => {
      const next = { ...prev, [key]: value }
      try {
        sessionStorage.setItem(getDraftKey(studentData?.nisn), JSON.stringify(next))
      } catch {}
      return next
    })
  }

  // Fetch pengaturan kartu sekolah
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data } = await supabase
          .from('pengaturan_sekolah')
          .select('setting_key, setting_value')
          .like('setting_key', 'kartu_%')

        if (data) {
          const sMap = {}
          data.forEach(item => {
            sMap[item.setting_key] = item.setting_value
          })
          setSettings(sMap)
        }
      } catch (err) {
        console.warn('Gagal memuat pengaturan kartu pelajar:', err)
      }
    }
    fetchSettings()
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
      const fileName = `kartu_pelajar_${studentData?.nisn || 'siswa'}.pdf`
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
      const fileName = `kartu_pelajar_${studentData?.nisn || 'siswa'}_${currentSide}.png`
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

  // Cetak Langsung
  const handlePrint = () => {
    window.print()
  }

  // Submit Handler: Simpan data siswa yang telah dilengkapi
  const handleSaveCompletenessForm = async (e) => {
    e.preventDefault()
    setFormError('')
    setFormSuccessMessage('')

    // Validasi Kolom Wajib
    if (!formData.nama_lengkap || !formData.nama_lengkap.trim()) {
      setFormError('Nama Lengkap wajib diisi.')
      return
    }
    if (!formData.tempat_lahir || !formData.tempat_lahir.trim()) {
      setFormError('Tempat Lahir wajib diisi.')
      return
    }
    if (!formData.tanggal_lahir) {
      setFormError('Tanggal Lahir wajib dipilih.')
      return
    }
    if (!formData.jenis_kelamin) {
      setFormError('Jenis Kelamin (Laki-laki / Perempuan) wajib dipilih.')
      return
    }
    if (!formData.alamat || !formData.alamat.trim()) {
      setFormError('Alamat (Nama Jalan / Rumah) wajib diisi.')
      return
    }
    if (!formData.rt || !String(formData.rt).trim()) {
      setFormError('RT wajib diisi.')
      return
    }
    if (!formData.rw || !String(formData.rw).trim()) {
      setFormError('RW wajib diisi.')
      return
    }
    if (!formData.kelurahan || !formData.kelurahan.trim()) {
      setFormError('Kelurahan / Desa wajib diisi.')
      return
    }
    if (!formData.kecamatan || !formData.kecamatan.trim()) {
      setFormError('Kecamatan wajib diisi.')
      return
    }
    if (!formData.kota || !formData.kota.trim()) {
      setFormError('Kota / Kabupaten wajib diisi.')
      return
    }
    if (!formData.parent_phone || !formData.parent_phone.trim()) {
      setFormError('Nomor WhatsApp / HP Orang Tua wajib diisi.')
      return
    }
    const cleanParentPhone = formatPhoneNumber(formData.parent_phone)
    if (cleanParentPhone.length < 8) {
      setFormError('Nomor WhatsApp / HP Orang Tua tidak valid (minimal 8 angka).')
      return
    }

    let finalTinggalBersama = formData.tinggal_dropdown
    if (formData.tinggal_dropdown === 'Lainnya') {
      if (!formData.tinggal_custom || !formData.tinggal_custom.trim()) {
        setFormError('Mohon sebutkan tinggal bersama siapa jika memilih "Lainnya".')
        return
      }
      finalTinggalBersama = `Lainnya: ${formData.tinggal_custom.trim()}`
    }

    setIsSavingForm(true)
    try {
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
        kontak_ortu: cleanKontakList,
        no_hp_ortu: cleanParentPhone,
        nama_ortu: formData.parent_nama ? formData.parent_nama.trim() : null
      }

      // Update tabel siswa_permanent
      const { error: dbError } = await supabase
        .from('siswa_permanent')
        .update(payload)
        .eq('nisn', studentData.nisn)

      if (dbError) {
        throw dbError
      }

      // Jalankan RPC update_kontak_ortu_siswa jika tersedia sebagai fallback sinkronisasi
      try {
        await supabase.rpc('update_kontak_ortu_siswa', {
          p_nisn: String(studentData.nisn),
          p_kontak_list: cleanKontakList
        })
      } catch (rpcEx) {
        // Toleransi jika RPC tidak wajib
      }

      // Buat objek siswa yang sudah diperbarui
      const updatedStudent = {
        ...studentData,
        ...payload,
        rt: cleanRt,
        rw: cleanRw,
        rt_rw: rtRwCombined
      }

      // Panggil callback agar state di parent (Dashboard) langsung terupdate
      if (typeof onUpdateStudentData === 'function') {
        onUpdateStudentData(updatedStudent)
      }

      // Hapus draft sesi karena data sudah tersimpan di database
      try {
        sessionStorage.removeItem(getDraftKey(studentData?.nisn))
      } catch {}
      isDirtyRef.current = false

      setFormSuccessMessage('Biodata berhasil disimpan! Membuka Kartu Pelajar Digital...')
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

  const alamatTeks = formatAlamatLengkap(studentData)

  // =========================================================================
  // VIEW A: JIKA DATA BELUM LENGKAP (ATAU SEDANG DALAM MODE EDIT DATA)
  // Menampilkan instruksi ramah + form pengisian data langsung
  // =========================================================================
  if (!audit.isComplete || isEditingData) {
    return (
      <div className="animate-slide-up space-y-6 max-w-4xl mx-auto pb-12">
        {/* Banner Status Kelengkapan Data */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-7 relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-44 h-44 bg-amber-50 rounded-full blur-2xl pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold mb-3 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                {audit.isComplete ? 'Mode Pembaruan Biodata' : 'Perhatian: Data Identitas Belum Lengkap'}
              </div>
              <h1 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">
                {audit.isComplete ? 'Perbarui Data Kartu Pelajar' : 'Lengkapi Biodata untuk Menampilkan Kartu'}
              </h1>
              <p className="text-sm text-slate-600 mt-2 max-w-2xl leading-relaxed">
                {audit.isComplete
                  ? 'Anda dapat memperbarui alamat domisili, kontak orang tua, atau data identitas diri Anda di bawah ini.'
                  : 'Sesuai dengan ketentuan resmi sekolah, Kartu Pelajar Digital hanya dapat diterbitkan dan diunduh setelah biodata diri, alamat domisili lengkap, kontak orang tua, dan status tempat tinggal telah terisi 100%.'}
              </p>
            </div>

            {/* Progress Bar Widget */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4.5 min-w-[240px] shrink-0 shadow-xs">
              <div className="flex items-center justify-between text-xs font-bold mb-2">
                <span className="text-slate-500 uppercase tracking-wider text-[11px]">Kelengkapan Data</span>
                <span className={`text-sm ${audit.isComplete ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {audit.completedCount} / {audit.totalCount} ({audit.percent}%)
                </span>
              </div>
              <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 rounded-full ${
                    audit.isComplete ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-500 to-orange-500'
                  }`}
                  style={{ width: `${audit.percent}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                {audit.isComplete 
                  ? 'Seluruh data telah lengkap' 
                  : `${audit.missingList.length} data masih perlu dilengkapi`}
              </p>
            </div>
          </div>

          {/* Checklist Tag List */}
          {!audit.isComplete && (
            <div className="mt-6 pt-6 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-3">
                Daftar Pengecekan Data Wajib:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {audit.checklist.map((item) => (
                  <div
                    key={item.key}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs transition-all ${
                      item.isComplete
                        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50/70 border-rose-200 text-rose-800 font-semibold'
                    }`}
                  >
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
                ))}
              </div>
            </div>
          )}
        </div>

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
                  type="text"
                  required
                  placeholder="Contoh: Muhammad Budi Santoso"
                  value={formData.nama_lengkap}
                  onChange={(e) => handleFieldChange('nama_lengkap', e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden"
                />
              </div>

              {/* Tempat Lahir */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Tempat Lahir <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Jakarta"
                  value={formData.tempat_lahir}
                  onChange={(e) => handleFieldChange('tempat_lahir', e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden"
                />
              </div>

              {/* Tanggal Lahir */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Tanggal Lahir <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formData.tanggal_lahir}
                  onChange={(e) => handleFieldChange('tanggal_lahir', e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden"
                />
              </div>

              {/* Jenis Kelamin */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Jenis Kelamin <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3 sm:max-w-md">
                  <label
                    className={`flex items-center justify-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                      formData.jenis_kelamin === 'L'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-900 font-bold shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="jenis_kelamin"
                      value="L"
                      checked={formData.jenis_kelamin === 'L'}
                      onChange={() => handleFieldChange('jenis_kelamin', 'L')}
                      className="sr-only"
                    />
                    <span className="text-base">👦</span>
                    <span className="text-xs">Laki-laki (L)</span>
                  </label>

                  <label
                    className={`flex items-center justify-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                      formData.jenis_kelamin === 'P'
                        ? 'bg-rose-50 border-rose-500 text-rose-900 font-bold shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="jenis_kelamin"
                      value="P"
                      checked={formData.jenis_kelamin === 'P'}
                      onChange={() => handleFieldChange('jenis_kelamin', 'P')}
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
              <div className="p-4.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Tinggal Bersama Siapa? <span className="text-rose-500">*</span>
                </label>
                <p className="text-[11px] text-slate-500 mb-3">
                  Pilih status keberadaan tempat tinggal Anda sehari-hari saat menempuh pendidikan.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <select
                      value={formData.tinggal_dropdown}
                      onChange={(e) => handleFieldChange('tinggal_dropdown', e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden"
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
                        placeholder="Contoh: Kakek dan Nenek / Paman / Asrama"
                        value={formData.tinggal_custom}
                        onChange={(e) => handleFieldChange('tinggal_custom', e.target.value)}
                        className="w-full px-4 py-2.5 bg-white border border-indigo-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden"
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
                  type="text"
                  required
                  placeholder="Contoh: Jl. Mangga Besar II No. 15 Blok C"
                  value={formData.alamat}
                  onChange={(e) => handleFieldChange('alamat', e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden"
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
                    type="text"
                    required
                    placeholder="Contoh: 002"
                    maxLength={4}
                    value={formData.rt}
                    onChange={(e) => handleFieldChange('rt', e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden"
                  />
                </div>

                {/* RW */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    RW <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 005"
                    maxLength={4}
                    value={formData.rw}
                    onChange={(e) => handleFieldChange('rw', e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden"
                  />
                </div>

                {/* Kelurahan */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Kelurahan / Desa <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Maphar"
                    value={formData.kelurahan}
                    onChange={(e) => handleFieldChange('kelurahan', e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden"
                  />
                </div>

                {/* Kecamatan */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Kecamatan <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Taman Sari"
                    value={formData.kecamatan}
                    onChange={(e) => handleFieldChange('kecamatan', e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden"
                  />
                </div>

                {/* Kota/Kabupaten */}
                <div className="col-span-2 sm:col-span-1 md:col-span-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Kota / Kabupaten <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Jakarta Barat"
                    value={formData.kota}
                    onChange={(e) => handleFieldChange('kota', e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Bagian 3: Kontak Orang Tua / Wali */}
          <div>
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 mb-5">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-sm">
                3
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Kontak Orang Tua / Wali</h3>
                <p className="text-xs text-slate-400">Minimal 1 nomor HP / WhatsApp orang tua atau wali untuk komunikasi darurat dan pelaporan sekolah.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Hubungan / Tag */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Hubungan <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formData.parent_tag}
                  onChange={(e) => handleFieldChange('parent_tag', e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden"
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
                  placeholder="Contoh: Hendro Pratama"
                  value={formData.parent_nama}
                  onChange={(e) => handleFieldChange('parent_nama', e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden"
                />
              </div>

              {/* Nomor WhatsApp / HP Orang Tua */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nomor WhatsApp / HP <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="Contoh: 081234567890"
                  value={formData.parent_phone}
                  onChange={(e) => handleFieldChange('parent_phone', e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl text-slate-800 text-xs font-semibold transition-all outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {isEditingData && audit.isComplete ? (
              <button
                type="button"
                onClick={() => setIsEditingData(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 active:scale-95 transition-all"
              >
                Batal & Kembali ke Kartu
              </button>
            ) : (
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <span className="text-rose-500 font-bold">*</span> Wajib diisi lengkap untuk mengaktifkan kartu pelajar.
              </div>
            )}

            <button
              type="submit"
              disabled={isSavingForm}
              className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
            >
              {isSavingForm ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Menyimpan Biodata...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Simpan & Tampilkan Kartu Pelajar</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    )
  }

  // =========================================================================
  // VIEW B: DATA LENGKAP -> MENAMPILKAN KARTU PELAJAR DIGITAL INTERAKTIF
  // =========================================================================
  return (
    <div className="animate-slide-up space-y-6 max-w-4xl mx-auto pb-12">
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
                <span className="text-xs font-bold text-slate-500">
                  • Kelas {studentData?.kelas || '-'} ({studentData?.tahun_ajaran || '-'})
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-medium">
                {studentData?.nama_lengkap || studentData?.nama || '-'} • NISN: {studentData?.nisn || '-'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              type="button"
              onClick={() => setIsEditingData(true)}
              className="px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 active:scale-95 text-slate-600 hover:text-slate-900 border border-slate-200 text-xs font-bold flex items-center gap-1.5 transition-all"
            >
              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
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
          <div className="w-full bg-slate-50/80 border border-slate-200/70 rounded-2xl p-4 sm:p-8 flex items-center justify-center overflow-x-auto shadow-inner">
            <div 
              className={`transition-all duration-300 transform ${
                isFlipping ? 'scale-95 opacity-50 rotate-y-90' : 'scale-100 opacity-100 rotate-y-0'
              }`}
            >
              <div className="hidden sm:block">
                <KartuPelajarCard
                  student={studentData}
                  photoUrl={photoUrl}
                  settings={settings}
                  side={currentSide}
                  scale={1}
                />
              </div>
              <div className="sm:hidden" style={{ width: '340px', height: '214px' }}>
                <KartuPelajarCard
                  student={studentData}
                  photoUrl={photoUrl}
                  settings={settings}
                  side={currentSide}
                  scale={340 / 510}
                />
              </div>
            </div>
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
              disabled={isDownloading}
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
              className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-50 active:scale-95 text-slate-700 border border-slate-200 font-bold text-xs flex items-center gap-2 shadow-2xs transition-all"
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
      <div id="student-card-printable" className="fixed -left-[9999px] -top-[9999px] pointer-events-none">
        <KartuPelajarCard
          ref={frontCardRef}
          student={studentData}
          photoUrl={photoUrl}
          settings={settings}
          side="front"
          scale={1}
        />
        <KartuPelajarCard
          ref={backCardRef}
          student={studentData}
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
            padding: 10mm !important;
            background: white !important;
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 10mm !important;
            justify-content: center !important;
            z-index: 999999 !important;
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
    </div>
  )
}
