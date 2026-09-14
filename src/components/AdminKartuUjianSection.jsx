import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import KartuUjianCard, { EXAM_CARD_COMPONENTS_META } from './KartuUjianCard'
import {
  DEFAULT_EXAM_CODE_PATTERN,
  calculateStudentExamRanks,
  parseClassComponents,
  compareClassNames
} from '../utils/examCodeHelper'
import {
  exportExamCardAsImage,
  exportExamCardAsPdf,
  exportBulkExamCardsA4Pdf,
  printBulkExamCardsA4Pdf,
  printSingleExamCardPdf,
  renderCardElementToDataUrl,
  renderCardElementsToDataUrls,
  printCardsViaIsolatedIframe,
  printCardsDirectlyFromDom,
  EXAM_PRINT_LAYOUT_PRESETS,
  exportExamStudentsToExcel,
  downloadExamAccountTemplateExcel,
  parseExamAccountExcel
} from '../utils/kartuUjianExporter'

// Pilihan item untuk susunan kode peserta ujian
const CODE_PART_OPTIONS = [
  { value: '{KELAS}', label: 'Kelas (misal: 9A, 7B)', sample: '9A' },
  { value: '{INDEX_ROMBEL:2}', label: 'No. Urutan Rombel 2-Digit (9A=01, 9B=02, 9C=03)', sample: '02' },
  { value: '{URUT_TINGKAT:3}', label: 'No. Urut Siswa Se-Tingkat 3-Digit (9A: 001-032, 9B: 033-064)', sample: '034' },
  { value: '{URUT_TINGKAT:4}', label: 'No. Urut Siswa Se-Tingkat 4-Digit (misal: 0034)', sample: '0034' },
  { value: '{ABSEN:2}', label: 'No. Absen Siswa 2-Digit (misal: 01, 34)', sample: '01' },
  { value: '{URUT_ROMBEL:2}', label: 'No. Urut Siswa dalam Rombel 2-Digit (01 s.d. 32 tiap kelas)', sample: '01' },
  { value: '{URUT_ROMBEL:3}', label: 'No. Urut Siswa dalam Rombel 3-Digit (001 s.d. 032 tiap kelas)', sample: '001' },
  { value: '{URUT_SEKOLAH:3}', label: 'No. Urut Siswa Se-Sekolah 3-Digit (misal: 002, 034)', sample: '002' },
  { value: '{URUT_SEKOLAH:4}', label: 'No. Urut Siswa Se-Sekolah 4-Digit (misal: 0002)', sample: '0002' },
  { value: '{TAHUN}', label: 'Tahun Ajaran 2-Digit (misal: 26)', sample: '26' },
  { value: '{TINGKAT}', label: 'Tingkat Kelas Saja (misal: 9, 8, 7)', sample: '9' },
  { value: '{PARALEL}', label: 'Paralel Saja (misal: A, B, C, D)', sample: 'A' },
  { value: '{NISN_AKHIR:3}', label: '3-Digit Terakhir NISN (misal: 562)', sample: '562' },
  { value: '{NISN}', label: 'NISN Lengkap Siswa', sample: '0117023562' },
  { value: '{NIPD}', label: 'NIPD / Nomor Induk Siswa', sample: '222307001' },
  { value: 'none', label: '(Kosongkan / Tidak Digunakan)', sample: '' }
]

const SEPARATOR_OPTIONS = [
  { value: '', label: 'Tanpa Pemisah (Rapat, contoh: 9A01002)' },
  { value: '-', label: 'Tanda Hubung / Strip - (contoh: 9A-01-002)' },
  { value: '.', label: 'Tanda Titik . (contoh: 9A.01.002)' },
  { value: '/', label: 'Garis Miring / (contoh: 9A/01/002)' },
  { value: ' ', label: 'Spasi (contoh: 9A 01 002)' }
]

// Helper pemecah array menjadi kelompok (misal 4 kartu per lembar A4)
const chunkArray = (arr, size) => {
  if (!Array.isArray(arr) || size <= 0) return []
  const res = []
  for (let i = 0; i < arr.length; i += size) {
    res.push(arr.slice(i, i + size))
  }
  return res
}

// Helper aman menyimpan data ke LocalStorage dengan penanganan kuota browser penuh
const safeSetLocalStorage = (key, value) => {
  try {
    localStorage.setItem(key, value)
  } catch (err) {
    console.warn(`[safeSetLocalStorage] Kuota penuh saat menyimpan key "${key}". Mencoba pembersihan cache...`, err?.message || err)
    try {
      // 1. Hapus cache data cetak atau cache temporer yang memakan memori besar
      const temporaryKeys = [
        'kartu_ujian_print_images',
        'kartu_pelajar_print_images',
        'temp_print_cache',
        'kartu_ujian_export_cache'
      ]
      temporaryKeys.forEach(k => {
        try { localStorage.removeItem(k) } catch {}
      })

      // 2. Scan dan bersihkan kunci cache lain yang tidak esensial
      for (let i = 0; i < localStorage.length; i++) {
        const storageKey = localStorage.key(i)
        if (storageKey && (storageKey.includes('_cache') || storageKey.includes('_images') || storageKey.startsWith('temp_'))) {
          try { localStorage.removeItem(storageKey) } catch {}
        }
      }

      // 3. Coba simpan kembali
      localStorage.setItem(key, value)
    } catch (retryErr) {
      // Jika tetap gagal (misal data base64 terlalu besar untuk batas 5MB browser),
      // abaikan secara anggun agar aplikasi & Supabase database tetap berjalan sukses
      console.warn(`[safeSetLocalStorage] Penyimpanan lokal untuk key "${key}" dilewati karena melampaui batas kuota browser. Data utama tetap tersimpan aman di Supabase.`, retryErr)
    }
  }
}

// Helper kompresi gambar sebelum disimpan sebagai Data URL agar hemat memori LocalStorage
const compressImageFile = (file, maxWidth = 800, maxHeight = 800, quality = 0.82) => {
  return new Promise((resolve) => {
    if (!file || !(file instanceof Blob)) {
      return resolve('')
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = () => {
        let width = img.width
        let height = img.height
        if (width > maxWidth || height > maxHeight) {
          if (width / height > maxWidth / maxHeight) {
            height = Math.round((height * maxWidth) / width)
            width = maxWidth
          } else {
            width = Math.round((width * maxHeight) / height)
            height = maxHeight
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        const isPng = file.type === 'image/png' || file.type === 'image/webp'
        const compressed = canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', quality)
        resolve(compressed)
      }
      img.onerror = () => resolve(ev.target.result)
      img.src = ev.target.result
    }
    reader.onerror = () => resolve('')
    reader.readAsDataURL(file)
  })
}

export default function AdminKartuUjianSection({
  students = [],
  activeTa = null,
  allFotos = [],
  tahunAjarans = [],
  onRefresh
}) {
  // 1. STATE SUSUNAN FORMAT KODE UJIAN (USER FRIENDLY DROPDOWNS)
  const [codeConfig, setCodeConfig] = useState(() => {
    const saved = localStorage.getItem('kartu_ujian_code_config')
    if (saved) {
      try { return JSON.parse(saved) } catch {}
    }
    return {
      part1: '{KELAS}',
      part2: '{ABSEN:2}',
      part3: '{URUT_SEKOLAH:3}',
      part4: 'none',
      separator: ''
    }
  })

  useEffect(() => {
    safeSetLocalStorage('kartu_ujian_code_config', JSON.stringify(codeConfig))
  }, [codeConfig])

  // Bangun pola pattern dari konfigurasi dropdown
  const pattern = useMemo(() => {
    const parts = [codeConfig.part1, codeConfig.part2, codeConfig.part3, codeConfig.part4]
      .filter(p => p && p !== 'none')
    return parts.join(codeConfig.separator || '')
  }, [codeConfig])

  // Helper pembersih komponen kustom ghost/duplikat header
  const isGhostOrDuplicateHeaderComponent = (c) => {
    if (!c) return false
    const txt = String(c.text || '').toUpperCase()
    const lbl = String(c.label || '').toUpperCase()
    const id = String(c.id || '').toLowerCase()
    if (txt.includes('MENJADI SISWA') || lbl.includes('MENJADI SISWA')) return true
    if (txt.includes('KARTU PESERTA') || lbl.includes('KARTU PESERTA')) return true
    if (txt.includes('ASESMEN SUMATIF') || lbl.includes('ASESMEN SUMATIF')) return true
    if (txt.includes('UJIAN ASESMEN') || lbl.includes('UJIAN ASESMEN')) return true
    if (txt.includes('TAHUN AJARAN') || lbl.includes('TAHUN AJARAN')) return true
    if (txt.includes('YAYASAN') || lbl.includes('YAYASAN')) return true
    if (txt.includes('LOURDES') || lbl.includes('LOURDES')) return true
    if (id === 'header_title' || id === 'ribbon_tahun' || id === 'badge_logo') return true
    return false
  }

  // 2. STATE PENGATURAN KARTU (TERINTEGRASI DENGAN TTD & CAP KARTU PELAJAR)
  const [settings, setSettings] = useState(() => {
    let saved = null
    try {
      const u = localStorage.getItem('kartu_ujian_settings')
      if (u) saved = JSON.parse(u)
    } catch {}

    // Fallback ambil TTD & Cap dari pengaturan kartu pelajar
    let kpSaved = null
    try {
      const p = localStorage.getItem('kartu_pelajar_settings')
      if (p) kpSaved = JSON.parse(p)
    } catch {}

    let savedCustom = null
    try {
      const c = localStorage.getItem('kartu_ujian_custom_components')
      if (c) savedCustom = JSON.parse(c)
    } catch {}

    const initCustomRaw = (saved?.customComponents && Array.isArray(saved.customComponents) && saved.customComponents.length > 0)
      ? saved.customComponents
      : (Array.isArray(savedCustom) && savedCustom.length > 0 ? savedCustom : [])
    const initCustom = initCustomRaw.filter(c => c && c.id && !['header_title', 'ribbon_tahun', 'badge_logo'].includes(c.id))

    return {
      namaSekolah: saved?.namaSekolah || kpSaved?.kartu_nama_sekolah || 'SMP BUDI MULIA',
      subNamaSekolah: saved?.subNamaSekolah || 'SEKOLAH MENENGAH PERTAMA',
      headerInstansi: saved?.headerInstansi || kpSaved?.kartu_header_instansi || 'YAYASAN BUDI MULIA LOURDES',
      judulUjian: saved?.judulUjian || 'KARTU PESERTA ASESMEN SUMATIF',
      subJudulUjian: saved?.subJudulUjian || 'UJIAN ASESMEN SUMATIF / PTS / PAS',
      headerSubTitle: saved?.headerSubTitle || '',
      tahunAjaran: saved?.tahunAjaran || (activeTa?.nama ? `TAHUN AJARAN ${activeTa.nama}` : 'TAHUN AJARAN 2026/2027'),
      semester: (saved && 'semester' in saved) ? (saved.semester || '') : '',
      logoUrl: saved?.logoUrl || kpSaved?.kartu_logo_url || '/logo_budimulia.png',
      ttdUrl: saved?.ttdUrl || kpSaved?.kartu_ttd_url || '',
      capUrl: saved?.capUrl || kpSaved?.kartu_cap_url || '',
      namaPenandatangan: saved?.namaPenandatangan || kpSaved?.kartu_nama_kepsek || 'Septian Ruswadi, S.Pd',
      jabatanPenandatangan: saved?.jabatanPenandatangan || kpSaved?.kartu_jabatan_kepsek || 'Kepala Sekolah',
      tanggalTerbit: saved?.tanggalTerbit || kpSaved?.kartu_tanggal_terbit || 'Jakarta, 15 September 2026',
      lokasiUjianLabel: saved?.lokasiUjianLabel || 'LOKASI UJIAN:',
      lokasiUjianText: saved?.lokasiUjianText || 'GEDUNG SMP BUDI MULIA',
      lokasiKotaText: saved?.lokasiKotaText || 'JAKARTA',
      badgeNamaSekolah: saved?.badgeNamaSekolah || 'BUDI MULIA',
      badgeKota: saved?.badgeKota || 'JAKARTA',
      tabelHeaderJudul: saved?.tabelHeaderJudul || 'RUANG & KREDENSIAL LOGIN CBT',
      tabelSubHeaderKanan: saved?.tabelSubHeaderKanan || 'SESI UJIAN',
      tabelWidth: saved?.tabelWidth !== undefined ? saved.tabelWidth : 100,
      tabelAlign: saved?.tabelAlign || 'left',
      tabelFontSize: saved?.tabelFontSize !== undefined ? saved.tabelFontSize : 100,
      qrText1: saved?.qrText1 || 'SCAN',
      qrText2: saved?.qrText2 || 'UNTUK',
      qrText3: saved?.qrText3 || 'VERIFIKASI',
      usernameSource: saved?.usernameSource || 'kode_ujian',
      passwordSource: saved?.passwordSource || 'kode_akses',
      passwordVisibility: saved?.passwordVisibility || 'show',
      customPassword: saved?.customPassword || '',
      customComponents: initCustom
    }
  })

  // Simpan settings ke localStorage saat ada perubahan
  useEffect(() => {
    safeSetLocalStorage('kartu_ujian_settings', JSON.stringify(settings))
  }, [settings])

  // Helper fungsi untuk update cepat field settings
  const updateSettingField = (field, value) => {
    setSettings(prev => {
      const next = { ...prev, [field]: value }
      safeSetLocalStorage('kartu_ujian_settings', JSON.stringify(next))
      return next
    })
  }

  // Sinkronisasi otomatis tanda tangan, cap, dan identitas sekolah dari tabel pengaturan_sekolah Supabase
  useEffect(() => {
    let isMounted = true
    const loadSchoolAssets = async () => {
      try {
        const { data, error } = await supabase
          .from('pengaturan_sekolah')
          .select('setting_key, setting_value')
          .like('setting_key', 'kartu_%')

        if (error) throw error
        if (data && data.length > 0 && isMounted) {
          const map = {}
          data.forEach(item => {
            map[item.setting_key] = item.setting_value
          })

          // Hydrate pengaturan kartu ujian dari Supabase jika tersimpan
          let parsedSettings = null
          if (map.kartu_ujian_settings) {
            try {
              parsedSettings = JSON.parse(map.kartu_ujian_settings)
            } catch {}
          }

          let customFromDb = null
          if (map.kartu_ujian_custom_components) {
            try {
              const parsedCustom = typeof map.kartu_ujian_custom_components === 'string'
                ? JSON.parse(map.kartu_ujian_custom_components)
                : map.kartu_ujian_custom_components
              if (Array.isArray(parsedCustom) && parsedCustom.length > 0) {
                customFromDb = parsedCustom.filter(c => c && c.id && !['header_title', 'ribbon_tahun', 'badge_logo'].includes(c.id))
                localStorage.setItem('kartu_ujian_custom_components', JSON.stringify(customFromDb))
              }
            } catch {}
          }

          if (map.kartu_ujian_layout_offsets) {
            try {
              const parsed = JSON.parse(map.kartu_ujian_layout_offsets)
              if (parsed && typeof parsed === 'object') {
                setLayoutOffsets(prev => ({ ...prev, ...parsed }))
                localStorage.setItem('kartu_ujian_layout_offsets', map.kartu_ujian_layout_offsets)
              }
            } catch {}
          }

          if (map.kartu_ujian_hidden_components) {
            try {
              const parsed = JSON.parse(map.kartu_ujian_hidden_components)
              if (Array.isArray(parsed)) {
                setHiddenComponents(parsed)
                localStorage.setItem('kartu_ujian_hidden_components', map.kartu_ujian_hidden_components)
              }
            } catch {}
          }

          if (map.kartu_ujian_code_config) {
            try {
              const parsed = JSON.parse(map.kartu_ujian_code_config)
              if (parsed && typeof parsed === 'object') {
                setCodeConfig(prev => ({ ...prev, ...parsed }))
                localStorage.setItem('kartu_ujian_code_config', map.kartu_ujian_code_config)
              }
            } catch {}
          }

          // Hydrate data kustom ruang & akun ujian dari Supabase jika ada
          const currentCustomKey = `kartu_ujian_custom_data_${activeTa?.id || activeTa?.nama || 'default'}`
          if (map[currentCustomKey]) {
            try {
              const parsedCustomData = JSON.parse(map[currentCustomKey])
              if (parsedCustomData && typeof parsedCustomData === 'object') {
                setCustomExamData(parsedCustomData)
                localStorage.setItem(currentCustomKey, map[currentCustomKey])
              }
            } catch {}
          } else {
            // Jika di Supabase belum ada tapi di LocalStorage lokal ada, migrasikan ke Supabase
            const localSaved = localStorage.getItem(currentCustomKey)
            if (localSaved) {
              try {
                const parsedLocal = JSON.parse(localSaved)
                if (parsedLocal && Object.keys(parsedLocal).length > 0) {
                  supabase.from('pengaturan_sekolah').upsert({
                    setting_key: currentCustomKey,
                    setting_value: localSaved
                  }, { onConflict: 'setting_key' }).then(() => {})
                }
              } catch {}
            }
          }

          if (map.kartu_ujian_print_margin_mm) {
            try {
              const val = parseFloat(map.kartu_ujian_print_margin_mm)
              if (!isNaN(val)) {
                setPrintCardMarginMm(val)
                localStorage.setItem('kartu_ujian_print_margin_mm', String(val))
              }
            } catch {}
          }

          setSettings(prev => {
            const finalCustom = (customFromDb && customFromDb.length > 0)
              ? customFromDb
              : (prev.customComponents && prev.customComponents.length > 0
                  ? prev.customComponents
                  : (parsedSettings?.customComponents || []))

            const next = {
              ...prev,
              ...(parsedSettings && typeof parsedSettings === 'object' ? parsedSettings : {}),
              semester: (prev.semester !== undefined && prev.semester !== null)
                ? prev.semester
                : (parsedSettings && 'semester' in parsedSettings ? parsedSettings.semester : ''),
              customComponents: finalCustom,
              ttdUrl: map.kartu_ttd_url || prev.ttdUrl,
              capUrl: map.kartu_cap_url || prev.capUrl,
              logoUrl: map.kartu_logo_url || prev.logoUrl,
              namaPenandatangan: (!prev.namaPenandatangan || prev.namaPenandatangan === 'Septian Ruswadi, S.Pd')
                ? (map.kartu_nama_kepsek || prev.namaPenandatangan)
                : prev.namaPenandatangan,
              jabatanPenandatangan: (!prev.jabatanPenandatangan || prev.jabatanPenandatangan === 'Kepala Sekolah')
                ? (map.kartu_jabatan_kepsek || prev.jabatanPenandatangan)
                : prev.jabatanPenandatangan,
              kartu_ttd_url: map.kartu_ttd_url || '',
              kartu_cap_url: map.kartu_cap_url || '',
              kartu_logo_url: map.kartu_logo_url || '',
              kartu_nama_kepsek: map.kartu_nama_kepsek || ''
            }
            try {
              localStorage.setItem('kartu_ujian_settings', JSON.stringify(next))
            } catch {}
            return next
          })
        }
      } catch (err) {
        console.warn('Gagal sinkronisasi aset TTD & Cap dari Supabase:', err)
      }
    }
    loadSchoolAssets()
    return () => { isMounted = false }
  }, [])

  useEffect(() => {
    if (activeTa?.nama) {
      setSettings(prev => ({
        ...prev,
        tahunAjaran: `Tahun Ajaran ${activeTa.nama}`
      }))
    }
  }, [activeTa])

  // Key penyimpanan data kustom ruang & akun per tahun ajaran
  const customStorageKey = `kartu_ujian_custom_data_${activeTa?.id || activeTa?.nama || 'default'}`
  const [customExamData, setCustomExamData] = useState(() => {
    try {
      const saved = localStorage.getItem(customStorageKey)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  // Sync saat ganti tahun ajaran (dari LocalStorage & database Supabase)
  useEffect(() => {
    let isCancelled = false
    const loadCustomData = async () => {
      try {
        const saved = localStorage.getItem(customStorageKey)
        if (saved) {
          setCustomExamData(JSON.parse(saved))
        }
        const { data } = await supabase
          .from('pengaturan_sekolah')
          .select('setting_value')
          .eq('setting_key', customStorageKey)
          .maybeSingle()
        if (data?.setting_value && !isCancelled) {
          const parsed = JSON.parse(data.setting_value)
          if (parsed && typeof parsed === 'object') {
            setCustomExamData(parsed)
            localStorage.setItem(customStorageKey, data.setting_value)
          }
        }
      } catch (err) {
        console.warn('Gagal memuat customExamData dari Supabase:', err)
      }
    }
    loadCustomData()
    return () => { isCancelled = true }
  }, [customStorageKey])

  const saveCustomExamData = async (newData) => {
    setCustomExamData(newData)
    try {
      localStorage.setItem(customStorageKey, JSON.stringify(newData))
    } catch {}
    try {
      await supabase
        .from('pengaturan_sekolah')
        .upsert({
          setting_key: customStorageKey,
          setting_value: JSON.stringify(newData)
        }, { onConflict: 'setting_key' })
    } catch (err) {
      console.warn('Gagal menyimpan customExamData ke Supabase:', err)
    }
  }

  // 3. FILTER & SEARCH & MODALS
  const [selectedKelas, setSelectedKelas] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [previewStudentId, setPreviewStudentId] = useState(null)
  const [cardScale, setCardScale] = useState(0.85)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [isProcessingUpload, setIsProcessingUpload] = useState(false)
  const [uploadMessage, setUploadMessage] = useState(null)
  const [showTablePasswords, setShowTablePasswords] = useState(true)

  // 4. PROGRESS EXPORT MASSAL
  const [isExportingBulk, setIsExportingBulk] = useState(false)
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0, percent: 0 })

  const previewCardRef = useRef(null)
  const bulkCardsContainerRef = useRef(null)
  const exportSingleCardRef = useRef(null)

  // 4B. STATE CETAK LANGSUNG PRINTER (DIRECT PRINT DARI APLIKASI)
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)
  const [printModalMode, setPrintModalMode] = useState('bulk') // 'bulk' | 'single'
  const [printPreviewPage, setPrintPreviewPage] = useState(0)
  const [isPrinting, setIsPrinting] = useState(false)
  const [isPreparingPrint, setIsPreparingPrint] = useState(false)
  const [printImages, setPrintImages] = useState([])
  const [printProgress, setPrintProgress] = useState({ current: 0, total: 0, percent: 0 })

  // 5. FILTER HANYA SISWA TAHUN AJARAN AKTIF (activeTa) DENGAN KELAS VALID
  const activeStudents = useMemo(() => {
    if (!students || students.length === 0) return []
    return students.filter(s => {
      const raw = s.rawStudent || s || {}

      // A. Cek kecocokan tahun ajaran
      let taMatch = false
      if (activeTa?.id) {
        if (s.tahun_ajaran_id === activeTa.id || raw.tahun_ajaran_id === activeTa.id) taMatch = true
      }
      if (!taMatch && activeTa?.nama) {
        const activeName = String(activeTa.nama).trim().toLowerCase()
        const sTa = String(s.tahun_ajaran || raw.tahun_ajaran || '').trim().toLowerCase()
        if (sTa === activeName) taMatch = true
      }
      // Jika activeTa belum terdefinisi, fallback ke true
      if (!activeTa?.id && !activeTa?.nama) taMatch = true

      // B. Cek kelas aktif (tidak kosong, bukan '-')
      const k = String(s.kelas || raw.kelas || '').trim()
      const hasValidClass = k && k !== '-' && k !== 'null' && k !== 'undefined'

      return taMatch && hasValidClass
    })
  }, [students, activeTa])

  // 6. HITUNG URUTAN DAN KODE UJIAN UNTUK SISWA AKTIF SAJA DILENGKAPI DATA KUSTOM
  const allRankedStudents = useMemo(() => {
    // Bangun map foto: nisn -> url (mengutamakan tahun ajaran aktif jika ada)
    const fotoMap = new Map()
    if (Array.isArray(allFotos) && allFotos.length > 0) {
      allFotos.forEach(f => {
        const url = typeof f.cloudinary_url === 'string' ? f.cloudinary_url.trim() : (f.foto_url || f.url || '')
        const nisnKey = String(f.nisn || '').trim()
        if (nisnKey && url && url !== '-' && url !== 'null' && url !== 'undefined' && !url.includes('ui-avatars.com')) {
          if (!fotoMap.has(nisnKey) || f.tahun_ajaran_id === activeTa?.id) {
            fotoMap.set(nisnKey, url)
          }
        }
      })
    }

    const enriched = activeStudents.map(st => {
      const raw = st.rawStudent || st || {}
      const nisn = String(st.nisn || raw.nisn || '').trim()
      const nipd = String(st.nipd || raw.nipd || raw.nis || '').trim()
      const stId = String(st.id || raw.id || '').trim()

      let fotoUrl = st.foto_url || raw.foto_url || st.cloudinary_url || raw.cloudinary_url || null
      if (!fotoUrl) {
        if (nisn && fotoMap.has(nisn)) {
          fotoUrl = fotoMap.get(nisn)
        } else if (stId && fotoMap.has(stId)) {
          fotoUrl = fotoMap.get(stId)
        } else if (nipd && fotoMap.has(nipd)) {
          fotoUrl = fotoMap.get(nipd)
        }
      }

      return {
        ...st,
        rawStudent: raw,
        foto_url: fotoUrl
      }
    })

    const ranked = calculateStudentExamRanks(enriched, pattern, {
      activeTaName: activeTa?.nama || '2026/2027',
      usernameSource: settings.usernameSource,
      passwordSource: settings.passwordSource,
      customPassword: settings.customPassword
    })

    // Gabungkan dengan data kustom Ruang, Username, dan Password jika diunggah
    return ranked.map(st => {
      const nisn = String(st.nisn || '').trim()
      const kode = String(st.kodeUjian || '').trim()
      const namaKey = `name_${String(st.nama || '').trim().toLowerCase()}`
      const custom = (nisn && customExamData[nisn]) ||
                     (kode && customExamData[kode]) ||
                     (st.id && customExamData[st.id]) ||
                     customExamData[namaKey] || null

      if (!custom) return st

      return {
        ...st,
        ruang: custom.ruang || st.ruang || '-',
        ruangUjian: custom.ruang || st.ruangUjian || st.ruang || '-',
        portalUsername: custom.username || st.portalUsername,
        username: custom.username || st.username || st.portalUsername,
        portalPassword: custom.password || st.portalPassword,
        password: custom.password || st.password || st.portalPassword,
        hasCustomData: true
      }
    })
  }, [activeStudents, allFotos, pattern, activeTa, settings.usernameSource, settings.passwordSource, settings.customPassword, customExamData])

  // Daftar Kelas Unik yang Tersedia (Diurutkan 7A s.d. 9D)
  const availableClasses = useMemo(() => {
    const set = new Set()
    allRankedStudents.forEach(s => {
      const clean = parseClassComponents(s.kelas).clean
      if (clean && clean !== '-') set.add(clean)
    })
    return Array.from(set).sort(compareClassNames)
  }, [allRankedStudents])

  // Filter siswa berdasarkan Kelas & Pencarian (Presisi!)
  const filteredStudents = useMemo(() => {
    return allRankedStudents.filter(s => {
      // 1. Filter Kelas (Cocokkan clean class name agar "8D" dan "Kelas 8D" sama)
      if (selectedKelas !== 'all') {
        const sClean = parseClassComponents(s.kelas).clean
        const targetClean = parseClassComponents(selectedKelas).clean
        if (sClean !== targetClean && s.kelas !== selectedKelas) return false
      }

      // 2. Pencarian Nama / NISN / Kode
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchNama = (s.nama || '').toLowerCase().includes(q)
        const matchNisn = (s.nisn || '').toLowerCase().includes(q)
        const matchKode = (s.kodeUjian || '').toLowerCase().includes(q)
        const matchKelas = (s.kelas || '').toLowerCase().includes(q)
        if (!matchNama && !matchNisn && !matchKode && !matchKelas) return false
      }
      return true
    })
  }, [allRankedStudents, selectedKelas, searchQuery])

  // =========================================================================
  // SELEKSI SISWA UNTUK CETAK KARTU (CHECKLIST / ANTREAN CETAK SPESIFIK)
  // =========================================================================
  const [selectedStudentIds, setSelectedStudentIds] = useState([])

  // Helper toggle checklist 1 siswa
  const handleToggleSelectStudent = (studentId) => {
    if (!studentId) return
    setSelectedStudentIds(prev => {
      if (prev.includes(studentId)) {
        return prev.filter(id => id !== studentId)
      } else {
        return [...prev, studentId]
      }
    })
  }

  // Apakah semua siswa pada filter/pencarian saat ini sudah terpilih?
  const isAllFilteredSelected = useMemo(() => {
    if (filteredStudents.length === 0) return false
    return filteredStudents.every(s => selectedStudentIds.includes(s.nisn || s.id))
  }, [filteredStudents, selectedStudentIds])

  // Helper toggle pilih semua / batalkan semua yang saat ini tampil
  const handleToggleSelectAllFiltered = () => {
    if (isAllFilteredSelected) {
      const filteredKeys = new Set(filteredStudents.map(s => s.nisn || s.id))
      setSelectedStudentIds(prev => prev.filter(id => !filteredKeys.has(id)))
    } else {
      const newKeys = new Set(selectedStudentIds)
      filteredStudents.forEach(s => newKeys.add(s.nisn || s.id))
      setSelectedStudentIds(Array.from(newKeys))
    }
  }

  // Helper kosongkan seluruh pilihan
  const handleClearSelectedStudents = () => {
    setSelectedStudentIds([])
  }

  // Objek siswa yang terpilih (urut sesuai peringkat/absen/kelas di allRankedStudents)
  const selectedStudents = useMemo(() => {
    if (selectedStudentIds.length === 0) return []
    return allRankedStudents.filter(s => selectedStudentIds.includes(s.nisn || s.id))
  }, [allRankedStudents, selectedStudentIds])

  // Siswa target untuk cetak/ekspor massal:
  // JIKA ADA YANG DICEKLIST -> Gunakan siswa yang diceklist
  // JIKA KOSONG -> Gunakan filteredStudents (perilaku lama 100% terjaga)
  const targetStudentsForBulkPrint = useMemo(() => {
    if (selectedStudentIds.length > 0) {
      return selectedStudents
    }
    return filteredStudents
  }, [selectedStudentIds, selectedStudents, filteredStudents])

  // Siswa yang sedang dipilih untuk preview
  const activePreviewStudent = useMemo(() => {
    if (previewStudentId) {
      const found = filteredStudents.find(s => (s.nisn || s.id) === previewStudentId)
      if (found) return found
    }
    return filteredStudents[0] || allRankedStudents[0] || null
  }, [filteredStudents, allRankedStudents, previewStudentId])

  // Sampel preview kode nyata
  const sampleDemonstrations = useMemo(() => {
    if (allRankedStudents.length === 0) return []
    const sample1 = allRankedStudents[0]
    const sampleMiddle = allRankedStudents[Math.min(33, allRankedStudents.length - 1)]
    const sampleLast = allRankedStudents[allRankedStudents.length - 1]
    return [sample1, sampleMiddle, sampleLast].filter(Boolean)
  }, [allRankedStudents])

  // Ringkasan label format kode aktif saat ini
  const activePatternSummary = useMemo(() => {
    const getLabel = (val) => {
      const found = CODE_PART_OPTIONS.find(o => o.value === val)
      return found ? found.sample : val
    }
    const parts = [codeConfig.part1, codeConfig.part2, codeConfig.part3, codeConfig.part4]
      .filter(p => p && p !== 'none')
      .map(getLabel)
    const sep = codeConfig.separator || ''
    return parts.join(sep)
  }, [codeConfig])

  // --------------------------------------------------------------------------
  // STUDIO EDITOR & FULLSCREEN LAYOUT STATE
  // --------------------------------------------------------------------------
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fullscreenZoom, setFullscreenZoom] = useState(1.15)
  const [isEditorMode, setIsEditorMode] = useState(true)
  const [activeComponentId, setActiveComponentId] = useState('foto')

  // Penyimpanan kustom posisi, skala, dan rotasi per komponen kartu ujian
  const [layoutOffsets, setLayoutOffsets] = useState(() => {
    try {
      const saved = localStorage.getItem('kartu_ujian_layout_offsets')
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('kartu_ujian_layout_offsets', JSON.stringify(layoutOffsets))
    } catch {}
  }, [layoutOffsets])

  // Komponen yang disembunyikan / dihapus dari kartu ujian
  const [hiddenComponents, setHiddenComponents] = useState(() => {
    try {
      const saved = localStorage.getItem('kartu_ujian_hidden_components')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('kartu_ujian_hidden_components', JSON.stringify(hiddenComponents))
    } catch {}
  }, [hiddenComponents])

  // Dragging state & ref
  const dragRef = useRef({
    active: false,
    id: null,
    startMouseX: 0,
    startMouseY: 0,
    startValX: 0,
    startValY: 0,
    scale: 1
  })
  const [isDragging, setIsDragging] = useState(false)

  // Inisiasi Drag dari komponen
  const handleStartDrag = useCallback((id, e) => {
    if (!isEditorMode) return
    e.preventDefault()
    e.stopPropagation()
    setActiveComponentId(id)

    const offset = layoutOffsets[id] || {}
    const startValX = Number(offset.x) || 0
    const startValY = Number(offset.y) || 0

    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY

    dragRef.current = {
      active: true,
      id,
      startMouseX: clientX,
      startMouseY: clientY,
      startValX,
      startValY,
      scale: isFullscreen ? fullscreenZoom : cardScale
    }
    setIsDragging(true)
  }, [isEditorMode, layoutOffsets, isFullscreen, fullscreenZoom, cardScale])

  // Global mousemove & mouseup listeners
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!dragRef.current.active) return
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY

      const dx = (clientX - dragRef.current.startMouseX) / (dragRef.current.scale || 1)
      const dy = (clientY - dragRef.current.startMouseY) / (dragRef.current.scale || 1)

      const nextX = Math.round(dragRef.current.startValX + dx)
      const nextY = Math.round(dragRef.current.startValY + dy)

      const compId = dragRef.current.id
      setLayoutOffsets(prev => ({
        ...prev,
        [compId]: {
          ...(prev[compId] || {}),
          x: nextX,
          y: nextY
        }
      }))
    }

    const handleMouseUp = () => {
      if (dragRef.current.active) {
        dragRef.current.active = false
        setIsDragging(false)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('touchmove', handleMouseMove)
    window.addEventListener('touchend', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('touchmove', handleMouseMove)
      window.removeEventListener('touchend', handleMouseUp)
    }
  }, [])

  // Keyboard shortcut Esc untuk keluar dari Mode Layar Penuh
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen])

  // Update nilai offset field tertentu (x, y, scale, rotate)
  const updateOffsetField = (id, field, value) => {
    setLayoutOffsets(prev => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [field]: value
      }
    }))
  }

  // Reset 1 komponen aktif ke posisi awal
  const handleResetActiveComponent = () => {
    if (!activeComponentId) return
    setLayoutOffsets(prev => {
      const copy = { ...prev }
      delete copy[activeComponentId]
      return copy
    })
  }

  // Reset seluruh komponen ke layout bawaan
  const handleResetAllOffsets = () => {
    if (window.confirm('Yakin ingin mereset seluruh tata letak posisi komponen kartu ke bawaan dan membersihkan elemen duplikat?')) {
      setLayoutOffsets({})
      const cleaned = (customComponents || []).filter(c => !isGhostOrDuplicateHeaderComponent(c))
      setSettings(prev => ({
        ...prev,
        customComponents: cleaned,
        kartu_ujian_custom_components: cleaned
      }))
      try {
        localStorage.setItem('kartu_ujian_layout_offsets', JSON.stringify({}))
        localStorage.setItem('kartu_ujian_custom_components', JSON.stringify(cleaned))
      } catch {}
    }
  }

  // Bersihkan komponen duplikat / ghost teks yang menumpuk di header
  const handleCleanDuplicateHeaderComponents = async () => {
    const cleaned = (customComponents || []).filter(c => !isGhostOrDuplicateHeaderComponent(c))
    setLayoutOffsets(prev => {
      const next = { ...prev }
      delete next['header_title']
      delete next['ribbon_tahun']
      delete next['badge_logo']
      try {
        localStorage.setItem('kartu_ujian_layout_offsets', JSON.stringify(next))
      } catch {}
      return next
    })
    setSettings(prev => {
      const next = {
        ...prev,
        customComponents: cleaned,
        kartu_ujian_custom_components: cleaned
      }
      try {
        localStorage.setItem('kartu_ujian_settings', JSON.stringify(next))
        localStorage.setItem('kartu_ujian_custom_components', JSON.stringify(cleaned))
      } catch {}
      return next
    })
    try {
      await supabase.from('pengaturan_sekolah').upsert({
        setting_key: 'kartu_ujian_custom_components',
        setting_value: JSON.stringify(cleaned)
      }, { onConflict: 'setting_key' })
    } catch {}
    alert('Komponen teks yang menumpuk / duplikat berhasil dibersihkan!')
  }

  // Komponen Kustom Tambahan (Badge Kapsul & Teks Bebas)
  const customComponents = useMemo(() => {
    const raw = settings.customComponents || settings.kartu_ujian_custom_components
    if (!raw) return []
    try {
      const parsed = typeof raw === 'string'
        ? JSON.parse(raw)
        : raw
      return Array.isArray(parsed) 
        ? parsed.filter(c => c && c.id && !['header_title', 'ribbon_tahun', 'badge_logo'].includes(c.id))
        : []
    } catch {
      return []
    }
  }, [settings.customComponents, settings.kartu_ujian_custom_components])

  // Settings yang digabungkan dengan layout offsets aktif, custom components, & hidden components
  const settingsWithOffsets = useMemo(() => ({
    ...settings,
    customComponents,
    kartu_ujian_custom_components: customComponents,
    layoutOffsets,
    hiddenComponents
  }), [settings, customComponents, layoutOffsets, hiddenComponents])

  const [isAddCustomModalOpen, setIsAddCustomModalOpen] = useState(false)
  const [newCustomData, setNewCustomData] = useState({
    type: 'text',
    text: '',
    label: '',
    imageUrl: '',
    imageFit: 'contain',
    width: 65,
    height: 65,
    opacity: 1,
    shape: 'square',
    color: '#0f172a',
    bgColor: '#e0e7ff',
    fontSize: 10,
    isBold: true,
    hasBorder: false,
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderStyle: 'solid'
  })

  // Helper fungsi untuk update list komponen kustom secara sinkron
  const updateCustomComponentsList = (nextList) => {
    setSettings(prev => {
      const next = {
        ...prev,
        customComponents: nextList,
        kartu_ujian_custom_components: nextList
      }
      safeSetLocalStorage('kartu_ujian_settings', JSON.stringify(next))
      try {
        localStorage.setItem('kartu_ujian_custom_components', JSON.stringify(nextList))
      } catch {}
      return next
    })
  }

  // Handler Tambah Komponen Kustom Baru
  const handleAddCustomComponent = (compData) => {
    const isImage = compData.type === 'image'
    const isBadge = compData.type === 'badge'

    const newComp = {
      id: `custom_${Date.now()}`,
      label: compData.label?.trim() || (isImage ? 'Gambar Kustom' : isBadge ? 'Badge Kustom' : 'Teks Bebas'),
      type: compData.type || 'text',
      text: compData.text?.trim() || (isImage ? '' : isBadge ? 'BADGE BARU' : 'Teks Baru'),
      imageUrl: compData.imageUrl || '',
      imageFit: compData.imageFit || 'contain',
      width: Number(compData.width) || 65,
      height: Number(compData.height) || 65,
      opacity: compData.opacity !== undefined ? Number(compData.opacity) : 1,
      shape: compData.shape || (isImage ? 'square' : isBadge ? 'pill' : 'square'),
      initialX: 180,
      initialY: 130,
      x: 0,
      y: 0,
      size: 100,
      rotate: 0,
      color: compData.color || (isBadge ? '#3730a3' : '#0f172a'),
      bgColor: compData.bgColor || (isBadge ? '#e0e7ff' : 'transparent'),
      fontSize: compData.fontSize || (isBadge ? 8.5 : 10),
      isBold: compData.isBold !== false,
      hasBorder: Boolean(compData.hasBorder),
      borderColor: compData.borderColor || '#cbd5e1',
      borderWidth: compData.borderWidth || 1,
      borderStyle: compData.borderStyle || 'solid'
    }
    const currentList = Array.isArray(customComponents) ? customComponents : []
    const nextList = [...currentList.filter(c => c.id !== newComp.id), newComp]
    updateCustomComponentsList(nextList)
    setActiveComponentId(newComp.id)
    setIsAddCustomModalOpen(false)
  }

  // Handler Hapus Komponen Kustom
  const handleDeleteCustomComponent = (id) => {
    const nextList = customComponents.filter(c => c.id !== id)
    updateCustomComponentsList(nextList)
    setActiveComponentId('header_title')
  }

  // Handler Update Atribut Komponen Kustom
  const handleUpdateCustomComponentAttr = (id, key, val) => {
    const nextList = customComponents.map(c => {
      if (c.id === id) {
        return { ...c, [key]: val }
      }
      return c
    })
    updateCustomComponentsList(nextList)
  }

  // State Simpan Pengaturan & Auto-Save
  const [savingSettings, setSavingSettings] = useState(false)
  const [autoSaveStatus, setAutoSaveStatus] = useState(null) // 'saving' | 'saved' | null
  const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState(() => {
    try {
      const v = localStorage.getItem('kartu_ujian_auto_save')
      return v !== null ? JSON.parse(v) : true
    } catch {
      return true
    }
  })
  const [saveSuccessMessage, setSaveSuccessMessage] = useState(null)
  const autoSaveTimerRef = useRef(null)

  // Serialized current state untuk memantau perubahan yang belum disimpan
  const currentStateStr = useMemo(() => {
    return JSON.stringify({
      settings,
      layoutOffsets,
      hiddenComponents,
      codeConfig
    })
  }, [settings, layoutOffsets, hiddenComponents, codeConfig])

  const [savedSnapshot, setSavedSnapshot] = useState(currentStateStr)

  const hasUnsavedChanges = useMemo(() => {
    if (!savedSnapshot) return false
    return currentStateStr !== savedSnapshot
  }, [currentStateStr, savedSnapshot])

  // Toggle Auto-Save ON/OFF
  const handleToggleAutoSave = () => {
    setIsAutoSaveEnabled(prev => {
      const next = !prev
      try {
        localStorage.setItem('kartu_ujian_auto_save', JSON.stringify(next))
      } catch {}
      return next
    })
  }

  // Handler Hapus / Sembunyikan Komponen (Bawaan atau Kustom)
  const handleDeleteComponent = (id) => {
    if (!id) return
    const isCustom = customComponents.some(c => c.id === id)
    if (isCustom) {
      handleDeleteCustomComponent(id)
      return
    }

    setHiddenComponents(prev => {
      if (prev.includes(id)) return prev
      const next = [...prev, id]
      try {
        localStorage.setItem('kartu_ujian_hidden_components', JSON.stringify(next))
      } catch {}
      return next
    })
  }

  // Handler Pulihkan / Tampilkan Kembali Komponen
  const handleRestoreComponent = (id) => {
    if (!id) return
    setHiddenComponents(prev => {
      const next = prev.filter(c => c !== id)
      try {
        localStorage.setItem('kartu_ujian_hidden_components', JSON.stringify(next))
      } catch {}
      return next
    })
  }

  // Handler Pulihkan Seluruh Komponen yang Tersembunyi
  const handleRestoreAllComponents = () => {
    setHiddenComponents([])
    try {
      localStorage.setItem('kartu_ujian_hidden_components', JSON.stringify([]))
    } catch {}
  }

  // Handler Toggle Visibilitas Password (show -> mask -> hide -> show)
  const handleTogglePasswordVisibility = (mode) => {
    setSettings(prev => {
      let nextMode = mode
      if (!nextMode || typeof nextMode !== 'string') {
        const current = prev.passwordVisibility || 'show'
        nextMode = current === 'show' ? 'mask' : (current === 'mask' ? 'hide' : 'show')
      }
      const next = { ...prev, passwordVisibility: nextMode }
      safeSetLocalStorage('kartu_ujian_settings', JSON.stringify(next))
      return next
    })
  }

  // Simpan Settings & Desain Kartu Ujian ke Supabase dan LocalStorage
  const handleSaveSettings = async (silent = false) => {
    if (!silent) setSavingSettings(true)
    else setAutoSaveStatus('saving')

    try {
      // 1. Simpan ke tabel pengaturan_sekolah Supabase terlebih dahulu (Cloud Storage Utama, Tidak Terbatas Kuota 5MB Browser)
      const rowsToUpsert = [
        { setting_key: 'kartu_ujian_settings', setting_value: JSON.stringify(settings) },
        { setting_key: 'kartu_ujian_layout_offsets', setting_value: JSON.stringify(layoutOffsets) },
        { setting_key: 'kartu_ujian_hidden_components', setting_value: JSON.stringify(hiddenComponents) },
        { setting_key: 'kartu_ujian_code_config', setting_value: JSON.stringify(codeConfig) }
      ]
      if (settings.customComponents) {
        rowsToUpsert.push({
          setting_key: 'kartu_ujian_custom_components',
          setting_value: typeof settings.customComponents === 'string'
            ? settings.customComponents
            : JSON.stringify(settings.customComponents)
        })
      }
      if (settings.ttdUrl) {
        rowsToUpsert.push({ setting_key: 'kartu_ttd_url', setting_value: settings.ttdUrl })
      }
      if (settings.capUrl) {
        rowsToUpsert.push({ setting_key: 'kartu_cap_url', setting_value: settings.capUrl })
      }
      if (settings.logoUrl) {
        rowsToUpsert.push({ setting_key: 'kartu_logo_url', setting_value: settings.logoUrl })
      }
      if (settings.namaPenandatangan) {
        rowsToUpsert.push({ setting_key: 'kartu_nama_kepsek', setting_value: settings.namaPenandatangan })
      }
      if (settings.jabatanPenandatangan) {
        rowsToUpsert.push({ setting_key: 'kartu_jabatan_kepsek', setting_value: settings.jabatanPenandatangan })
      }

      for (const row of rowsToUpsert) {
        const { error } = await supabase
          .from('pengaturan_sekolah')
          .upsert(row, { onConflict: 'setting_key' })
        if (error) throw error
      }

      // 2. Simpan salinan ke LocalStorage secara aman (safeSetLocalStorage mencegah error jika kuota browser penuh)
      safeSetLocalStorage('kartu_ujian_settings', JSON.stringify(settings))
      safeSetLocalStorage('kartu_ujian_layout_offsets', JSON.stringify(layoutOffsets))
      safeSetLocalStorage('kartu_ujian_hidden_components', JSON.stringify(hiddenComponents))
      safeSetLocalStorage('kartu_ujian_code_config', JSON.stringify(codeConfig))
      if (settings.customComponents) {
        safeSetLocalStorage(
          'kartu_ujian_custom_components',
          typeof settings.customComponents === 'string'
            ? settings.customComponents
            : JSON.stringify(settings.customComponents)
        )
      }

      setSavedSnapshot(currentStateStr)

      if (!silent) {
        setSaveSuccessMessage('Pengaturan dan tata letak kartu ujian berhasil disimpan!')
        setTimeout(() => setSaveSuccessMessage(null), 3500)
      } else {
        setAutoSaveStatus('saved')
        setTimeout(() => setAutoSaveStatus(null), 2500)
      }
    } catch (err) {
      console.error('Gagal menyimpan pengaturan kartu ujian:', err)
      if (!silent) {
        alert('Gagal menyimpan pengaturan: ' + (err.message || err))
      }
      setAutoSaveStatus(null)
    } finally {
      if (!silent) setSavingSettings(false)
    }
  }

  // Debounced Auto-Save saat ada perubahan
  useEffect(() => {
    if (!isAutoSaveEnabled || !savedSnapshot) return
    if (!hasUnsavedChanges) return

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    autoSaveTimerRef.current = setTimeout(() => {
      handleSaveSettings(true)
    }, 1500)

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [hasUnsavedChanges, isAutoSaveEnabled, savedSnapshot, currentStateStr])

  // Peringatan saat user reload / tutup tab jika perubahan belum disimpan dan Auto-Save mati
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges && !isAutoSaveEnabled && autoSaveStatus !== 'saving') {
        e.preventDefault()
        e.returnValue = 'Perubahan pengaturan kartu ujian belum disimpan.'
        return e.returnValue
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges, isAutoSaveEnabled, autoSaveStatus])

  const activeCustomComp = customComponents.find(c => c.id === activeComponentId)

  // Aktif metadata komponen yang sedang di-inspect (termasuk komponen kustom)
  const activeMeta = activeCustomComp ? {
    id: activeCustomComp.id,
    label: activeCustomComp.label || (activeCustomComp.type === 'image' ? 'Gambar Kustom' : activeCustomComp.type === 'badge' ? 'Badge Kustom' : 'Teks Bebas'),
    icon: activeCustomComp.type === 'image' ? '🖼️' : activeCustomComp.type === 'badge' ? '🏷️' : '✏️',
    isCustom: true,
    customData: activeCustomComp
  } : (EXAM_CARD_COMPONENTS_META.find(c => c.id === activeComponentId) || EXAM_CARD_COMPONENTS_META[0])

  const currentOffset = layoutOffsets[activeMeta?.id] || {}
  const currentX = currentOffset.x || 0
  const currentY = currentOffset.y || 0
  const currentScale = currentOffset.scale !== undefined ? currentOffset.scale : 1
  const currentRotate = currentOffset.rotate || 0

  const nudgePosition = (dx, dy) => {
    if (!activeMeta?.id) return
    updateOffsetField(activeMeta.id, 'x', (currentOffset.x || 0) + dx)
    updateOffsetField(activeMeta.id, 'y', (currentOffset.y || 0) + dy)
  }

  // Upload aset tanda tangan atau cap sekolah langsung dari studio editor
  const handleUploadSchoolAsset = async (field, file) => {
    if (!file) return
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'unsigned_budimulia'

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('upload_preset', uploadPreset)

      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
        method: 'POST',
        body: formData
      })

      if (res.ok) {
        const data = await res.json()
        const url = data.secure_url
        if (field === 'kartu_ttd_url' || field === 'ttdUrl') {
          updateSettingField('ttdUrl', url)
          await supabase.from('pengaturan_sekolah').upsert({ setting_key: 'kartu_ttd_url', setting_value: url }, { onConflict: 'setting_key' })
        } else if (field === 'kartu_cap_url' || field === 'capUrl') {
          updateSettingField('capUrl', url)
          await supabase.from('pengaturan_sekolah').upsert({ setting_key: 'kartu_cap_url', setting_value: url }, { onConflict: 'setting_key' })
        }
        alert('File berhasil diunggah dan disimpan ke sistem!')
      } else {
        alert('Gagal mengunggah file ke Cloudinary.')
      }
    } catch (err) {
      console.error(err)
      alert('Terjadi kesalahan unggah: ' + err.message)
    }
  }

  // Komponen formulir edit teks langsung di Studio Inspector sesuai komponen yang diklik
  const renderComponentTextEditor = () => {
    return (
      <div className="bg-indigo-50/70 border border-indigo-200/90 rounded-2xl p-3.5 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between border-b border-indigo-200/70 pb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-indigo-600 font-bold">✏️</span>
            <h5 className="text-xs font-black text-indigo-950 uppercase tracking-wide">
              Edit Teks: {activeMeta?.label}
            </h5>
          </div>
          <span className="text-[10px] text-indigo-700 font-bold bg-white px-2 py-0.5 rounded-md border border-indigo-200">
            Live Preview
          </span>
        </div>

        {activeComponentId === 'header_title' && (
          <div className="space-y-2.5 text-xs">
            <div>
              <label className="text-[10.5px] font-bold text-slate-700 block mb-1">Nama Yayasan / Instansi (Baris Paling Atas):</label>
              <input
                type="text"
                value={settings.headerInstansi !== undefined ? settings.headerInstansi : 'YAYASAN BUDI MULIA LOURDES'}
                onChange={e => updateSettingField('headerInstansi', e.target.value)}
                placeholder="Contoh: YAYASAN BUDI MULIA LOURDES"
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-[10.5px] font-bold text-slate-700 block mb-1">Judul Utama Ujian:</label>
              <input
                type="text"
                value={settings.judulUjian || ''}
                onChange={e => updateSettingField('judulUjian', e.target.value)}
                placeholder="KARTU PESERTA ASESMEN SUMATIF"
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-[10.5px] font-bold text-slate-700 block mb-1">Sub-Judul Ujian:</label>
              <input
                type="text"
                value={settings.subJudulUjian || ''}
                onChange={e => updateSettingField('subJudulUjian', e.target.value)}
                placeholder="UJIAN ASESMEN SUMATIF / PTS / PAS"
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-[10.5px] font-bold text-slate-700 block mb-1">Teks Nama Sekolah (Baris Kedua):</label>
              <input
                type="text"
                value={settings.headerSubTitle || `${settings.subNamaSekolah || 'SEKOLAH MENENGAH PERTAMA'} ${settings.namaSekolah || 'SMP BUDI MULIA'} JAKARTA`}
                onChange={e => updateSettingField('headerSubTitle', e.target.value)}
                placeholder="SEKOLAH MENENGAH PERTAMA SMP BUDI MULIA JAKARTA"
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        )}

        {activeComponentId === 'ribbon_tahun' && (
          <div className="space-y-2.5 text-xs">
            <div>
              <label className="text-[10.5px] font-bold text-slate-700 block mb-1">Teks Tahun Ajaran:</label>
              <input
                type="text"
                value={settings.tahunAjaran || ''}
                onChange={e => updateSettingField('tahunAjaran', e.target.value)}
                placeholder="TAHUN AJARAN 2026/2027"
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-[10.5px] font-bold text-slate-700 block mb-1">Semester:</label>
              <select
                value={settings.semester || ''}
                onChange={e => updateSettingField('semester', e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="">(Kosongkan)</option>
                <option value="Semester Ganjil">Semester Ganjil</option>
                <option value="Semester Genap">Semester Genap</option>
              </select>
            </div>
          </div>
        )}

        {activeComponentId === 'lokasi_ujian' && (
          <div className="space-y-2.5 text-xs">
            <div>
              <label className="text-[10.5px] font-bold text-slate-700 block mb-1">Label Lokasi:</label>
              <input
                type="text"
                value={settings.lokasiUjianLabel || ''}
                onChange={e => updateSettingField('lokasiUjianLabel', e.target.value)}
                placeholder="LOKASI UJIAN:"
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-[10.5px] font-bold text-slate-700 block mb-1">Nama Tempat / Gedung:</label>
              <input
                type="text"
                value={settings.lokasiUjianText || ''}
                onChange={e => updateSettingField('lokasiUjianText', e.target.value)}
                placeholder="GEDUNG SMP BUDI MULIA"
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-[10.5px] font-bold text-slate-700 block mb-1">Kota / Wilayah:</label>
              <input
                type="text"
                value={settings.lokasiKotaText || ''}
                onChange={e => updateSettingField('lokasiKotaText', e.target.value)}
                placeholder="JAKARTA"
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        )}

        {activeComponentId === 'pengesahan_kepsek' && (
          <div className="space-y-2.5 text-xs">
            <div>
              <label className="text-[10.5px] font-bold text-slate-700 block mb-1">Tanggal Terbit:</label>
              <input
                type="text"
                value={settings.tanggalTerbit || ''}
                onChange={e => updateSettingField('tanggalTerbit', e.target.value)}
                placeholder="Jakarta, 15 September 2026"
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10.5px] font-bold text-slate-700 block mb-1">Jabatan:</label>
                <input
                  type="text"
                  value={settings.jabatanPenandatangan || ''}
                  onChange={e => updateSettingField('jabatanPenandatangan', e.target.value)}
                  placeholder="Kepala Sekolah"
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-[10.5px] font-bold text-slate-700 block mb-1">Nama Kepala Sekolah:</label>
                <input
                  type="text"
                  value={settings.namaPenandatangan || ''}
                  onChange={e => updateSettingField('namaPenandatangan', e.target.value)}
                  placeholder="Septian Ruswadi, S.Pd"
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Status Tanda Tangan & Cap dari Kartu Pelajar */}
            <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-2">
              <span className="text-[10.5px] font-bold text-slate-700 block">Aset TTD & Cap Sekolah:</span>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg flex flex-col items-center justify-center text-center">
                  <span className="text-[9.5px] text-slate-500 font-bold block mb-1">Tanda Tangan:</span>
                  {settings.ttdUrl ? (
                    <img src={settings.ttdUrl} alt="TTD" className="h-9 max-w-full object-contain drop-shadow-xs" />
                  ) : (
                    <span className="text-[10px] text-amber-600 font-semibold italic">Belum ada</span>
                  )}
                  <label className="mt-1.5 text-[9.5px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
                    <span>Ganti TTD</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={e => handleUploadSchoolAsset('kartu_ttd_url', e.target.files?.[0])}
                    />
                  </label>
                </div>
                <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg flex flex-col items-center justify-center text-center">
                  <span className="text-[9.5px] text-slate-500 font-bold block mb-1">Cap Stempel:</span>
                  {settings.capUrl ? (
                    <img src={settings.capUrl} alt="Cap" className="h-9 max-w-full object-contain drop-shadow-xs" />
                  ) : (
                    <span className="text-[10px] text-amber-600 font-semibold italic">Belum ada</span>
                  )}
                  <label className="mt-1.5 text-[9.5px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
                    <span>Ganti Cap</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={e => handleUploadSchoolAsset('kartu_cap_url', e.target.files?.[0])}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Tombol Pintas untuk Menggeser TTD & Cap secara Individu */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-2.5 rounded-xl border border-indigo-200/80 space-y-1.5">
              <span className="text-[10.5px] font-bold text-indigo-950 block">
                🎯 Atur / Geser TTD & Cap Secara Mandiri:
              </span>
              <p className="text-[10px] text-slate-600 leading-tight">
                Klik tombol di bawah (atau klik langsung pada kartu) untuk menggeser posisi, memperbesar ukuran, atau memiringkan TTD & Cap secara terpisah:
              </p>
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => setActiveComponentId('ttd')}
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-800 rounded-lg text-xs font-bold border border-slate-200 flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-all hover:border-indigo-400"
                >
                  <span>✒️</span>
                  <span>Geser TTD Saja</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveComponentId('cap')}
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-800 rounded-lg text-xs font-bold border border-slate-200 flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-all hover:border-rose-400"
                >
                  <span>🔴</span>
                  <span>Geser Cap Saja</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeComponentId === 'ttd' && (
          <div className="space-y-2.5 text-xs">
            <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-base">✒️</span>
                  <span className="text-xs font-bold text-slate-800">Tanda Tangan Kepala Sekolah</span>
                </div>
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                  Komponen Individu
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Anda dapat <b>klik & geser (drag)</b> langsung tanda tangan pada kartu, atau gunakan tombol <b>Posisi (X & Y)</b>, <b>Skala Ukuran</b>, dan <b>Rotasi</b> di panel bawah untuk mengatur letaknya secara presisi dan terpisah dari cap stempel.
              </p>
              <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
                <div className="w-24 h-12 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center p-1 shrink-0">
                  {settings.ttdUrl ? (
                    <img src={settings.ttdUrl} alt="TTD" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-[10px] text-amber-600 font-semibold italic">Belum ada</span>
                  )}
                </div>
                <div>
                  <label className="text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs inline-flex items-center gap-1">
                    <span>📁 Ganti File TTD</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={e => handleUploadSchoolAsset('kartu_ttd_url', e.target.files?.[0])}
                    />
                  </label>
                  <p className="text-[10px] text-slate-400 mt-1">Gunakan file PNG transparan untuk hasil terbaik</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeComponentId === 'cap' && (
          <div className="space-y-2.5 text-xs">
            <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-base">🔴</span>
                  <span className="text-xs font-bold text-slate-800">Cap Stempel Sekolah</span>
                </div>
                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                  Komponen Individu
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Anda dapat <b>klik & geser (drag)</b> cap stempel secara bebas, menempatkannya agak menimpa tanda tangan, mengatur <b>Rotasi Kemiringan</b>, atau mengubah <b>Ukuran Skala</b> di kontrol bawah.
              </p>
              <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
                <div className="w-16 h-16 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center p-1 shrink-0">
                  {settings.capUrl ? (
                    <img src={settings.capUrl} alt="Cap" className="max-h-full max-w-full object-contain opacity-90" />
                  ) : (
                    <span className="text-[10px] text-amber-600 font-semibold italic">Belum ada</span>
                  )}
                </div>
                <div>
                  <label className="text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs inline-flex items-center gap-1">
                    <span>📁 Ganti File Cap</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={e => handleUploadSchoolAsset('kartu_cap_url', e.target.files?.[0])}
                    />
                  </label>
                  <p className="text-[10px] text-slate-400 mt-1">Format PNG stempel transparan direkomendasikan</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeComponentId === 'badge_logo' && (
          <div className="space-y-2.5 text-xs">
            <div>
              <label className="text-[10.5px] font-bold text-slate-700 block mb-1">Teks Atas Badge:</label>
              <input
                type="text"
                value={settings.badgeNamaSekolah || ''}
                onChange={e => updateSettingField('badgeNamaSekolah', e.target.value)}
                placeholder="BUDI MULIA"
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-[10.5px] font-bold text-slate-700 block mb-1">Teks Bawah Badge (Warna Emas):</label>
              <input
                type="text"
                value={settings.badgeKota || ''}
                onChange={e => updateSettingField('badgeKota', e.target.value)}
                placeholder="JAKARTA"
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        )}

        {activeComponentId === 'tabel_kredensial' && (
          <div className="space-y-3 text-xs">
            {/* 1. Kontrol Lebar Tabel */}
            <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-800">
                  ↔️ Lebar Tabel:
                </span>
                <span className="font-mono text-xs font-bold text-indigo-700">
                  {settings.tabelWidth || 100}%
                </span>
              </div>
              <input
                type="range"
                min="50"
                max="100"
                step="1"
                value={settings.tabelWidth || 100}
                onChange={e => updateSettingField('tabelWidth', Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
              <div className="flex items-center gap-1 pt-0.5">
                <button
                  type="button"
                  onClick={() => updateSettingField('tabelWidth', 75)}
                  className={`flex-1 py-1 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                    settings.tabelWidth === 75
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  75% Ramping
                </button>
                <button
                  type="button"
                  onClick={() => updateSettingField('tabelWidth', 88)}
                  className={`flex-1 py-1 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                    settings.tabelWidth === 88
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  88% Sedang
                </button>
                <button
                  type="button"
                  onClick={() => updateSettingField('tabelWidth', 100)}
                  className={`flex-1 py-1 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                    (!settings.tabelWidth || settings.tabelWidth === 100)
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  100% Penuh
                </button>
              </div>

              {/* Posisi Alignment Tabel (Kiri, Tengah, Kanan) jika lebarnya < 100% */}
              {Boolean(settings.tabelWidth && settings.tabelWidth < 100) && (
                <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-600">Posisi Rata:</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateSettingField('tabelAlign', 'left')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                        (!settings.tabelAlign || settings.tabelAlign === 'left')
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      ⬅️ Kiri
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSettingField('tabelAlign', 'center')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                        settings.tabelAlign === 'center'
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      ↔️ Tengah
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSettingField('tabelAlign', 'right')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                        settings.tabelAlign === 'right'
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      ➡️ Kanan
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Kontrol Ukuran Font Teks */}
            <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-800">
                  🔤 Ukuran Font Teks:
                </span>
                <span className="font-mono text-xs font-bold text-indigo-700">
                  {settings.tabelFontSize || 100}%
                </span>
              </div>
              <input
                type="range"
                min="70"
                max="140"
                step="2"
                value={settings.tabelFontSize || 100}
                onChange={e => updateSettingField('tabelFontSize', Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
              <div className="grid grid-cols-4 gap-1 pt-0.5">
                <button
                  type="button"
                  onClick={() => updateSettingField('tabelFontSize', 85)}
                  className={`py-1 rounded text-[9.5px] font-bold border transition-all cursor-pointer ${
                    settings.tabelFontSize === 85
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  85% Kecil
                </button>
                <button
                  type="button"
                  onClick={() => updateSettingField('tabelFontSize', 100)}
                  className={`py-1 rounded text-[9.5px] font-bold border transition-all cursor-pointer ${
                    (!settings.tabelFontSize || settings.tabelFontSize === 100)
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  100% Normal
                </button>
                <button
                  type="button"
                  onClick={() => updateSettingField('tabelFontSize', 115)}
                  className={`py-1 rounded text-[9.5px] font-bold border transition-all cursor-pointer ${
                    settings.tabelFontSize === 115
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  115% Besar
                </button>
                <button
                  type="button"
                  onClick={() => updateSettingField('tabelFontSize', 130)}
                  className={`py-1 rounded text-[9.5px] font-bold border transition-all cursor-pointer ${
                    settings.tabelFontSize === 130
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  130% Ekstra
                </button>
              </div>
            </div>

            {/* 3. Teks Header */}
            <div>
              <label className="text-[10.5px] font-bold text-slate-700 block mb-1">Judul Header Tabel (Merah):</label>
              <input
                type="text"
                value={settings.tabelHeaderJudul || ''}
                onChange={e => updateSettingField('tabelHeaderJudul', e.target.value)}
                placeholder="RUANG & KREDENSIAL LOGIN CBT"
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-[10.5px] font-bold text-slate-700 block mb-1">Teks Sisi Kanan Header:</label>
              <input
                type="text"
                value={settings.tabelSubHeaderKanan || ''}
                onChange={e => updateSettingField('tabelSubHeaderKanan', e.target.value)}
                placeholder="SESI UJIAN"
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-[10.5px] font-bold text-slate-700 block mb-1">Tampilan Kolom Password:</label>
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => updateSettingField('passwordVisibility', 'show')}
                  className={`py-1.5 px-1 rounded-lg text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                    (settings.passwordVisibility || 'show') === 'show'
                      ? 'bg-white text-emerald-700 shadow-xs border border-emerald-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>👁️ Tampil</span>
                  <span className="text-[8.5px] font-normal text-slate-400">Teks asli</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateSettingField('passwordVisibility', 'mask')}
                  className={`py-1.5 px-1 rounded-lg text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                    settings.passwordVisibility === 'mask'
                      ? 'bg-white text-amber-700 shadow-xs border border-amber-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>🔒 Sensor</span>
                  <span className="text-[8.5px] font-normal text-slate-400">••••••</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateSettingField('passwordVisibility', 'hide')}
                  className={`py-1.5 px-1 rounded-lg text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                    settings.passwordVisibility === 'hide'
                      ? 'bg-white text-rose-700 shadow-xs border border-rose-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>🚫 Sembunyi</span>
                  <span className="text-[8.5px] font-normal text-slate-400">2 kolom</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeComponentId === 'qrcode' && (
          <div className="space-y-2.5 text-xs">
            <span className="text-[10.5px] font-bold text-slate-700 block">Teks Samping QR Code:</span>
            <div className="grid grid-cols-3 gap-1.5">
              <input
                type="text"
                value={settings.qrText1 || ''}
                onChange={e => updateSettingField('qrText1', e.target.value)}
                placeholder="SCAN"
                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-800 text-center"
              />
              <input
                type="text"
                value={settings.qrText2 || ''}
                onChange={e => updateSettingField('qrText2', e.target.value)}
                placeholder="UNTUK"
                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 text-center"
              />
              <input
                type="text"
                value={settings.qrText3 || ''}
                onChange={e => updateSettingField('qrText3', e.target.value)}
                placeholder="VERIFIKASI"
                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-black text-[#0a2558] text-center"
              />
            </div>
          </div>
        )}

        {activeComponentId === 'biodata' && (
          <div className="p-2.5 bg-white rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
            <p className="font-bold text-slate-800">ℹ️ Informasi Biodata Siswa:</p>
            <p className="text-[11px] leading-relaxed">
              Nama Lengkap, NISN, NIPD, dan Kelas terisi otomatis dari database siswa aktif. Kode peserta ujian disusun otomatis berdasarkan aturan format yang Anda pilih.
            </p>
          </div>
        )}

        {activeComponentId === 'foto' && (
          <div className="p-2.5 bg-white rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
            <p className="font-bold text-slate-800">📷 Pas Foto Siswa (3x4):</p>
            <p className="text-[11px] leading-relaxed">
              Foto siswa dimuat otomatis dari arsip Cloudinary siswa tahun ajaran aktif. Anda dapat menggeser posisi frame atau mengatur ukurannya di kontrol bawah.
            </p>
          </div>
        )}

        {/* Kontrol Khusus Komponen Kustom */}
        {activeMeta.isCustom && activeCustomComp && (
          <div className="p-3 bg-purple-50/70 border border-purple-200/90 rounded-xl space-y-3">
            <div className="flex items-center justify-between border-b border-purple-200 pb-2">
              <span className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                ⚙️ Komponen Kustom: {activeCustomComp.label}
              </span>
              <button
                type="button"
                onClick={() => handleDeleteCustomComponent(activeMeta.id)}
                className="text-[11px] font-bold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded-lg border border-rose-200 flex items-center gap-1 cursor-pointer transition-colors"
                title="Hapus Komponen Ini dari Kartu Ujian"
              >
                <span>🗑️ Hapus Komponen</span>
              </button>
            </div>

            {activeCustomComp.type === 'image' ? (
              <div className="space-y-2.5">
                <div>
                  <label className="text-[10.5px] font-bold text-slate-700 block mb-1">
                    Gambar / Logo:
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-12 rounded-lg bg-white border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                      {activeCustomComp.imageUrl ? (
                        <img src={activeCustomComp.imageUrl} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-xl">🖼️</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <label className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold cursor-pointer inline-flex items-center gap-1 shadow-2xs">
                        <span>📤</span>
                        <span>Ganti Gambar</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async e => {
                            const file = e.target.files?.[0]
                            if (file) {
                              const compressed = await compressImageFile(file)
                              handleUpdateCustomComponentAttr(activeMeta.id, 'imageUrl', compressed)
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10.5px] font-bold text-slate-700 block mb-1">
                    Atau URL Gambar:
                  </label>
                  <input
                    type="text"
                    value={activeCustomComp.imageUrl || ''}
                    onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'imageUrl', e.target.value)}
                    placeholder="https://... atau data:image/..."
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-[11px] font-mono text-slate-800 outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10.5px] font-bold text-slate-700 block mb-1">
                      Lebar ({activeCustomComp.width || 65}px):
                    </label>
                    <input
                      type="range"
                      min={20}
                      max={300}
                      step={5}
                      value={activeCustomComp.width || 65}
                      onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'width', Number(e.target.value))}
                      className="w-full accent-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="text-[10.5px] font-bold text-slate-700 block mb-1">
                      Tinggi ({activeCustomComp.height || 65}px):
                    </label>
                    <input
                      type="range"
                      min={20}
                      max={300}
                      step={5}
                      value={activeCustomComp.height || 65}
                      onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'height', Number(e.target.value))}
                      className="w-full accent-indigo-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10.5px] font-bold text-slate-700 block mb-1">
                      Kerapian Gambar:
                    </label>
                    <select
                      value={activeCustomComp.imageFit || 'contain'}
                      onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'imageFit', e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-medium text-slate-700"
                    >
                      <option value="contain">Pas Kotak (Contain)</option>
                      <option value="cover">Isi Penuh (Cover)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10.5px] font-bold text-slate-700 block mb-1">
                      Bentuk Sudut:
                    </label>
                    <select
                      value={activeCustomComp.shape || 'square'}
                      onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'shape', e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-medium text-slate-700"
                    >
                      <option value="square">Lurus Siku (Persegi)</option>
                      <option value="rounded">Sudut Melengkung</option>
                      <option value="circle">Bulat / Lingkaran</option>
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10.5px] font-bold text-slate-700">
                      Transparansi (Opacity):
                    </label>
                    <span className="font-mono text-[10.5px] text-indigo-700 font-bold">
                      {Math.round((activeCustomComp.opacity !== undefined ? activeCustomComp.opacity : 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={activeCustomComp.opacity !== undefined ? activeCustomComp.opacity : 1}
                    onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'opacity', Number(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                </div>

                <div>
                  <label className="text-[10.5px] font-bold text-slate-700 block mb-1">
                    Nama Label Komponen (di Inspector):
                  </label>
                  <input
                    type="text"
                    value={activeCustomComp.label || ''}
                    onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'label', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px] font-bold text-slate-700">Garis Pinggir (Border):</span>
                    <button
                      type="button"
                      onClick={() => handleUpdateCustomComponentAttr(activeMeta.id, 'hasBorder', !activeCustomComp.hasBorder)}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer ${
                        activeCustomComp.hasBorder ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {activeCustomComp.hasBorder ? '✓ Aktif' : 'Nonaktif'}
                    </button>
                  </div>
                  {Boolean(activeCustomComp.hasBorder) && (
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                      <div>
                        <label className="text-[9.5px] text-slate-500 block mb-0.5">Warna Garis:</label>
                        <input
                          type="color"
                          value={activeCustomComp.borderColor || '#cbd5e1'}
                          onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'borderColor', e.target.value)}
                          className="w-6 h-6 rounded cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="text-[9.5px] text-slate-500 block mb-0.5">Tebal:</label>
                        <select
                          value={activeCustomComp.borderWidth || 1}
                          onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'borderWidth', Number(e.target.value))}
                          className="w-full px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px]"
                        >
                          <option value={1}>1px</option>
                          <option value={2}>2px</option>
                          <option value={3}>3px</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div>
                  <label className="text-[10.5px] font-bold text-slate-700 block mb-1">
                    Teks Komponen:
                  </label>
                  <input
                    type="text"
                    value={activeCustomComp.text || ''}
                    onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'text', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[10.5px] font-bold text-slate-700 block mb-1">
                    Nama Label Komponen (di Inspector):
                  </label>
                  <input
                    type="text"
                    value={activeCustomComp.label || ''}
                    onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'label', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-indigo-500"
                  />
                </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10.5px] font-bold text-slate-700 block mb-1">
                    Warna Teks:
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={activeCustomComp.color || '#0f172a'}
                      onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'color', e.target.value)}
                      className="w-7 h-7 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                    />
                    <input
                      type="text"
                      value={activeCustomComp.color || '#0f172a'}
                      onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'color', e.target.value)}
                      className="flex-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-mono text-slate-800"
                    />
                  </div>
                </div>

                {activeCustomComp.type === 'badge' ? (
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10.5px] font-bold text-slate-700 block mb-1">
                        Warna Background:
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={activeCustomComp.bgColor || '#e0e7ff'}
                          onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'bgColor', e.target.value)}
                          className="w-7 h-7 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                        />
                        <input
                          type="text"
                          value={activeCustomComp.bgColor || '#e0e7ff'}
                          onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'bgColor', e.target.value)}
                          className="flex-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-mono text-slate-800"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10.5px] font-bold text-slate-700 block mb-1">
                        Bentuk / Gaya Badge:
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { id: 'slanted', label: '📐 Pita Miring', desc: 'Gaya miring khas header' },
                          { id: 'pill', label: '💊 Kapsul Lonjong', desc: 'Bulat melengkung' },
                          { id: 'rounded', label: '🔲 Kotak Membulat', desc: 'Sudut sedikit lengkung' },
                          { id: 'square', label: '⏹️ Persegi Tegak', desc: 'Sudut siku-siku' }
                        ].map(shape => {
                          const isSelected = (activeCustomComp.shape || 'pill') === shape.id
                          return (
                            <button
                              key={shape.id}
                              type="button"
                              onClick={() => handleUpdateCustomComponentAttr(activeMeta.id, 'shape', shape.id)}
                              className={`px-2 py-1.5 rounded-lg border text-left cursor-pointer transition-all ${
                                isSelected
                                  ? 'border-indigo-600 bg-indigo-50 text-indigo-900 font-bold shadow-2xs'
                                  : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                              }`}
                            >
                              <div className="text-[10px] leading-tight">{shape.label}</div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="text-[10.5px] font-bold text-slate-700 block mb-1">
                      Warna Background:
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={activeCustomComp.bgColor && activeCustomComp.bgColor !== 'transparent' ? activeCustomComp.bgColor : '#ffffff'}
                        onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'bgColor', e.target.value)}
                        className="w-7 h-7 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                      />
                      <button
                        type="button"
                        onClick={() => handleUpdateCustomComponentAttr(activeMeta.id, 'bgColor', 'transparent')}
                        className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 cursor-pointer"
                      >
                        Transparan
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 items-center">
                <div>
                  <label className="text-[10.5px] font-bold text-slate-700 block mb-1">
                    Ukuran Font ({activeCustomComp.fontSize || 10}px):
                  </label>
                  <input
                    type="range"
                    min="7"
                    max="22"
                    step="0.5"
                    value={activeCustomComp.fontSize || 10}
                    onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'fontSize', Number(e.target.value))}
                    className="w-full accent-purple-600 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="text-[10.5px] font-bold text-slate-700 block mb-1">
                    Format Huruf:
                  </label>
                  <button
                    type="button"
                    onClick={() => handleUpdateCustomComponentAttr(activeMeta.id, 'isBold', !activeCustomComp.isBold)}
                    className={`w-full py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                      activeCustomComp.isBold !== false
                        ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {activeCustomComp.isBold !== false ? '✓ Tebal (Bold)' : 'Normal'}
                  </button>
                </div>
              </div>

              {/* Kontrol Garis Pinggir / Border Komponen Kustom */}
              <div className="pt-2 border-t border-purple-200/70 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-slate-800 block">Garis Pinggir (Border):</span>
                    <span className="text-[9.5px] text-slate-500 block">Beri bingkai garis tepi pada komponen</span>
                  </div>
                  <div className="inline-flex rounded-lg p-0.5 bg-slate-200/80 border border-slate-300/60">
                    <button
                      type="button"
                      onClick={() => handleUpdateCustomComponentAttr(activeMeta.id, 'hasBorder', false)}
                      className={`px-2.5 py-1 text-[10.5px] font-bold rounded-md transition-all cursor-pointer ${
                        !activeCustomComp.hasBorder 
                          ? 'bg-white text-slate-800 shadow-2xs' 
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      ✕ Tanpa Garis
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateCustomComponentAttr(activeMeta.id, 'hasBorder', true)}
                      className={`px-2.5 py-1 text-[10.5px] font-bold rounded-md transition-all cursor-pointer ${
                        activeCustomComp.hasBorder 
                          ? 'bg-purple-600 text-white shadow-2xs' 
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      ✓ Pakai Garis
                    </button>
                  </div>
                </div>

                {Boolean(activeCustomComp.hasBorder) && (
                  <div className="grid grid-cols-2 gap-2 p-2 rounded-xl bg-white/90 border border-purple-200/70">
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-1">
                        Warna Garis:
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={activeCustomComp.borderColor || '#cbd5e1'}
                          onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'borderColor', e.target.value)}
                          className="w-6 h-6 rounded border border-slate-200 cursor-pointer p-0.5"
                        />
                        <input
                          type="text"
                          value={activeCustomComp.borderColor || '#cbd5e1'}
                          onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'borderColor', e.target.value)}
                          className="flex-1 px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10.5px] font-mono text-slate-700"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-1">
                        Gaya & Tebal:
                      </label>
                      <div className="flex items-center gap-1">
                        <select
                          value={activeCustomComp.borderStyle || 'solid'}
                          onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'borderStyle', e.target.value)}
                          className="flex-1 px-1.5 py-1 bg-white border border-slate-200 rounded text-[10.5px] font-medium text-slate-700"
                        >
                          <option value="solid">Lurus</option>
                          <option value="dashed">Putus</option>
                          <option value="dotted">Titik</option>
                        </select>
                        <select
                          value={activeCustomComp.borderWidth || 1}
                          onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'borderWidth', Number(e.target.value))}
                          className="px-1.5 py-1 bg-white border border-slate-200 rounded text-[10.5px] font-medium text-slate-700"
                        >
                          <option value={1}>1px</option>
                          <option value={2}>2px</option>
                          <option value={3}>3px</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Render konten Studio Inspector (dipakai di mode layar penuh)
  const renderStudioInspectorContent = () => (
    <div className="space-y-4 text-left">
      {/* Header Studio Inspector */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center text-sm shadow-2xs">
            🎨
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                STUDIO INSPECTOR: <span className="text-indigo-600">{activeMeta?.icon} {activeMeta?.label}</span>
              </h4>
            </div>
            <p className="text-[10.5px] text-slate-500 mt-0.5">
              Klik & geser langsung di kartu atau sesuaikan posisi & ukuran di bawah
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsEditorMode(prev => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
              isEditorMode 
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm' 
                : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
            }`}
            title="Nyalakan/Matikan mode interaktif drag kursor pada kartu"
          >
            <span>{isEditorMode ? '🎯 Drag Aktif' : 'Pratinjau Biasa'}</span>
          </button>

          {hiddenComponents.includes(activeComponentId) ? (
            <button
              type="button"
              onClick={() => handleRestoreComponent(activeComponentId)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 transition-all cursor-pointer shadow-2xs flex items-center gap-1"
              title="Tampilkan kembali komponen ini pada kartu ujian"
            >
              <span>👁️ Pulihkan</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleDeleteComponent(activeComponentId)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-all cursor-pointer shadow-2xs flex items-center gap-1"
              title="Hapus atau sembunyikan komponen ini dari kartu ujian"
            >
              <span>🗑️ Hapus</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleResetActiveComponent}
            className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer shadow-2xs"
            title="Kembalikan koordinat, ukuran, dan rotasi komponen ini ke default"
          >
            ↩️ Reset
          </button>
        </div>
      </div>

      {/* Banner Peringatan jika Komponen yang Aktif Sedang Dihapus */}
      {hiddenComponents.includes(activeComponentId) && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between gap-3 text-rose-800 text-xs animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="text-base">🚫</span>
            <div>
              <p className="font-bold">Komponen Ini Sedang Dihapus</p>
              <p className="text-[10.5px] text-rose-600">Komponen tidak akan ditampilkan pada kartu atau saat dicetak.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleRestoreComponent(activeComponentId)}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs cursor-pointer shrink-0 transition-all"
          >
            👁️ Tampilkan Kembali
          </button>
        </div>
      )}

      {/* Pill Pemilihan Cepat Komponen */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10.5px] font-bold text-slate-600 uppercase tracking-wider block">
            PILIH KOMPONEN KARTU:
          </span>
          <button
            type="button"
            onClick={() => {
              setNewCustomData({
                type: 'text',
                text: '',
                label: '',
                side: 'front',
                imageUrl: '',
                imageFit: 'contain',
                width: 65,
                height: 65,
                opacity: 1,
                shape: 'square',
                color: '#0f172a',
                bgColor: '#e0e7ff',
                fontSize: 10,
                isBold: true,
                hasBorder: false,
                borderColor: '#cbd5e1',
                borderWidth: 1,
                borderStyle: 'solid'
              })
              setIsAddCustomModalOpen(true)
            }}
            className="text-[10.5px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
            title="Tambah Komponen Kustom Baru ke Kartu Ujian"
          >
            <span>✨</span>
            <span>+ Tambah Komponen</span>
          </button>
          <button
            type="button"
            onClick={handleCleanDuplicateHeaderComponents}
            className="text-[10.5px] font-bold text-slate-600 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 px-2.5 py-1 rounded-lg border border-slate-200 hover:border-rose-200 transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
            title="Bersihkan teks ganda / numpuk di header kartu ujian"
          >
            <span>🧹</span>
            <span>Rapikan Teks Numpuk</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
          {/* Komponen Bawaan */}
          {EXAM_CARD_COMPONENTS_META.map(comp => {
            const isSelected = activeComponentId === comp.id
            const isHidden = hiddenComponents.includes(comp.id)
            const hasOffset = !!layoutOffsets[comp.id] && (
              layoutOffsets[comp.id].x !== 0 ||
              layoutOffsets[comp.id].y !== 0 ||
              layoutOffsets[comp.id].scale !== 1 ||
              layoutOffsets[comp.id].rotate !== 0
            )

            return (
              <button
                key={comp.id}
                type="button"
                onClick={() => setActiveComponentId(comp.id)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                  isSelected
                    ? isHidden ? 'bg-rose-600 text-white border-rose-600 shadow-sm' : 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : isHidden 
                      ? 'bg-rose-50/70 hover:bg-rose-100 text-rose-700 border-rose-200 line-through opacity-75' 
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
                title={isHidden ? `${comp.label} (Sedang Dihapus/Disembunyikan)` : comp.label}
              >
                <span>{comp.icon}</span>
                <span>{comp.label}</span>
                {isHidden && <span className="text-[9px] font-black text-rose-500 not-line-through">🚫</span>}
                {hasOffset && !isHidden && (
                  <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-amber-300' : 'bg-indigo-600'}`} />
                )}
              </button>
            )
          })}

          {/* Komponen Kustom Tambahan */}
          {customComponents.map(comp => {
            const isSelected = activeComponentId === comp.id
            const hasOffset = !!layoutOffsets[comp.id] && (
              layoutOffsets[comp.id].x !== 0 ||
              layoutOffsets[comp.id].y !== 0 ||
              layoutOffsets[comp.id].scale !== 1 ||
              layoutOffsets[comp.id].rotate !== 0
            )

            return (
              <button
                key={comp.id}
                type="button"
                onClick={() => setActiveComponentId(comp.id)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-purple-600 text-white border-purple-600 shadow-sm ring-1 ring-purple-400'
                    : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200'
                }`}
              >
                <span>{comp.type === 'image' ? '🖼️' : comp.type === 'badge' ? '🏷️' : '✏️'}</span>
                <span>{comp.label || comp.text || 'Kustom'}</span>
                {hasOffset && (
                  <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-amber-300' : 'bg-purple-500'}`} />
                )}
              </button>
            )
          })}
        </div>

        {/* Indikator Komponen yang Disembunyikan */}
        {hiddenComponents.length > 0 && (
          <div className="flex items-center justify-between text-[11px] bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl text-rose-700 mt-2">
            <span>⚠️ <strong>{hiddenComponents.length}</strong> komponen sedang disembunyikan</span>
            <button
              type="button"
              onClick={handleRestoreAllComponents}
              className="font-bold text-rose-800 hover:underline cursor-pointer"
            >
              👁️ Pulihkan Semua
            </button>
          </div>
        )}
      </div>

      {/* FORMULIR EDIT TEKS LANGSUNG UNTUK KOMPONEN TERPILIH */}
      {renderComponentTextEditor()}

      {/* Kontrol Koordinat Posisi X & Y */}
      <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-red-500 font-bold">📍</span>
            <span className="text-xs font-bold text-slate-800">
              Posisi (X & Y)
            </span>
          </div>
          <span className="font-mono text-xs font-bold text-indigo-700">
            X: {currentX}px • Y: {currentY}px
          </span>
        </div>

        {/* Tombol Nudge (Geser Posisi Presisi 4 Arah) */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10.5px] text-slate-500 font-semibold">Geser Posisi:</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => nudgePosition(-5, 0)}
              className="px-2 py-1 bg-white hover:bg-slate-100 active:scale-95 rounded-lg text-[11px] font-bold text-slate-700 border border-slate-200 cursor-pointer shadow-2xs"
              title="Geser Kiri 5px"
            >
              ⬅️ -5
            </button>
            <button
              type="button"
              onClick={() => nudgePosition(0, -5)}
              className="px-2 py-1 bg-white hover:bg-slate-100 active:scale-95 rounded-lg text-[11px] font-bold text-slate-700 border border-slate-200 cursor-pointer shadow-2xs"
              title="Geser Atas 5px"
            >
              ⬆️ -5
            </button>
            <button
              type="button"
              onClick={() => nudgePosition(0, 5)}
              className="px-2 py-1 bg-white hover:bg-slate-100 active:scale-95 rounded-lg text-[11px] font-bold text-slate-700 border border-slate-200 cursor-pointer shadow-2xs"
              title="Geser Bawah 5px"
            >
              ⬇️ +5
            </button>
            <button
              type="button"
              onClick={() => nudgePosition(5, 0)}
              className="px-2 py-1 bg-white hover:bg-slate-100 active:scale-95 rounded-lg text-[11px] font-bold text-slate-700 border border-slate-200 cursor-pointer shadow-2xs"
              title="Geser Kanan 5px"
            >
              ➡️ +5
            </button>
          </div>
        </div>

        {/* Sliders X & Y */}
        <div className="space-y-2 pt-1">
          <div>
            <div className="flex justify-between text-[11px] text-slate-600 mb-0.5 font-medium">
              <span>Geser Kiri / Kanan (X):</span>
              <span className="font-mono text-indigo-600 font-bold">{currentX} px</span>
            </div>
            <input
              type="range"
              min="-150"
              max="150"
              step="1"
              value={currentX}
              onChange={e => updateOffsetField(activeMeta.id, 'x', Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px] text-slate-600 mb-0.5 font-medium">
              <span>Geser Atas / Bawah (Y):</span>
              <span className="font-mono text-indigo-600 font-bold">{currentY} px</span>
            </div>
            <input
              type="range"
              min="-120"
              max="120"
              step="1"
              value={currentY}
              onChange={e => updateOffsetField(activeMeta.id, 'y', Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Kontrol Ukuran (Skala) & Rotasi */}
      <div className="grid grid-cols-2 gap-3">
        {/* Skala / Ukuran */}
        <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-800">
              🔍 Ukuran / Skala:
            </span>
            <span className="font-mono text-xs font-bold text-indigo-700">
              {Math.round(currentScale * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => updateOffsetField(activeMeta.id, 'scale', Math.max(0.5, Number((currentScale - 0.05).toFixed(2))))}
              className="flex-1 py-0.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded text-[10px] font-bold"
            >
              -5%
            </button>
            <button
              type="button"
              onClick={() => updateOffsetField(activeMeta.id, 'scale', 1)}
              className="flex-1 py-0.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded text-[10px] font-bold"
            >
              100%
            </button>
            <button
              type="button"
              onClick={() => updateOffsetField(activeMeta.id, 'scale', Math.min(1.8, Number((currentScale + 0.05).toFixed(2))))}
              className="flex-1 py-0.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded text-[10px] font-bold"
            >
              +5%
            </button>
          </div>
          <input
            type="range"
            min="0.5"
            max="1.8"
            step="0.05"
            value={currentScale}
            onChange={e => updateOffsetField(activeMeta.id, 'scale', Number(e.target.value))}
            className="w-full accent-indigo-600"
          />
        </div>

        {/* Kemiringan / Rotasi */}
        <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-800">
              🔄 Kemiringan:
            </span>
            <span className="font-mono text-xs font-bold text-indigo-700">
              {currentRotate}°
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => updateOffsetField(activeMeta.id, 'rotate', 0)}
              className="flex-1 py-0.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded text-[10px] font-bold"
            >
              0°
            </button>
            <button
              type="button"
              onClick={() => updateOffsetField(activeMeta.id, 'rotate', currentRotate - 15)}
              className="flex-1 py-0.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded text-[10px] font-bold"
            >
              -15°
            </button>
            <button
              type="button"
              onClick={() => updateOffsetField(activeMeta.id, 'rotate', currentRotate + 15)}
              className="flex-1 py-0.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded text-[10px] font-bold"
            >
              +15°
            </button>
          </div>
          <input
            type="range"
            min="-45"
            max="45"
            value={currentRotate}
            onChange={e => updateOffsetField(activeMeta.id, 'rotate', Number(e.target.value))}
            className="w-full accent-indigo-600"
          />
        </div>
      </div>

      {/* Tombol Reset Global */}
      <div className="pt-2 text-center">
        <button
          type="button"
          onClick={handleResetAllOffsets}
          className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline transition-all cursor-pointer"
        >
          ⚠️ Reset Seluruh Posisi & Tata Letak Kartu ke Bawaan
        </button>
      </div>
    </div>
  )

  // Handlers Ekspor
  const handleExportSingleImage = async () => {
    const targetCard = exportSingleCardRef.current || previewCardRef.current
    if (!targetCard) return
    const name = activePreviewStudent?.nama?.replace(/\s+/g, '_') || 'siswa'
    const kode = activePreviewStudent?.kodeUjian || 'ujian'
    await exportExamCardAsImage(targetCard, `Kartu_Ujian_${kode}_${name}.png`)
  }

  const handleExportSinglePdf = async () => {
    const targetCard = exportSingleCardRef.current || previewCardRef.current
    if (!targetCard) return
    const name = activePreviewStudent?.nama?.replace(/\s+/g, '_') || 'siswa'
    const kode = activePreviewStudent?.kodeUjian || 'ujian'
    await exportExamCardAsPdf(targetCard, `Kartu_Ujian_${kode}_${name}.pdf`)
  }

  const handleExportBulkPdf = async () => {
    if (targetStudentsForBulkPrint.length === 0) return
    setIsExportingBulk(true)
    setExportProgress({ current: 0, total: targetStudentsForBulkPrint.length, percent: 0 })

    try {
      await new Promise(r => setTimeout(r, 600))
      const cardNodes = bulkCardsContainerRef.current?.querySelectorAll('[data-card-type="kartu-ujian"]') || []
      const cardElements = Array.from(cardNodes)

      const taClean = (activeTa?.nama || '2026_2027').replace(/\//g, '_')
      const kelasClean = selectedStudentIds.length > 0
        ? `${selectedStudentIds.length}_Siswa_Terpilih`
        : (selectedKelas !== 'all' ? `Kelas_${selectedKelas}` : 'Semua_Kelas')
      const fileName = `Kartu_Ujian_Massal_A4_${kelasClean}_${taClean}.pdf`

      await exportBulkExamCardsA4Pdf(cardElements, fileName, (curr, tot) => {
        setExportProgress({
          current: curr,
          total: tot,
          percent: Math.round((curr / tot) * 100)
        })
      }, effectiveLayoutPreset)
    } catch (err) {
      alert('Terjadi kesalahan saat memproses ekspor PDF massal: ' + err.message)
    } finally {
      setIsExportingBulk(false)
    }
  }

  // Pilihan kategori ukuran cetak ('85x60' atau 'standard')
  const [printLayoutCategory, setPrintLayoutCategory] = useState(() => {
    try {
      const saved = localStorage.getItem('kartu_ujian_print_category')
      if (saved === 'standard') return 'standard'
      return '85x60'
    } catch {
      return '85x60'
    }
  })

  // Pilihan ID preset susunan kartu
  const [printPresetId, setPrintPresetId] = useState(() => {
    try {
      const saved = localStorage.getItem('kartu_ujian_print_preset_id')
      if (saved) {
        const aliasMap = {
          '87x56-8': '85x60-8',
          '87x56-6': '85x60-6',
          '87x56-4': '85x60-4',
          '87x56-2': '85x60-2',
          '87x56-1': '85x60-1',
          '87x57-8': '85x60-8',
          '87x57-6': '85x60-6',
          '87x57-4': '85x60-4',
          '87x57-2': '85x60-2',
          '87x57-1': '85x60-1',
        }
        const mapped = aliasMap[saved] || saved
        if (EXAM_PRINT_LAYOUT_PRESETS.some(p => String(p.id) === String(mapped))) {
          return mapped
        }
      }
      const savedOld = localStorage.getItem('kartu_ujian_print_cards_per_page')
      if (savedOld && EXAM_PRINT_LAYOUT_PRESETS.some(p => String(p.cardsPerPage) === String(savedOld))) {
        const foundOld = EXAM_PRINT_LAYOUT_PRESETS.find(p => String(p.cardsPerPage) === String(savedOld))
        if (foundOld) return String(foundOld.id)
      }
      return '85x60-8'
    } catch {
      return '85x60-8'
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('kartu_ujian_print_category', printLayoutCategory)
    } catch {}
  }, [printLayoutCategory])

  useEffect(() => {
    try {
      localStorage.setItem('kartu_ujian_print_preset_id', String(printPresetId))
      const found = EXAM_PRINT_LAYOUT_PRESETS.find(p => String(p.id) === String(printPresetId))
      if (found) {
        localStorage.setItem('kartu_ujian_print_cards_per_page', String(found.cardsPerPage))
      }
    } catch {}
  }, [printPresetId])

  const activeLayoutPreset = useMemo(() => {
    const aliasMap = {
      '87x56-8': '85x60-8',
      '87x56-6': '85x60-6',
      '87x56-4': '85x60-4',
      '87x56-2': '85x60-2',
      '87x56-1': '85x60-1',
      '87x57-8': '85x60-8',
      '87x57-6': '85x60-6',
      '87x57-4': '85x60-4',
      '87x57-2': '85x60-2',
      '87x57-1': '85x60-1',
    }
    const resolvedId = aliasMap[String(printPresetId)] || String(printPresetId)
    return (
      EXAM_PRINT_LAYOUT_PRESETS.find(p => String(p.id) === resolvedId) ||
      EXAM_PRINT_LAYOUT_PRESETS.find(p => p.id === Number(printPresetId)) ||
      EXAM_PRINT_LAYOUT_PRESETS.find(p => p.cardsPerPage === Number(printPresetId)) ||
      EXAM_PRINT_LAYOUT_PRESETS.find(p => p.id === '85x60-8') ||
      EXAM_PRINT_LAYOUT_PRESETS[0]
    )
  }, [printPresetId])

  // Jarak dari kartu ke garis potong (margin dalam milimeter)
  const [printCardMarginMm, setPrintCardMarginMm] = useState(() => {
    try {
      const saved = localStorage.getItem('kartu_ujian_print_margin_mm')
      if (saved !== null && !isNaN(Number(saved))) {
        return Number(saved)
      }
      return 0.7
    } catch {
      return 0.7
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('kartu_ujian_print_margin_mm', String(printCardMarginMm))
      supabase.from('pengaturan_sekolah').upsert({
        setting_key: 'kartu_ujian_print_margin_mm',
        setting_value: String(printCardMarginMm)
      }, { onConflict: 'setting_key' }).then(() => {})
    } catch {}
  }, [printCardMarginMm])

  // Preset dinamis dengan skala presisi kartu 8,5 x 6 cm (Hasil Kartu + Border) dan jarak ke garis potong yang dapat disesuaikan
  const effectiveLayoutPreset = useMemo(() => {
    const base = activeLayoutPreset
    const gap = Number(printCardMarginMm) >= 0 ? Number(printCardMarginMm) : 0.7

    // Ukuran visual luar kartu (510 x 322 px + 2 x 8px box-shadow bingkai luar = 526 x 338 px)
    // Pada 96 DPI CSS print standard: 1 inch = 25.4 mm => 1 mm = 3.7795 px
    const baseVisualWidthMm = 526 * (25.4 / 96)  // ≈ 139.1708 mm
    const baseVisualHeightMm = 338 * (25.4 / 96) // ≈ 89.4292 mm

    const is85x60Size = base.category === '85x60' || base.category === '87x57' || base.category === '87x56' || base.is85x60 !== false || base.is87x57 !== false || base.is87x56 !== false

    // Ukuran fisik KARTU ITU SENDIRI (tetap presisi 8,5 x 6 cm hasil kartu + border, TIDAK BERUBAH saat jarak ke garis potong diubah)
    const cardWidthMm = is85x60Size ? 85.0 : (base.cardWidthMm || 85.0)
    const cardHeightMm = is85x60Size ? 60.0 : (base.cardHeightMm || 60.0)

    // Ukuran KOTAK GARIS POTONG (menambah celah/gap jarak potong di sekeliling kartu tanpa mengubah ukuran kartu)
    const cellWidthMm = Number((cardWidthMm + (2 * gap)).toFixed(2))
    const cellHeightMm = Number((cardHeightMm + (2 * gap)).toFixed(2))

    // Skala presisi X dan Y untuk memastikan kartu fisik luar berukuran tepat 8,5 x 6 cm
    const scaleX = Number((cardWidthMm / baseVisualWidthMm).toFixed(5))
    const scaleY = Number((cardHeightMm / baseVisualHeightMm).toFixed(5))
    const uniformScale = Number(Math.min(scaleX, scaleY).toFixed(4))

    // Hitung margin kertas (padding halaman) agar grid berada tepat di tengah kertas
    const paperW = 210.0
    const paperH = base.paperSize === 'f4' ? 330.0 : (base.paperHeightMm || 297.0)
    const totalGridW = base.cols * cellWidthMm
    const totalGridH = base.rows * cellHeightMm
    const padX = Number((Math.max(0, (paperW - totalGridW) / 2)).toFixed(2))
    const padY = Number((Math.max(0, (paperH - totalGridH) / 2)).toFixed(2))
    const isOverflow = totalGridH > paperH

    return {
      ...base,
      marginMm: gap,
      cardWidthMm,
      cardHeightMm,
      cellWidthMm,
      cellHeightMm,
      padX,
      padY,
      scale: uniformScale,
      scaleX,
      scaleY,
      isOverflow
    }
  }, [activeLayoutPreset, printCardMarginMm])

  const displayedPresets = useMemo(() => {
    return EXAM_PRINT_LAYOUT_PRESETS.filter(p => {
      if (printLayoutCategory === '85x60' || printLayoutCategory === '87x57' || printLayoutCategory === '87x56') {
        return p.category === '85x60' || p.category === '87x57' || p.category === '87x56' || p.is85x60 || p.is87x57 || p.is87x56
      }
      return p.category === printLayoutCategory
    })
  }, [printLayoutCategory])

  // Siswa yang akan dicetak (Single atau Bulk)
  const studentsToPrint = useMemo(() => {
    if (printModalMode === 'single') {
      return activePreviewStudent ? [activePreviewStudent] : []
    }
    return targetStudentsForBulkPrint
  }, [printModalMode, activePreviewStudent, targetStudentsForBulkPrint])

  // Pengelompokan siswa ke lembar A4 berdasarkan preset kartu terpilih
  const bulkPages = useMemo(() => {
    return chunkArray(studentsToPrint, effectiveLayoutPreset.cardsPerPage)
  }, [studentsToPrint, effectiveLayoutPreset.cardsPerPage])

  const totalPrintSheets = Math.max(1, bulkPages.length)

  // Handler Buka Modal Cetak Langsung
  const handleOpenPrintModal = (mode = 'bulk') => {
    setPrintModalMode(mode)
    if (mode === 'single') {
      if (printLayoutCategory === '85x60' || printLayoutCategory === '87x57' || printLayoutCategory === '87x56') {
        setPrintPresetId('85x60-1')
      } else {
        setPrintPresetId('1')
      }
    } else {
      if (printPresetId === '1' || printPresetId === '85x60-1' || printPresetId === '87x57-1' || printPresetId === '87x56-1') {
        if (printLayoutCategory === '85x60' || printLayoutCategory === '87x57' || printLayoutCategory === '87x56') {
          setPrintPresetId('85x60-8')
        } else {
          setPrintPresetId('8')
        }
      }
    }
    setPrintPreviewPage(0)
    setIsPrintModalOpen(true)
  }

  // Eksekusi Cetak Langsung ke Printer Browser (window.print) Menggunakan DOM Asli (100% Persis Gambar 3 di Layar)
  const triggerDirectPrint = async () => {
    setIsPrinting(true)
    setIsPreparingPrint(true)
    setPrintProgress({ current: 0, total: studentsToPrint.length, percent: 0 })

    try {
      if (printModalMode === 'single') {
        const targetCard = exportSingleCardRef.current || previewCardRef.current
        if (!targetCard) throw new Error('Elemen kartu pratinjau tidak ditemukan.')
        setPrintProgress({ current: 1, total: 1, percent: 100 })
        await printCardsDirectlyFromDom([targetCard], effectiveLayoutPreset)
      } else {
        // Tunggu DOM container massal aktif ter-render
        await new Promise(r => setTimeout(r, 400))
        const cardNodes = bulkCardsContainerRef.current?.querySelectorAll('[data-card-type="kartu-ujian"]') || []
        const cardElements = Array.from(cardNodes)
        if (cardElements.length === 0) throw new Error('Elemen kartu massal tidak ditemukan di DOM.')

        setPrintProgress({ current: cardElements.length, total: cardElements.length, percent: 100 })
        await printCardsDirectlyFromDom(cardElements, effectiveLayoutPreset)
      }
    } catch (err) {
      console.error('Gagal mencetak kartu ujian:', err)
      alert('Gagal menyiapkan cetak kartu: ' + err.message)
    } finally {
      setIsPrinting(false)
      setIsPreparingPrint(false)
    }
  }

  // Eksekusi Cetak Langsung via PDF (Sama Persis Output File PDF / Gambar 2)
  const triggerDirectPdfPrint = async () => {
    setIsPrinting(true)
    setIsPreparingPrint(true)
    setPrintProgress({ current: 0, total: printModalMode === 'single' ? 1 : studentsToPrint.length, percent: 0 })

    try {
      if (printModalMode === 'single') {
        const targetCard = exportSingleCardRef.current || previewCardRef.current
        if (!targetCard) throw new Error('Elemen kartu pratinjau tidak ditemukan.')
        await printSingleExamCardPdf(targetCard, effectiveLayoutPreset)
      } else {
        await new Promise(r => setTimeout(r, 400))
        const cardNodes = bulkCardsContainerRef.current?.querySelectorAll('[data-card-type="kartu-ujian"]') || []
        const cardElements = Array.from(cardNodes)
        if (cardElements.length === 0) throw new Error('Elemen kartu massal tidak ditemukan di DOM.')

        await printBulkExamCardsA4Pdf(cardElements, (curr, tot) => {
          setPrintProgress({
            current: curr,
            total: tot,
            percent: Math.round((curr / tot) * 100)
          })
        }, effectiveLayoutPreset)
      }
    } catch (err) {
      console.error('Gagal mencetak via PDF:', err)
      alert('Gagal mencetak via PDF: ' + err.message)
    } finally {
      setIsPrinting(false)
      setIsPreparingPrint(false)
    }
  }

  const handleExportExcel = async () => {
    if (targetStudentsForBulkPrint.length === 0) return
    const taClean = (activeTa?.nama || '2026_2027').replace(/\//g, '_')
    const kelasClean = selectedStudentIds.length > 0
      ? `${selectedStudentIds.length}_Siswa_Terpilih`
      : (selectedKelas !== 'all' ? `Kelas_${selectedKelas}` : 'Semua_Kelas')
    const fileName = `Rekap_Peserta_Ujian_${kelasClean}_${taClean}.xlsx`
    await exportExamStudentsToExcel(targetStudentsForBulkPrint, fileName)
  }

  // Unduh template Excel untuk diisi Ruang, Username, dan Password
  const handleDownloadUploadTemplate = async () => {
    const taClean = (activeTa?.nama || '2026_2027').replace(/\//g, '_')
    const fileName = `Template_Ruang_dan_Akun_Ujian_${taClean}.xlsx`
    await downloadExamAccountTemplateExcel(allRankedStudents, fileName)
  }

  // Upload file Excel Ruang, Username, dan Password
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsProcessingUpload(true)
    setUploadMessage(null)

    try {
      const res = await parseExamAccountExcel(file)
      if (!res.success) {
        setUploadMessage({ type: 'error', text: res.error || 'Gagal membaca file Excel.' })
        return
      }

      const updated = { ...customExamData, ...res.dataMap }
      saveCustomExamData(updated)
      setUploadMessage({
        type: 'success',
        text: `Berhasil mengimpor data Ruang & Akun untuk ${res.count} baris data!`
      })
    } catch (err) {
      setUploadMessage({ type: 'error', text: 'Terjadi kesalahan saat memproses file: ' + err.message })
    } finally {
      setIsProcessingUpload(false)
      e.target.value = ''
    }
  }

  // Reset custom uploaded data
  const handleResetCustomData = () => {
    if (window.confirm('Yakin ingin mereset seluruh data kustom Ruang & Akun yang telah diupload? Data akan kembali ke nilai bawaan.')) {
      saveCustomExamData({})
      setUploadMessage({ type: 'info', text: 'Data kustom Ruang & Akun berhasil dibersihkan.' })
    }
  }

  return (
    <div className="space-y-6 animate-fade-in p-2 sm:p-4 text-slate-800">
      
      {/* 1. HEADER SECTION & TOMBOL AKSI UTAMA */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#081b3f] to-[#dc2626] text-white flex items-center justify-center text-2xl shadow-md shrink-0">
            🪪
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                Kartu Peserta Ujian Digital
              </h2>
              {activeTa?.nama && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs">
                  Tahun Ajaran {activeTa.nama}
                </span>
              )}
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                Siswa Aktif: {allRankedStudents.length}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Khusus Tahun Ajaran Aktif. Susun format kode nomor peserta ujian secara mudah, cetak massal ke kertas A4, dan export Excel.
            </p>
          </div>
        </div>

        {/* Toolbar Tombol Aksi */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleExportExcel}
            disabled={targetStudentsForBulkPrint.length === 0}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-colors disabled:opacity-50"
            title="Download Excel Rekap Peserta & Akun Login"
          >
            <span>📊</span>
            <span>{selectedStudentIds.length > 0 ? `Export Excel (${selectedStudentIds.length})` : 'Export Excel'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenPrintModal('bulk')}
            disabled={targetStudentsForBulkPrint.length === 0}
            className={`px-4 py-2 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer ${
              selectedStudentIds.length > 0
                ? 'bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 ring-2 ring-indigo-300 ring-offset-1'
                : 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700'
            }`}
            title="Cetak Langsung dari Aplikasi ke Printer Anda (Format 4 Kartu / Lembar A4)"
          >
            <span>🖨️</span>
            <span>
              {selectedStudentIds.length > 0
                ? `Cetak Terpilih (${selectedStudentIds.length})`
                : `Cetak Langsung A4 (${filteredStudents.length})`}
            </span>
          </button>

          <button
            type="button"
            onClick={handleExportBulkPdf}
            disabled={targetStudentsForBulkPrint.length === 0 || isExportingBulk}
            className={`px-4 py-2 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-all disabled:opacity-50 cursor-pointer ${
              selectedStudentIds.length > 0
                ? 'bg-slate-900 hover:bg-black ring-1 ring-slate-400'
                : 'bg-slate-800 hover:bg-slate-900'
            }`}
            title="Unduh file dokumen PDF A4 (4 Kartu / Lembar) untuk percetakan luar"
          >
            <span>📄</span>
            <span>
              {isExportingBulk
                ? `Memproses ${exportProgress.percent}%...`
                : (selectedStudentIds.length > 0 ? `Unduh PDF Terpilih (${selectedStudentIds.length})` : 'Unduh PDF Massal')}
            </span>
          </button>

          <button
            onClick={() => setShowSettingsModal(true)}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors border border-slate-200"
            title="Pengaturan Kop, TTD, Judul Ujian, dan Akun Login"
          >
            <span>⚙️</span>
            <span>Pengaturan Kartu</span>
          </button>
        </div>
      </div>

      {/* 2. CARD SETTING KODE UJIAN PRAKTIS & RINGKAS (CLEAN & TIDAK RIBET) */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center text-xl shrink-0">
            🏷️
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-slate-900 text-sm">
                Format Kode Nomor Peserta Ujian:
              </span>
              <span className="font-mono font-black text-indigo-700 text-sm px-3 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200 shadow-2xs">
                {activePatternSummary || '9A01002'}
              </span>
              <span className="text-[10px] text-slate-500 font-medium">
                (Contoh: Siswa 9A Absen 1 Urut #2)
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Susunan: {[
                CODE_PART_OPTIONS.find(o => o.value === codeConfig.part1)?.label.split(' ')[0],
                CODE_PART_OPTIONS.find(o => o.value === codeConfig.part2)?.label.split(' ')[0],
                CODE_PART_OPTIONS.find(o => o.value === codeConfig.part3)?.label.split(' ')[0],
                codeConfig.part4 !== 'none' ? CODE_PART_OPTIONS.find(o => o.value === codeConfig.part4)?.label.split(' ')[0] : null
              ].filter(Boolean).join(` ${codeConfig.separator || '+'} `)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => setShowCodeModal(true)}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs"
          >
            <span>⚙️</span>
            <span>Atur Susunan Kode</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setUploadMessage(null)
              setShowUploadModal(true)
            }}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs"
          >
            <span>📤</span>
            <span>Upload Ruang & Akun</span>
            {Object.keys(customExamData).length > 0 && (
              <span className="px-1.5 py-0.5 bg-emerald-800 text-[10px] rounded-full text-white font-mono">
                {Object.keys(customExamData).length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 3. SPLIT WORKSPACE: LIVE CARD PREVIEW (KIRI) & TABEL SISWA (KANAN) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* PANEL KIRI: PREVIEW KARTU SISWA TERPILIH (5 KOLOM) */}
        <div className="lg:col-span-5 bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-4 sticky top-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <span>👁️</span> Live Preview Kartu Ujian
              </h3>
              <p className="text-xs text-slate-500">
                {activePreviewStudent ? `${activePreviewStudent.nama} (${activePreviewStudent.kelas})` : 'Pilih siswa dari tabel'}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-end">
              {/* Auto-Save Toggle & Status */}
              <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-xl border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={handleToggleAutoSave}
                  className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isAutoSaveEnabled ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                  title={isAutoSaveEnabled ? 'Simpan Otomatis Aktif (Otomatis disimpan ke database)' : 'Simpan Otomatis Nonaktif (Gunakan tombol Simpan)'}
                >
                  <span
                    className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      isAutoSaveEnabled ? 'translate-x-3' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-[10px] font-bold text-slate-700 select-none">
                  Auto-Save {isAutoSaveEnabled ? 'ON' : 'OFF'}
                </span>
                {autoSaveStatus === 'saving' && (
                  <span className="text-[10px] text-indigo-600 font-bold flex items-center gap-0.5">
                    <span className="animate-spin">🔄</span>
                  </span>
                )}
                {autoSaveStatus === 'saved' && (
                  <span className="text-[10px] text-emerald-600 font-bold">
                    ✓
                  </span>
                )}
                {!autoSaveStatus && hasUnsavedChanges && (
                  <span className="text-[10px] text-amber-600 font-bold" title="Ada perubahan belum tersimpan">
                    ⚠️
                  </span>
                )}
              </div>

              {/* Tombol Simpan Perubahan */}
              <button
                type="button"
                onClick={() => handleSaveSettings(false)}
                disabled={savingSettings}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50 ${
                  hasUnsavedChanges
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-300 shadow-md animate-pulse'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
                }`}
                title="Simpan pengaturan & posisi komponen kartu ujian ke database"
              >
                <span>{savingSettings ? '⏳' : hasUnsavedChanges ? '💾' : '✓'}</span>
                <span>{savingSettings ? 'Menyimpan...' : hasUnsavedChanges ? 'Simpan Perubahan' : 'Tersimpan'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setNewCustomData({
                    type: 'text',
                    text: '',
                    label: '',
                    side: 'front',
                    imageUrl: '',
                    imageFit: 'contain',
                    width: 65,
                    height: 65,
                    opacity: 1,
                    shape: 'square',
                    color: '#0f172a',
                    bgColor: '#e0e7ff',
                    fontSize: 10,
                    isBold: true,
                    hasBorder: false,
                    borderColor: '#cbd5e1',
                    borderWidth: 1,
                    borderStyle: 'solid'
                  })
                  setIsAddCustomModalOpen(true)
                }}
                className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                title="Tambah Komponen Kustom Baru ke Kartu Ujian"
              >
                <span>✨</span>
                <span>+ Komponen</span>
              </button>

              {/* Quick Toggle Password Visibility */}
              <button
                type="button"
                onClick={() => handleTogglePasswordVisibility()}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs border ${
                  settings.passwordVisibility === 'hide'
                    ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                    : settings.passwordVisibility === 'mask'
                    ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                }`}
                title="Klik untuk ubah tampilan password: Tampil -> Sensor (••••) -> Sembunyikan Kolom"
              >
                <span>{settings.passwordVisibility === 'hide' ? '🚫' : settings.passwordVisibility === 'mask' ? '🔒' : '👁️'}</span>
                <span>Pwd: {settings.passwordVisibility === 'hide' ? 'Sembunyi' : settings.passwordVisibility === 'mask' ? 'Sensor' : 'Tampil'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsFullscreen(true)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                title="Buka Editor Kartu dalam Mode Layar Penuh (Fullscreen Canvas)"
              >
                <span>🖥️</span>
                <span>Mode Layar Penuh</span>
              </button>

              {/* Slider Zoom Skala Preview */}
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span>Zoom:</span>
                <input
                  type="range"
                  min="0.5"
                  max="1.0"
                  step="0.05"
                  value={cardScale}
                  onChange={e => setCardScale(parseFloat(e.target.value))}
                  className="w-16 accent-indigo-600"
                />
                <span className="font-mono text-[10px] w-8">{Math.round(cardScale * 100)}%</span>
              </div>
            </div>
          </div>

          {/* Card Preview Container */}
          <div className="bg-slate-100/70 p-3 rounded-2xl border border-slate-200/80 flex items-center justify-center overflow-auto min-h-[290px]">
            {activePreviewStudent ? (
              <div style={{ width: `${510 * cardScale}px`, height: `${322 * cardScale}px` }} className="shrink-0 transition-all">
                <KartuUjianCard
                  ref={previewCardRef}
                  student={activePreviewStudent}
                  photoUrl={activePreviewStudent?.foto_url}
                  settings={settingsWithOffsets}
                  scale={cardScale}
                  isEditorMode={isEditorMode}
                  activeComponent={activeComponentId}
                  onSelectComponent={(id) => setActiveComponentId(id)}
                  onStartDrag={handleStartDrag}
                  onDeleteComponent={handleDeleteComponent}
                  onTogglePasswordVisibility={handleTogglePasswordVisibility}
                />
              </div>
            ) : (
              <div className="text-center text-slate-400 py-12">
                <span>📭 Tidak ada data siswa aktif di kelas ini</span>
              </div>
            )}
          </div>

          {/* Action Buttons Untuk 1 Kartu Ini */}
          <div className="space-y-2 text-xs font-bold">
            <button
              type="button"
              onClick={() => handleOpenPrintModal('single')}
              disabled={!activePreviewStudent}
              className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              title="Cetak Langsung dari Aplikasi ke Printer untuk Kartu Siswa Ini"
            >
              <span>🖨️</span>
              <span>Cetak Kartu Ini (Print Langsung)</span>
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleExportSinglePdf}
                disabled={!activePreviewStudent}
                className="px-3 py-2 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <span>📄</span>
                <span>Download PDF</span>
              </button>
              <button
                type="button"
                onClick={handleExportSingleImage}
                disabled={!activePreviewStudent}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-800 text-slate-700 hover:text-white border border-slate-200 rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <span>🖼️</span>
                <span>Download PNG</span>
              </button>
            </div>
          </div>

          {/* Detail Akun Siswa Ini */}
          {activePreviewStudent && (
            <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/90 text-xs space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Detail Kredensial Siswa Terpilih:
              </span>
              <div className="flex justify-between font-mono text-slate-700">
                <span className="text-slate-500">Nomor Peserta:</span>
                <span className="font-bold text-indigo-700">{activePreviewStudent.kodeUjian}</span>
              </div>
              <div className="flex justify-between font-mono text-slate-700">
                <span className="text-slate-500">Ruang Ujian:</span>
                <span className="font-bold text-slate-800">
                  {activePreviewStudent.ruangUjian && activePreviewStudent.ruangUjian !== '-'
                    ? (String(activePreviewStudent.ruangUjian).toUpperCase().startsWith('R') ? activePreviewStudent.ruangUjian : `Ruang ${activePreviewStudent.ruangUjian}`)
                    : '(Belum diatur)'}
                </span>
              </div>
              <div className="flex justify-between font-mono text-slate-700">
                <span className="text-slate-500">Username Ujian:</span>
                <span className="font-bold text-slate-800">{activePreviewStudent.portalUsername || activePreviewStudent.username || activePreviewStudent.kodeUjian}</span>
              </div>
              <div className="flex justify-between font-mono text-slate-700">
                <span className="text-slate-500">Password / PIN:</span>
                <span className="font-bold text-red-600">{activePreviewStudent.portalPassword || activePreviewStudent.password || '-'}</span>
              </div>
            </div>
          )}
        </div>

        {/* PANEL KANAN: TABEL PESERTA UJIAN & FILTER (7 KOLOM) */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-4">
          
          {/* TRAY ANTREAN SISWA TERPILIH UNTUK DICETAK */}
          {selectedStudentIds.length > 0 && (
            <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50/90 via-violet-50/70 to-blue-50/90 border border-indigo-200/90 shadow-sm space-y-3 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-sm font-bold shadow-xs shrink-0">
                    ✓
                  </span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-slate-900 text-xs tracking-tight">
                        Antrean Cetak: {selectedStudentIds.length} Siswa Terpilih
                      </span>
                      <span className="px-2 py-0.2 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-bold border border-indigo-200">
                        Siap Cetak / PDF
                      </span>
                    </div>
                    <p className="text-[10.5px] text-slate-500">
                      Hanya siswa yang diceklist yang akan dicetak / diunduh ke PDF.
                    </p>
                  </div>
                </div>

                {/* Aksi Cepat Antrean */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleOpenPrintModal('bulk')}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    title="Buka dialog cetak langsung untuk siswa terpilih"
                  >
                    <span>🖨️</span>
                    <span>Cetak Terpilih ({selectedStudentIds.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportBulkPdf}
                    disabled={isExportingBulk}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                    title="Unduh file PDF untuk siswa terpilih"
                  >
                    <span>📄</span>
                    <span>{isExportingBulk ? `${exportProgress.percent}%` : 'Unduh PDF'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleClearSelectedStudents}
                    className="px-2.5 py-1.5 bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 rounded-xl text-[11px] font-bold transition-colors cursor-pointer"
                    title="Kosongkan semua siswa terpilih"
                  >
                    ✕ Kosongkan
                  </button>
                </div>
              </div>

              {/* Chips Siswa Terpilih (Scrollable Horizontal) */}
              <div className="flex items-center gap-1.5 flex-wrap max-h-24 overflow-y-auto pr-1">
                {selectedStudents.map(st => {
                  const id = st.nisn || st.id
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-white border border-indigo-200/80 text-slate-800 text-[11px] font-bold shadow-2xs group hover:border-indigo-400 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => setPreviewStudentId(id)}
                        className="hover:text-indigo-600 cursor-pointer text-left flex items-center gap-1"
                        title="Klik untuk pratinjau kartu siswa ini"
                      >
                        <span>{st.nama}</span>
                        <span className="text-[9.5px] px-1 py-0.2 bg-slate-100 rounded text-slate-500 font-semibold">{st.kelas}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggleSelectStudent(id)
                        }}
                        className="w-4 h-4 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center font-black text-xs cursor-pointer transition-colors"
                        title="Hapus dari antrean cetak"
                      >
                        ×
                      </button>
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {/* Controls Bar: Filter Kelas & Search */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label className="text-xs font-bold text-slate-500 shrink-0">Filter Kelas:</label>
              <select
                value={selectedKelas}
                onChange={e => setSelectedKelas(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
              >
                <option value="all">Semua Kelas ({allRankedStudents.length} siswa)</option>
                {availableClasses.map(cls => (
                  <option key={cls} value={cls}>Kelas {cls}</option>
                ))}
              </select>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-60">
              <input
                type="text"
                placeholder="Cari Nama / NISN / Kode..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
              />
              <span className="absolute left-2.5 top-2 text-slate-400 text-xs">🔍</span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1.5 text-slate-400 hover:text-slate-600 font-bold text-xs"
                >
                  &times;
                </button>
              )}
            </div>
          </div>

          {/* Info Jumlah */}
          <div className="flex items-center justify-between text-xs text-slate-500 px-1 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span>Menampilkan <strong>{filteredStudents.length}</strong> siswa</span>
              {selectedStudentIds.length > 0 && (
                <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 text-[11px] flex items-center gap-1">
                  <span>✓ {selectedStudentIds.length} terpilih</span>
                </span>
              )}
            </div>
            {selectedKelas !== 'all' && (
              <span className="text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200 text-[11px]">
                Kelas {selectedKelas}
              </span>
            )}
          </div>

          {/* Tabel Peserta Ujian */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 text-[11px] font-bold uppercase tracking-wider sticky top-0 border-b border-slate-200">
                <tr>
                  <th className="p-3 text-center w-10">
                    <input
                      type="checkbox"
                      checked={isAllFilteredSelected}
                      onChange={handleToggleSelectAllFiltered}
                      title={isAllFilteredSelected ? "Batal pilih semua siswa di tampilan ini" : "Pilih semua siswa di tampilan ini"}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                    />
                  </th>
                  <th className="p-3 text-center w-10">No</th>
                  <th className="p-3 w-14 text-center">Absen</th>
                  <th className="p-3 w-14 text-center">Urut</th>
                  <th className="p-3 w-28 whitespace-nowrap">Kode Ujian</th>
                  <th className="p-3 min-w-[170px] whitespace-nowrap">Nama Siswa</th>
                  <th className="p-3 text-center w-14">Kelas</th>
                  <th className="p-3 text-center w-16 whitespace-nowrap">Ruang</th>
                  <th className="p-3 w-28 whitespace-nowrap">Username</th>
                  <th className="p-3 w-28 whitespace-nowrap">
                    <div className="flex items-center justify-between gap-1">
                      <span>Password</span>
                      <button
                        type="button"
                        onClick={() => setShowTablePasswords(prev => !prev)}
                        className="p-1 hover:bg-slate-200/70 rounded text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                        title={showTablePasswords ? "Klik untuk sensor password di tabel" : "Klik untuk tampilkan password di tabel"}
                      >
                        {showTablePasswords ? '👁️' : '🔒'}
                      </button>
                    </div>
                  </th>
                  <th className="p-3 text-center w-28 whitespace-nowrap">Pilih & Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-slate-400">
                      Tidak ada siswa di kelas ini yang cocok dengan filter pencarian.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((s, idx) => {
                    const studentKey = s.nisn || s.id
                    const isPreviewActive = activePreviewStudent && (activePreviewStudent.nisn || activePreviewStudent.id) === studentKey
                    const isStudentChecked = selectedStudentIds.includes(studentKey)

                    return (
                      <tr
                        key={studentKey || idx}
                        onClick={() => setPreviewStudentId(studentKey)}
                        className={`cursor-pointer transition-colors ${
                          isStudentChecked
                            ? (isPreviewActive ? 'bg-indigo-100/80 font-semibold' : 'bg-indigo-50/60')
                            : (isPreviewActive ? 'bg-indigo-50/80 font-semibold' : 'hover:bg-slate-50')
                        }`}
                      >
                        <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isStudentChecked}
                            onChange={() => handleToggleSelectStudent(studentKey)}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                          />
                        </td>
                        <td className="p-2.5 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="p-2.5 text-center font-mono font-bold text-slate-700">{s.noAbsen}</td>
                        <td className="p-2.5 text-center font-mono text-slate-500 text-[11px]">#{s.noUrutSekolah}</td>
                        <td className="p-2.5 font-mono font-bold text-indigo-700 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-xs inline-block">
                            {s.kodeUjian}
                          </span>
                        </td>
                        <td className="p-2.5 font-bold text-slate-800 whitespace-nowrap">
                          {s.nama}
                        </td>
                        <td className="p-2.5 text-center whitespace-nowrap">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-700">
                            {s.kelas}
                          </span>
                        </td>
                        <td className="p-2.5 text-center whitespace-nowrap">
                          {s.ruangUjian && s.ruangUjian !== '-' ? (
                            <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-[10px] font-bold text-indigo-700">
                              {String(s.ruangUjian).toUpperCase().startsWith('R') ? s.ruangUjian : `R.${s.ruangUjian}`}
                            </span>
                          ) : (
                            <span className="text-slate-300 font-normal">-</span>
                          )}
                        </td>
                        <td className="p-2.5 font-mono text-slate-600 whitespace-nowrap text-[11px]">
                          {s.portalUsername || s.username || s.kodeUjian}
                        </td>
                        <td className="p-2.5 font-mono text-red-600 font-bold whitespace-nowrap text-[11px]">
                          {showTablePasswords
                            ? (s.portalPassword || s.password || '-')
                            : (s.portalPassword || s.password ? '••••••' : '-')}
                        </td>
                        <td className="p-2.5 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleToggleSelectStudent(studentKey)
                              }}
                              className={`px-2 py-1 rounded-lg text-[10.5px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                                isStudentChecked
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                              }`}
                              title={isStudentChecked ? "Keluarkan siswa ini dari antrean cetak" : "Tambahkan siswa ini ke antrean cetak"}
                            >
                              <span>{isStudentChecked ? '✓' : '+'}</span>
                              <span>{isStudentChecked ? 'Terpilih' : 'Pilih'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setPreviewStudentId(studentKey)
                              }}
                              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer ${
                                isPreviewActive
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                              }`}
                              title="Lihat preview kartu di panel kiri"
                            >
                              {isPreviewActive ? 'Aktif' : 'Lihat'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

        </div>

      </div>

      {/* 4. MODAL ATUR SUSUNAN KODE UJIAN (DROPDOWN DEPAN, TENGAH, BELAKANG - SANGAT MUDAH & INTUITIF) */}
      {showCodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚙️</span>
                <div>
                  <h3 className="font-bold text-slate-900 text-base leading-tight">
                    Atur Susunan Format Kode Ujian
                  </h3>
                  <p className="text-xs text-slate-500">
                    Pilih urutan elemen dari posisi depan, tengah, hingga belakang.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCodeModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center text-base"
              >
                &times;
              </button>
            </div>

            {/* FORM DROPDOWN POSISI */}
            <div className="space-y-3.5 text-xs">
              
              {/* Posisi 1 (Depan) */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  1. Posisi Paling Depan:
                </label>
                <select
                  value={codeConfig.part1}
                  onChange={e => setCodeConfig({ ...codeConfig, part1: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  {CODE_PART_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Posisi 2 (Tengah) */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  2. Posisi Tengah:
                </label>
                <select
                  value={codeConfig.part2}
                  onChange={e => setCodeConfig({ ...codeConfig, part2: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  {CODE_PART_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Posisi 3 (Belakang) */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  3. Posisi Belakang:
                </label>
                <select
                  value={codeConfig.part3}
                  onChange={e => setCodeConfig({ ...codeConfig, part3: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  {CODE_PART_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Posisi 4 (Opsional Tambahan) */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  4. Posisi Tambahan (Opsional):
                </label>
                <select
                  value={codeConfig.part4}
                  onChange={e => setCodeConfig({ ...codeConfig, part4: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  {CODE_PART_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Pemisah Antar Elemen */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  5. Tanda Pemisah Antar Bagian:
                </label>
                <select
                  value={codeConfig.separator}
                  onChange={e => setCodeConfig({ ...codeConfig, separator: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  {SEPARATOR_OPTIONS.map(sep => (
                    <option key={sep.value} value={sep.value}>{sep.label}</option>
                  ))}
                </select>
              </div>

              {/* PREVIEW HASIL KODE */}
              <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-3.5 space-y-1 mt-2">
                <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block">
                  Contoh Kode yang Terbentuk Saat Ini:
                </span>
                <div className="flex items-center gap-3 font-mono font-black text-indigo-900 text-lg">
                  <span>{activePatternSummary || '9A01002'}</span>
                  <span className="text-xs text-slate-500 font-sans font-normal">(Siswa 9A Absen 1 Urut 2)</span>
                </div>
              </div>

              {/* Pola Siap Pakai / Presets */}
              <div className="space-y-1 pt-1">
                <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider block">
                  Pola Cepat Rekomendasi:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCodeConfig({ part1: '{KELAS}', part2: '{INDEX_ROMBEL:2}', part3: '{ABSEN:2}', part4: 'none', separator: '.' })}
                    className="px-2.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold border border-indigo-200 transition-colors"
                  >
                    Urutan Rombel: 9A.02.31 ⭐
                  </button>
                  <button
                    type="button"
                    onClick={() => setCodeConfig({ part1: '{KELAS}', part2: '{URUT_TINGKAT:3}', part3: 'none', part4: 'none', separator: '' })}
                    className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-bold border border-emerald-200 transition-colors"
                  >
                    Se-Tingkat: 9A034 ⭐
                  </button>
                  <button
                    type="button"
                    onClick={() => setCodeConfig({ part1: '{KELAS}', part2: '{URUT_ROMBEL:2}', part3: 'none', part4: 'none', separator: '' })}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg text-xs font-semibold border border-slate-200 transition-colors"
                  >
                    Rombel: 9A01
                  </button>
                  <button
                    type="button"
                    onClick={() => setCodeConfig({ part1: '{KELAS}', part2: '{ABSEN:2}', part3: '{URUT_SEKOLAH:3}', part4: 'none', separator: '' })}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg text-xs font-semibold border border-slate-200 transition-colors"
                  >
                    Standar: 9A01002
                  </button>
                  <button
                    type="button"
                    onClick={() => setCodeConfig({ part1: '{KELAS}', part2: '{ABSEN:2}', part3: '{URUT_SEKOLAH:3}', part4: 'none', separator: '-' })}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg text-xs font-semibold border border-slate-200 transition-colors"
                  >
                    Strip: 9A-01-002
                  </button>
                  <button
                    type="button"
                    onClick={() => setCodeConfig({ part1: '{TAHUN}', part2: '{KELAS}', part3: '{ABSEN:2}', part4: 'none', separator: '' })}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg text-xs font-semibold border border-slate-200 transition-colors"
                  >
                    Tahun Depan: 269A01
                  </button>
                </div>
              </div>

            </div>

            <div className="border-t border-slate-100 pt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCodeModal(false)}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors"
              >
                Simpan & Terapkan
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 5. MODAL PENGATURAN KARTU & PORTAL */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚙️</span>
                <h3 className="font-bold text-slate-900 text-base">Pengaturan Kartu Ujian & Portal CBT</h3>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              
              <div>
                <label className="font-bold text-slate-700 block mb-1">Judul Ujian / Asesmen:</label>
                <input
                  type="text"
                  value={settings.judulUjian}
                  onChange={e => setSettings({ ...settings, judulUjian: e.target.value })}
                  placeholder="Contoh: KARTU PESERTA ASESMEN SUMATIF / PTS / PAT"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Semester:</label>
                  <select
                    value={settings.semester || ''}
                    onChange={e => setSettings({ ...settings, semester: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="">(Kosongkan)</option>
                    <option value="Semester Ganjil">Semester Ganjil</option>
                    <option value="Semester Genap">Semester Genap</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Tanggal Terbit Kartu:</label>
                  <input
                    type="text"
                    value={settings.tanggalTerbit}
                    onChange={e => setSettings({ ...settings, tanggalTerbit: e.target.value })}
                    placeholder="Contoh: Jakarta, 15 September 2026"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Nama Penandatangan:</label>
                  <input
                    type="text"
                    value={settings.namaPenandatangan}
                    onChange={e => setSettings({ ...settings, namaPenandatangan: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Jabatan:</label>
                  <input
                    type="text"
                    value={settings.jabatanPenandatangan}
                    onChange={e => setSettings({ ...settings, jabatanPenandatangan: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-3">
                <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wider block">
                  Kredensial Default Akun Siswa (Bawaan Sistem)
                </span>
                <p className="text-[11px] text-slate-500">
                  Digunakan sebagai nilai awal jika Anda belum mengunggah file data Ruang & Akun.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Sumber Username Bawaan:</label>
                    <select
                      value={settings.usernameSource}
                      onChange={e => setSettings({ ...settings, usernameSource: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="kode_ujian">Gunakan Kode Ujian (Rekomendasi)</option>
                      <option value="nisn">Gunakan NISN Siswa</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Sumber Password Bawaan:</label>
                    <select
                      value={settings.passwordSource}
                      onChange={e => setSettings({ ...settings, passwordSource: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="kode_akses">Kode Akses Siswa (Database)</option>
                      <option value="tgl_lahir">Tanggal Lahir (DDMMYYYY)</option>
                      <option value="custom">Password Tetap / Kustom</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Tampilan Kolom Password:</label>
                    <select
                      value={settings.passwordVisibility || 'show'}
                      onChange={e => setSettings({ ...settings, passwordVisibility: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="show">👁️ Tampilkan Password (Teks Asli)</option>
                      <option value="mask">🔒 Sensor Password (••••••)</option>
                      <option value="hide">🚫 Sembunyikan Kolom Password (2 Kolom)</option>
                    </select>
                  </div>
                </div>

                {settings.passwordSource === 'custom' && (
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Ketik Password Tetap Semua Siswa:</label>
                    <input
                      type="text"
                      value={settings.customPassword}
                      onChange={e => setSettings({ ...settings, customPassword: e.target.value })}
                      placeholder="Contoh: smpbm2026"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

            </div>

            <div className="border-t border-slate-100 pt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors"
              >
                Simpan & Terapkan
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 6. MODAL UPLOAD EXCEL RUANG & AKUN UJIAN SISWA */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl shrink-0">
                  📥
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Upload Data Ruang & Akun Ujian</h3>
                  <p className="text-xs text-slate-500">
                    Isi dan sinkronkan data Ruang Ujian, Username, dan Password peserta secara massal.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center"
              >
                &times;
              </button>
            </div>

            {/* Status Pesan / Feedback */}
            {uploadMessage && (
              <div className={`p-3 rounded-2xl text-xs font-semibold flex items-center gap-2 ${
                uploadMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                uploadMessage.type === 'error' ? 'bg-rose-50 text-rose-800 border border-rose-200' :
                'bg-blue-50 text-blue-800 border border-blue-200'
              }`}>
                <span>{uploadMessage.type === 'success' ? '✅' : uploadMessage.type === 'error' ? '⚠️' : 'ℹ️'}</span>
                <span>{uploadMessage.text}</span>
              </div>
            )}

            <div className="space-y-3.5 text-xs">
              
              {/* Langkah 1: Unduh Format Excel */}
              <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px]">
                      1
                    </span>
                    <span className="font-bold text-slate-800 text-xs">
                      Unduh Template Excel Peserta
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadUploadTemplate}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
                  >
                    <span>📥</span>
                    <span>Download Template Excel</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-600 pl-7">
                  Template otomatis terisi data {allRankedStudents.length} siswa aktif (NISN, Nama, Kelas, dan Kode Ujian). Anda cukup melengkapi kolom <strong>Ruang Ujian</strong>, <strong>Username</strong>, dan <strong>Password</strong>.
                </p>
              </div>

              {/* Langkah 2: Upload File Excel */}
              <div className="p-4 rounded-2xl bg-emerald-50/40 border border-emerald-100 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px]">
                    2
                  </span>
                  <span className="font-bold text-slate-800 text-xs">
                    Unggah File Excel yang Telah Diisi
                  </span>
                </div>
                <div className="pl-7 space-y-2">
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    disabled={isProcessingUpload}
                    onChange={handleFileUpload}
                    className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 cursor-pointer disabled:opacity-50"
                  />
                  <p className="text-[10.5px] text-slate-500">
                    Kolom yang dicocokkan otomatis: <strong>NISN</strong> (atau <strong>Kode Peserta</strong> / <strong>Nama</strong>), <strong>Ruang Ujian</strong>, <strong>Username</strong>, dan <strong>Password</strong>.
                  </p>
                </div>
              </div>

              {/* Status Data Kustom Tersimpan */}
              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 flex items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] font-bold text-slate-700 block">
                    Status Data Unggahan:
                  </span>
                  <span className="text-xs text-slate-500">
                    {Object.keys(customExamData).length > 0
                      ? `Terdapat data kustom tersimpan untuk ${Object.keys(customExamData).length} record siswa.`
                      : 'Belum ada data unggahan (menggunakan akun bawaan sistem).'}
                  </span>
                </div>
                {Object.keys(customExamData).length > 0 && (
                  <button
                    type="button"
                    onClick={handleResetCustomData}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold text-[11px] transition-colors shrink-0"
                  >
                    Reset Data Upload
                  </button>
                )}
              </div>

            </div>

            <div className="border-t border-slate-100 pt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors"
              >
                Selesai & Tutup
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 6. HIDDEN CONTAINER UNTUK RENDER MASSAL KARTU PDF A4 & HIGH-RES PRINT */}
      {/* Hidden Container untuk Render Kartu Skala 1:1 Seluruh Siswa (Digunakan html2canvas Saat Cetak / Ekspor PDF Massal) */}
      <div
        ref={bulkCardsContainerRef}
        style={{
          position: 'fixed',
          left: '-99999px',
          top: '0',
          zIndex: -9999,
          opacity: 1,
          visibility: (isExportingBulk || isPreparingPrint) ? 'visible' : 'hidden',
          pointerEvents: 'none'
        }}
      >
        {(isExportingBulk || isPreparingPrint) && targetStudentsForBulkPrint.map((st, idx) => (
          <div key={st.nisn || st.id || idx} style={{ width: '510px', height: '322px', marginBottom: '20px' }}>
            <KartuUjianCard
              student={st}
              photoUrl={st.foto_url}
              settings={settingsWithOffsets}
              scale={1}
            />
          </div>
        ))}
      </div>

      {/* Container Unscaled Khusus Ekspor / Cetak 1 Kartu (Scale 1.0 Murni Tanpa CSS Transform) */}
      <div
        style={{
          position: 'fixed',
          left: '-99999px',
          top: '0',
          zIndex: -9999,
          opacity: 1,
          pointerEvents: 'none'
        }}
      >
        <div ref={exportSingleCardRef} style={{ width: '510px', height: '322px' }}>
          {activePreviewStudent && (
            <KartuUjianCard
              student={activePreviewStudent}
              photoUrl={activePreviewStudent?.foto_url}
              settings={settingsWithOffsets}
              scale={1}
              isEditorMode={false}
            />
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 7. MODAL FULLSCREEN STUDIO EDITOR (PORTAL KE DOCUMENT.BODY) */}
      {/* ========================================================================= */}
      {isFullscreen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] w-screen h-screen bg-slate-950/75 backdrop-blur-md flex flex-col overflow-hidden select-none animate-fade-in">
          {/* Top Bar Fullscreen */}
          <div className="h-16 px-6 bg-white/95 backdrop-blur-md border-b border-slate-200/80 flex items-center justify-between shadow-xs shrink-0 z-10">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 font-black text-base border border-indigo-100">
                🪪
              </span>
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                  STUDIO KARTU UJIAN — MODE LAYAR PENUH
                </h3>
                <p className="text-[11px] text-slate-500">
                  Drag & drop langsung pada kartu, geser koordinat, atau sesuaikan ukuran & rotasi
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Sample Siswa Dropdown */}
              <select
                value={activePreviewStudent?.nisn || activePreviewStudent?.id || ''}
                onChange={e => setPreviewStudentId(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold outline-none cursor-pointer max-w-xs truncate"
              >
                {filteredStudents.map(s => (
                  <option key={s.nisn || s.id} value={s.nisn || s.id}>
                    {s.nama} (Kelas {s.kelas || '-'})
                  </option>
                ))}
              </select>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setFullscreenZoom(z => Math.max(0.6, Number((z - 0.1).toFixed(1))))}
                  className="px-2 py-0.5 text-xs font-bold text-slate-700 hover:bg-white rounded cursor-pointer"
                  title="Perkecil Zoom"
                >
                  -
                </button>
                <span className="text-[11px] font-mono font-bold text-slate-700 px-1">
                  {Math.round(fullscreenZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setFullscreenZoom(z => Math.min(1.6, Number((z + 0.1).toFixed(1))))}
                  className="px-2 py-0.5 text-xs font-bold text-slate-700 hover:bg-white rounded cursor-pointer"
                  title="Perbesar Zoom"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setFullscreenZoom(1.0)}
                  className="text-[10px] text-slate-500 hover:text-slate-900 px-1.5 cursor-pointer font-semibold"
                  title="Kembalikan Zoom 100%"
                >
                  100%
                </button>
              </div>

              {/* Quick Toggle Password Visibility di Fullscreen */}
              <button
                type="button"
                onClick={() => handleTogglePasswordVisibility()}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs border ${
                  settings.passwordVisibility === 'hide'
                    ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                    : settings.passwordVisibility === 'mask'
                    ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                }`}
                title="Klik untuk ubah tampilan password: Tampil -> Sensor (••••) -> Sembunyikan Kolom"
              >
                <span>{settings.passwordVisibility === 'hide' ? '🚫' : settings.passwordVisibility === 'mask' ? '🔒' : '👁️'}</span>
                <span>Pwd: {settings.passwordVisibility === 'hide' ? 'Sembunyi' : settings.passwordVisibility === 'mask' ? 'Sensor' : 'Tampil'}</span>
              </button>

              {/* Auto-Save Toggle */}
              <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={handleToggleAutoSave}
                  className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isAutoSaveEnabled ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                  title={isAutoSaveEnabled ? 'Simpan Otomatis Aktif' : 'Simpan Otomatis Nonaktif'}
                >
                  <span
                    className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      isAutoSaveEnabled ? 'translate-x-3' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-[11px] font-bold text-slate-700 select-none">
                  Auto-Save {isAutoSaveEnabled ? 'ON' : 'OFF'}
                </span>
                {autoSaveStatus === 'saving' && (
                  <span className="text-[10px] text-indigo-600 font-bold flex items-center gap-1">
                    <span className="animate-spin">🔄</span>
                  </span>
                )}
                {autoSaveStatus === 'saved' && (
                  <span className="text-[10px] text-emerald-600 font-bold">
                    ✓
                  </span>
                )}
                {!autoSaveStatus && hasUnsavedChanges && (
                  <span className="text-[10px] text-amber-600 font-bold" title="Ada perubahan belum tersimpan">
                    ⚠️
                  </span>
                )}
              </div>

              {/* Tombol Simpan Manual */}
              <button
                type="button"
                onClick={() => handleSaveSettings(false)}
                disabled={savingSettings}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                  hasUnsavedChanges
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-300 shadow-md animate-pulse'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                }`}
                title="Simpan pengaturan & posisi kartu ke database Supabase"
              >
                <span>{savingSettings ? '⏳' : hasUnsavedChanges ? '💾' : '✓'}</span>
                <span>{savingSettings ? 'Menyimpan...' : hasUnsavedChanges ? 'Simpan Sekarang ⚠️' : 'Tersimpan'}</span>
              </button>

              {/* Tombol Tutup Fullscreen */}
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>✕ Keluar Layar Penuh (Esc)</span>
              </button>
            </div>
          </div>

          {/* Workspace: Center Large Canvas + Right Inspector Sidebar */}
          <div className="flex-1 flex overflow-hidden min-h-0 w-full">
            {/* Center Canvas */}
            <div className="flex-1 h-full overflow-hidden bg-slate-900/30 p-6 flex flex-col items-center justify-center relative">
              <div 
                style={{ 
                  width: '510px', 
                  height: '322px', 
                  transform: `scale(${fullscreenZoom})`, 
                  transformOrigin: 'center center' 
                }} 
                className="shadow-2xl rounded-none shrink-0 transition-transform duration-75 select-none"
              >
                <KartuUjianCard
                  student={activePreviewStudent}
                  photoUrl={activePreviewStudent?.foto_url}
                  settings={settingsWithOffsets}
                  scale={1}
                  isEditorMode={isEditorMode}
                  activeComponent={activeComponentId}
                  onSelectComponent={(id) => setActiveComponentId(id)}
                  onStartDrag={handleStartDrag}
                  onDeleteComponent={handleDeleteComponent}
                  onTogglePasswordVisibility={handleTogglePasswordVisibility}
                />
              </div>
            </div>

            {/* Right Inspector Sidebar */}
            <div className="w-[420px] max-w-[45vw] h-full border-l border-slate-200/80 bg-white p-5 overflow-y-auto shrink-0 shadow-2xl">
              {renderStudioInspectorContent()}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* MODAL TAMBAH KOMPONEN KUSTOM BARU (PORTAL KE DOCUMENT.BODY) */}
      {/* ========================================================================= */}
      {isAddCustomModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md p-6 space-y-4 animate-scale-in text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  ✨
                </span>
                <h3 className="text-sm font-black text-slate-900">Tambah Komponen Baru</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddCustomModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold text-sm cursor-pointer p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {/* Tipe Komponen */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Tipe Komponen:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewCustomData(prev => ({ ...prev, type: 'text', text: prev.text || 'Teks Baru' }))}
                    className={`p-2 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      newCustomData.type === 'text'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-base">✏️</span>
                    <span className="text-[11px]">Teks Bebas</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCustomData(prev => ({ ...prev, type: 'badge', text: prev.text || 'BADGE BARU' }))}
                    className={`p-2 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      newCustomData.type === 'badge'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-base">🏷️</span>
                    <span className="text-[11px]">Badge Kapsul</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCustomData(prev => ({ ...prev, type: 'image', shape: 'square' }))}
                    className={`p-2 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      newCustomData.type === 'image'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-base">🖼️</span>
                    <span className="text-[11px]">Gambar / Logo</span>
                  </button>
                </div>
              </div>

              {/* Sisi Kartu */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Sisi Kartu:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewCustomData(prev => ({ ...prev, side: 'front' }))}
                    className={`py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      newCustomData.side === 'front'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    Sisi Depan
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCustomData(prev => ({ ...prev, side: 'back' }))}
                    className={`py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      newCustomData.side === 'back'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    Sisi Belakang
                  </button>
                </div>
              </div>

              {newCustomData.type === 'image' ? (
                <>
                  {/* Upload Gambar */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Pilih File Gambar dari Perangkat:
                    </label>
                    <div className="flex items-center gap-2.5">
                      <div className="w-14 h-14 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0 shadow-2xs">
                        {newCustomData.imageUrl ? (
                          <img src={newCustomData.imageUrl} alt="" className="w-full h-full object-contain" />
                        ) : (
                          <span className="text-2xl">🖼️</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <label className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer inline-flex items-center gap-1.5 shadow-2xs">
                          <span>📤</span>
                          <span>{newCustomData.imageUrl ? 'Ganti File Gambar' : 'Pilih Gambar...'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async e => {
                              const file = e.target.files?.[0]
                              if (file) {
                                const compressed = await compressImageFile(file)
                                setNewCustomData(prev => ({
                                  ...prev,
                                  imageUrl: compressed,
                                  label: prev.label || file.name.replace(/\.[^/.]+$/, '')
                                }))
                              }
                            }}
                          />
                        </label>
                        <p className="text-[10px] text-slate-400 mt-1">Mendukung PNG, JPG, SVG, WebP</p>
                      </div>
                    </div>
                  </div>

                  {/* URL Gambar Alternatif */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Atau Masukkan URL Gambar:
                    </label>
                    <input
                      type="text"
                      value={newCustomData.imageUrl}
                      onChange={e => setNewCustomData(prev => ({ ...prev, imageUrl: e.target.value }))}
                      placeholder="https://... atau data:image/..."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-mono outline-none focus:border-indigo-500 focus:bg-white"
                    />
                  </div>

                  {/* Lebar & Tinggi */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10.5px] font-bold text-slate-700 block mb-1">
                        Lebar ({newCustomData.width || 65}px):
                      </label>
                      <input
                        type="range"
                        min={20}
                        max={250}
                        step={5}
                        value={newCustomData.width || 65}
                        onChange={e => setNewCustomData(prev => ({ ...prev, width: Number(e.target.value) }))}
                        className="w-full accent-indigo-600"
                      />
                    </div>
                    <div>
                      <label className="text-[10.5px] font-bold text-slate-700 block mb-1">
                        Tinggi ({newCustomData.height || 65}px):
                      </label>
                      <input
                        type="range"
                        min={20}
                        max={250}
                        step={5}
                        value={newCustomData.height || 65}
                        onChange={e => setNewCustomData(prev => ({ ...prev, height: Number(e.target.value) }))}
                        className="w-full accent-indigo-600"
                      />
                    </div>
                  </div>

                  {/* Mode & Bentuk */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10.5px] font-bold text-slate-700 block mb-1">
                        Kerapian Gambar:
                      </label>
                      <select
                        value={newCustomData.imageFit || 'contain'}
                        onChange={e => setNewCustomData(prev => ({ ...prev, imageFit: e.target.value }))}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700"
                      >
                        <option value="contain">Pas Kotak (Contain)</option>
                        <option value="cover">Isi Penuh (Cover)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10.5px] font-bold text-slate-700 block mb-1">
                        Bentuk Sudut:
                      </label>
                      <select
                        value={newCustomData.shape || 'square'}
                        onChange={e => setNewCustomData(prev => ({ ...prev, shape: e.target.value }))}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700"
                      >
                        <option value="square">Lurus Siku (Persegi)</option>
                        <option value="rounded">Sudut Melengkung</option>
                        <option value="circle">Bulat / Lingkaran</option>
                      </select>
                    </div>
                  </div>

                  {/* Transparansi Slider */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10.5px] font-bold text-slate-700">
                        Transparansi (Opacity):
                      </label>
                      <span className="font-mono text-[10.5px] text-indigo-700 font-bold">
                        {Math.round((newCustomData.opacity !== undefined ? newCustomData.opacity : 1) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={newCustomData.opacity !== undefined ? newCustomData.opacity : 1}
                      onChange={e => setNewCustomData(prev => ({ ...prev, opacity: Number(e.target.value) }))}
                      className="w-full accent-indigo-600"
                    />
                  </div>
                </>
              ) : (
                /* Isi Teks untuk Teks Bebas / Badge */
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Teks Komponen:
                  </label>
                  <input
                    type="text"
                    value={newCustomData.text}
                    onChange={e => setNewCustomData(prev => ({ ...prev, text: e.target.value }))}
                    placeholder={newCustomData.type === 'badge' ? 'Contoh: OSIS 2026' : 'Contoh: STATUS: AKTIF'}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>
              )}

              {/* Label Pengenal */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nama Label Komponen (di Inspector):
                </label>
                <input
                  type="text"
                  value={newCustomData.label}
                  onChange={e => setNewCustomData(prev => ({ ...prev, label: e.target.value }))}
                  placeholder={newCustomData.type === 'image' ? 'Contoh: Logo Sponsor / Stempel' : 'Contoh: Label Status / Badge OSIS'}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              {/* Fitur Garis Pinggir / Border */}
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Garis Pinggir (Border)</span>
                    <span className="text-[10.5px] text-slate-500 block">Beri bingkai garis tepi pada komponen</span>
                  </div>
                  <div className="inline-flex rounded-lg p-0.5 bg-slate-200/80 border border-slate-300/60">
                    <button
                      type="button"
                      onClick={() => setNewCustomData(prev => ({ ...prev, hasBorder: false }))}
                      className={`px-2.5 py-1 text-[10.5px] font-bold rounded-md transition-all cursor-pointer ${
                        !newCustomData.hasBorder 
                          ? 'bg-white text-slate-800 shadow-2xs' 
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      ✕ Tanpa Garis
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewCustomData(prev => ({ ...prev, hasBorder: true }))}
                      className={`px-2.5 py-1 text-[10.5px] font-bold rounded-md transition-all cursor-pointer ${
                        newCustomData.hasBorder 
                          ? 'bg-indigo-600 text-white shadow-2xs' 
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      ✓ Pakai Garis
                    </button>
                  </div>
                </div>

                {newCustomData.hasBorder && (
                  <div className="pt-2 border-t border-slate-200/60 grid grid-cols-2 gap-2 animate-fade-in">
                    <div>
                      <label className="text-[10.5px] font-bold text-slate-600 block mb-1">
                        Warna Garis:
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={newCustomData.borderColor || '#cbd5e1'}
                          onChange={e => setNewCustomData(prev => ({ ...prev, borderColor: e.target.value }))}
                          className="w-7 h-7 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                        />
                        <input
                          type="text"
                          value={newCustomData.borderColor || '#cbd5e1'}
                          onChange={e => setNewCustomData(prev => ({ ...prev, borderColor: e.target.value }))}
                          className="flex-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-mono text-slate-700"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10.5px] font-bold text-slate-600 block mb-1">
                        Tipe & Tebal Garis:
                      </label>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={newCustomData.borderStyle || 'solid'}
                          onChange={e => setNewCustomData(prev => ({ ...prev, borderStyle: e.target.value }))}
                          className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-medium text-slate-700"
                        >
                          <option value="solid">Lurus (Solid)</option>
                          <option value="dashed">Putus-putus</option>
                          <option value="dotted">Titik</option>
                        </select>
                        <select
                          value={newCustomData.borderWidth || 1}
                          onChange={e => setNewCustomData(prev => ({ ...prev, borderWidth: Number(e.target.value) }))}
                          className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-medium text-slate-700"
                        >
                          <option value={1}>1px</option>
                          <option value={2}>2px</option>
                          <option value={3}>3px</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddCustomModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (newCustomData.type === 'image') {
                    if (!newCustomData.imageUrl) {
                      alert('Silakan pilih file gambar atau masukkan URL gambar terlebih dahulu.')
                      return
                    }
                  }
                  const finalData = {
                    ...newCustomData,
                    text: newCustomData.text?.trim() || (newCustomData.type === 'badge' ? 'BADGE BARU' : 'Teks Baru'),
                    label: newCustomData.label?.trim() || (newCustomData.type === 'image' ? 'Gambar Kustom' : newCustomData.type === 'badge' ? 'Badge Kustom' : 'Teks Bebas')
                  }
                  handleAddCustomComponent(finalData)
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer transition-colors"
              >
                Tambahkan ke Kartu
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* 8. MODAL PRATINJAU & DIALOG CETAK LANGSUNG PRINTER (PORTAL KE DOCUMENT.BODY) */}
      {/* ========================================================================= */}
      {isPrintModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden text-left animate-scale-in">
            {/* Header Modal */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/70">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center text-xl shadow-2xs font-bold">
                  🖨️
                </span>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {printModalMode === 'bulk'
                      ? (selectedStudentIds.length > 0 ? `Cetak ${selectedStudentIds.length} Siswa Terpilih` : 'Cetak Kartu Massal')
                      : 'Cetak 1 Kartu'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {printModalMode === 'bulk'
                      ? (selectedStudentIds.length > 0
                          ? `${selectedStudentIds.length} Siswa Terpilih (Sesuai Ceklist) • ${effectiveLayoutPreset.label} • Total ${totalPrintSheets} Lembar`
                          : `${filteredStudents.length} Siswa • ${effectiveLayoutPreset.label} • Total ${totalPrintSheets} Lembar`)
                      : `${activePreviewStudent?.nama || 'Siswa'} (${activePreviewStudent?.kelas || '-'}) • ${effectiveLayoutPreset.label}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold text-base cursor-pointer p-1.5 rounded-xl hover:bg-slate-200/60 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {/* Pilihan Ukuran & Susunan Kartu per Lembar A4 / F4 */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-800 text-xs">
                    Pilih Format Susunan Kartu:
                  </span>
                  <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg">
                    {effectiveLayoutPreset.label} ({effectiveLayoutPreset.sizeLabel || '8,5 × 6 cm'})
                  </span>
                </div>

                {/* Tab Pemilihan Kategori Ukuran */}
                <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setPrintLayoutCategory('85x60')
                      const newId = printModalMode === 'single' ? '85x60-1' : '85x60-8'
                      setPrintPresetId(newId)
                      setPrintPreviewPage(0)
                    }}
                    className={`flex-1 py-1.5 px-3 rounded-lg transition-all text-center cursor-pointer ${
                      printLayoutCategory === '85x60' || printLayoutCategory === '87x57' || printLayoutCategory === '87x56'
                        ? 'bg-white text-indigo-700 shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    Ukuran 8,5 × 6 cm (Hasil Kartu + Border)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPrintLayoutCategory('standard')
                      const newId = printModalMode === 'single' ? '1' : '10'
                      setPrintPresetId(newId)
                      setPrintPreviewPage(0)
                    }}
                    className={`flex-1 py-1.5 px-3 rounded-lg transition-all text-center cursor-pointer ${
                      printLayoutCategory === 'standard'
                        ? 'bg-white text-indigo-700 shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    Format Standar Lainnya
                  </button>
                </div>

                {/* Grid Pilihan Preset */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {displayedPresets.map((preset) => {
                    const isSelected = String(activeLayoutPreset.id) === String(preset.id)
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setPrintPresetId(String(preset.id))
                          setPrintPreviewPage(0)
                        }}
                        className={`p-2.5 rounded-xl border text-center flex flex-col items-center justify-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-50 border-indigo-600 ring-2 ring-indigo-600/30 shadow-xs'
                            : 'bg-slate-50 border-slate-200 hover:bg-white hover:border-slate-300'
                        }`}
                      >
                        <span className={`text-xs font-bold ${isSelected ? 'text-indigo-950' : 'text-slate-800'}`}>
                          {preset.label}
                        </span>
                        <span className={`text-[11px] font-medium mt-0.5 ${isSelected ? 'text-indigo-600 font-bold' : 'text-slate-500'}`}>
                          {preset.sizeLabel || `${(preset.cellWidthMm / 10).toString().replace('.', ',')} × ${(preset.cellHeightMm / 10).toString().replace('.', ',')} cm`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Pilihan Jarak Kartu ke Garis Potong */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">✂️</span>
                    <span className="font-bold text-slate-800 text-xs">
                      Jarak Kartu ke Garis Potong:
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">
                      (Perlebar celah potong tanpa mengubah ukuran fisik kartu)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg">
                      {printCardMarginMm === 0 ? '0 mm (Rapat Penuh)' : `${printCardMarginMm} mm`}
                    </span>
                  </div>
                </div>

                {/* Quick Preset Buttons & Precision Slider */}
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    { value: 0, label: '0 mm (Rapat)' },
                    { value: 0.5, label: '0.5 mm' },
                    { value: 0.7, label: '0.7 mm' },
                    { value: 1.0, label: '1 mm' },
                    { value: 1.5, label: '1.5 mm' },
                    { value: 2.0, label: '2 mm' },
                    { value: 3.0, label: '3 mm' },
                    { value: 4.0, label: '4 mm' }
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPrintCardMarginMm(opt.value)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        Number(printCardMarginMm) === opt.value
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-white hover:border-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}

                  <div className="flex-1 min-w-[140px] flex items-center gap-2 ml-1">
                    <input
                      type="range"
                      min="0"
                      max="5"
                      step="0.1"
                      value={printCardMarginMm}
                      onChange={(e) => setPrintCardMarginMm(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-600 bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-xl">
                  <span>📏 <strong>Ukuran Kartu Fisik:</strong> Tepat 8,5 × 6 cm (Hasil Kartu + Border)</span>
                  <span>✂️ <strong>Ukuran Garis Potong:</strong> {(effectiveLayoutPreset.cellWidthMm / 10).toFixed(2).replace('.', ',')} × {(effectiveLayoutPreset.cellHeightMm / 10).toFixed(2).replace('.', ',')} cm (Celah {printCardMarginMm} mm di sekeliling kartu)</span>
                </div>

                {/* Notifikasi Batas Kertas Jika Memilih 10 Kartu pada Kertas A4 */}
                {(effectiveLayoutPreset.cardsPerPage === 10 && effectiveLayoutPreset.paperSize !== 'f4') && (
                  <div className="flex items-start gap-3 p-3.5 bg-rose-50 border-2 border-rose-300 rounded-2xl text-xs text-rose-900 shadow-xs animate-fade-in">
                    <span className="text-xl shrink-0">⚠️</span>
                    <div className="space-y-1.5 flex-1">
                      <p className="font-black text-rose-950 text-xs">
                        Penyebab Kertas Bagian Bawah Terpotong:
                      </p>
                      <p className="leading-relaxed text-rose-900/90 text-[11px]">
                        Kartu ukuran <strong>8,5 × 6 cm</strong> sebanyak 10 kartu (5 baris) membutuhkan tinggi minimal <strong>30 cm</strong> (5 × 6 cm) sedangkan total lembar A4 hanya <strong>29,7 cm</strong>. Ditambah lagi sebagian besar printer memiliki batas fisik roller penjepit kertas (margin bawah 1,2 cm – 1,5 cm), sehingga baris kartu paling bawah (baris ke-5) pasti terpotong jika menggunakan kertas A4.
                      </p>
                      <div className="pt-1 flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setPrintPresetId('85x60-8')}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-xs cursor-pointer flex items-center gap-1.5 transition-all"
                        >
                          <span>⭐</span>
                          <span>Beralih ke 8 Kartu (A4) — Dijamin Bebas Terpotong</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPrintPresetId('10-f4-exact')}
                          className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs shadow-xs cursor-pointer flex items-center gap-1.5 transition-all"
                        >
                          <span>📄</span>
                          <span>Beralih ke 10 Kartu (Kertas F4 / Folio 33 cm)</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Visual Mini Paper Preview */}
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-100/70 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                    <span>👁️</span> Pratinjau Lembar ({effectiveLayoutPreset.label} — {effectiveLayoutPreset.sizeLabel || '8,5 × 6 cm'}):
                  </span>
                  {totalPrintSheets > 1 && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPrintPreviewPage(prev => Math.max(0, prev - 1))}
                        disabled={printPreviewPage === 0}
                        className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 disabled:opacity-40 cursor-pointer shadow-2xs"
                      >
                        ⬅️ Lembar Sebelumnya
                      </button>
                      <span className="font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg text-xs">
                        Lembar {printPreviewPage + 1} dari {totalPrintSheets}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPrintPreviewPage(prev => Math.min(totalPrintSheets - 1, prev + 1))}
                        disabled={printPreviewPage >= totalPrintSheets - 1}
                        className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 disabled:opacity-40 cursor-pointer shadow-2xs"
                      >
                        Lembar Berikutnya ➡️
                      </button>
                    </div>
                  )}
                </div>

                {/* Simulated Paper (A4 or F4) */}
                <div className="flex justify-center">
                  <div
                    style={{ minHeight: effectiveLayoutPreset.paperSize === 'f4' ? '540px' : '490px' }}
                    className="w-[360px] bg-white rounded-xl shadow-md border border-slate-300 p-3 flex flex-col justify-between relative overflow-hidden transition-all"
                  >
                    <div className="text-[9px] text-slate-400 font-bold text-center border-b border-slate-100 pb-1 mb-2">
                      {printModalMode === 'single'
                        ? `LEMBAR CETAK 1 KARTU (${effectiveLayoutPreset.label.toUpperCase()})`
                        : `LEMBAR ${printPreviewPage + 1} DARI ${totalPrintSheets} (${effectiveLayoutPreset.label.toUpperCase()})`}
                    </div>

                    <div className="flex-1 flex items-center justify-center p-1">
                      {(() => {
                        const previewMmToPx = 330 / 210
                        const cellWPx = Math.round(effectiveLayoutPreset.cellWidthMm * previewMmToPx)
                        const cellHPx = Math.round(effectiveLayoutPreset.cellHeightMm * previewMmToPx)
                        const cardWPx = Math.round(effectiveLayoutPreset.cardWidthMm * previewMmToPx)
                        const cardHPx = Math.round(effectiveLayoutPreset.cardHeightMm * previewMmToPx)
                        const scaleXVal = cardWPx / 510
                        const scaleYVal = cardHPx / 322

                        return (
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: `repeat(${effectiveLayoutPreset.cols}, ${cellWPx}px)`,
                              gridTemplateRows: `repeat(${effectiveLayoutPreset.rows}, ${cellHPx}px)`,
                              border: '0.6px solid #64748b'
                            }}
                            className="bg-white shadow-2xs relative"
                          >
                            {(bulkPages[printPreviewPage] || []).map((st, idx) => (
                              <div
                                key={st.nisn || st.id || idx}
                                style={{ width: `${cellWPx}px`, height: `${cellHPx}px`, border: '0.6px solid #64748b' }}
                                className="flex items-center justify-center bg-white relative box-border"
                              >
                                <div style={{ width: `${cardWPx}px`, height: `${cardHPx}px` }} className="relative flex items-center justify-center">
                                  <div style={{ width: '510px', height: '322px', transform: `scale(${scaleXVal}, ${scaleYVal})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
                                    <KartuUjianCard
                                      student={st}
                                      photoUrl={st.foto_url}
                                      settings={settingsWithOffsets}
                                      scale={1}
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      })()}
                    </div>

                    <div className="text-[8.5px] text-slate-400 text-center border-t border-slate-100 pt-1 mt-2 font-mono">
                      SMP BUDI MULIA JAKARTA • KARTU PESERTA UJIAN RESMI
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Progress Bar Persiapan Cetak Resolusi Tinggi */}
            {isPreparingPrint && (
              <div className="mx-6 mb-4 p-3.5 bg-indigo-50/90 border border-indigo-200 rounded-2xl flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
                  <div className="flex items-center gap-2">
                    <span className="animate-spin text-sm">⏳</span>
                    <span>Menyiapkan gambar kartu resolusi tinggi ({printProgress.current} / {printProgress.total})...</span>
                  </div>
                  <span className="font-mono bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-lg text-xs font-black">
                    {printProgress.percent}%
                  </span>
                </div>
                <div className="w-full h-2 bg-indigo-100/80 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-600 to-blue-600 rounded-full transition-all duration-200"
                    style={{ width: `${printProgress.percent}%` }}
                  />
                </div>
                <span className="text-[10px] text-indigo-600">
                  *Kartu dirender ke bitmap resolusi tinggi 300 DPI agar hasil print 100% presisi tanpa font geser / header tumpang tindih.
                </span>
              </div>
            )}

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <span className="text-[11px] text-slate-400">
                Ukuran cetak otomatis disesuaikan dengan susunan kartu yang dipilih.
              </span>
              <div className="flex items-center gap-2.5 flex-wrap justify-end">
                <button
                  type="button"
                  onClick={() => setIsPrintModalOpen(false)}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-2xs"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={triggerDirectPrint}
                  disabled={isPrinting}
                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-600/30 flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                >
                  <span>🖨️</span>
                  <span>
                    {isPrinting
                      ? 'Menyiapkan Printer...'
                      : (printModalMode === 'bulk' && selectedStudentIds.length > 0
                          ? `Cetak ${selectedStudentIds.length} Siswa Terpilih`
                          : 'Buka Dialog Printer (Cetak Sekarang)')}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Toast Notifikasi Berhasil Simpan */}
      {saveSuccessMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[999999] bg-emerald-700 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-bold animate-bounce">
          <span className="text-base">✓</span>
          <span>{saveSuccessMessage}</span>
        </div>
      )}

      {/* FLOATING ACTION BAR: Peringatan jika ada perubahan yang belum disimpan (saat Auto-Save OFF) */}
      {hasUnsavedChanges && !isAutoSaveEnabled && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[99999] bg-slate-900/95 text-white border border-slate-700/80 px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-4 text-xs font-semibold animate-slide-up">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 text-base">⚠️</span>
            <span>Ada perubahan posisi/pengaturan kartu ujian yang belum disimpan!</span>
          </div>
          <button
            type="button"
            onClick={() => handleSaveSettings(false)}
            disabled={savingSettings}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            <span>{savingSettings ? '⏳' : '💾'}</span>
            <span>{savingSettings ? 'Menyimpan...' : 'Simpan Sekarang'}</span>
          </button>
        </div>
      )}
    </div>
  )
}

