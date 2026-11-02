import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'
// ExcelJS di-lazy-load saat export (hemat ~920KB dari initial load)
import { downloadFile } from '../utils/fileDownloader'
import { getSemesterAktif } from '../utils/semesterUtils'

// ─── Theme Colors for BABs (matching NilaiGuruSection) ────────────────────────
const BAB_BG = [
  'bg-indigo-50/70 border-indigo-100',
  'bg-emerald-50/70 border-emerald-100',
  'bg-amber-50/70 border-amber-100',
  'bg-purple-50/70 border-purple-100',
  'bg-rose-50/70 border-rose-100',
  'bg-cyan-50/70 border-cyan-100'
]
const BAB_TEXT = [
  'text-indigo-800',
  'text-emerald-800',
  'text-amber-800',
  'text-purple-800',
  'text-rose-800',
  'text-cyan-800'
]

const isKarakterKomponen = (nama) => {
  const n = (nama || '').toUpperCase().trim()
  return n.includes('KARAKTER') || n === 'NK' || n.startsWith('NK ') || n.startsWith('N. KARAKTER')
}

const isSumatif = (name) => {
  const u = (name || '').toUpperCase().trim()
  return u.includes('PSTS') || u.includes('PSAS') || u.includes('PSAT')
}

// ─── Helper to match class names flexibly ─────────────────────────────────────
const isClassMatch = (target, current) => {
  if (!target && target !== 0) return true
  if (Array.isArray(target)) {
    if (target.length === 0) return true
    return target.some(t => isClassMatch(t, current))
  }
  const tStr = String(target || '').trim().toUpperCase()
  const cStr = String(current || '').trim().toUpperCase()
  if (!tStr || tStr === 'LINTAS' || tStr === 'SEMUA' || tStr === 'ALL') return true
  if (!cStr) return false
  if (tStr === cStr) return true

  const clean = (s) => s.replace(/^KELAS\s*/i, '').replace(/^ROMBEL\s*/i, '').replace(/[\s\-_()]/g, '')
  const ct = clean(tStr)
  const cc = clean(cStr)
  if (ct === cc) return true

  const toArabic = (s) => s.replace(/^VII(?=[A-Z0-9]|$)/, '7').replace(/^VIII(?=[A-Z0-9]|$)/, '8').replace(/^IX(?=[A-Z0-9]|$)/, '9')
  const act = toArabic(ct)
  const acc = toArabic(cc)
  if (act === acc) return true

  const rombelT = act.replace(/\D/g, '')
  const rombelC = acc.replace(/\D/g, '')
  if (rombelT && rombelT === rombelC && /^\d+$/.test(act)) return true

  return false
}

const CANONICAL_MAPEL_ORDER = [
  'agama', 'pancasila', 'bahasa indonesia', 'matematika',
  'ilmu pengetahuan alam', 'ilmu pengetahuan sosial', 'bahasa inggris',
  'jasmani', 'informatika', 'seni musik', 'seni budaya',
  'bahasa mandarin', 'english plus', 'psbm'
]

// ─── Icons ───────────────────────────────────────────────────────────────────
const IconDownload = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)

const IconRefresh = ({ spinning }) => (
  <svg className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
)

const IconSearch = () => (
  <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

const IconLock = () => (
  <svg className="w-3 h-3 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

const IconClose = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
)

export default function LegerNilaiKurikulumSection({ session, activeTa, onNavigateToRapor }) {
  // ─── Filter & Context States ────────────────────────────────────────────────
  const [semesters, setSemesters] = useState([])
  const [selectedSemesterId, setSelectedSemesterId] = useState('')
  const [allKelasList, setAllKelasList] = useState([])
  const [activeTabKelas, setActiveTabKelas] = useState('')
  const [mapels, setMapels] = useState([])
  const [selectedMapelId, setSelectedMapelId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [kkm, setKkm] = useState(75)

  const curMapelObj = mapels.find(m => m.id === selectedMapelId)
  const curMapelNama = curMapelObj?.nama || 'Mata Pelajaran'

  // ─── Data States ───────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState([])
  const [komponen, setKomponen] = useState([])
  const [nilaiData, setNilaiData] = useState({}) // { [komponen_id]: { [nisn]: nilai } }
  const [configAkhir, setConfigAkhir] = useState({ metode_hitung: 'rata_rata', bobot_detail: {}, include_karakter: false })
  const [showConfigAkhirModal, setShowConfigAkhirModal] = useState(false)
  const [tempConfigAkhir, setTempConfigAkhir] = useState({ metode_hitung: 'rata_rata', bobot_detail: {}, include_karakter: false })
  const [applyToParallel, setApplyToParallel] = useState(true)
  const [currentGuruPengampu, setCurrentGuruPengampu] = useState(null)
  const [maxNamaWidth, setMaxNamaWidth] = useState(240)

  // ─── Parallel Classes for the Active Grade ────────────────────────────────
  const parallelClasses = useMemo(() => {
    if (!activeTabKelas || activeTabKelas === 'ALL') return []
    const gradeNum = String(activeTabKelas).replace(/[^0-9]/g, '')
    if (gradeNum) {
      return allKelasList.filter(c => String(c).replace(/[^0-9]/g, '') === gradeNum)
    }
    return [activeTabKelas]
  }, [activeTabKelas, allKelasList])

  // ─── Kurikulum & Admin Role Check ──────────────────────────────────────────
  const isKurikulumOrAdmin = useMemo(() => {
    if (!session) return false
    const roleStr = String(session?.role || session?.app_role || '').toLowerCase()
    if (session?.is_admin || roleStr.includes('admin') || roleStr.includes('superadmin') || roleStr.includes('kurikulum')) return true
    return (session?.roles || []).some(r => {
      const n = String(r?.nama || r?.role_name || r || '').toLowerCase()
      return n.includes('kurikulum') || n.includes('admin') || n.includes('superadmin')
    })
  }, [session])

  // ─── Rapor & Penilaian Settings States (pengaturan_sekolah) ─────────────────
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [raporSettings, setRaporSettings] = useState({
    status_rapor_pts: 'tutup',
    show_kolom_psts: 'true',
    show_kolom_psas: 'true',
    rapor_max_lingkup: 3,
    rapor_max_tp_per_lingkup: 3,
    metode_hitung_nilai_akhir: 'rata_rata', // 'rata_rata' | 'rata_rata_langsung' | 'bobot_manual'
    include_karakter_nilai_akhir: 'false'
  })
  const [tempSettings, setTempSettings] = useState({ ...raporSettings })

  // ─── Active Nilai Akhir Method & Include Karakter (Centralized School Standard) ──
  const effectiveMetode = useMemo(() => {
    if (configAkhir.metode_hitung === 'bobot_manual') return 'bobot_manual'
    return raporSettings.metode_hitung_nilai_akhir || configAkhir.metode_hitung || 'rata_rata'
  }, [configAkhir.metode_hitung, raporSettings.metode_hitung_nilai_akhir])

  const effectiveIncludeKar = useMemo(() => {
    if (configAkhir.include_karakter !== undefined && configAkhir.metode_hitung === 'bobot_manual') {
      return Boolean(configAkhir.include_karakter)
    }
    if (raporSettings.include_karakter_nilai_akhir !== undefined) {
      return raporSettings.include_karakter_nilai_akhir === 'true'
    }
    return Boolean(configAkhir.include_karakter)
  }, [configAkhir.include_karakter, configAkhir.metode_hitung, raporSettings.include_karakter_nilai_akhir])

  // ─── Export Modal States ───────────────────────────────────────────────────
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportScope, setExportScope] = useState('current') // 'current' | 'master_all'
  const [selectedExportClasses, setSelectedExportClasses] = useState([])
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgressText, setExportProgressText] = useState('')

  // ─── Realtime State ─────────────────────────────────────────────────────────
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const [realtimeToast, setRealtimeToast] = useState(null)
  const refreshTimeoutRef = useRef(null)

  // ─── PTS Lingkup Materi Audit States (Admin & Kurikulum) ───────────────────
  const [showPtsAuditModal, setShowPtsAuditModal] = useState(false)
  const [ptsAuditSelectedClass, setPtsAuditSelectedClass] = useState('')
  const [ptsAuditStatusFilter, setPtsAuditStatusFilter] = useState('all') // 'all' | 'pending' | 'confirmed' | 'no_bab'
  const [ptsAuditSearch, setPtsAuditSearch] = useState('')
  const [ptsAuditLoading, setPtsAuditLoading] = useState(false)
  const [ptsAuditData, setPtsAuditData] = useState([])
  const [editingPtsMapel, setEditingPtsMapel] = useState(null)
  const [tempAuditSelectedBabs, setTempAuditSelectedBabs] = useState([])
  const [savingAuditPts, setSavingAuditPts] = useState(false)
  const [selectedMissingDetail, setSelectedMissingDetail] = useState(null)
  const [filterOnlyMissing, setFilterOnlyMissing] = useState(false)

  useEffect(() => {
    setFilterOnlyMissing(false)
  }, [activeTabKelas, selectedMapelId])

  // ─── 1. Load Initial Master Data (TA, Semesters, Mapels, Classes) ───────────
  useEffect(() => {
    const initMaster = async () => {
      setLoading(true)
      try {
        // 1. Tahun Ajaran ID
        let taId = activeTa?.id
        if (!taId) {
          const { data: taData } = await supabase.from('tahun_ajaran').select('id, nama').eq('is_aktif', true).maybeSingle()
          taId = taData?.id
        }

        // 2. Semesters
        let semQuery = supabase.from('semester').select('*').order('nomor')
        if (taId) semQuery = semQuery.eq('tahun_ajaran_id', taId)
        const { data: semData } = await semQuery
        if (semData && semData.length > 0) {
          setSemesters(semData)
          const aktif = getSemesterAktif(semData) || semData[0]
          setSelectedSemesterId(aktif.id)
        }

        // 3. Mata Pelajaran
        const { data: mapelData } = await supabase.from('mata_pelajaran').select('id, nama, singkatan').order('nama')
        if (mapelData && mapelData.length > 0) {
          setMapels(mapelData)

          // Default mapel priority:
          // a. Teacher's assigned mapel from session.guru_mapel_raw if exists
          // b. Matematika
          // c. First available mapel
          const userMapelId = session?.guru_mapel_raw?.[0]?.mata_pelajaran_id
          const userMapelExists = userMapelId && mapelData.some(m => m.id === userMapelId)

          if (userMapelExists) {
            setSelectedMapelId(userMapelId)
          } else {
            const defaultMat = mapelData.find(m => m.nama.toLowerCase().includes('matematika')) || mapelData[0]
            setSelectedMapelId(defaultMat.id)
          }
        }

        // 4. Classes from siswa_lengkap
        let classQuery = supabase.from('siswa_lengkap').select('kelas')
        if (taId) classQuery = classQuery.eq('tahun_ajaran_id', taId)
        let { data: classData } = await classQuery

        if (!classData || classData.length === 0) {
          const { data: fbData } = await supabase.from('siswa_lengkap').select('kelas')
          classData = fbData || []
        }

        if (classData && classData.length > 0) {
          const unique = [...new Set(classData.map(c => (c.kelas || '').trim()).filter(Boolean))].sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, '') || '0', 10)
            const numB = parseInt(b.replace(/\D/g, '') || '0', 10)
            if (numA !== numB) return numA - numB
            return a.localeCompare(b)
          })
          setAllKelasList(unique)

          if (unique.length > 0) {
            const userClasses = (session?.guru_mapel_raw || []).map(g => g.kelas).filter(Boolean)
            const matchedUserClass = userClasses.find(c => unique.includes(c))
            const defaultClass = matchedUserClass || (unique.includes('7A') ? '7A' : unique[0])
            setActiveTabKelas(defaultClass)
          }
        }
      } catch (err) {
        console.error('Error init master leger kurikulum:', err)
      } finally {
        setLoading(false)
      }
    }
    initMaster()
  }, [activeTa?.id])

  // ─── 1.5. Fetch Rapor & Penilaian Settings (pengaturan_sekolah) ────────────
  const fetchRaporSettings = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('pengaturan_sekolah')
        .select('setting_key, setting_value')
        .in('setting_key', [
          'status_rapor_pts',
          'show_kolom_psts',
          'show_kolom_psas',
          'rapor_max_lingkup',
          'rapor_max_tp_per_lingkup',
          'metode_hitung_nilai_akhir',
          'include_karakter_nilai_akhir'
        ])
      if (data && data.length > 0) {
        const map = {}
        data.forEach(d => { map[d.setting_key] = d.setting_value })
        const loaded = {
          status_rapor_pts: map.status_rapor_pts || 'tutup',
          show_kolom_psts: map.show_kolom_psts !== undefined ? map.show_kolom_psts : 'true',
          show_kolom_psas: map.show_kolom_psas !== undefined ? map.show_kolom_psas : 'true',
          rapor_max_lingkup: map.rapor_max_lingkup ? parseInt(map.rapor_max_lingkup, 10) : 3,
          rapor_max_tp_per_lingkup: map.rapor_max_tp_per_lingkup ? parseInt(map.rapor_max_tp_per_lingkup, 10) : 3,
          metode_hitung_nilai_akhir: map.metode_hitung_nilai_akhir || 'rata_rata',
          include_karakter_nilai_akhir: map.include_karakter_nilai_akhir || 'false'
        }
        setRaporSettings(loaded)
        setTempSettings(loaded)
        setConfigAkhir(prev => {
          if (prev.metode_hitung === 'bobot_manual') return prev
          return {
            ...prev,
            metode_hitung: loaded.metode_hitung_nilai_akhir,
            include_karakter: loaded.include_karakter_nilai_akhir === 'true'
          }
        })
      }
    } catch (err) {
      console.error('Error fetching rapor settings:', err)
    }
  }, [])

  useEffect(() => {
    fetchRaporSettings()
  }, [fetchRaporSettings])

  // ─── 2. Fetch Students, Teacher, Components, and Grades for Active Class & Mapel ─
  const fetchClassSheetData = useCallback(async (isSilent = false) => {
    if (!activeTabKelas || !selectedSemesterId || !selectedMapelId) return
    if (!isSilent) setLoading(true)

    try {
      const taId = activeTa?.id

      // 1. Fetch Students (only nisn, nama_lengkap, kelas to avoid 400 Bad Request)
      let stdQuery = supabase.from('siswa_lengkap')
        .select('nisn, nama_lengkap, kelas')
      if (activeTabKelas !== 'ALL') {
        stdQuery = stdQuery.eq('kelas', activeTabKelas)
      }
      if (taId) stdQuery = stdQuery.eq('tahun_ajaran_id', taId)
      let { data: stdData } = await stdQuery.order('nama_lengkap', { ascending: true })

      if (!stdData || stdData.length === 0) {
        let fallbackQuery = supabase.from('siswa_lengkap')
          .select('nisn, nama_lengkap, kelas')
        if (activeTabKelas !== 'ALL') {
          fallbackQuery = fallbackQuery.eq('kelas', activeTabKelas)
        }
        const { data: fallbackStds } = await fallbackQuery.order('nama_lengkap', { ascending: true })
        stdData = fallbackStds || []
      }

      setStudents(stdData || [])

      // Dynamic name width based on longest student name
      if (stdData && stdData.length > 0) {
        const maxLen = Math.max(...stdData.map(d => (d.nama_lengkap || '').length))
        const calculatedWidth = Math.max(200, Math.ceil(maxLen * 7.5 + 40))
        setMaxNamaWidth(calculatedWidth)
      }

      if (activeTabKelas === 'ALL') {
        setCurrentGuruPengampu({ nama_guru: 'Seluruh Guru Pengampu', kode: 'ALL' })
        setKomponen([])
        setNilaiData({})
        return
      }

      // 2. Fetch Guru Pengampu for this mapel in this class
      let gmQuery = supabase.from('guru_mapel')
        .select('guru_id, kelas, guru(id, nama_guru, kode)')
        .eq('mata_pelajaran_id', selectedMapelId)
        .eq('kelas', activeTabKelas)
      if (taId) gmQuery = gmQuery.eq('tahun_ajaran_id', taId)
      let { data: gmData } = await gmQuery.maybeSingle()

      if (!gmData) {
        const { data: fbGm } = await supabase.from('guru_mapel')
          .select('guru_id, kelas, guru(id, nama_guru, kode)')
          .eq('mata_pelajaran_id', selectedMapelId)
          .eq('kelas', activeTabKelas)
          .maybeSingle()
        gmData = fbGm
      }
      const assignedGuru = gmData?.guru || null
      const assignedGuruId = gmData?.guru_id || null
      setCurrentGuruPengampu(assignedGuru)

      // 3. Fetch Components strictly for this Mapel & Teacher assigned to this class
      let kompQuery = supabase.from('nilai_komponen')
        .select('*')
        .eq('mata_pelajaran_id', selectedMapelId)
        .order('urutan', { ascending: true })
      
      if (assignedGuruId) {
        kompQuery = kompQuery.eq('guru_id', assignedGuruId)
      }
      if (taId) kompQuery = kompQuery.eq('tahun_ajaran_id', taId)
      let { data: kData } = await kompQuery

      if (!kData || kData.length === 0) {
        let fbQuery = supabase.from('nilai_komponen')
          .select('*')
          .eq('mata_pelajaran_id', selectedMapelId)
          .order('urutan', { ascending: true })
        if (assignedGuruId) {
          fbQuery = fbQuery.eq('guru_id', assignedGuruId)
        }
        const { data: fbK } = await fbQuery
        kData = fbK || []
      }

      // Auto-heal & deduplicate Sumatif (PSTS & PSAS)
      let cleanedKData = kData || []
      const hasCanonicalPsts = cleanedKData.some(k => (k.bab_nama === 'PSTS 1' || k.bab_nama === 'PSTS 2'))
      const hasCanonicalPsas = cleanedKData.some(k => (k.bab_nama === 'PSAS' || k.bab_nama === 'PSAT'))

      const zombieIds = []
      cleanedKData = cleanedKData.filter(k => {
        const isZombiePsts = (k.bab_nama === 'PSTS' && k.nama === 'Nilai PSTS') || (hasCanonicalPsts && k.bab_nama === 'PSTS')
        const isZombiePsas = (k.bab_nama === 'PSAS/PSAT') || (hasCanonicalPsas && k.bab_nama === 'PSAS/PSAT')
        if (isZombiePsts || isZombiePsas) {
          zombieIds.push(k.id)
          return false
        }
        return true
      })

      // Silently clean zombie components from database in background
      if (zombieIds.length > 0) {
        supabase.from('nilai_komponen').delete().in('id', zombieIds).then(() => {
          console.log('[Leger] Zombie sumatif components successfully removed from database:', zombieIds)
        }).catch(e => console.warn('[Leger] Could not delete zombie components:', e))
      }

      setKomponen(cleanedKData)

      // 4. Fetch Nilai Akhir Configuration for this assigned teacher
      let cfgQuery = supabase.from('nilai_akhir_config')
        .select('*')
        .eq('semester_id', selectedSemesterId)
        .eq('mata_pelajaran_id', selectedMapelId)
        .eq('kelas', activeTabKelas)
      if (assignedGuruId) {
        cfgQuery = cfgQuery.eq('guru_id', assignedGuruId)
      }
      if (taId) cfgQuery = cfgQuery.eq('tahun_ajaran_id', taId)
      const { data: cfgData } = await cfgQuery.maybeSingle()
      const masterMetode = raporSettings.metode_hitung_nilai_akhir || 'rata_rata'
      const masterIncKar = raporSettings.include_karakter_nilai_akhir === 'true'

      if (cfgData && cfgData.metode_hitung === 'bobot_manual') {
        setConfigAkhir({
          metode_hitung: 'bobot_manual',
          bobot_detail: cfgData.bobot_detail || {},
          include_karakter: cfgData.bobot_detail?.include_karakter ?? masterIncKar
        })
      } else if (cfgData) {
        setConfigAkhir({
          metode_hitung: cfgData.metode_hitung || masterMetode,
          bobot_detail: cfgData.bobot_detail || {},
          include_karakter: cfgData.bobot_detail?.include_karakter ?? masterIncKar
        })
      } else {
        setConfigAkhir({
          metode_hitung: masterMetode,
          bobot_detail: {},
          include_karakter: masterIncKar
        })
      }

      // 5. Fetch Nilai Siswa (filtered to components of this assigned teacher)
      const curClass = String(activeTabKelas).trim().toUpperCase()
      const validKomps = (kData || []).filter(k => {
        if (assignedGuruId && k.guru_id && k.guru_id !== assignedGuruId) {
          return false
        }
        if (k.semester_id && selectedSemesterId && k.semester_id !== selectedSemesterId) {
          return false
        }
        if (!k.target_kelas || k.target_kelas.length === 0) {
          if (k.kelas) return String(k.kelas).trim().toUpperCase() === curClass
          return true
        }
        if (Array.isArray(k.target_kelas)) {
          return k.target_kelas.some(c => String(c || '').trim().toUpperCase() === curClass)
        }
        if (typeof k.target_kelas === 'string') {
          return k.target_kelas.toUpperCase().includes(curClass)
        }
        if (k.kelas) {
          return String(k.kelas).trim().toUpperCase() === curClass
        }
        return true
      })

      const kompIds = validKomps.map(k => k.id)
      const nisnList = (stdData || []).map(s => String(s.nisn))

      if (kompIds.length > 0 && nisnList.length > 0) {
        const { data: nData } = await supabase.from('nilai_siswa')
          .select('komponen_id, siswa_nisn, nilai')
          .in('komponen_id', kompIds)
          .in('siswa_nisn', nisnList)

        const map = {}
        ;(nData || []).forEach(n => {
          if (!map[n.komponen_id]) map[n.komponen_id] = {}
          map[n.komponen_id][String(n.siswa_nisn)] = n.nilai
        })
        setNilaiData(map)
      } else {
        setNilaiData({})
      }

    } catch (err) {
      console.error('Error fetching class sheet data:', err)
    } finally {
      if (!isSilent) setLoading(false)
    }
  }, [
    activeTabKelas,
    selectedSemesterId,
    selectedMapelId,
    activeTa?.id,
    raporSettings.metode_hitung_nilai_akhir,
    raporSettings.include_karakter_nilai_akhir
  ])

  useEffect(() => {
    fetchClassSheetData()
  }, [fetchClassSheetData])

  // ─── Realtime Subscriptions ────────────────────────────────────────────────
  useEffect(() => {
    if (!activeTabKelas || !selectedSemesterId) return

    const channel = supabase
      .channel(`leger-live-${activeTabKelas}-${selectedSemesterId}-${selectedMapelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nilai_siswa' }, () => {
        setRealtimeToast('Nilai guru baru saja tersinkronisasi realtime!')
        if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
        refreshTimeoutRef.current = setTimeout(() => {
          fetchClassSheetData(true)
          setTimeout(() => setRealtimeToast(null), 3500)
        }, 600)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nilai_komponen' }, () => {
        if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
        refreshTimeoutRef.current = setTimeout(() => {
          fetchClassSheetData(true)
        }, 800)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pengaturan_sekolah' }, () => {
        fetchRaporSettings()
        fetchClassSheetData(true)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nilai_akhir_config' }, () => {
        fetchClassSheetData(true)
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') setRealtimeConnected(true)
        else setRealtimeConnected(false)
      })

    const handleWindowNilaiUpdated = () => {
      fetchRaporSettings()
      fetchClassSheetData(true)
    }
    window.addEventListener('ebudimulia:nilai_updated', handleWindowNilaiUpdated)

    return () => {
      window.removeEventListener('ebudimulia:nilai_updated', handleWindowNilaiUpdated)
      supabase.removeChannel(channel)
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
    }
  }, [activeTabKelas, selectedSemesterId, selectedMapelId, fetchClassSheetData, fetchRaporSettings])

  // ─── Save Rapor & Penilaian Settings (pengaturan_sekolah) ─────────────────
  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      const updates = [
        { setting_key: 'status_rapor_pts', setting_value: String(tempSettings.status_rapor_pts) },
        { setting_key: 'show_kolom_psts', setting_value: String(tempSettings.show_kolom_psts) },
        { setting_key: 'show_kolom_psas', setting_value: String(tempSettings.show_kolom_psas) },
        { setting_key: 'rapor_max_lingkup', setting_value: String(tempSettings.rapor_max_lingkup) },
        { setting_key: 'rapor_max_tp_per_lingkup', setting_value: String(tempSettings.rapor_max_tp_per_lingkup) },
        { setting_key: 'metode_hitung_nilai_akhir', setting_value: String(tempSettings.metode_hitung_nilai_akhir || 'rata_rata') },
        { setting_key: 'include_karakter_nilai_akhir', setting_value: String(tempSettings.include_karakter_nilai_akhir || 'false') }
      ]
      for (const item of updates) {
        await supabase.from('pengaturan_sekolah').upsert(item, { onConflict: 'setting_key' })
      }

      const newMetode = tempSettings.metode_hitung_nilai_akhir || 'rata_rata'
      const newIncKar = tempSettings.include_karakter_nilai_akhir === 'true'

      setRaporSettings({ ...tempSettings })
      setConfigAkhir(prev => ({
        ...prev,
        metode_hitung: newMetode,
        include_karakter: newIncKar
      }))

      if (newMetode !== 'bobot_manual' && selectedSemesterId) {
        await supabase.from('nilai_akhir_config')
          .update({
            metode_hitung: newMetode,
            bobot_detail: { include_karakter: newIncKar },
            updated_at: new Date().toISOString()
          })
          .eq('semester_id', selectedSemesterId)
          .neq('metode_hitung', 'bobot_manual')
      }

      setShowSettingsModal(false)
      setRealtimeToast('Pengaturan Rapor & Penilaian berhasil disimpan')
      setTimeout(() => setRealtimeToast(null), 3000)

      fetchClassSheetData(true)
      window.dispatchEvent(new CustomEvent('ebudimulia:nilai_updated'))
    } catch (err) {
      console.error('Gagal menyimpan pengaturan rapor:', err)
      alert('Gagal menyimpan pengaturan: ' + err.message)
    } finally {
      setSavingSettings(false)
    }
  }

  // ─── Save Config Akhir Per Mapel & Kelas ───────────────────────────────────
  const handleSaveConfigAkhir = async (newConfig, applyToAllClasses = false) => {
    // Validate bobot manual sums to 100
    if (newConfig.metode_hitung === 'bobot_manual') {
      const sum = Object.values(newConfig.bobot_detail || {}).reduce((a, b) => a + Number(b || 0), 0)
      if (Math.abs(sum - 100) > 0.01) {
        alert(`Total bobot harus 100%. Saat ini: ${sum}%`)
        return false
      }
    }

    try {
      const targetClasses = applyToAllClasses && parallelClasses.length > 0
        ? parallelClasses
        : (activeTabKelas && activeTabKelas !== 'ALL' ? [activeTabKelas] : [allKelasList[0] || '7A'])

      const targetGuruId = currentGuruPengampu?.id || session?.id
      const taId = activeTa?.id

      const upsertRows = targetClasses.map(cls => ({
        guru_id: targetGuruId,
        tahun_ajaran_id: taId,
        semester_id: selectedSemesterId,
        mata_pelajaran_id: selectedMapelId,
        kelas: cls,
        metode_hitung: newConfig.metode_hitung,
        bobot_detail: {
          ...(newConfig.bobot_detail || {}),
          include_karakter: Boolean(newConfig.include_karakter)
        },
        is_visible: true,
        updated_at: new Date().toISOString()
      }))

      const { error } = await supabase.from('nilai_akhir_config').upsert(
        upsertRows,
        { onConflict: 'guru_id,tahun_ajaran_id,semester_id,mata_pelajaran_id,kelas' }
      )

      if (error) {
        alert('Gagal menyimpan pengaturan nilai akhir: ' + error.message)
        return false
      }

      // Jika Kurikulum / Admin mengubah metode hitung dari modal ini, sinkronkan juga ke pengaturan_sekolah
      if (newConfig.metode_hitung) {
        await supabase.from('pengaturan_sekolah').upsert([
          { setting_key: 'metode_hitung_nilai_akhir', setting_value: newConfig.metode_hitung },
          { setting_key: 'include_karakter_nilai_akhir', setting_value: String(Boolean(newConfig.include_karakter)) }
        ], { onConflict: 'setting_key' })

        setRaporSettings(prev => ({
          ...prev,
          metode_hitung_nilai_akhir: newConfig.metode_hitung,
          include_karakter_nilai_akhir: String(Boolean(newConfig.include_karakter))
        }))
      }

      setConfigAkhir(newConfig)
      setShowConfigAkhirModal(false)
      setRealtimeToast('Pengaturan Nilai Akhir berhasil disimpan')
      setTimeout(() => setRealtimeToast(null), 3000)
      fetchClassSheetData(true)
      window.dispatchEvent(new CustomEvent('ebudimulia:nilai_updated'))
      return true
    } catch (err) {
      console.error('Error saving config akhir:', err)
      alert('Gagal menyimpan: ' + err.message)
      return false
    }
  }

  // ─── Audit PTS Lingkup Materi Handlers ─────────────────────────────────────
  const fetchPtsAuditData = useCallback(async (targetClassOverride) => {
    setPtsAuditLoading(true)
    try {
      const cls = targetClassOverride || ptsAuditSelectedClass || (activeTabKelas !== 'ALL' && activeTabKelas ? activeTabKelas : (allKelasList[0] || '7A'))
      const taId = activeTa?.id || null
      const semId = selectedSemesterId || null

      // 1. Fetch guru_mapel for this class & TA
      let gmQuery = supabase.from('guru_mapel')
        .select('guru_id, kelas, mata_pelajaran_id, guru(id, nama_guru, kode)')
      if (taId) gmQuery = gmQuery.or(`tahun_ajaran_id.eq.${taId},tahun_ajaran_id.is.null`)
      const { data: gmData } = await gmQuery

      // 2. Fetch nilai_komponen for this semester
      let kompQuery = supabase.from('nilai_komponen')
        .select('id, nama, bab_nama, mata_pelajaran_id, kelas, target_kelas, semester_id, tahun_ajaran_id')
      if (semId) kompQuery = kompQuery.eq('semester_id', semId)
      if (taId) kompQuery = kompQuery.or(`tahun_ajaran_id.eq.${taId},tahun_ajaran_id.is.null`)
      const { data: kData } = await kompQuery

      // 3. Fetch nilai_akhir_config
      let cfgQuery = supabase.from('nilai_akhir_config')
        .select('*')
      if (semId) cfgQuery = cfgQuery.eq('semester_id', semId)
      if (taId) cfgQuery = cfgQuery.or(`tahun_ajaran_id.eq.${taId},tahun_ajaran_id.is.null`)
      const { data: cfgData } = await cfgQuery

      // 3b. Fetch students in this class to audit scores
      let stdQuery = supabase.from('siswa_lengkap')
        .select('nisn, nama_lengkap, kelas')
        .eq('kelas', cls)
      if (taId) stdQuery = stdQuery.eq('tahun_ajaran_id', taId)
      const { data: stdData } = await stdQuery.order('nama_lengkap', { ascending: true })
      const classStudents = stdData || []
      const studentNisns = classStudents.map(s => String(s.nisn))

      // 3c. Fetch all student scores for components in this semester
      let gradesMap = {}
      const allKompIds = (kData || []).map(k => k.id)
      if (allKompIds.length > 0 && studentNisns.length > 0) {
        const queryNisns = [...new Set(studentNisns.flatMap(n => {
          const str = String(n || '').trim()
          if (!str) return []
          const noZero = str.replace(/^0+/, '')
          return [str, noZero, noZero ? '0' + noZero : ''].filter(Boolean)
        }))]

        const chunkSize = 50
        for (let i = 0; i < allKompIds.length; i += chunkSize) {
          const chunkIds = allKompIds.slice(i, i + chunkSize)
          const { data: nData } = await supabase.from('nilai_siswa')
            .select('komponen_id, siswa_nisn, nilai')
            .in('komponen_id', chunkIds)
            .in('siswa_nisn', queryNisns)

          ;(nData || []).forEach(n => {
            if (!gradesMap[n.komponen_id]) gradesMap[n.komponen_id] = {}
            const sNisn = String(n.siswa_nisn ?? '').trim()
            gradesMap[n.komponen_id][sNisn] = n.nilai
            const noZero = sNisn.replace(/^0+/, '')
            if (noZero) {
              gradesMap[n.komponen_id][noZero] = n.nilai
              gradesMap[n.komponen_id]['0' + noZero] = n.nilai
            }
          })
        }
      }

      // 4. Sort mapels in canonical order
      let sorted = [...(mapels || [])].sort((a, b) => {
        const nameA = (a.nama || '').toLowerCase()
        const nameB = (b.nama || '').toLowerCase()
        let idxA = CANONICAL_MAPEL_ORDER.findIndex(k => nameA.includes(k))
        let idxB = CANONICAL_MAPEL_ORDER.findIndex(k => nameB.includes(k))
        if (idxA === -1) idxA = 999
        if (idxB === -1) idxB = 999
        if (idxA !== idxB) return idxA - idxB
        return nameA.localeCompare(nameB)
      })

      const targetRombel = (cls || '').replace(/\D/g, '')

      const isSumatif = (name) => {
        const u = (name || '').toUpperCase()
        return u.includes('PSTS') || u.includes('PSAS') || u.includes('PSAT')
      }

      const normalizeBabStr = (name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')
      const isBabMatchingCheck = (sBab, cBab) => {
        const s = normalizeBabStr(sBab)
        const c = normalizeBabStr(cBab)
        if (!s || !c) return false
        if (s === c || c.startsWith(s) || s.startsWith(c)) return true
        const numS = s.match(/(?:bab|lingkup)\s*(\d+)/i)?.[1]
        const numC = c.match(/(?:bab|lingkup)\s*(\d+)/i)?.[1]
        if (numS && numC && numS === numC) return true
        return false
      }

      const rows = sorted.map(m => {
        // Teacher assigned
        const assignedGm = (gmData || []).find(g => g.mata_pelajaran_id === m.id && isClassMatch(g.kelas, cls))
        const guruNama = assignedGm?.guru?.nama_guru || 'Belum Ditugaskan'
        const guruId = assignedGm?.guru_id || null

        // Komponen for this mapel in this class
        const mKomps = (kData || []).filter(k => 
          k.mata_pelajaran_id === m.id && 
          (isClassMatch(k.target_kelas, cls) || isClassMatch(k.kelas, cls))
        )

        // Available regular BABs
        const availableBabs = [...new Set(
          mKomps
            .map(k => k.bab_nama)
            .filter(b => b && !isSumatif(b))
        )].sort((a, b) => {
          const numA = parseInt(a.replace(/\D/g, '') || '0', 10)
          const numB = parseInt(b.replace(/\D/g, '') || '0', 10)
          if (numA !== numB && numA > 0 && numB > 0) return numA - numB
          return a.localeCompare(b)
        })

        // Config matching: exact class first, fallback to same rombel
        const exactCfg = (cfgData || []).find(c => 
          c.mata_pelajaran_id === m.id && 
          c.kelas === cls &&
          (!guruId || !c.guru_id || c.guru_id === guruId)
        )
        const siblingCfg = !exactCfg ? (cfgData || []).find(c => 
          c.mata_pelajaran_id === m.id && 
          c.kelas && c.kelas.replace(/\D/g, '') === targetRombel &&
          (!guruId || !c.guru_id || c.guru_id === guruId) &&
          Array.isArray(c.bobot_detail?.pts_selected_babs) &&
          c.bobot_detail.pts_selected_babs.length > 0
        ) : null

        const activeCfg = exactCfg || siblingCfg
        const selectedBabs = activeCfg?.bobot_detail?.pts_selected_babs || []
        const isConfirmed = activeCfg?.bobot_detail?.pts_confirmed ?? (Array.isArray(selectedBabs) && selectedBabs.length > 0)

        let status = 'pending'
        if (availableBabs.length === 0) {
          status = 'no_bab'
        } else if (isConfirmed && selectedBabs.length > 0) {
          status = 'confirmed'
        }

        // Audit Nilai Kosong (-) pada TP yang sudah ada deskripsinya
        const isBabIncludedInPts = (babName) => {
          if (!selectedBabs || selectedBabs.length === 0) return true
          return selectedBabs.some(b => isBabMatchingCheck(b, babName))
        }

        const describedTps = mKomps.filter(k => 
          !isSumatif(k.bab_nama || k.nama) &&
          Boolean(k.deskripsi && k.deskripsi.trim()) &&
          isBabIncludedInPts(k.bab_nama)
        )

        const missingScores = []
        describedTps.forEach(tp => {
          classStudents.forEach(std => {
            const rawVal = gradesMap[tp.id]?.[String(std.nisn)]
            const isMissing = rawVal === undefined || rawVal === null || rawVal === '' || String(rawVal).trim() === '-'
            if (isMissing) {
              missingScores.push({
                studentNisn: std.nisn,
                studentNama: std.nama_lengkap,
                komponenId: tp.id,
                tpNama: tp.nama || 'TP',
                babNama: tp.bab_nama || 'Materi',
                deskripsi: tp.deskripsi
              })
            }
          })
        })

        return {
          mapelId: m.id,
          mapelNama: m.nama,
          singkatan: m.singkatan,
          guruNama,
          guruId,
          availableBabs,
          selectedBabs,
          isConfirmed,
          status,
          targetClass: cls,
          activeCfg,
          describedTpsCount: describedTps.length,
          missingScores,
          missingCount: missingScores.length,
          affectedStudentCount: [...new Set(missingScores.map(ms => ms.studentNisn))].length
        }
      })

      setPtsAuditData(rows)
    } catch (err) {
      console.error('Error fetching PTS audit data:', err)
    } finally {
      setPtsAuditLoading(false)
    }
  }, [ptsAuditSelectedClass, activeTabKelas, allKelasList, activeTa?.id, selectedSemesterId, mapels])

  const openPtsAuditModal = (initialClass) => {
    const defaultCls = initialClass || (activeTabKelas !== 'ALL' && activeTabKelas ? activeTabKelas : (allKelasList[0] || '7A'))
    setPtsAuditSelectedClass(defaultCls)
    setShowPtsAuditModal(true)
    fetchPtsAuditData(defaultCls)
  }

  const handleSaveAuditPts = async () => {
    if (!editingPtsMapel) return
    setSavingAuditPts(true)
    try {
      const taId = activeTa?.id
      if (!taId || !selectedSemesterId) {
        alert('Tahun ajaran atau semester tidak aktif!')
        return
      }

      const targetCls = editingPtsMapel.targetClass
      const rombelNumber = targetCls.replace(/\D/g, '')
      const classesInRombel = allKelasList.filter(c => c.replace(/\D/g, '') === rombelNumber)
      const targetClasses = classesInRombel.length > 0 ? classesInRombel : [targetCls]

      const { data: existingConfigs } = await supabase.from('nilai_akhir_config')
        .select('*')
        .eq('mata_pelajaran_id', editingPtsMapel.mapelId)
        .eq('semester_id', selectedSemesterId)
        .eq('tahun_ajaran_id', taId)
        .in('kelas', targetClasses)

      const guruIdToUse = editingPtsMapel.guruId || session?.id

      const upsertRows = targetClasses.map(cls => {
        const existing = (existingConfigs || []).find(c => c.kelas === cls && (!guruIdToUse || c.guru_id === guruIdToUse))
        return {
          guru_id: guruIdToUse,
          tahun_ajaran_id: taId,
          semester_id: selectedSemesterId,
          mata_pelajaran_id: editingPtsMapel.mapelId,
          kelas: cls,
          metode_hitung: existing?.metode_hitung || 'rata_rata',
          bobot_detail: {
            ...(existing?.bobot_detail || {}),
            pts_selected_babs: tempAuditSelectedBabs,
            pts_confirmed: true
          },
          is_visible: existing?.is_visible ?? true,
          updated_at: new Date().toISOString()
        }
      })

      const { error } = await supabase.from('nilai_akhir_config').upsert(
        upsertRows,
        { onConflict: 'guru_id,tahun_ajaran_id,semester_id,mata_pelajaran_id,kelas' }
      )

      if (error) {
        alert('Gagal menyimpan pilihan BAB PTS: ' + error.message)
        return
      }

      setEditingPtsMapel(null)
      fetchPtsAuditData(targetCls)
      window.dispatchEvent(new CustomEvent('ebudimulia:nilai_updated'))
      setRealtimeToast(`Pilihan Lingkup PTS untuk ${editingPtsMapel.mapelNama} berhasil disimpan!`)
      setTimeout(() => setRealtimeToast(null), 3500)
    } catch (err) {
      console.error('Error saving PTS selection in audit modal:', err)
      alert('Terjadi kesalahan: ' + err.message)
    } finally {
      setSavingAuditPts(false)
    }
  }

  // ─── Filtered Components for Active Class ──────────────────────────────────
  const classKomponen = useMemo(() => {
    const curClass = String(activeTabKelas || '').trim().toUpperCase()
    const assignedId = currentGuruPengampu?.id
    const filtered = (komponen || []).filter(k => {
      // 1. Strict guru isolation: only components belonging to the assigned teacher of this class
      if (assignedId && k.guru_id && k.guru_id !== assignedId) {
        return false
      }
      if (k.semester_id && selectedSemesterId && k.semester_id !== selectedSemesterId) {
        return false
      }
      if (!k.target_kelas || k.target_kelas.length === 0) {
        if (k.kelas) return String(k.kelas).trim().toUpperCase() === curClass
        return true
      }
      if (Array.isArray(k.target_kelas)) {
        return k.target_kelas.some(c => String(c || '').trim().toUpperCase() === curClass)
      }
      if (typeof k.target_kelas === 'string') {
        return k.target_kelas.toUpperCase().includes(curClass)
      }
      if (k.kelas) {
        return String(k.kelas).trim().toUpperCase() === curClass
      }
      return true
    })

    // Strict Sumatif Deduplication: ensure only ONE PSTS and ONE PSAS/PSAT exist
    const hasPsts1Or2 = filtered.some(k => k.bab_nama === 'PSTS 1' || k.bab_nama === 'PSTS 2')
    const hasPsasOrPsat = filtered.some(k => k.bab_nama === 'PSAS' || k.bab_nama === 'PSAT')

    // Prioritize keeping components that actually have scores in nilaiData or descriptions
    const sortedFiltered = [...filtered].sort((a, b) => {
      const aScores = nilaiData[a.id] ? Object.values(nilaiData[a.id]).filter(v => v !== undefined && v !== null && v !== '').length : 0
      const bScores = nilaiData[b.id] ? Object.values(nilaiData[b.id]).filter(v => v !== undefined && v !== null && v !== '').length : 0
      if (aScores !== bScores) return bScores - aScores // more scores first
      if (a.deskripsi && !b.deskripsi) return -1
      if (!a.deskripsi && b.deskripsi) return 1
      return (a.urutan || 0) - (b.urutan || 0)
    })

    // Deduplicate:
    // 1. Drop zombie PSTS / PSAS
    // 2. Ensure each BAB has AT MOST ONE N. Karakter column!
    const seenBabKarakter = new Set()
    const duplicateKompIds = []

    const deduped = sortedFiltered.filter(k => {
      if (hasPsts1Or2 && k.bab_nama === 'PSTS') return false
      if (hasPsasOrPsat && k.bab_nama === 'PSAS/PSAT') return false
      if (k.bab_nama === 'PSTS' && k.nama === 'Nilai PSTS') return false

      if (isKarakterKomponen(k.nama)) {
        const babKey = (k.bab_nama || '').trim().toUpperCase()
        if (seenBabKarakter.has(babKey)) {
          duplicateKompIds.push(k.id)
          return false
        }
        seenBabKarakter.add(babKey)
      }
      return true
    })

    // Clean duplicate empty character components in background
    if (duplicateKompIds.length > 0) {
      supabase.from('nilai_komponen').delete().in('id', duplicateKompIds).then(() => {
        console.log('[Leger] Duplicate N. Karakter components deleted from database:', duplicateKompIds)
      }).catch(e => console.warn('[Leger] Could not delete duplicate components:', e))
    }

    return deduped.sort((a, b) => (a.urutan || 0) - (b.urutan || 0))
  }, [komponen, selectedSemesterId, activeTabKelas, currentGuruPengampu?.id, nilaiData])

  // Group BABs (PSTS and PSAS ordered naturally at the end, filtered by settings)
  const uniqueBabsClass = useMemo(() => {
    const rawBabs = [...new Set(classKomponen.map(k => k.bab_nama || 'Lainnya'))]
    const hasPsts1Or2 = rawBabs.some(b => b === 'PSTS 1' || b === 'PSTS 2')
    const hasPsasOrPsat = rawBabs.some(b => b === 'PSAS' || b === 'PSAT')

    const dedupedBabs = rawBabs.filter(bab => {
      if (hasPsts1Or2 && bab === 'PSTS') return false
      if (hasPsasOrPsat && bab === 'PSAS/PSAT') return false
      return true
    })

    return dedupedBabs
      .filter(bab => {
        const isPsts = bab.toUpperCase().includes('PSTS')
        const isPsas = bab.toUpperCase().includes('PSAS') || bab.toUpperCase().includes('PSAT')
        if (isPsts && raporSettings.show_kolom_psts === 'false') return false
        if (isPsas && raporSettings.show_kolom_psas === 'false') return false
        return true
      })
      .sort((a, b) => {
        const isPstsA = a.toUpperCase().includes('PSTS')
        const isPstsB = b.toUpperCase().includes('PSTS')
        const isPsasA = a.toUpperCase().includes('PSAS') || a.toUpperCase().includes('PSAT')
        const isPsasB = b.toUpperCase().includes('PSAS') || b.toUpperCase().includes('PSAT')

        if (isPstsA && !isPstsB) return isPsasB ? -1 : 1
        if (isPstsB && !isPstsA) return isPsasA ? 1 : -1
        if (isPsasA && !isPsasB) return 1
        if (isPsasB && !isPsasA) return -1

        const matchA = a.match(/\d+/)
        const matchB = b.match(/\d+/)
        if (matchA && matchB) return parseInt(matchA[0], 10) - parseInt(matchB[0], 10)
        return a.localeCompare(b)
      })
  }, [classKomponen, raporSettings.show_kolom_psts, raporSettings.show_kolom_psas])



  const sortBabKomponen = (a, b) => {
    const isKarA = isKarakterKomponen(a.nama)
    const isKarB = isKarakterKomponen(b.nama)
    if (isKarA && !isKarB) return 1
    if (!isKarA && isKarB) return -1
    if (isKarA && isKarB) return (a.urutan || 0) - (b.urutan || 0)

    const matchA = (a.nama || '').match(/^TP\s*(\d+)/i)
    const matchB = (b.nama || '').match(/^TP\s*(\d+)/i)
    if (matchA && matchB) {
      const diff = parseInt(matchA[1], 10) - parseInt(matchB[1], 10)
      if (diff !== 0) return diff
    }
    return (a.urutan || 0) - (b.urutan || 0)
  }

  // Ordered list of components (N. KARAKTER at the end of each BAB)
  const orderedKomponen = useMemo(() => {
    return uniqueBabsClass.flatMap(bab => 
      classKomponen.filter(k => (k.bab_nama || 'Lainnya') === bab).sort(sortBabKomponen)
    )
  }, [uniqueBabsClass, classKomponen])

  // ─── Calculation Engine (Matching NilaiGuruSection) ────────────────────────
  const hitungRataBAB = useCallback((bab, nisn) => {
    const komp = classKomponen.filter(k => (k.bab_nama || 'Lainnya') === bab)
    if (komp.length === 0) return null
    const metode = komp[0]?.metode_hitung || 'rata_rata'
    let totalBobot = 0, totalNilai = 0, hasVal = false

    const includeKarakter = effectiveIncludeKar

    komp.forEach(k => {
      if (!includeKarakter && isKarakterKomponen(k.nama)) return
      const val = nilaiData[k.id]?.[String(nisn)]
      if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && String(val).trim() !== '-') {
        if (metode === 'bobot_manual') {
          totalNilai += Number(val) * (k.bobot || 1)
          totalBobot += (k.bobot || 1)
        } else {
          totalNilai += Number(val)
          totalBobot += 1
        }
        hasVal = true
      }
    })
    if (!hasVal || totalBobot === 0) return null
    return +(totalNilai / totalBobot).toFixed(1)
  }, [classKomponen, nilaiData, effectiveIncludeKar])

  const hitungRataRataAkhir = useCallback((nisn) => {
    if (uniqueBabsClass.length === 0) return null

    const metode = effectiveMetode
    const includeKarakter = effectiveIncludeKar

    // METODE 1: RATA-RATA LANGSUNG SEMUA NILAI (TANPA DIRATA-RATA PER BAB)
    if (metode === 'rata_rata_langsung') {
      let totalNilai = 0
      let count = 0
      orderedKomponen.forEach(k => {
        if (!includeKarakter && isKarakterKomponen(k.nama)) return
        const val = nilaiData[k.id]?.[String(nisn)]
        if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && String(val).trim() !== '-') {
          totalNilai += Number(val)
          count += 1
        }
      })
      if (count === 0) return null
      return +(totalNilai / count).toFixed(1)
    }

    // METODE 3: BOBOT MANUAL PER BAB
    if (metode === 'bobot_manual') {
      let totalNilai = 0
      let totalBobot = 0
      uniqueBabsClass.forEach(bab => {
        const rataBab = hitungRataBAB(bab, nisn)
        if (rataBab !== null) {
          const bobot = Number(configAkhir.bobot_detail?.[bab] || 0)
          totalNilai += rataBab * bobot
          totalBobot += bobot
        }
      })
      if (totalBobot === 0) return null
      return +(totalNilai / totalBobot).toFixed(1)
    }

    // METODE 2: RATA-RATA BERTINGKAT PER BAB (DEFAULT)
    const vals = uniqueBabsClass.map(bab => hitungRataBAB(bab, nisn)).filter(v => v !== null)
    if (vals.length === 0) return null
    return +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
  }, [uniqueBabsClass, effectiveMetode, effectiveIncludeKar, configAkhir.bobot_detail, hitungRataBAB, orderedKomponen, nilaiData])

  const getPredikat = (val) => {
    if (val === null || val === undefined || val === '') return '-'
    const num = Number(val)
    if (num >= 90) return 'A'
    if (num >= 80) return 'B'
    if (num >= 70) return 'C'
    return 'D'
  }

  // ─── Active Sheet Audit: Deteksi Nilai Kosong (-) pada TP yang sudah ada deskripsi ─
  const activeSheetMissingAudit = useMemo(() => {
    if (!isKurikulumOrAdmin || activeTabKelas === 'ALL') {
      return { items: [], count: 0, studentCount: 0, studentNisns: [] }
    }

    const items = []
    orderedKomponen.forEach(k => {
      const isDescribed = Boolean(k.deskripsi && k.deskripsi.trim() !== '')
      const isSumatifKomp = isSumatif(k.bab_nama || k.nama)
      const isKarakter = isKarakterKomponen(k.nama)
      if (isDescribed && !isSumatifKomp && !isKarakter) {
        students.forEach(s => {
          const val = nilaiData[k.id]?.[String(s.nisn)]
          const hasVal = val !== undefined && val !== null && val !== '' && String(val).trim() !== '-'
          if (!hasVal) {
            items.push({
              studentNisn: s.nisn,
              studentNama: s.nama_lengkap,
              komponenId: k.id,
              tpNama: k.nama || 'TP',
              babNama: k.bab_nama || 'Materi',
              deskripsi: k.deskripsi
            })
          }
        })
      }
    })

    const uniqueNisns = [...new Set(items.map(it => it.studentNisn))]
    return {
      items,
      count: items.length,
      studentCount: uniqueNisns.length,
      studentNisns: uniqueNisns
    }
  }, [isKurikulumOrAdmin, activeTabKelas, orderedKomponen, students, nilaiData])

  // ─── Filtered Students with Search Query & Audit Filter ─────────────────────
  const filteredStudents = useMemo(() => {
    let list = students
    if (filterOnlyMissing && activeSheetMissingAudit.studentNisns.length > 0) {
      list = list.filter(s => activeSheetMissingAudit.studentNisns.includes(s.nisn))
    }
    if (!searchQuery.trim()) return list
    const q = searchQuery.toLowerCase()
    return list.filter(s => 
      (s.nama_lengkap || '').toLowerCase().includes(q) || 
      String(s.nisn).includes(q)
    )
  }, [students, searchQuery, filterOnlyMissing, activeSheetMissingAudit.studentNisns])

  // ─── Class Summary Stats ───────────────────────────────────────────────────
  const classStats = useMemo(() => {
    const validScores = students
      .map(s => hitungRataRataAkhir(s.nisn))
      .filter(v => v !== null)

    const avg = validScores.length > 0 
      ? +(validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(1) 
      : 0
    const tuntas = validScores.filter(v => v >= kkm).length
    const tuntasPercent = validScores.length > 0 ? Math.round((tuntas / validScores.length) * 100) : 0

    return {
      average: avg,
      tuntasCount: tuntas,
      totalRated: validScores.length,
      tuntasPercent
    }
  }, [students, hitungRataRataAkhir, kkm])

  // ─── Excel Export Helper: Generate Rich Sheet (Matching NilaiGuruSection Exactly) ─
  const generateClassSheet = async (kelas, classStudents, classKomp, classNilaiData, classConfigAkhir, wb, teacherName, customMapelNama = null, customSheetName = null) => {
    const sem = semesters.find(s => s.id === selectedSemesterId)
    const curMapelObj = mapels.find(m => m.id === selectedMapelId)
    const mapelNama = customMapelNama || curMapelObj?.nama || 'Mata Pelajaran'
    const sekolah = 'SMP BUDI MULIA'
    const tahunAjaran = activeTa?.nama || ''

    const isSumatif = (bab) => ['PSTS 1', 'PSTS 2', 'PSAS', 'PSAT', 'PSTS'].includes(bab) || bab.toUpperCase().includes('PSTS') || bab.toUpperCase().includes('PSAS') || bab.toUpperCase().includes('PSAT')

    const rawBabList = [...new Set(classKomp.map(k => k.bab_nama || 'Lainnya'))]
    const hasPsts1Or2Excel = rawBabList.some(b => b === 'PSTS 1' || b === 'PSTS 2')
    const hasPsasOrPsatExcel = rawBabList.some(b => b === 'PSAS' || b === 'PSAT')

    const babList = rawBabList
      .filter(bab => {
        if (hasPsts1Or2Excel && bab === 'PSTS') return false
        if (hasPsasOrPsatExcel && bab === 'PSAS/PSAT') return false
        const isPsts = bab.toUpperCase().includes('PSTS')
        const isPsas = bab.toUpperCase().includes('PSAS') || bab.toUpperCase().includes('PSAT')
        if (isPsts && raporSettings.show_kolom_psts === 'false') return false
        if (isPsas && raporSettings.show_kolom_psas === 'false') return false
        return true
      })
      .sort((a, b) => {
        const isPstsA = a.toUpperCase().includes('PSTS')
        const isPstsB = b.toUpperCase().includes('PSTS')
        const isPsasA = a.toUpperCase().includes('PSAS') || a.toUpperCase().includes('PSAT')
        const isPsasB = b.toUpperCase().includes('PSAS') || b.toUpperCase().includes('PSAT')
        if (isPstsA && !isPstsB) return isPsasB ? -1 : 1
        if (isPstsB && !isPstsA) return isPsasA ? 1 : -1
        if (isPsasA && !isPsasB) return 1
        if (isPsasB && !isPsasA) return -1
        const matchA = a.match(/\d+/)
        const matchB = b.match(/\d+/)
        if (matchA && matchB) return parseInt(matchA[0], 10) - parseInt(matchB[0], 10)
        return a.localeCompare(b)
      })

    const babKomponenMap = {}
    babList.forEach(bab => {
      babKomponenMap[bab] = classKomp.filter(k => (k.bab_nama || 'Lainnya') === bab).sort(sortBabKomponen)
    })

    const FIXED = 3
    const babColStart = {}
    const kompColMap = {}
    let col = FIXED
    babList.forEach(bab => {
      babColStart[bab] = col
      const komp = babKomponenMap[bab] || []
      komp.forEach((k, ki) => {
        kompColMap[k.id] = col + ki
      })
      col += (komp.length || 0) + (isSumatif(bab) ? 1 : 2)
    })
    const nilaiAkhirCol = col
    const predikatCol = col + 1
    const lingkupStartCol = col + 2

    let maxKomp = 0
    babList.forEach(bab => {
      if (babKomponenMap[bab]?.length > maxKomp) maxKomp = babKomponenMap[bab].length
    })

    const totalCols = lingkupStartCol + (babList.length * 2)
    const requiredLingkupRows = 15 + (maxKomp * 4)
    const dataRows = 13 + classStudents.length
    const totalRows = Math.max(dataRows, requiredLingkupRows)

    const BORDER = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    const styleTitle = { font: { bold: true, sz: 22 }, alignment: { horizontal: 'center', vertical: 'center' } }
    const styleInfo = { font: { sz: 12, bold: true } }
    const styleHeader = { font: { bold: true, sz: 12 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: BORDER, fill: { fgColor: { rgb: 'F2F2F2' } } }
    const styleDataCenter = { font: { sz: 12 }, alignment: { horizontal: 'center', vertical: 'center' }, border: BORDER }
    const styleDataLeft = { font: { sz: 12 }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: BORDER }
    const styleLingkupTitle = { font: { bold: true, sz: 12 } }
    const styleLingkupItalic = { font: { italic: true, sz: 12 } }
    const styleLingkupDesc = { font: { sz: 12 }, alignment: { horizontal: 'left', vertical: 'top', wrapText: true }, border: BORDER }

    const aoa2 = Array.from({ length: totalRows }, () => Array.from({ length: totalCols }, () => null))

    const getColLetter = (colIndex) => {
      let letter = ''
      let temp = colIndex
      while (temp >= 0) {
        letter = String.fromCharCode((temp % 26) + 65) + letter
        temp = Math.floor(temp / 26) - 1
      }
      return letter
    }

    const setCell = (r, c, val, style, t = null, f = null) => {
      if (aoa2[r]) {
        const cellType = t ? t : (typeof val === 'number' ? 'n' : 's')
        aoa2[r][c] = { v: val, t: cellType, s: JSON.parse(JSON.stringify(style || {})), f: f }
      }
    }

    // Title rows
    setCell(0, 0, 'DAFTAR NILAI PESERTA DIDIK', styleTitle)
    setCell(1, 0, sekolah, styleTitle)
    setCell(2, 0, `TAHUN AJARAN ${tahunAjaran}`, styleTitle)

    // Info rows
    setCell(3, 0, 'Mata Pelajaran', styleInfo); setCell(3, 2, `: ${mapelNama}`, styleInfo)
    setCell(4, 0, 'Kelas', styleInfo);          setCell(4, 2, `: ${kelas}`, styleInfo)
    setCell(5, 0, 'Semester', styleInfo);       setCell(5, 2, `: ${sem?.nomor || '-'}`, styleInfo)
    setCell(6, 0, 'Tahun Ajaran', styleInfo);   setCell(6, 2, `: ${tahunAjaran}`, styleInfo)
    setCell(7, 0, 'KKM', styleInfo);            setCell(7, 2, `: ${kkm}`, styleInfo)
    setCell(8, 0, 'Guru Pengampu', styleInfo);  setCell(8, 2, `: ${teacherName || 'Guru Pengampu'}`, styleInfo)

    const fillEmptyBorders = (rStart, rEnd, cStart, cEnd, style) => {
      for (let r = rStart; r <= rEnd; r++) {
        for (let c = cStart; c <= cEnd; c++) {
          if (!aoa2[r][c]) setCell(r, c, '', style, 's')
        }
      }
    }

    // Row 11 (idx 10): Main Headers & Bab
    setCell(10, 0, 'No', styleHeader)
    setCell(10, 1, 'NISN', styleHeader)
    setCell(10, 2, 'Nama Siswa', styleHeader)
    babList.forEach(bab => {
      setCell(10, babColStart[bab], bab, styleHeader)
    })
    setCell(10, nilaiAkhirCol, 'Nilai Akhir', styleHeader)
    setCell(10, predikatCol, 'Predikat', styleHeader)

    // Row 12 (idx 11): TP Sub-headers
    babList.forEach(bab => {
      const komp = babKomponenMap[bab] || []
      const start = babColStart[bab]
      const metode = komp[0]?.metode_hitung || 'rata_rata'
      komp.forEach((k, ki) => { setCell(11, start + ki, k.nama, styleHeader) })
      if (isSumatif(bab)) {
        setCell(11, start + komp.length, 'Keterangan (Belum Tuntas)', styleHeader)
        setCell(12, start + komp.length, '', styleDataCenter)
      } else {
        const rataHeaderName = (metode === 'bobot_manual') ? 'Nilai Akhir BAB' : 'Rata-rata BAB'
        setCell(11, start + komp.length, rataHeaderName, styleHeader)
        setCell(11, start + komp.length + 1, 'Keterangan (Belum Tuntas)', styleHeader)
        setCell(12, start + komp.length, '', styleDataCenter)
        setCell(12, start + komp.length + 1, '', styleDataCenter)
      }
    })

    // Row 13 (idx 12): Bobot
    babList.forEach(bab => {
      const komp = babKomponenMap[bab] || []
      const start = babColStart[bab]
      const metode = komp[0]?.metode_hitung || 'rata_rata'
      komp.forEach((k, ki) => {
        let bobot = ''
        if (metode === 'bobot_sama') {
          bobot = 100
        } else if (metode === 'bobot_manual') {
          bobot = (k.bobot !== undefined && k.bobot !== null) ? k.bobot : 100
        } else {
          bobot = ''
        }
        setCell(12, start + ki, bobot, styleDataCenter, 'n')
      })
    })

    fillEmptyBorders(10, 12, 0, 2, styleHeader)
    fillEmptyBorders(10, 12, nilaiAkhirCol, predikatCol, styleHeader)
    babList.forEach(bab => {
      const komp = babKomponenMap[bab] || []
      const start = babColStart[bab]
      const end = start + komp.length + (isSumatif(bab) ? 0 : 1)
      fillEmptyBorders(10, 12, start, end, styleHeader)
    })

    // Lingkup Materi Headers
    babList.forEach((bab, bi) => {
      const startLCol = lingkupStartCol + bi * 2
      setCell(10, startLCol, `Lingkup Materi ${bi + 1} :`, styleLingkupTitle)
      setCell(11, startLCol, 'Materi yang diajarkan :', styleLingkupTitle)
      setCell(12, startLCol, bab, styleLingkupItalic)
    })

    // Data Rows
    classStudents.forEach((s, idx) => {
      const r = 13 + idx
      const excelRow = r + 1
      setCell(r, 0, idx + 1, styleDataCenter)
      setCell(r, 1, s.nisn, styleDataCenter, 's')
      setCell(r, 2, s.nama_lengkap, styleDataLeft)

      const rataBabFormulaRefs = []

      babList.forEach(bab => {
        const komp = babKomponenMap[bab] || []
        const start = babColStart[bab]
        const tpKomp = komp
        const tpColLetters = tpKomp.map((k, ki) => getColLetter(start + ki))

        komp.forEach((k, ki) => {
          const val = classNilaiData[k.id]?.[String(s.nisn)]
          setCell(r, start + ki, val !== undefined && val !== null && val !== '' ? Number(val) : '', styleDataCenter, 'n')
        })

        const metode = komp[0]?.metode_hitung || 'rata_rata'
        let formulaRata = ''

        if (!isSumatif(bab)) {
          if (tpColLetters.length > 0) {
            const rangeNilai = `${tpColLetters[0]}${excelRow}:${tpColLetters[tpColLetters.length - 1]}${excelRow}`
            const rangeBobot = `${tpColLetters[0]}13:${tpColLetters[tpColLetters.length - 1]}13`

            if (metode === 'rata_rata') {
              formulaRata = `IF(COUNT(${rangeNilai})=0, "", IFERROR(ROUND(AVERAGE(${rangeNilai}), 2), ""))`
            } else {
              formulaRata = `IF(COUNT(${rangeNilai})=0, "", IFERROR(ROUND(SUMPRODUCT(${rangeNilai}, ${rangeBobot}) / SUMIF(${rangeNilai}, ">=0", ${rangeBobot}), 2), ""))`
            }
          }

          const rataCol = start + komp.length
          const rataColLetter = getColLetter(rataCol)
          if (formulaRata) {
            rataBabFormulaRefs.push(`${rataColLetter}${excelRow}`)
          }

          setCell(r, rataCol, null, styleDataCenter, 'n', formulaRata)

          // Keterangan formula
          let formulaKeterangan = `""`
          if (tpColLetters.length > 0) {
            const parts = tpKomp.map((k, ki) => `IF(AND(NOT(ISBLANK(${tpColLetters[ki]}${excelRow})), ${tpColLetters[ki]}${excelRow}=0), "${k.nama}, ", "")`)
            const concatExpr = parts.join(' & ')
            formulaKeterangan = `IF(${concatExpr}="", "", LEFT(${concatExpr}, LEN(${concatExpr})-2) & " belum dikerjakan")`
          }
          setCell(r, start + komp.length + 1, null, styleDataLeft, 's', formulaKeterangan)
        } else {
          if (tpColLetters.length > 0) {
            rataBabFormulaRefs.push(`${tpColLetters[0]}${excelRow}`)
          }
          let formulaKeterangan = `""`
          if (tpColLetters.length > 0) {
            const parts = tpKomp.map((k, ki) => `IF(AND(NOT(ISBLANK(${tpColLetters[ki]}${excelRow})), ${tpColLetters[ki]}${excelRow}=0), "${k.nama}, ", "")`)
            const concatExpr = parts.join(' & ')
            formulaKeterangan = `IF(${concatExpr}="", "", LEFT(${concatExpr}, LEN(${concatExpr})-2) & " belum dikerjakan")`
          }
          setCell(r, start + komp.length, null, styleDataLeft, 's', formulaKeterangan)
        }
      })

      // Nilai Akhir Formula
      let formulaRataSumatif = `""`
      if (rataBabFormulaRefs.length > 0) {
        if (classConfigAkhir.metode_hitung === 'bobot_manual') {
          let numParts = []
          let denParts = []
          babList.forEach((bab, bIdx) => {
            const bobot = Number(classConfigAkhir.bobot_detail[bab] || 0)
            if (bobot > 0 && rataBabFormulaRefs[bIdx]) {
              numParts.push(`IF(ISNUMBER(${rataBabFormulaRefs[bIdx]}), ${rataBabFormulaRefs[bIdx]} * ${bobot}, 0)`)
              denParts.push(`IF(ISNUMBER(${rataBabFormulaRefs[bIdx]}), ${bobot}, 0)`)
            }
          })
          if (numParts.length > 0) {
            formulaRataSumatif = `IF((${denParts.join(' + ')})=0, "", IFERROR(ROUND((${numParts.join(' + ')}) / (${denParts.join(' + ')}), 1), ""))`
          }
        } else if (classConfigAkhir.metode_hitung === 'rata_rata_langsung') {
          const allCompRefs = []
          babList.forEach(bab => {
            const komp = babKomponenMap[bab] || []
            komp.forEach(k => {
              if (classConfigAkhir.include_karakter !== true && isKarakterKomponen(k.nama)) return
              const colIdx = kompColMap[k.id]
              if (colIdx !== undefined) {
                allCompRefs.push(`${getColLetter(colIdx)}${excelRow}`)
              }
            })
          })
          if (allCompRefs.length > 0) {
            formulaRataSumatif = `IFERROR(ROUND(AVERAGE(${allCompRefs.join(',')}), 1), "")`
          }
        } else {
          formulaRataSumatif = `IFERROR(ROUND(AVERAGE(${rataBabFormulaRefs.join(',')}), 1), "")`
        }
      }
      setCell(r, nilaiAkhirCol, null, styleDataCenter, 'n', formulaRataSumatif)

      // Predikat Formula
      const akhirColLetter = getColLetter(nilaiAkhirCol)
      const formulaPredikat = `IF(OR(${akhirColLetter}${excelRow}="", ${akhirColLetter}${excelRow}=0), "", IF(${akhirColLetter}${excelRow}>=90, "A", IF(${akhirColLetter}${excelRow}>=80, "B", IF(${akhirColLetter}${excelRow}>=70, "C", IF(${akhirColLetter}${excelRow}>=60, "D", "E")))))`
      setCell(r, predikatCol, null, styleDataCenter, 's', formulaPredikat)
    })

    // Lingkup Materi Descriptions
    babList.forEach((bab, bi) => {
      const komp = babKomponenMap[bab] || []
      const startLCol = lingkupStartCol + bi * 2

      komp.forEach((k, ki) => {
        const rowStart = 13 + (ki * 4)
        setCell(rowStart, startLCol, k.nama, styleDataCenter)
        setCell(rowStart, startLCol + 1, k.deskripsi || '', styleLingkupDesc)
        fillEmptyBorders(rowStart, rowStart + 3, startLCol, startLCol, styleDataCenter)
        fillEmptyBorders(rowStart, rowStart + 3, startLCol + 1, startLCol + 1, styleLingkupDesc)
      })
    })

    const sheetName = (customSheetName || `Nilai ${kelas} Sem${sem?.nomor || '-'}`).substring(0, 31)
    const ws = wb.addWorksheet(sheetName, {
      views: [{ state: 'frozen', xSplit: 3, ySplit: 13, showGridLines: false }]
    })

    // Write values and styles
    for (let r = 0; r < totalRows; r++) {
      const row = ws.getRow(r + 1)
      for (let c = 0; c < totalCols; c++) {
        const cell = row.getCell(c + 1)
        if (aoa2[r] && aoa2[r][c] !== null && aoa2[r][c] !== undefined) {
          const val = aoa2[r][c].v
          const f = aoa2[r][c].f
          if (f) {
            cell.value = { formula: f }
          } else {
            if (val !== undefined && val !== null) cell.value = val
          }

          const s = aoa2[r][c].s
          if (s) {
            if (s.font) {
              cell.font = {
                bold: s.font.bold,
                italic: s.font.italic,
                size: s.font.sz,
                name: 'Times New Roman'
              }
            }
            if (s.alignment) {
              cell.alignment = {
                horizontal: s.alignment.horizontal,
                vertical: s.alignment.vertical === 'center' ? 'middle' : s.alignment.vertical,
                wrapText: s.alignment.wrapText
              }
            }
            if (s.border) {
              const borderStyle = { style: 'thin', color: { argb: 'FF000000' } }
              const cellBorder = {}
              if (s.border.top) cellBorder.top = borderStyle
              if (s.border.bottom) cellBorder.bottom = borderStyle
              if (s.border.left) cellBorder.left = borderStyle
              if (s.border.right) cellBorder.right = borderStyle
              if (Object.keys(cellBorder).length > 0) cell.border = cellBorder
            }
            if (s.fill && s.fill.fgColor && s.fill.fgColor.rgb) {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF' + s.fill.fgColor.rgb }
              }
            }
          }
        }
      }
    }

    // Merges
    const merges = []
    ;[0, 1, 2].forEach(r => {
      if (predikatCol > 1) merges.push({ s: { r, c: 0 }, e: { r, c: predikatCol } })
    })
    ;[4, 5, 6, 7, 8].forEach(r => {
      if (predikatCol > 2) merges.push({ s: { r, c: 2 }, e: { r, c: predikatCol } })
    })

    babList.forEach(bab => {
      const komp = babKomponenMap[bab] || []
      const start = babColStart[bab]
      const end = start + komp.length + (isSumatif(bab) ? 0 : 1)
      if (end > start) merges.push({ s: { r: 10, c: start }, e: { r: 10, c: end } })

      if (!isSumatif(bab)) {
        const rataCol = start + komp.length
        const ketCol = start + komp.length + 1
        merges.push({ s: { r: 11, c: rataCol }, e: { r: 12, c: rataCol } })
        merges.push({ s: { r: 11, c: ketCol }, e: { r: 12, c: ketCol } })
      } else {
        const ketCol = start + komp.length
        merges.push({ s: { r: 11, c: ketCol }, e: { r: 12, c: ketCol } })
      }
    })

    ;[0, 1, 2].forEach(c => merges.push({ s: { r: 10, c }, e: { r: 12, c } }))
    ;[nilaiAkhirCol, predikatCol].forEach(c => {
      merges.push({ s: { r: 10, c }, e: { r: 12, c } })
    })

    babList.forEach((bab, bi) => {
      const startLCol = lingkupStartCol + bi * 2
      const komp = babKomponenMap[bab] || []
      komp.forEach((k, ki) => {
        const rowStart = 13 + (ki * 4)
        merges.push({ s: { r: rowStart, c: startLCol }, e: { r: rowStart + 3, c: startLCol } })
        merges.push({ s: { r: rowStart, c: startLCol + 1 }, e: { r: rowStart + 3, c: startLCol + 1 } })
      })
    })

    for (const m of merges) {
      ws.mergeCells(m.s.r + 1, m.s.c + 1, m.e.r + 1, m.e.c + 1)
    }

    // Column widths
    const colWidths = Array(totalCols).fill({ wch: 10 })
    for (let c = 0; c < totalCols; c++) {
      let maxLen = 5
      for (let r = 0; r < totalRows; r++) {
        if (aoa2[r] && aoa2[r][c] && aoa2[r][c].v !== undefined && aoa2[r][c].v !== null) {
          if (c === 0 && r < 4) continue
          if (r === 10 && c > 2 && c < nilaiAkhirCol) continue
          if (c >= lingkupStartCol && r >= 10 && r <= 12) continue

          let valStr = String(aoa2[r][c].v)
          let lines = valStr.split('\n')
          for (let line of lines) {
            if (line.length > maxLen) maxLen = line.length
          }
        }
      }

      if (c === 0) maxLen = 4 // No
      else if (c === 1) maxLen = 16.5 // NISN
      else if (c === 2) {
        const maxNamaLength = Math.max(...classStudents.map(s => (s.nama_lengkap || '').length), 15)
        maxLen = maxNamaLength + 2
      } else if (c >= lingkupStartCol) {
        const isDesc = (c - lingkupStartCol) % 2 !== 0
        if (isDesc) maxLen = 60
        else maxLen = 15
      } else {
        maxLen = Math.min(Math.max(maxLen + 2, 8), 35)
      }

      colWidths[c] = { wch: maxLen }
    }

    for (let c = 0; c < colWidths.length; c++) {
      if (colWidths[c]) {
        ws.getColumn(c + 1).width = colWidths[c].wch
      }
    }

    // Row heights
    ws.getRow(1).height = 34.5
    ws.getRow(2).height = 34.5
    ws.getRow(3).height = 34.5

    babList.forEach((bab, bi) => {
      const komp = babKomponenMap[bab] || []
      komp.forEach((k, ki) => {
        const rowStart = 13 + (ki * 4)
        const descLen = (k.deskripsi || '').length
        const lines = Math.ceil(descLen / 60)
        if (lines > 4) {
          const extraLines = lines - 4
          const hpt = 15 + Math.ceil((extraLines * 15) / 4)
          ws.getRow(rowStart).height = hpt
          ws.getRow(rowStart + 1).height = hpt
          ws.getRow(rowStart + 2).height = hpt
          ws.getRow(rowStart + 3).height = hpt
        }
      })
    })

    // Custom BAB Header Colors
    const babHexColors = ['FFEEF2FF', 'FFECFDF5', 'FFFFFBEB', 'FFFAF5FF', 'FFFFF1F2', 'FFECFEFF']
    babList.forEach((bab, bi) => {
      const start = babColStart[bab]
      const komp = babKomponenMap[bab] || []
      const end = start + komp.length + (isSumatif(bab) ? 0 : 1)
      const color = babHexColors[bi % babHexColors.length]

      for (let r = 10; r <= 11; r++) {
        for (let c = start; c <= end; c++) {
          const cell = ws.getRow(r + 1).getCell(c + 1)
          cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
        }
      }

      for (let c = start; c <= end; c++) {
        const cell = ws.getRow(13).getCell(c + 1)
        if (aoa2[12] && aoa2[12][c] && aoa2[12][c].v !== undefined && aoa2[12][c].v !== null && aoa2[12][c].v !== '') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
        }
      }
    })

    // Zebra striping on student rows
    classStudents.forEach((s, idx) => {
      const r = 13 + idx
      const isGanjilVisual = (idx % 2 === 0)
      const rowColor = isGanjilVisual ? 'FFFFFFFF' : 'FFF0F9FF'
      for (let c = 0; c < totalCols; c++) {
        if (c > predikatCol) break
        const cell = ws.getRow(r + 1).getCell(c + 1)
        if (aoa2[r] && aoa2[r][c] && aoa2[r][c].s && aoa2[r][c].s.border) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowColor } }
        }
      }
    })

    // Worksheet Protection
    await ws.protect('sklbm123', {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: false,
      formatColumns: false,
      formatRows: false
    })

    // Unlock grade cells & Apply Conditional Formatting (Red under KKM, Green >= KKM)
    for (let r = 13; r < totalRows; r++) {
      const excelRow = r + 1
      babList.forEach(bab => {
        const start = babColStart[bab]
        const komp = babKomponenMap[bab] || []
        komp.forEach((k, ki) => {
          const cell = ws.getRow(excelRow).getCell(start + ki + 1)
          cell.protection = { locked: false }

          ws.addConditionalFormatting({
            ref: cell.address,
            rules: [
              {
                type: 'expression',
                formulae: [`AND(ISNUMBER(${cell.address}), ${cell.address}<${kkm})`],
                style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' } } }
              },
              {
                type: 'expression',
                formulae: [`AND(ISNUMBER(${cell.address}), ${cell.address}>=${kkm})`],
                style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } }, font: { color: { argb: 'FF006100' } } }
              }
            ]
          })
        })

        // Rata-rata BAB conditional formatting
        const rataCell = ws.getRow(excelRow).getCell(start + komp.length + 1)
        ws.addConditionalFormatting({
          ref: rataCell.address,
          rules: [
            {
              type: 'expression',
              formulae: [`AND(ISNUMBER(${rataCell.address}), ${rataCell.address}<${kkm})`],
              style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' } } }
            },
            {
              type: 'expression',
              formulae: [`AND(ISNUMBER(${rataCell.address}), ${rataCell.address}>=${kkm})`],
              style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } }, font: { color: { argb: 'FF006100' } } }
            }
          ]
        })
      })

      // Nilai Akhir conditional formatting
      const nilaiAkhirColCell = ws.getRow(excelRow).getCell(nilaiAkhirCol + 1)
      ws.addConditionalFormatting({
        ref: nilaiAkhirColCell.address,
        rules: [
          {
            type: 'expression',
            formulae: [`AND(ISNUMBER(${nilaiAkhirColCell.address}), ${nilaiAkhirColCell.address}<${kkm})`],
            style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' } } }
          },
          {
            type: 'expression',
            formulae: [`AND(ISNUMBER(${nilaiAkhirColCell.address}), ${nilaiAkhirColCell.address}>=${kkm})`],
            style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } }, font: { color: { argb: 'FF006100' } } }
          }
        ]
      })
    }
  }

  // ─── Complete Multi-Class Excel Export Execution ─────────────────────────
  const handleDownloadExcel = async () => {
    try {
      if (selectedExportClasses.length === 0) {
        alert('Pilih minimal satu kelas untuk diekspor.')
        return
      }
      setIsExporting(true)
      setShowExportModal(false)

      const taId = activeTa?.id
      const sem = semesters.find(s => s.id === selectedSemesterId)
      const curMapelObj = mapels.find(m => m.id === selectedMapelId)
      const mapelNama = curMapelObj?.nama || 'Mata Pelajaran'

      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'eBudiMulia - Kurikulum'
      wb.created = new Date()

      let currentIdx = 0
      for (const kelas of selectedExportClasses) {
        currentIdx++
        setExportProgressText(`Memproses Kelas ${kelas} (${currentIdx}/${selectedExportClasses.length})...`)

        // 1. Fetch Assigned Teacher for this class & mapel
        let gmQuery = supabase.from('guru_mapel')
          .select('guru_id, kelas, guru(id, nama_guru, kode)')
          .eq('mata_pelajaran_id', selectedMapelId)
          .eq('kelas', kelas)
        if (taId) gmQuery = gmQuery.eq('tahun_ajaran_id', taId)
        let { data: gmData } = await gmQuery.maybeSingle()

        if (!gmData) {
          const { data: fbGm } = await supabase.from('guru_mapel')
            .select('guru_id, kelas, guru(id, nama_guru, kode)')
            .eq('mata_pelajaran_id', selectedMapelId)
            .eq('kelas', kelas)
            .maybeSingle()
          gmData = fbGm
        }
        const teacherId = gmData?.guru_id || null
        const teacherName = gmData?.guru?.nama_guru
          ? `${gmData.guru.nama_guru} (${gmData.guru.kode || '-'})`
          : 'Guru Pengampu'

        // 2. Fetch Students for this class
        let stdQuery = supabase.from('siswa_lengkap')
          .select('nisn, nama_lengkap, kelas')
          .eq('kelas', kelas)
        if (taId) stdQuery = stdQuery.eq('tahun_ajaran_id', taId)
        let { data: classStudents } = await stdQuery.order('nama_lengkap', { ascending: true })

        if (!classStudents || classStudents.length === 0) {
          const { data: fbStds } = await supabase.from('siswa_lengkap')
            .select('nisn, nama_lengkap, kelas')
            .eq('kelas', kelas)
            .order('nama_lengkap', { ascending: true })
          classStudents = fbStds || []
        }

        // 3. Fetch Components for this teacher & mapel
        let kompQuery = supabase.from('nilai_komponen')
          .select('*')
          .eq('mata_pelajaran_id', selectedMapelId)
          .order('urutan', { ascending: true })
        if (teacherId) kompQuery = kompQuery.eq('guru_id', teacherId)
        if (taId) kompQuery = kompQuery.eq('tahun_ajaran_id', taId)
        let { data: rawKData } = await kompQuery

        if (!rawKData || rawKData.length === 0) {
          let fbKompQuery = supabase.from('nilai_komponen')
            .select('*')
            .eq('mata_pelajaran_id', selectedMapelId)
            .order('urutan', { ascending: true })
          if (teacherId) fbKompQuery = fbKompQuery.eq('guru_id', teacherId)
          const { data: fbK } = await fbKompQuery
          rawKData = fbK || []
        }

        const curClass = String(kelas).trim().toUpperCase()
        const classKomp = (rawKData || []).filter(k => {
          if (teacherId && k.guru_id && k.guru_id !== teacherId) return false
          if (k.semester_id && selectedSemesterId && k.semester_id !== selectedSemesterId) return false
          if (!k.target_kelas || k.target_kelas.length === 0) {
            if (k.kelas) return String(k.kelas).trim().toUpperCase() === curClass
            return true
          }
          if (Array.isArray(k.target_kelas)) {
            return k.target_kelas.some(c => String(c || '').trim().toUpperCase() === curClass)
          }
          if (typeof k.target_kelas === 'string') {
            return k.target_kelas.toUpperCase().includes(curClass)
          }
          if (k.kelas) {
            return String(k.kelas).trim().toUpperCase() === curClass
          }
          return true
        })

        // 4. Fetch Nilai Siswa for this class & components
        let classNilaiData = {}
        const kompIds = classKomp.map(k => k.id)
        const nisnList = (classStudents || []).map(s => String(s.nisn))

        if (kompIds.length > 0 && nisnList.length > 0) {
          const { data: nData } = await supabase.from('nilai_siswa')
            .select('*')
            .in('komponen_id', kompIds)
            .in('siswa_nisn', nisnList)

          if (nData) {
            nData.forEach(n => {
              if (!classNilaiData[n.komponen_id]) classNilaiData[n.komponen_id] = {}
              classNilaiData[n.komponen_id][String(n.siswa_nisn)] = n.nilai
            })
          }
        }

        // 5. Fetch Config Akhir for this class & teacher
        const masterMetodeExp = raporSettings.metode_hitung_nilai_akhir || 'rata_rata'
        const masterIncKarExp = raporSettings.include_karakter_nilai_akhir === 'true'
        let classConfigAkhir = {
          metode_hitung: masterMetodeExp,
          bobot_detail: {},
          include_karakter: masterIncKarExp,
          is_visible: false
        }
        let cfgQuery = supabase.from('nilai_akhir_config')
          .select('*')
          .eq('semester_id', selectedSemesterId)
          .eq('mata_pelajaran_id', selectedMapelId)
          .eq('kelas', kelas)
        if (teacherId) cfgQuery = cfgQuery.eq('guru_id', teacherId)
        if (taId) cfgQuery = cfgQuery.eq('tahun_ajaran_id', taId)
        const { data: cfgRow } = await cfgQuery.maybeSingle()
        if (cfgRow) {
          classConfigAkhir = {
            metode_hitung: cfgRow.metode_hitung === 'bobot_manual' ? 'bobot_manual' : (cfgRow.metode_hitung || masterMetodeExp),
            bobot_detail: cfgRow.bobot_detail || {},
            include_karakter: cfgRow.bobot_detail?.include_karakter ?? masterIncKarExp,
            is_visible: cfgRow.is_visible ?? false
          }
        }

        // 6. Generate formatted class sheet
        await generateClassSheet(kelas, classStudents, classKomp, classNilaiData, classConfigAkhir, wb, teacherName)
      }

      const buffer = await wb.xlsx.writeBuffer()
      const clsName = selectedExportClasses.length === allKelasList.length
        ? 'Seluruh_Kelas'
        : selectedExportClasses.length > 1
        ? 'MultiKelas'
        : `Kelas_${selectedExportClasses[0]}`
      const cleanMapelName = mapelNama.trim().replace(/\s+/g, '_')
      const fileName = `Leger_Nilai_${cleanMapelName}_${clsName}_Sem${sem?.nomor || 1}.xlsx`
      await downloadFile(buffer, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    } catch (err) {
      console.error('Error export excel leger:', err)
      alert('Gagal mengekspor file Excel: ' + err.message)
    } finally {
      setIsExporting(false)
      setExportProgressText('')
    }
  }

  // ─── Export Master Leger Seluruh Mapel Sekolah + Seluruh Kelas (1 File Excel) ─────
  const handleDownloadMasterLegerSchoolExcel = async () => {
    try {
      setIsExporting(true)
      setShowExportModal(false)
      setExportProgressText('Mempersiapkan data seluruh mapel sekolah...')

      const sem = semesters.find(s => s.id === selectedSemesterId)
      const taId = activeTa?.id
      const tahunAjaran = activeTa?.nama || ''
      const sekolah = 'SMP BUDI MULIA'

      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'eBudiMulia - Kurikulum & Admin'
      wb.created = new Date()

      // 1. Fetch All Mata Pelajaran
      const { data: rawMapels } = await supabase.from('mata_pelajaran').select('id, nama, singkatan').order('nama')
      const allSchoolMapels = rawMapels || []
      if (allSchoolMapels.length === 0) {
        alert('Data mata pelajaran tidak ditemukan.')
        setIsExporting(false)
        setExportProgressText('')
        return
      }

      // 2. Fetch All Students in Active TA
      let stdQuery = supabase.from('siswa_lengkap').select('nisn, nama_lengkap, kelas')
      if (taId) stdQuery = stdQuery.eq('tahun_ajaran_id', taId)
      const { data: rawStudents } = await stdQuery.order('nama_lengkap', { ascending: true })
      const allStudents = rawStudents || []
      if (allStudents.length === 0) {
        alert('Data siswa tidak ditemukan untuk tahun ajaran ini.')
        setIsExporting(false)
        setExportProgressText('')
        return
      }

      // Extract unique classes sorted naturally
      const allClassesList = [...new Set(allStudents.map(s => (s.kelas || '').trim()).filter(Boolean))].sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, '') || '0', 10)
        const numB = parseInt(b.replace(/\D/g, '') || '0', 10)
        if (numA !== numB) return numA - numB
        return a.localeCompare(b)
      })

      // 3. Fetch All Components for Active TA & Semester
      let kompQuery = supabase.from('nilai_komponen')
        .select('*')
        .eq('semester_id', selectedSemesterId)
      if (taId) kompQuery = kompQuery.eq('tahun_ajaran_id', taId)
      const { data: rawKomponen } = await kompQuery.order('urutan', { ascending: true })
      const allKomponen = rawKomponen || []

      // 4. Fetch All Nilai Siswa for these components (with pagination to bypass Supabase 1000 row limit)
      const kompIds = allKomponen.map(k => k.id)
      let allNilaiData = {} // { [komponen_id]: { [nisn]: nilai } }
      if (kompIds.length > 0) {
        const compChunkSize = 30
        const pageSize = 1000
        for (let i = 0; i < kompIds.length; i += compChunkSize) {
          const chunk = kompIds.slice(i, i + compChunkSize)
          let from = 0
          let hasMore = true
          while (hasMore) {
            const { data: nData, error } = await supabase.from('nilai_siswa')
              .select('komponen_id, siswa_nisn, nilai')
              .in('komponen_id', chunk)
              .range(from, from + pageSize - 1)
            if (error) {
              console.error('Error fetching nilai_siswa chunk:', error)
              break
            }
            if (nData && nData.length > 0) {
              nData.forEach(n => {
                if (!allNilaiData[n.komponen_id]) allNilaiData[n.komponen_id] = {}
                allNilaiData[n.komponen_id][String(n.siswa_nisn)] = n.nilai
              })
              if (nData.length < pageSize) {
                hasMore = false
              } else {
                from += pageSize
              }
            } else {
              hasMore = false
            }
          }
        }
      }

      // 5. Fetch Config Akhir
      let cfgQuery = supabase.from('nilai_akhir_config')
        .select('*')
        .eq('semester_id', selectedSemesterId)
      if (taId) cfgQuery = cfgQuery.eq('tahun_ajaran_id', taId)
      const { data: rawConfigs } = await cfgQuery
      const configMap = {}
      ;(rawConfigs || []).forEach(c => {
        configMap[`${c.mata_pelajaran_id}_${c.kelas}`] = c
      })

      // 5b. Fetch Guru Mapel Assignments for accurate teacher component isolation
      let gmExportQuery = supabase.from('guru_mapel').select('guru_id, kelas, mata_pelajaran_id')
      if (taId) gmExportQuery = gmExportQuery.eq('tahun_ajaran_id', taId)
      const { data: rawGmExport } = await gmExportQuery
      const allGmExportList = rawGmExport || []

      // Helper to calculate student's final score in a subject
      const calcStudentSubjectScore = (studentNisn, kelas, mapelId) => {
        const curClass = String(kelas).trim().toUpperCase()
        const assignedGuruId = allGmExportList.find(g => g.mata_pelajaran_id === mapelId && String(g.kelas).trim().toUpperCase() === curClass)?.guru_id

        let mKomps = allKomponen.filter(k => {
          if (k.mata_pelajaran_id !== mapelId) return false
          if (!k.target_kelas || k.target_kelas.length === 0) {
            if (k.kelas) return String(k.kelas).trim().toUpperCase() === curClass
            return true
          }
          if (Array.isArray(k.target_kelas)) {
            return k.target_kelas.some(c => String(c || '').trim().toUpperCase() === curClass)
          }
          return true
        })

        if (assignedGuruId) {
          const teacherKomps = mKomps.filter(k => k.guru_id === assignedGuruId)
          if (teacherKomps.length > 0) {
            const nonTeacherKomps = mKomps.filter(k => k.guru_id !== assignedGuruId)
            const extraKomps = nonTeacherKomps.filter(k => {
              const b = (k.bab_nama || '').toLowerCase()
              const n = (k.nama || '').toLowerCase()
              return b.includes('psts') || n.includes('psts') || b.startsWith('psas') || b.startsWith('psat')
            })
            mKomps = [...teacherKomps, ...extraKomps]
          }
        }

        if (mKomps.length === 0) return null

        const babs = [...new Set(mKomps.map(k => k.bab_nama || 'Lainnya'))]
        const cfg = configMap[`${mapelId}_${kelas}`] || { metode_hitung: raporSettings.metode_hitung_nilai_akhir || 'rata_rata', bobot_detail: {} }
        const incKar = cfg.bobot_detail?.include_karakter ?? (raporSettings.include_karakter_nilai_akhir === 'true')

        const hitungRataBAB = (bab) => {
          const bKomps = mKomps.filter(k => (k.bab_nama || 'Lainnya') === bab && (incKar ? true : !isKarakterKomponen(k.nama)))
          if (bKomps.length === 0) return null
          const metode = bKomps[0]?.metode_hitung || 'rata_rata'
          let totalBobot = 0, totalNilai = 0, hasVal = false
          bKomps.forEach(k => {
            const val = allNilaiData[k.id]?.[String(studentNisn)]
            if (val !== undefined && val !== null && val !== '') {
              const num = Number(val)
              if (metode === 'bobot_manual') {
                totalNilai += num * (k.bobot || 1)
                totalBobot += (k.bobot || 1)
              } else {
                totalNilai += num
                totalBobot += 1
              }
              hasVal = true
            }
          })
          if (!hasVal || totalBobot === 0) return null
          return +(totalNilai / totalBobot).toFixed(1)
        }

        if (cfg.metode_hitung === 'rata_rata_langsung') {
          let totalNilai = 0, count = 0
          mKomps.forEach(k => {
            if (!incKar && isKarakterKomponen(k.nama)) return
            const val = allNilaiData[k.id]?.[String(studentNisn)]
            if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && String(val).trim() !== '-') {
              totalNilai += Number(val)
              count += 1
            }
          })
          if (count === 0) return null
          return +(totalNilai / count).toFixed(1)
        } else if (cfg.metode_hitung === 'bobot_manual') {
          let totalNilai = 0, totalBobot = 0
          babs.forEach(bab => {
            const rBab = hitungRataBAB(bab)
            if (rBab !== null) {
              const b = Number(cfg.bobot_detail?.[bab] || 0)
              totalNilai += rBab * b
              totalBobot += b
            }
          })
          if (totalBobot === 0) return null
          return +(totalNilai / totalBobot).toFixed(1)
        } else {
          const vals = babs.map(b => hitungRataBAB(b)).filter(v => v !== null)
          if (vals.length === 0) return null
          return +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
        }
      }

      const BORDER_THIN = {
        top: { style: 'thin', color: { argb: 'CBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'CBD5E1' } },
        left: { style: 'thin', color: { argb: 'CBD5E1' } },
        right: { style: 'thin', color: { argb: 'CBD5E1' } }
      }
      const BORDER_DOUBLE_BOTTOM = {
        top: { style: 'thin', color: { argb: 'CBD5E1' } },
        bottom: { style: 'double', color: { argb: '334155' } },
        left: { style: 'thin', color: { argb: 'CBD5E1' } },
        right: { style: 'thin', color: { argb: 'CBD5E1' } }
      }

      const getColLetter = (colNum) => {
        let letter = ''
        let n = colNum
        while (n > 0) {
          const m = (n - 1) % 26
          letter = String.fromCharCode(65 + m) + letter
          n = Math.floor((n - 1) / 26)
        }
        return letter
      }

      // Add Rekapitulasi Sekolah summary sheet first if more than 1 class
      const wsSummary = allClassesList.length > 1 ? wb.addWorksheet('Rekapitulasi Sekolah', {
        views: [{ showGridLines: true }]
      }) : null
      const schoolClassSummaries = []

      // 6. Generate a Leger Sheet for EACH class
      for (let cIdx = 0; cIdx < allClassesList.length; cIdx++) {
        const kelas = allClassesList[cIdx]
        setExportProgressText(`Menghitung Leger Kelas ${kelas} (${cIdx + 1}/${allClassesList.length})...`)

        const classStudents = allStudents.filter(s => s.kelas === kelas)
        if (classStudents.length === 0) continue

        const ws = wb.addWorksheet(`Leger ${kelas}`.substring(0, 31), {
          views: [{ state: 'frozen', xSplit: 3, ySplit: 5, showGridLines: true }]
        })

        const headers = ['No', 'NISN', 'Nama Siswa', ...allSchoolMapels.map(m => m.singkatan || m.nama), 'Total Nilai', 'Rata-rata', 'Peringkat']
        const lastColLetter = getColLetter(headers.length)

        // Title Header
        ws.mergeCells(`A1:${lastColLetter}1`)
        const titleCell = ws.getCell('A1')
        titleCell.value = 'LEGER NILAI HASIL BELAJAR PESERTA DIDIK'
        titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: '1E293B' } }
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' }

        ws.mergeCells(`A2:${lastColLetter}2`)
        const subTitleCell = ws.getCell('A2')
        subTitleCell.value = `${sekolah} | KELAS: ${kelas} | SEMESTER: ${sem?.nomor || '-'} | TAHUN AJARAN: ${tahunAjaran}`
        subTitleCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: '64748B' } }
        subTitleCell.alignment = { horizontal: 'center', vertical: 'middle' }

        // Table Header Row 5
        const headerRow = ws.getRow(5)
        headerRow.values = headers
        headerRow.height = 28

        headerRow.eachCell((cell, colNum) => {
          cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFF' } }
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: colNum > allSchoolMapels.length + 3 ? '0F172A' : colNum <= 3 ? '334155' : '4338CA' }
          }
          cell.border = BORDER_THIN
        })

        // Compute scores for all students in this class
        const studentRowsData = classStudents.map(s => {
          let totalScore = 0
          let scoredCount = 0
          const mapelScores = allSchoolMapels.map(m => {
            const score = calcStudentSubjectScore(s.nisn, kelas, m.id)
            if (score !== null && !isNaN(score)) {
              totalScore += score
              scoredCount++
              return score
            }
            return null
          })

          const avgScore = scoredCount > 0 ? +(totalScore / scoredCount).toFixed(1) : null

          return {
            nisn: s.nisn,
            nama: s.nama_lengkap,
            mapelScores,
            totalScore: scoredCount > 0 ? +(totalScore).toFixed(1) : null,
            avgScore
          }
        })

        // Assign rankings based on avgScore
        const sortedScores = [...studentRowsData]
          .filter(s => s.avgScore !== null)
          .map(s => s.avgScore)
          .sort((a, b) => b - a)

        studentRowsData.forEach(s => {
          if (s.avgScore !== null) {
            s.rank = sortedScores.indexOf(s.avgScore) + 1
          } else {
            s.rank = '-'
          }
        })

        // Write student rows
        studentRowsData.forEach((sData, sIdx) => {
          const row = ws.getRow(6 + sIdx)
          row.height = 20
          const isEven = sIdx % 2 === 1

          const rowValues = [
            sIdx + 1,
            sData.nisn,
            sData.nama,
            ...sData.mapelScores.map(v => v !== null ? v : '-'),
            sData.totalScore !== null ? sData.totalScore : '-',
            sData.avgScore !== null ? sData.avgScore : '-',
            sData.rank
          ]
          row.values = rowValues

          row.eachCell((cell, colNum) => {
            cell.font = { name: 'Arial', size: 9, bold: colNum >= headers.length - 2 }
            cell.alignment = {
              horizontal: colNum === 3 ? 'left' : 'center',
              vertical: 'middle'
            }
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: isEven ? 'F8FAFC' : 'FFFFFF' }
            }
            cell.border = BORDER_THIN

            if (colNum > 3 && colNum <= 3 + allSchoolMapels.length) {
              const val = cell.value
              if (typeof val === 'number') {
                if (val < kkm) {
                  cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'DC2626' } }
                } else if (val >= 90) {
                  cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: '059669' } }
                }
              }
            }
          })
        })

        // Summary Row: Rata-rata Kelas
        const summaryRowIdx = 6 + studentRowsData.length
        const sumRow = ws.getRow(summaryRowIdx)
        sumRow.height = 22
        const classAvgValues = ['Rata-rata Kelas', '', '']
        allSchoolMapels.forEach((_, mIdx) => {
          const vals = studentRowsData.map(s => s.mapelScores[mIdx]).filter(v => v !== null)
          if (vals.length > 0) {
            classAvgValues.push(+(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1))
          } else {
            classAvgValues.push('-')
          }
        })
        const totalAvgs = studentRowsData.map(s => s.totalScore).filter(v => v !== null)
        classAvgValues.push(totalAvgs.length > 0 ? +(totalAvgs.reduce((a, b) => a + b, 0) / totalAvgs.length).toFixed(1) : '-')
        const generalAvgs = studentRowsData.map(s => s.avgScore).filter(v => v !== null)
        const classAvgValue = generalAvgs.length > 0 ? +(generalAvgs.reduce((a, b) => a + b, 0) / generalAvgs.length).toFixed(1) : null
        classAvgValues.push(classAvgValue !== null ? classAvgValue : '-')
        classAvgValues.push('')

        sumRow.values = classAvgValues
        ws.mergeCells(`A${summaryRowIdx}`, `C${summaryRowIdx}`)

        sumRow.eachCell((cell, colNum) => {
          cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: '1E293B' } }
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } }
          cell.border = BORDER_DOUBLE_BOTTOM
        })

        // Column widths
        ws.getColumn(1).width = 5
        ws.getColumn(2).width = 15
        ws.getColumn(3).width = 30
        for (let c = 4; c <= 3 + allSchoolMapels.length; c++) {
          ws.getColumn(c).width = 13
        }
        ws.getColumn(4 + allSchoolMapels.length).width = 13
        ws.getColumn(5 + allSchoolMapels.length).width = 13
        ws.getColumn(6 + allSchoolMapels.length).width = 11

        schoolClassSummaries.push({
          kelas,
          studentCount: classStudents.length,
          highestScore: sortedScores.length > 0 ? sortedScores[0] : null,
          lowestScore: sortedScores.length > 0 ? sortedScores[sortedScores.length - 1] : null,
          classAvg: classAvgValue,
          rank1Student: studentRowsData.find(s => s.rank === 1)?.nama || '-'
        })
      }

      // Populate Rekapitulasi Sekolah if it exists
      if (wsSummary && schoolClassSummaries.length > 0) {
        wsSummary.mergeCells('A1:G1')
        const tCell = wsSummary.getCell('A1')
        tCell.value = 'REKAPITULASI LEGER NILAI SELURUH KELAS'
        tCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: '1E293B' } }
        tCell.alignment = { horizontal: 'center', vertical: 'middle' }

        wsSummary.mergeCells('A2:G2')
        const stCell = wsSummary.getCell('A2')
        stCell.value = `${sekolah} | SEMESTER: ${sem?.nomor || '-'} | TAHUN AJARAN: ${tahunAjaran}`
        stCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: '64748B' } }
        stCell.alignment = { horizontal: 'center', vertical: 'middle' }

        const sHeaders = ['No', 'Kelas', 'Jumlah Siswa', 'Rata-rata Kelas', 'Nilai Tertinggi', 'Nilai Terendah', 'Siswa Peringkat 1']
        const sHeaderRow = wsSummary.getRow(4)
        sHeaderRow.values = sHeaders
        sHeaderRow.height = 26
        sHeaderRow.eachCell((cell) => {
          cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } }
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E293B' } }
          cell.border = BORDER_THIN
        })

        schoolClassSummaries.forEach((cs, idx) => {
          const sRow = wsSummary.getRow(5 + idx)
          sRow.height = 22
          sRow.values = [
            idx + 1,
            `Kelas ${cs.kelas}`,
            cs.studentCount,
            cs.classAvg !== null ? cs.classAvg : '-',
            cs.highestScore !== null ? cs.highestScore : '-',
            cs.lowestScore !== null ? cs.lowestScore : '-',
            cs.rank1Student
          ]
          sRow.eachCell((cell, col) => {
            cell.font = { name: 'Arial', size: 9, bold: col === 2 || col === 4 }
            cell.alignment = { horizontal: col === 7 ? 'left' : 'center', vertical: 'middle' }
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 1 ? 'F8FAFC' : 'FFFFFF' } }
            cell.border = BORDER_THIN
          })
        })

        wsSummary.getColumn(1).width = 6
        wsSummary.getColumn(2).width = 15
        wsSummary.getColumn(3).width = 16
        wsSummary.getColumn(4).width = 18
        wsSummary.getColumn(5).width = 18
        wsSummary.getColumn(6).width = 18
        wsSummary.getColumn(7).width = 32
      }

      // Download workbook
      const buffer = await wb.xlsx.writeBuffer()
      const filename = `Master_Leger_Nilai_Seluruh_Mapel_dan_Kelas_Sem${sem?.nomor || 1}.xlsx`
      await downloadFile(buffer, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

      setIsExporting(false)
      setExportProgressText('')
    } catch (err) {
      console.error('Error generating master leger excel:', err)
      alert('Gagal mengekspor Master Leger: ' + (err.message || 'Terjadi kesalahan'))
      setIsExporting(false)
      setExportProgressText('')
    }
  }

  // ─── Export Detail Seluruh Mapel Sekolah & Kelas (Multi-Sheet BAB, PSTS, PSAS) ───
  const handleDownloadAllSchoolDetailExcel = async () => {
    try {
      setIsExporting(true)
      setShowExportModal(false)
      setExportProgressText('Mempersiapkan detail seluruh mapel sekolah...')

      const sem = semesters.find(s => s.id === selectedSemesterId)
      const taId = activeTa?.id

      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'eBudiMulia - Kurikulum & Admin'
      wb.created = new Date()

      // 1. Fetch All Mapel
      const { data: rawMapels } = await supabase.from('mata_pelajaran').select('id, nama, singkatan').order('nama')
      const allSchoolMapels = rawMapels || []
      if (allSchoolMapels.length === 0) {
        alert('Data mata pelajaran tidak ditemukan.')
        setIsExporting(false)
        setExportProgressText('')
        return
      }

      // 2. Fetch All Students in Active TA
      let stdQuery = supabase.from('siswa_lengkap').select('nisn, nama_lengkap, kelas')
      if (taId) stdQuery = stdQuery.eq('tahun_ajaran_id', taId)
      const { data: rawStudents } = await stdQuery.order('nama_lengkap', { ascending: true })
      const allStudents = rawStudents || []
      if (allStudents.length === 0) {
        alert('Data siswa tidak ditemukan.')
        setIsExporting(false)
        setExportProgressText('')
        return
      }

      // Unique classes
      const allClassesList = [...new Set(allStudents.map(s => (s.kelas || '').trim()).filter(Boolean))].sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, '') || '0', 10)
        const numB = parseInt(b.replace(/\D/g, '') || '0', 10)
        if (numA !== numB) return numA - numB
        return a.localeCompare(b)
      })

      // 3. Fetch All Components for Active TA & Semester
      let kompQuery = supabase.from('nilai_komponen')
        .select('*')
        .eq('semester_id', selectedSemesterId)
      if (taId) kompQuery = kompQuery.eq('tahun_ajaran_id', taId)
      const { data: rawKomponen } = await kompQuery.order('urutan', { ascending: true })
      const allKomponen = rawKomponen || []

      // 4. Fetch All Nilai Siswa
      const kompIds = allKomponen.map(k => k.id)
      // 4. Fetch All Nilai Siswa (with pagination to bypass Supabase 1000 row limit)
      let allNilaiData = {}
      if (kompIds.length > 0) {
        const compChunkSize = 30
        const pageSize = 1000
        for (let i = 0; i < kompIds.length; i += compChunkSize) {
          const chunk = kompIds.slice(i, i + compChunkSize)
          let from = 0
          let hasMore = true
          while (hasMore) {
            const { data: nData, error } = await supabase.from('nilai_siswa')
              .select('komponen_id, siswa_nisn, nilai')
              .in('komponen_id', chunk)
              .range(from, from + pageSize - 1)
            if (error) {
              console.error('Error fetching nilai_siswa chunk:', error)
              break
            }
            if (nData && nData.length > 0) {
              nData.forEach(n => {
                if (!allNilaiData[n.komponen_id]) allNilaiData[n.komponen_id] = {}
                allNilaiData[n.komponen_id][String(n.siswa_nisn)] = n.nilai
              })
              if (nData.length < pageSize) {
                hasMore = false
              } else {
                from += pageSize
              }
            } else {
              hasMore = false
            }
          }
        }
      }

      // 5. Fetch Config Akhir
      let cfgQuery = supabase.from('nilai_akhir_config')
        .select('*')
        .eq('semester_id', selectedSemesterId)
      if (taId) cfgQuery = cfgQuery.eq('tahun_ajaran_id', taId)
      const { data: rawConfigs } = await cfgQuery
      const configMap = {}
      ;(rawConfigs || []).forEach(c => {
        configMap[`${c.mata_pelajaran_id}_${c.kelas}`] = c
      })

      // 5b. Fetch Guru Mapel assignments
      let gmExportQuery = supabase.from('guru_mapel').select('guru_id, kelas, mata_pelajaran_id')
      if (taId) gmExportQuery = gmExportQuery.eq('tahun_ajaran_id', taId)
      const { data: rawGmExport } = await gmExportQuery
      const allGmExportList = rawGmExport || []

      let totalSheets = 0
      for (let mIdx = 0; mIdx < allSchoolMapels.length; mIdx++) {
        const mapel = allSchoolMapels[mIdx]
        for (let cIdx = 0; cIdx < allClassesList.length; cIdx++) {
          const kelas = allClassesList[cIdx]
          const classStudents = allStudents.filter(s => s.kelas === kelas)
          if (classStudents.length === 0) continue

          const curClass = String(kelas).trim().toUpperCase()
          const assignedGuruId = allGmExportList.find(g => g.mata_pelajaran_id === mapel.id && String(g.kelas).trim().toUpperCase() === curClass)?.guru_id

          let classKomp = allKomponen.filter(k => {
            if (k.mata_pelajaran_id !== mapel.id) return false
            if (!k.target_kelas || k.target_kelas.length === 0) {
              if (k.kelas) return String(k.kelas).trim().toUpperCase() === curClass
              return true
            }
            if (Array.isArray(k.target_kelas)) {
              return k.target_kelas.some(c => String(c || '').trim().toUpperCase() === curClass)
            }
            return true
          })

          if (assignedGuruId) {
            const teacherKomps = classKomp.filter(k => k.guru_id === assignedGuruId)
            if (teacherKomps.length > 0) {
              const nonTeacherKomps = classKomp.filter(k => k.guru_id !== assignedGuruId)
              const extraKomps = nonTeacherKomps.filter(k => {
                const b = (k.bab_nama || '').toLowerCase()
                const n = (k.nama || '').toLowerCase()
                return b.includes('psts') || n.includes('psts') || b.startsWith('psas') || b.startsWith('psat')
              })
              classKomp = [...teacherKomps, ...extraKomps]
            }
          }
          if (classKomp.length === 0) continue

          setExportProgressText(`Mengekspor ${mapel.singkatan || mapel.nama} - Kelas ${kelas}...`)

          const cfg = configMap[`${mapel.id}_${kelas}`]
          const classConfigAkhir = {
            metode_hitung: cfg?.metode_hitung || raporSettings.metode_hitung_nilai_akhir || 'rata_rata',
            bobot_detail: cfg?.bobot_detail || {},
            include_karakter: cfg?.bobot_detail?.include_karakter ?? (raporSettings.include_karakter_nilai_akhir === 'true'),
            is_visible: cfg?.is_visible ?? false
          }
          const shortMapel = mapel.singkatan || (mapel.nama.length > 15 ? mapel.nama.slice(0, 14) : mapel.nama)
          const sheetName = `${shortMapel} - ${kelas}`.substring(0, 31)

          await generateClassSheet(kelas, classStudents, classKomp, allNilaiData, classConfigAkhir, wb, 'Guru Pengampu', mapel.nama, sheetName)
          totalSheets++
        }
      }

      if (totalSheets === 0) {
        alert('Tidak ada komponen penilaian yang ditemukan untuk kelas manapun.')
        setIsExporting(false)
        setExportProgressText('')
        return
      }

      const buffer = await wb.xlsx.writeBuffer()
      const filename = `Detail_Nilai_Seluruh_Mapel_dan_Kelas_Sem${sem?.nomor || 1}.xlsx`
      await downloadFile(buffer, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

      setIsExporting(false)
      setExportProgressText('')
    } catch (err) {
      console.error('Error downloading all school detail excel:', err)
      alert('Gagal mengekspor detail seluruh mapel: ' + (err.message || 'Terjadi kesalahan'))
      setIsExporting(false)
      setExportProgressText('')
    }
  }

  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      {/* ─── REALTIME TOAST NOTIFICATION ─────────────────────────────────── */}
      {realtimeToast && (
        <div className="fixed top-5 right-5 z-[9999] bg-emerald-600 text-white px-4 py-2 rounded-xl shadow-xl flex items-center gap-2.5 animate-bounce text-xs font-bold">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-200 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
          </span>
          <span>{realtimeToast}</span>
        </div>
      )}

      {/* ─── ROW 1: HEADER + MAPEL & SEMESTER CONTROLS (MATCHING INPUT NILAI GURU) ─── */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">
              Leger Nilai (Kurikulum)
            </h2>
            {realtimeConnected ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200" title="Terhubung langsung dengan database realtime">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Live Sync
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                <span className="h-2 w-2 rounded-full bg-slate-400"></span>
                Tersinkron
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full">
              <IconLock /> Mode Baca
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Sistem Inspeksi Nilai Berbasis Target Kelas (Read-Only)
          </p>
        </div>

        {/* Top Right: Mapel & Semester Dropdown Pills (matching Input Nilai design) */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mapel Selector */}
          <div className="relative">
            <select
              value={selectedMapelId}
              onChange={(e) => setSelectedMapelId(e.target.value)}
              className="px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 font-extrabold text-xs rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-xs pr-8 transition-all hover:bg-indigo-100/60"
            >
              {mapels.map(m => (
                <option key={m.id} value={m.id}>
                  {m.nama}
                </option>
              ))}
            </select>
          </div>

          {/* Semester Selector */}
          <div className="relative">
            <select
              value={selectedSemesterId}
              onChange={(e) => setSelectedSemesterId(e.target.value)}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold text-xs rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-xs pr-8 transition-all hover:border-slate-300"
            >
              {semesters.map(s => (
                <option key={s.id} value={s.id}>
                  Semester {s.nomor}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ─── ROW 2: CLASS BUTTONS + KKM + EXPORT (MATCHING SCREENSHOT) ───── */}
      <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        {/* Left: Class Pills */}
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar py-0.5 flex-1">
          {/* Master Leger Seluruh Kelas */}
          <button
            key="ALL"
            onClick={() => setActiveTabKelas('ALL')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap border shrink-0 flex items-center gap-1.5 cursor-pointer ${
              activeTabKelas === 'ALL'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/20'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:border-emerald-300 hover:bg-emerald-100'
            }`}
          >
            <span>🏆 Seluruh Kelas (Master Leger)</span>
          </button>

          {allKelasList.length === 0 ? (
            <span className="text-xs text-slate-400 italic">Memuat kelas...</span>
          ) : (
            allKelasList.map(c => {
              const isActive = activeTabKelas === c
              return (
                <button
                  key={c}
                  onClick={() => setActiveTabKelas(c)}
                  className={`px-4 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap border shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-slate-50 hover:text-indigo-600'
                  }`}
                >
                  Kelas {c}
                </button>
              )
            })
          )}

          {/* Vertical divider */}
          <div className="h-6 w-px bg-slate-200 shrink-0 mx-1"></div>

          {/* Guru Pengampu Info Badge */}
          {activeTabKelas === 'ALL' ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800 font-semibold shrink-0">
              <span className="text-emerald-600">Rekapitulasi:</span>
              <span className="font-bold">Seluruh Guru &amp; Mapel</span>
            </div>
          ) : currentGuruPengampu ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 font-semibold shrink-0">
              <span className="text-slate-400">Guru:</span>
              <span className="text-indigo-900 font-bold">{currentGuruPengampu.nama_guru}</span>
              {currentGuruPengampu.kode && (
                <span className="font-mono text-slate-400">({currentGuruPengampu.kode})</span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-700 font-medium shrink-0">
              <span>Guru: Belum ditentukan</span>
            </div>
          )}
        </div>

        {/* Right: Search, KKM, Refresh, Export */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-start xl:justify-end">
          {/* Search Box */}
          <div className="relative w-36 sm:w-44">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
              <IconSearch />
            </div>
            <input
              type="text"
              placeholder="Cari siswa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white transition-all h-9"
            />
          </div>

          {/* KKM */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 rounded-xl border border-slate-200 h-9" title="KKM Standar Kelulusan">
            <span className="text-[11px] font-bold text-slate-500 uppercase">KKM:</span>
            <input
              type="number"
              min="0"
              max="100"
              value={kkm}
              onChange={(e) => setKkm(Number(e.target.value) || 0)}
              className="w-10 px-1 text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-lg outline-none text-center h-6"
            />
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => fetchClassSheetData()}
            disabled={loading}
            className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 transition-all h-9 w-9 flex items-center justify-center shrink-0"
            title="Muat Ulang Data Lembar Nilai"
          >
            <IconRefresh spinning={loading} />
          </button>

          {/* Atur Rapor & Penilaian Button (Admin & Kurikulum) */}
          {isKurikulumOrAdmin && (
            <button
              onClick={() => {
                setTempSettings({ ...raporSettings })
                setShowSettingsModal(true)
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all shadow-xs h-9 shrink-0 cursor-pointer"
              title="Pengaturan Format Rapor & Penilaian (Kurikulum & Admin)"
            >
              <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>Atur Rapor</span>
            </button>
          )}

          {/* Cek Lingkup PTS Button (Admin & Kurikulum) */}
          {isKurikulumOrAdmin && (
            <button
              onClick={() => openPtsAuditModal()}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 rounded-xl text-xs font-bold transition-all shadow-xs h-9 shrink-0 cursor-pointer"
              title="Cek Status Pengaturan Lingkup Materi / BAB Rapor PTS untuk Setiap Mapel"
            >
              <svg className="w-4 h-4 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 11 12 14 22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              <span>Cek Lingkup PTS</span>
            </button>
          )}

          {/* Export Button (Opens Multi-Class Export Modal) */}
          <button
            onClick={() => {
              setSelectedExportClasses(allKelasList.length > 0 ? allKelasList : [activeTabKelas])
              if (activeTabKelas === 'ALL') {
                setExportScope('master_all')
              } else {
                setExportScope('current')
              }
              setShowExportModal(true)
            }}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 h-9 shrink-0 cursor-pointer"
            title="Export Format Excel Standar Kurikulum (Pilih Seluruh / Beberapa Kelas)"
          >
            {isExporting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span className="truncate max-w-[120px]">{exportProgressText || 'Mengekspor...'}</span>
              </>
            ) : (
              <>
                <IconDownload />
                <span>Export Excel</span>
              </>
            )}
          </button>

          {/* Shortcut to Rapor Siswa */}
          {onNavigateToRapor && (
            <button
              onClick={() => onNavigateToRapor('rapor_siswa')}
              className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs h-9 shrink-0 cursor-pointer"
              title="Buka Cetak Rapor Siswa Resmi"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span>Rapor Siswa</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── SUMMARY KPI STRIP (HANYA MUNCUL PADA TAB KELAS INDIVIDUAL) ───── */}
      {activeTabKelas !== 'ALL' && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <div className="bg-white px-3.5 py-2 rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Siswa ({activeTabKelas})</span>
              <span className="text-xs font-extrabold text-slate-800">{students.length} siswa</span>
            </div>
            <div className="bg-white px-3.5 py-2 rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Jumlah BAB</span>
              <span className="text-xs font-extrabold text-indigo-700">{uniqueBabsClass.length} BAB ({orderedKomponen.length} TP)</span>
            </div>
            <div className="bg-white px-3.5 py-2 rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Rata-rata Kelas</span>
              <span className="text-xs font-extrabold text-indigo-700">{classStats.average} / 100</span>
            </div>
            <div className="bg-white px-3.5 py-2 rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Ketuntasan KKM ({kkm})</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-extrabold text-emerald-600">{classStats.tuntasPercent}%</span>
                <span className="text-[10px] text-slate-400">({classStats.tuntasCount} siswa)</span>
              </div>
            </div>
            {isKurikulumOrAdmin && (
              <div 
                onClick={() => {
                  if (activeSheetMissingAudit.count > 0) {
                    setFilterOnlyMissing(prev => !prev)
                  }
                }}
                className={`px-3.5 py-2 rounded-xl border shadow-2xs flex items-center justify-between transition-all ${
                  activeSheetMissingAudit.count > 0
                    ? 'bg-rose-50/90 border-rose-300 hover:bg-rose-100 text-rose-800 cursor-pointer'
                    : 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                }`}
                title={activeSheetMissingAudit.count > 0 ? "Klik untuk memfilter siswa dengan nilai kosong pada TP berdeskripsi" : "Semua TP berdeskripsi telah dinilai"}
              >
                <span className="text-xs font-bold flex items-center gap-1">
                  {activeSheetMissingAudit.count > 0 ? '🚨 Audit Nilai (-)' : '✓ Audit Nilai'}
                </span>
                <span className="text-xs font-black">
                  {activeSheetMissingAudit.count > 0 
                    ? `${activeSheetMissingAudit.count} Nilai (${activeSheetMissingAudit.studentCount} Siswa)`
                    : 'Lengkap'}
                </span>
              </div>
            )}
          </div>

          {/* ─── BANNER AUDIT NILAI KOSONG PADA TP BERDESKRIPSI (KHUSUS ADMIN & KURIKULUM) ─ */}
          {isKurikulumOrAdmin && activeSheetMissingAudit.count > 0 && (
            <div className="bg-gradient-to-r from-amber-50 via-rose-50 to-orange-50 border-2 border-rose-200/90 rounded-2xl p-3 sm:p-4 text-rose-950 shadow-xs animate-in fade-in flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-500 text-white flex items-center justify-center font-bold text-base shrink-0 shadow-xs">
                  ⚠️
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-extrabold text-xs sm:text-sm text-rose-900">
                      Audit Kurikulum: Terdeteksi {activeSheetMissingAudit.count} Nilai Kosong (-) pada TP Berdeskripsi
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-200/80 text-rose-900 border border-rose-300">
                      {activeSheetMissingAudit.studentCount} Siswa Terdampak
                    </span>
                    {currentGuruPengampu && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                        Guru Pengampu: {currentGuruPengampu.nama_guru}
                      </span>
                    )}
                  </div>
                  <p className="text-[11.5px] text-slate-600 mt-1 leading-relaxed">
                    TP ini telah dilengkapi deskripsi capaian oleh guru, namun nilai siswa masih berupa strip (<strong>—</strong>). Sel yang belum lengkap ditandai dengan kotak garis putus-putus merah pada tabel di bawah.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end md:self-center shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={() => setFilterOnlyMissing(prev => !prev)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                    filterOnlyMissing
                      ? 'bg-rose-600 text-white border-rose-700 ring-2 ring-rose-300'
                      : 'bg-white hover:bg-rose-50 text-rose-900 border-rose-300'
                  }`}
                  title="Filter tabel agar hanya menampilkan siswa yang memiliki nilai kosong"
                >
                  <span>{filterOnlyMissing ? '✓ Filter Siswa Kosong Aktif' : '🔍 Filter Siswa Nilai (-) Saja'}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${filterOnlyMissing ? 'bg-white text-rose-700' : 'bg-rose-100 text-rose-800'}`}>
                    {activeSheetMissingAudit.studentCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const curMapel = mapels.find(m => m.id === selectedMapelId)
                    setSelectedMissingDetail({
                      mapelNama: curMapel?.nama || 'Mata Pelajaran',
                      targetClass: activeTabKelas,
                      guruNama: currentGuruPengampu?.nama_guru || 'Guru Pengampu',
                      missingScores: activeSheetMissingAudit.items,
                      missingCount: activeSheetMissingAudit.count,
                      affectedStudentCount: activeSheetMissingAudit.studentCount
                    })
                  }}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                  title="Buka rincian lengkap siswa dan salin pesan WhatsApp pengingat untuk guru"
                >
                  <span>📋 Rincian &amp; Pengingat WA</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── MAIN CONTENT: MASTER LEGER DASHBOARD OR CLASS TABLE ─────────── */}
      {activeTabKelas === 'ALL' ? (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 space-y-6">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-700 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
            <div className="relative z-10 max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-bold mb-3 border border-white/30">
                <span>🏆 Master Leger Nilai Sekolah</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300"></span>
                <span>Seluruh Rombel &amp; Seluruh Mapel</span>
              </div>
              <h2 className="text-2xl font-black tracking-tight mb-2">
                Pusat Rekapitulasi Leger Nilai Terpadu
              </h2>
              <p className="text-emerald-50 text-xs sm:text-sm leading-relaxed mb-6">
                Ekspor seluruh lembar nilai mata pelajaran (Agama, PPKn, B. Indonesia, Matematika, IPA, IPS, B. Inggris, PJOK, Seni, Informatika, dll.) untuk semua kelas ke dalam <strong>1 file Excel tunggal</strong> dengan format resmi dinas &amp; kurikulum.
              </p>

              {/* Action Buttons inside Banner */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleDownloadMasterLegerSchoolExcel}
                  disabled={isExporting}
                  className="px-5 py-3 text-xs sm:text-sm font-extrabold text-emerald-950 bg-white hover:bg-emerald-50 rounded-xl transition-all shadow-md flex items-center gap-2.5 cursor-pointer disabled:opacity-50"
                >
                  {isExporting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-emerald-900 border-t-transparent rounded-full animate-spin" />
                      <span>{exportProgressText || 'Mengekspor...'}</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span>📥 Download Master Leger (1 File Excel)</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadAllSchoolDetailExcel}
                  disabled={isExporting}
                  className="px-4 py-3 text-xs sm:text-sm font-bold text-white bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-xl transition-all border border-white/30 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  title="Download detail rincian BAB, PSTS, PSAS seluruh mapel & kelas"
                >
                  <svg className="w-4 h-4 text-emerald-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Detail Lengkap (Multi-Sheet BAB)</span>
                </button>
              </div>
            </div>

            {/* Decorative background circle */}
            <div className="absolute right-0 top-0 -mt-10 -mr-10 w-64 h-64 rounded-full bg-white/10 pointer-events-none blur-2xl"></div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80">
              <span className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Total Kelas</span>
              <span className="text-xl font-black text-slate-900">{allKelasList.length} Rombel</span>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80">
              <span className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Total Siswa Terdata</span>
              <span className="text-xl font-black text-slate-900">{students.length} Siswa</span>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80">
              <span className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Total Mata Pelajaran</span>
              <span className="text-xl font-black text-indigo-700">{mapels.length} Mapel</span>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80">
              <span className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Standar KKM Sekolah</span>
              <span className="text-xl font-black text-emerald-600">{kkm}</span>
            </div>
          </div>

          {/* Feature Breakdown Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2 mb-2 font-bold text-slate-800 text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Keunggulan Format Master Leger (1 File Excel):</span>
              </div>
              <ul className="text-xs text-slate-600 space-y-1.5 pl-3 list-disc marker:text-emerald-500">
                <li><strong>Sheet 1 (Rekapitulasi Sekolah)</strong>: Komparasi performa nilai per kelas, jumlah siswa, tuntas vs belum tuntas, dan persentase kelulusan KKM.</li>
                <li><strong>Sheet per Kelas</strong>: Lembar kerja tersendiri untuk setiap rombel (<code>Leger 7A</code>, <code>Leger 7B</code>, dst.).</li>
                <li><strong>Seluruh Mapel Terjajar</strong>: Nilai akhir semua mapel dirangkum bersebelahan dengan total nilai, rata-rata, dan ranking otomatis.</li>
                <li><strong>Conditional Formatting KKM</strong>: Nilai di bawah KKM ({kkm}) otomatis ditandai dengan warna merah lembut.</li>
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2 mb-2 font-bold text-slate-800 text-xs">
                <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                <span>Pilih Kelas untuk Melihat Rincian Lembar Nilai:</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {allKelasList.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setActiveTabKelas(c)}
                    className="p-2.5 rounded-lg bg-white border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/50 hover:text-indigo-700 text-xs font-bold text-slate-700 transition-all text-center cursor-pointer shadow-2xs"
                  >
                    Buka Kelas {c} →
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[500px]">
        {loading ? (
          <div className="p-20 flex flex-col items-center justify-center text-slate-400 gap-3">
            <div className="w-9 h-9 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            <span className="text-xs font-bold text-slate-600">Memuat lembar nilai Kelas {activeTabKelas}...</span>
          </div>
        ) : students.length === 0 ? (
          <div className="p-20 flex flex-col items-center justify-center text-slate-400 gap-2">
            <div className="text-3xl">👥</div>
            <h3 className="font-bold text-slate-700 text-sm">Tidak Ada Siswa di Kelas {activeTabKelas}</h3>
            <p className="text-xs text-slate-400">Pastikan data siswa pada tahun ajaran aktif sudah di-enroll.</p>
          </div>
        ) : orderedKomponen.length === 0 ? (
          <div className="p-20 flex flex-col items-center justify-center text-slate-400 gap-2 text-center max-w-lg mx-auto">
            <div className="text-4xl mb-1">📚</div>
            <h3 className="font-bold text-slate-700 text-sm">Belum Ada Materi BAB di Kelas {activeTabKelas}</h3>
            <p className="text-xs text-slate-400">
              Guru pengampu mata pelajaran <strong className="text-indigo-600">{mapels.find(m => m.id === selectedMapelId)?.nama}</strong> belum membuat BAB atau TP untuk Kelas {activeTabKelas}.
            </p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[calc(100vh-250px)] custom-scrollbar">
            <table className="w-full min-w-max text-xs whitespace-nowrap border-collapse">
              {/* Sticky Double Headers */}
              <thead className="sticky top-0 z-30 bg-slate-50 shadow-sm">
                {/* Level 1 Header: NO, NAMA, NISN, BAB 1, PSTS, PSAS, NILAI AKHIR */}
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 text-xs uppercase tracking-wider font-extrabold">
                  <th
                    className="border-r border-slate-200 bg-indigo-50 text-indigo-700 p-0 align-top"
                    rowSpan={2}
                    style={{ position: 'sticky', top: 0, left: 0, zIndex: 30, minWidth: 40, maxWidth: 40, width: 40 }}
                  >
                    <div className="pt-4 flex items-start justify-center h-full">No</div>
                  </th>

                  <th
                    className="border-r border-slate-200 bg-indigo-50 text-indigo-700 p-0 align-top"
                    rowSpan={2}
                    style={{ position: 'sticky', top: 0, left: 40, zIndex: 30, minWidth: maxNamaWidth, maxWidth: maxNamaWidth, width: maxNamaWidth }}
                  >
                    <div className="pt-4 flex items-start justify-center h-full">Nama Siswa</div>
                  </th>

                  <th
                    className="border-r border-slate-200 bg-indigo-50 text-indigo-700 p-0 align-top"
                    rowSpan={2}
                    style={{ position: 'sticky', top: 0, left: 40 + maxNamaWidth, zIndex: 30, minWidth: 90, maxWidth: 90, width: 90 }}
                  >
                    <div className="pt-4 flex items-start justify-center h-full">NISN</div>
                  </th>

                  {/* BAB Group Headers (matching Input Nilai color themes) */}
                  {uniqueBabsClass.map((bab, bIdx) => {
                    const kompsInBab = classKomponen.filter(k => (k.bab_nama || 'Lainnya') === bab)
                    const babCount = kompsInBab.length
                    // Tampilkan nama babnya saja (hilangkan prefix Lingkup 1 :, Bab 1 :, dll jika ada)
                    const cleanBabName = bab.replace(/^(?:lingkup\s*(?:materi)?\s*\d*\s*[:\-]\s*|bab\s*\d*\s*[:\-]\s*)/i, '').trim() || bab

                    return (
                      <th
                        key={bab}
                        colSpan={babCount}
                        className={`text-center px-2 py-1.5 border-r border-slate-200 font-extrabold text-xs leading-snug align-middle whitespace-normal break-words ${BAB_BG[bIdx % BAB_BG.length]} ${BAB_TEXT[bIdx % BAB_TEXT.length]}`}
                        title={bab}
                      >
                        <div className="flex items-center justify-center text-center whitespace-normal break-words max-w-full mx-auto">
                          <span className="text-center block">{cleanBabName}</span>
                        </div>
                      </th>
                    )
                  })}

                  {/* Nilai Akhir Group Header */}
                  <th
                    className="px-4 py-2 min-w-[125px] bg-indigo-50 border-l border-indigo-200 text-center text-indigo-800 align-middle font-extrabold text-xs"
                    rowSpan={2}
                  >
                    <div className="flex flex-col items-center justify-center gap-1">
                      <div className="flex items-center gap-1.5">
                        <span>Nilai Akhir</span>
                        {isKurikulumOrAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              setTempConfigAkhir({
                                metode_hitung: effectiveMetode,
                                bobot_detail: { ...(configAkhir.bobot_detail || {}) },
                                include_karakter: effectiveIncludeKar
                              })
                              setShowConfigAkhirModal(true)
                            }}
                            className="p-1 rounded-md text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 transition-colors"
                            title="Atur Metode & Bobot Nilai Akhir (Admin & Kurikulum)"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="3" />
                              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                            </svg>
                          </button>
                        )}
                      </div>
                      <span
                        className={`text-[9px] font-black px-2 py-0.5 rounded uppercase border transition-all ${
                          isKurikulumOrAdmin ? 'cursor-pointer hover:scale-105 active:scale-95' : ''
                        } ${
                          effectiveMetode === 'bobot_manual'
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : effectiveMetode === 'rata_rata_langsung'
                            ? 'bg-purple-100 text-purple-800 border-purple-300'
                            : 'bg-indigo-100 text-indigo-700 border-indigo-200'
                        }`}
                        onClick={() => {
                          if (isKurikulumOrAdmin) {
                            setTempConfigAkhir({
                              metode_hitung: effectiveMetode,
                              bobot_detail: { ...(configAkhir.bobot_detail || {}) },
                              include_karakter: effectiveIncludeKar
                            })
                            setShowConfigAkhirModal(true)
                          }
                        }}
                        title={isKurikulumOrAdmin ? 'Klik untuk mengubah metode perhitungan Nilai Akhir' : undefined}
                      >
                        {effectiveMetode === 'bobot_manual'
                          ? 'Bobot Manual'
                          : effectiveMetode === 'rata_rata_langsung'
                          ? 'Rerata Langsung'
                          : 'Rerata BAB'}
                      </span>
                    </div>
                  </th>
                </tr>

                {/* Level 2 Header: TP 1, N. Karakter, Nilai, Nilai (Compact columns) */}
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px]">
                  {uniqueBabsClass.flatMap((bab, bIdx) => {
                    return classKomponen
                      .filter(k => (k.bab_nama || 'Lainnya') === bab)
                      .sort(sortBabKomponen)
                      .map(k => {
                        const hasDesc = Boolean(k.deskripsi && k.deskripsi.trim() !== '')
                        return (
                          <th
                            key={k.id}
                            className={`text-center px-2 py-1.5 min-w-[70px] max-w-[85px] border-r border-slate-200 font-bold align-middle truncate ${BAB_BG[bIdx % BAB_BG.length]} ${BAB_TEXT[bIdx % BAB_TEXT.length]}`}
                            title={`${k.nama} (Bobot: ${k.bobot || 1})${hasDesc ? `\nDeskripsi Capaian: ${k.deskripsi}` : '\n(Belum ada deskripsi)'}`}
                          >
                            <div className="flex items-center justify-center gap-1">
                              <span className="truncate">{k.nama}</span>
                              {hasDesc && (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="TP sudah memiliki deskripsi capaian" />
                              )}
                            </div>
                          </th>
                        )
                      })
                  })}
                </tr>
              </thead>

              {/* Table Body: Alternating Rows (bg-sky-50 & bg-white, matching NilaiGuruSection) */}
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((s, idx) => {
                  const finalScore = hitungRataRataAkhir(s.nisn)
                  const isFinalTuntas = finalScore !== null && finalScore >= kkm
                  const rowBg = idx % 2 === 1 ? 'bg-sky-50' : 'bg-white'

                  return (
                    <tr key={s.nisn} className={`hover:bg-slate-200/70 transition-colors ${rowBg}`}>
                      {/* Sticky No */}
                      <td
                        className={`text-center px-2 py-2 text-slate-400 border-r border-slate-100 font-medium ${rowBg}`}
                        style={{ position: 'sticky', left: 0, zIndex: 10, minWidth: 40, maxWidth: 40, width: 40 }}
                      >
                        {idx + 1}
                      </td>

                      {/* Sticky Nama Siswa */}
                      <td
                        className={`px-4 py-2 font-bold text-slate-800 text-[13px] border-r border-slate-100 truncate ${rowBg}`}
                        style={{ position: 'sticky', left: 40, zIndex: 10, minWidth: maxNamaWidth, maxWidth: maxNamaWidth, width: maxNamaWidth }}
                        title={s.nama_lengkap}
                      >
                        <div className="truncate">{s.nama_lengkap}</div>
                      </td>

                      {/* Sticky NISN */}
                      <td
                        className={`px-3 py-2 text-slate-500 font-mono text-[12px] border-r border-slate-100 ${rowBg}`}
                        style={{ position: 'sticky', left: 40 + maxNamaWidth, zIndex: 10, minWidth: 90, maxWidth: 90, width: 90 }}
                      >
                        {s.nisn}
                      </td>

                      {/* Grade Cells: Compact rounded box matching the input styling from screenshot */}
                      {orderedKomponen.map(k => {
                        const val = nilaiData[k.id]?.[String(s.nisn)]
                        const hasVal = val !== undefined && val !== null && val !== '' && String(val).trim() !== '-'
                        const isUnderKkm = hasVal && Number(val) < kkm
                        const isDescribed = Boolean(k.deskripsi && k.deskripsi.trim() !== '')
                        const isMissingWithDesc = !hasVal && isDescribed && !isSumatif(k.bab_nama || k.nama) && !isKarakterKomponen(k.nama) && isKurikulumOrAdmin

                        return (
                          <td key={k.id} className={`text-center px-1.5 py-1.5 border-r border-slate-100 ${isMissingWithDesc ? 'bg-rose-50/20' : ''}`}>
                            <div className="relative flex justify-center">
                              <div
                                className={`w-14 h-7 mx-auto rounded-xl border text-center flex items-center justify-center font-black text-xs select-none transition-all relative ${
                                  isMissingWithDesc
                                    ? 'bg-rose-50/90 border-rose-400 text-rose-600 border-dashed font-black ring-1 ring-rose-200'
                                    : !hasVal
                                    ? 'bg-slate-50/70 border-slate-200 text-slate-300 font-bold'
                                    : isUnderKkm
                                    ? 'bg-rose-50 border-rose-200 text-rose-600 font-black'
                                    : 'bg-emerald-50/70 border-emerald-200 text-emerald-700 font-black'
                                }`}
                                title={
                                  isMissingWithDesc
                                    ? `⚠️ PERINGATAN AUDIT: TP "${k.nama}" sudah ada deskripsi capaian, tetapi nilai siswa ini masih kosong (-)!`
                                    : hasVal
                                    ? `Nilai: ${val}`
                                    : 'Belum dinilai'
                                }
                              >
                                {hasVal ? val : '—'}
                                {isMissingWithDesc && (
                                  <span
                                    className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border border-white animate-pulse"
                                    title="Nilai belum diisi guru pengampu"
                                  />
                                )}
                              </div>
                            </div>
                          </td>
                        )
                      })}

                      {/* Nilai Akhir Cell */}
                      <td className="text-center px-3 py-1.5 border-l border-indigo-100 bg-indigo-50/30 font-black text-xs">
                        {finalScore !== null ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <span className={`font-black text-xs ${isFinalTuntas ? 'text-emerald-700' : 'text-rose-600'}`}>
                              {finalScore}
                            </span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                              getPredikat(finalScore) === 'A' || getPredikat(finalScore) === 'B'
                                ? 'bg-emerald-100 text-emerald-700'
                                : getPredikat(finalScore) === 'C'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-rose-100 text-rose-700'
                            }`}>
                              {getPredikat(finalScore)}
                            </span>
                          </div>
                        ) : (
                          <span className="font-bold text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>

              {/* Table Footer: Class Average per Column */}
              <tfoot className="sticky bottom-0 z-20 bg-slate-100 border-t-2 border-slate-300 font-extrabold text-[11px] text-slate-700 shadow-sm">
                <tr>
                  <td
                    colSpan={3}
                    className="py-2.5 px-4 text-right bg-slate-100 border-r border-slate-200 sticky left-0 z-20 font-black text-slate-700 uppercase"
                    style={{ minWidth: 40 + maxNamaWidth + 90 }}
                  >
                    RATA-RATA KELAS:
                  </td>

                  {/* Component Averages */}
                  {orderedKomponen.map(k => {
                    const vals = students
                      .map(s => nilaiData[k.id]?.[String(s.nisn)])
                      .filter(v => v !== undefined && v !== null && v !== '')
                      .map(Number)
                    const avg = vals.length > 0 ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '-'
                    const isUnder = avg !== '-' && Number(avg) < kkm

                    return (
                      <td key={k.id} className={`text-center py-2 px-1.5 border-r border-slate-200 font-black text-xs ${
                        isUnder ? 'text-rose-600' : 'text-indigo-800'
                      }`}>
                        {avg}
                      </td>
                    )
                  })}

                  {/* Nilai Akhir Class Average */}
                  <td className="text-center py-2 px-3 bg-indigo-100/70 text-indigo-900 border-l border-indigo-200 font-black text-xs">
                    {classStats.average || '-'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    )}

      {/* ─── EXPORT EXCEL MODAL (KURIKULUM & ADMIN) ────────────────────────── */}
      {showExportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-xl p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-fade-in border border-slate-100">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-slate-800 text-base">Export Leger Nilai Excel</h3>
                <p className="text-xs text-slate-500">
                  Format resmi dinas &amp; kurikulum SMP Budi Mulia
                </p>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <IconClose />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-bold">
              <button
                type="button"
                onClick={() => setExportScope('current')}
                className={`flex-1 py-3 px-2 text-center border-b-2 transition-all cursor-pointer ${
                  exportScope === 'current'
                    ? 'border-indigo-600 text-indigo-700 bg-white shadow-2xs font-extrabold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Mapel Ini ({curMapelNama})
              </button>
              <button
                type="button"
                onClick={() => setExportScope('master_all')}
                className={`flex-1 py-3 px-2 text-center border-b-2 transition-all cursor-pointer ${
                  exportScope === 'master_all'
                    ? 'border-emerald-600 text-emerald-700 bg-white shadow-2xs font-extrabold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                ✨ Seluruh Mapel &amp; Kelas (1 Excel)
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 bg-slate-50/50">
              {exportScope === 'current' ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                      Pilih Kelas yang Ingin Diexport:
                    </span>
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                      {selectedExportClasses.length} dari {allKelasList.length} kelas
                    </span>
                  </div>

                  {/* Quick Select Buttons */}
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => setSelectedExportClasses([...allKelasList])}
                      className="px-2.5 py-1 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200 cursor-pointer"
                    >
                      Pilih Semua Kelas ({allKelasList.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedExportClasses([activeTabKelas !== 'ALL' ? activeTabKelas : allKelasList[0]].filter(Boolean))}
                      className="px-2.5 py-1 text-xs font-bold text-slate-600 bg-white hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 cursor-pointer"
                    >
                      {activeTabKelas !== 'ALL' ? `Hanya Kelas ${activeTabKelas}` : 'Kelas Pertama'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedExportClasses([])}
                      className="px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-rose-600 ml-auto cursor-pointer"
                    >
                      Kosongkan
                    </button>
                  </div>

                  {/* Class Checkbox Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-52 overflow-y-auto custom-scrollbar pr-1 p-1">
                    {allKelasList.map(c => {
                      const isChecked = selectedExportClasses.includes(c)
                      return (
                        <label
                          key={c}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer border transition-all text-xs font-bold ${
                            isChecked
                              ? 'bg-indigo-50/80 border-indigo-300 text-indigo-900 shadow-xs'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedExportClasses(prev => [...prev, c])
                              } else {
                                setSelectedExportClasses(prev => prev.filter(x => x !== c))
                              }
                            }}
                          />
                          <span>Kelas {c}</span>
                        </label>
                      )
                    })}
                  </div>

                  <div className="mt-3 p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-100 text-[11px] text-indigo-900 leading-relaxed">
                    💡 <strong>Catatan Kurikulum:</strong> Setiap kelas terpilih akan dibuatkan sheet terpisah dengan formula rata-rata, predikat, lingkup materi, dan guru pengampu yang terisolasi sesuai kelasnya.
                  </div>

                  {/* Modal Footer Tab 1 */}
                  <div className="mt-4 pt-3 border-t border-slate-200/80 flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => setShowExportModal(false)}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadExcel}
                      disabled={selectedExportClasses.length === 0 || isExporting}
                      className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                    >
                      {isExporting ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Mengekspor...</span>
                        </>
                      ) : (
                        <>
                          <IconDownload />
                          <span>Download Excel ({selectedExportClasses.length} Kelas)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-emerald-600 text-white rounded-xl shrink-0 mt-0.5 shadow-sm">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="text-xs text-emerald-950 space-y-1.5">
                        <div className="font-extrabold text-sm text-emerald-900 flex items-center gap-2">
                          <span>Master Leger Sekolah (1 File Excel)</span>
                          <span className="text-[10px] bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full font-bold">Seluruh Mapel + Seluruh Kelas</span>
                        </div>
                        <p className="text-emerald-800 leading-relaxed text-xs">
                          Mengekspor <strong>seluruh mata pelajaran sekolah</strong> (Agama, PPKn, B.Indo, MTK, IPA, IPS, B.Inggris, PJOK, Seni, Informatika, dll.) untuk <strong>semua kelas ({allKelasList.length} kelas)</strong> ke dalam <strong>1 file Excel tunggal</strong>.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs bg-white p-4 rounded-xl border border-slate-200">
                    <div className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Struktur Isi File Excel:</span>
                    </div>
                    <ul className="space-y-1.5 text-slate-600 pl-1">
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-600 font-bold">✓</span>
                        <span><strong>Sheet Rekapitulasi Sekolah</strong>: Rangkuman perbandingan seluruh rombel, jumlah siswa, dan rata-rata kelas.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-600 font-bold">✓</span>
                        <span><strong>Sheet per Kelas</strong>: <code>Leger 7A</code>, <code>Leger 7B</code>, <code>Leger 8A</code>, <code>Leger 9A</code>, dst.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-600 font-bold">✓</span>
                        <span><strong>Daftar Nilai Siswa</strong>: Seluruh mapel terjajar rapi dengan perhitungan otomatis <strong>Total Nilai</strong>, <strong>Rata-rata</strong>, dan <strong>Ranking Kelas</strong>.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-600 font-bold">✓</span>
                        <span><strong>Statistik Kelas</strong>: Baris rata-rata kelas di bagian bawah tabel dengan pewarnaan nilai di bawah KKM ({kkm}).</span>
                      </li>
                    </ul>
                  </div>

                  {/* Modal Footer Tab 2 */}
                  <div className="pt-3 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-2.5">
                    <button 
                      type="button"
                      onClick={handleDownloadAllSchoolDetailExcel}
                      disabled={isExporting}
                      className="w-full sm:w-auto px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 hover:border-slate-300 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
                      title="Download format detail multi-sheet (Setiap mapel & kelas memiliki sheet rincian BAB, PSTS, PSAS)"
                    >
                      <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span>Detail Lengkap (Multi-Sheet BAB)</span>
                    </button>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                      <button onClick={() => setShowExportModal(false)} className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer">Batal</button>
                      <button 
                        onClick={handleDownloadMasterLegerSchoolExcel} 
                        disabled={isExporting}
                        className="flex-1 sm:flex-initial px-5 py-2.5 text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm shadow-emerald-600/20 cursor-pointer"
                      >
                        {isExporting ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                            <span>{exportProgressText || 'Mengekspor...'}</span>
                          </>
                        ) : (
                          <>
                            <span>📥 Download Master Leger (1 Excel)</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ─── PENGATURAN RAPOR & PENILAIAN MODAL (KURIKULUM & ADMIN) ─────── */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center font-bold">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Atur Format Rapor &amp; Penilaian</h3>
                  <p className="text-[11px] text-slate-300">Pengaturan menyeluruh untuk guru dan kurikulum</p>
                </div>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <IconClose />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-700">
              {/* 1. Status Rapor PTS */}
              <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-800 text-sm">Status Rapor PTS</div>
                    <div className="text-[11px] text-slate-500">
                      Buka atau tutup periode pengisian &amp; penerbitan Rapor PTS.
                    </div>
                  </div>
                  <div className="flex bg-slate-200 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setTempSettings(prev => ({ ...prev, status_rapor_pts: 'buka' }))}
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
                        tempSettings.status_rapor_pts === 'buka'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Buka
                    </button>
                    <button
                      type="button"
                      onClick={() => setTempSettings(prev => ({ ...prev, status_rapor_pts: 'tutup' }))}
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
                        tempSettings.status_rapor_pts === 'tutup'
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Tutup
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-indigo-700 italic">
                  {tempSettings.status_rapor_pts === 'buka'
                    ? 'Rapor PTS aktif. Guru mapel akan diminta mengonfirmasi/memilih lingkup materi yang masuk ke rapor.'
                    : 'Rapor PTS ditutup.'}
                </p>

                {/* Shortcut to Audit PTS */}
                <button
                  type="button"
                  onClick={() => {
                    setShowSettingsModal(false)
                    openPtsAuditModal()
                  }}
                  className="w-full mt-1.5 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 11 12 14 22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                  <span>Cek Status Lingkup Materi PTS Semua Mapel</span>
                </button>
              </div>

              {/* 2. Kontrol Kolom Sumatif PSTS & PSAS */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
                <div>
                  <div className="font-bold text-slate-800 text-sm">Kendali Kolom PSTS &amp; PSAS</div>
                  <div className="text-[11px] text-slate-500">
                    Hanya kurikulum dan admin yang dapat menentukan kemunculan kolom ini. Guru hanya dapat mengisi nilai.
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Kolom PSTS */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col justify-between gap-2">
                    <div>
                      <span className="font-bold text-slate-800 block">Kolom PSTS</span>
                      <span className="text-[10px] text-slate-500">Penilaian Sumatif Tengah Semester</span>
                    </div>
                    <div className="flex bg-slate-100 p-0.5 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setTempSettings(prev => ({ ...prev, show_kolom_psts: 'true' }))}
                        className={`flex-1 py-1 text-[11px] font-bold rounded-md transition-all ${
                          tempSettings.show_kolom_psts === 'true'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Tampil
                      </button>
                      <button
                        type="button"
                        onClick={() => setTempSettings(prev => ({ ...prev, show_kolom_psts: 'false' }))}
                        className={`flex-1 py-1 text-[11px] font-bold rounded-md transition-all ${
                          tempSettings.show_kolom_psts === 'false'
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Hide
                      </button>
                    </div>
                  </div>

                  {/* Kolom PSAS */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col justify-between gap-2">
                    <div>
                      <span className="font-bold text-slate-800 block">Kolom PSAS / PSAT</span>
                      <span className="text-[10px] text-slate-500">Penilaian Sumatif Akhir Semester</span>
                    </div>
                    <div className="flex bg-slate-100 p-0.5 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setTempSettings(prev => ({ ...prev, show_kolom_psas: 'true' }))}
                        className={`flex-1 py-1 text-[11px] font-bold rounded-md transition-all ${
                          tempSettings.show_kolom_psas === 'true'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Tampil
                      </button>
                      <button
                        type="button"
                        onClick={() => setTempSettings(prev => ({ ...prev, show_kolom_psas: 'false' }))}
                        className={`flex-1 py-1 text-[11px] font-bold rounded-md transition-all ${
                          tempSettings.show_kolom_psas === 'false'
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Hide
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Pengaturan Format Lembar Rapor */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
                <div>
                  <div className="font-bold text-slate-800 text-sm">Format Tabel Lembar Rapor</div>
                  <div className="text-[11px] text-slate-500">
                    Menentukan struktur kolom bab dan TP pada cetak lembar Rapor Siswa.
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Maksimal Lingkup Materi (BAB) */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5">
                    <label className="font-bold text-slate-800 block text-xs">Maks. Lingkup Materi (BAB)</label>
                    <p className="text-[10px] text-slate-500">Jumlah kolom bab di lembar rapor</p>
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={tempSettings.rapor_max_lingkup}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(10, parseInt(e.target.value || '1', 10)))
                          setTempSettings(prev => ({ ...prev, rapor_max_lingkup: val }))
                        }}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-bold text-slate-800 text-center text-sm outline-none focus:border-indigo-500"
                      />
                      <span className="font-semibold text-slate-600 shrink-0">BAB</span>
                    </div>
                  </div>

                  {/* Maksimal TP per Lingkup */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5">
                    <label className="font-bold text-slate-800 block text-xs">Maks. TP per Lingkup</label>
                    <p className="text-[10px] text-slate-500">Jumlah kolom TP di setiap bab</p>
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={tempSettings.rapor_max_tp_per_lingkup}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(10, parseInt(e.target.value || '1', 10)))
                          setTempSettings(prev => ({ ...prev, rapor_max_tp_per_lingkup: val }))
                        }}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-bold text-slate-800 text-center text-sm outline-none focus:border-indigo-500"
                      />
                      <span className="font-semibold text-slate-600 shrink-0">TP</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* 4. Kebijakan Standar Perhitungan Nilai Akhir Sekolah */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-800 text-sm">Standar Perhitungan Nilai Akhir</div>
                    <div className="text-[11px] text-slate-500">
                      Standar metode perhitungan nilai akhir yang berlaku di Leger Nilai &amp; Rapor.
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-indigo-100 text-indigo-800 border border-indigo-200">
                    Standar Sekolah
                  </span>
                </div>

                <div className="space-y-2 pt-1">
                  {/* Option 1: Rerata Bertingkat per BAB */}
                  <label
                    onClick={() => setTempSettings(prev => ({ ...prev, metode_hitung_nilai_akhir: 'rata_rata' }))}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      tempSettings.metode_hitung_nilai_akhir === 'rata_rata'
                        ? 'border-indigo-600 bg-indigo-50/60 shadow-2xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="metode_hitung_sekolah"
                      value="rata_rata"
                      checked={tempSettings.metode_hitung_nilai_akhir === 'rata_rata'}
                      onChange={() => {}}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <strong className="text-slate-800 text-xs">Rata-rata Bertingkat per BAB (Standar)</strong>
                        <span className="text-[9px] font-black text-indigo-700 bg-indigo-100 px-1.5 py-0.2 rounded">Per-BAB</span>
                      </div>
                      <span className="text-[10.5px] text-slate-500 block leading-relaxed mt-0.5">
                        Nilai dirata-rata per BAB Lingkup Materi terlebih dahulu, lalu dirata-rata antar BAB dengan nilai PTS/PSAT.
                      </span>
                    </div>
                  </label>

                  {/* Option 2: Rerata Langsung Semua Nilai */}
                  <label
                    onClick={() => setTempSettings(prev => ({ ...prev, metode_hitung_nilai_akhir: 'rata_rata_langsung' }))}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      tempSettings.metode_hitung_nilai_akhir === 'rata_rata_langsung'
                        ? 'border-purple-600 bg-purple-50/60 shadow-2xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="metode_hitung_sekolah"
                      value="rata_rata_langsung"
                      checked={tempSettings.metode_hitung_nilai_akhir === 'rata_rata_langsung'}
                      onChange={() => {}}
                      className="mt-0.5 text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <strong className="text-slate-800 text-xs">Rata-rata Langsung (Semua Komponen)</strong>
                        <span className="text-[9px] font-black text-purple-700 bg-purple-100 px-1.5 py-0.2 rounded">Tanpa BAB</span>
                      </div>
                      <span className="text-[10.5px] text-slate-500 block leading-relaxed mt-0.5">
                        Seluruh nilai TP dan PTS yang terisi dijumlahkan langsung lalu dibagi total komponen yang dinilai.
                      </span>
                    </div>
                  </label>

                  {/* Option 3: Bobot Manual per BAB */}
                  <label
                    onClick={() => setTempSettings(prev => ({ ...prev, metode_hitung_nilai_akhir: 'bobot_manual' }))}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      tempSettings.metode_hitung_nilai_akhir === 'bobot_manual'
                        ? 'border-amber-600 bg-amber-50/60 shadow-2xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="metode_hitung_sekolah"
                      value="bobot_manual"
                      checked={tempSettings.metode_hitung_nilai_akhir === 'bobot_manual'}
                      onChange={() => {}}
                      className="mt-0.5 text-amber-600 focus:ring-amber-500"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <strong className="text-slate-800 text-xs">Bobot Manual (%)</strong>
                        <span className="text-[9px] font-black text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded">Kustom %</span>
                      </div>
                      <span className="text-[10.5px] text-slate-500 block leading-relaxed mt-0.5">
                        Guru atau Kurikulum mengatur persentase bobot per BAB untuk masing-masing mata pelajaran (total 100%).
                      </span>
                    </div>
                  </label>
                </div>

                {/* Checkbox Karakter */}
                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tempSettings.include_karakter_nilai_akhir === 'true'}
                    onChange={(e) => setTempSettings(prev => ({ ...prev, include_karakter_nilai_akhir: e.target.checked ? 'true' : 'false' }))}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-bold text-slate-700">Sertakan Nilai Karakter ke dalam Nilai Akhir Kognitif</span>
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-all"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-black disabled:opacity-50 rounded-xl transition-all shadow-xs flex items-center gap-2"
              >
                {savingSettings && (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                <span>Simpan Pengaturan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── PENGATURAN NILAI AKHIR QUICK MODAL (KURIKULUM & ADMIN) ─────── */}
      {showConfigAkhirModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-bold text-base">
                  ⚙️
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">Pengaturan Nilai Akhir</h3>
                  <p className="text-[11px] text-indigo-200">
                    {mapels.find(m => m.id === selectedMapelId)?.nama || 'Mata Pelajaran'} • Kelas {activeTabKelas}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConfigAkhirModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <IconClose />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-700">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Pilih Metode Perhitungan Nilai Akhir
                </label>

                {/* 3 Option Cards */}
                <div className="space-y-2.5">
                  {/* Opsi 1: Rata-rata Langsung */}
                  <div
                    onClick={() => setTempConfigAkhir(prev => ({ ...prev, metode_hitung: 'rata_rata_langsung' }))}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      tempConfigAkhir.metode_hitung === 'rata_rata_langsung'
                        ? 'border-purple-600 bg-purple-50/50 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base">⚡</span>
                        <strong className="text-slate-900 text-xs sm:text-sm">Rata-rata Langsung (Semua Komponen)</strong>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        tempConfigAkhir.metode_hitung === 'rata_rata_langsung'
                          ? 'bg-purple-600 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        Tanpa Rerata BAB
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed pl-6">
                      Seluruh nilai TP dan PSTS dijumlahkan langsung lalu dibagi total komponen yang dinilai. Setiap tugas &amp; ujian diperlakukan setara.
                    </p>
                  </div>

                  {/* Opsi 2: Rata-rata Bertingkat per BAB */}
                  <div
                    onClick={() => setTempConfigAkhir(prev => ({ ...prev, metode_hitung: 'rata_rata' }))}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      tempConfigAkhir.metode_hitung === 'rata_rata'
                        ? 'border-indigo-600 bg-indigo-50/50 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base">📊</span>
                        <strong className="text-slate-900 text-xs sm:text-sm">Rata-rata Bertingkat per BAB (Standar)</strong>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        tempConfigAkhir.metode_hitung === 'rata_rata'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        Rerata per BAB
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed pl-6">
                      Nilai TP dirata-rata per BAB Lingkup Materi terlebih dahulu, kemudian rata-rata antar BAB digabung dengan nilai PTS/PSAT.
                    </p>
                  </div>

                  {/* Opsi 3: Bobot Manual per BAB */}
                  <div
                    onClick={() => setTempConfigAkhir(prev => ({ ...prev, metode_hitung: 'bobot_manual' }))}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      tempConfigAkhir.metode_hitung === 'bobot_manual'
                        ? 'border-amber-500 bg-amber-50/50 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base">⚖️</span>
                        <strong className="text-slate-900 text-xs sm:text-sm">Bobot Manual (%)</strong>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        tempConfigAkhir.metode_hitung === 'bobot_manual'
                          ? 'bg-amber-600 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        Kustom Persentase
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed pl-6">
                      Tentukan persentase bobot masing-masing BAB materi dan nilai PSTS/PSAS (total persentase harus 100%).
                    </p>
                  </div>
                </div>
              </div>

              {/* Detail Input Bobot jika Bobot Manual dipilih */}
              {tempConfigAkhir.metode_hitung === 'bobot_manual' && (
                <div className="p-4 rounded-xl border border-amber-200 bg-white space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-xs uppercase tracking-wider">Persentase Bobot Tiap BAB</span>
                    <span className="text-[11px] text-slate-500">Total harus 100%</span>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {uniqueBabsClass.map((bab) => (
                      <div key={bab} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-slate-50 border border-slate-100">
                        <span className="text-xs font-bold text-slate-800 truncate flex-1">{bab}</span>
                        <div className="relative w-24 shrink-0">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            className="w-full pl-3 pr-8 py-1.5 text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded-lg text-right focus:outline-none focus:border-amber-500"
                            value={tempConfigAkhir.bobot_detail?.[bab] ?? ''}
                            onChange={(e) => {
                              const val = e.target.value
                              setTempConfigAkhir(prev => ({
                                ...prev,
                                bobot_detail: {
                                  ...(prev.bobot_detail || {}),
                                  [bab]: val === '' ? '' : Number(val)
                                }
                              }))
                            }}
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">%</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {(() => {
                    const sum = Object.values(tempConfigAkhir.bobot_detail || {}).reduce((a, b) => a + Number(b || 0), 0)
                    const isValid = Math.abs(sum - 100) < 0.01
                    return (
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span className="font-bold text-xs text-slate-700">Total Bobot:</span>
                        <span className={`text-xs font-black px-2 py-0.5 rounded ${isValid ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                          {sum}% {isValid ? '✅ Sesuai' : '⚠️ Harus 100%'}
                        </span>
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* Opsi Tambahan: Karakter */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/60 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={Boolean(tempConfigAkhir.include_karakter)}
                  onChange={(e) => setTempConfigAkhir(prev => ({ ...prev, include_karakter: e.target.checked }))}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-slate-300 mt-0.5"
                />
                <div>
                  <span className="font-bold text-slate-800 block text-xs">Sertakan Nilai Karakter ke dalam Nilai Akhir</span>
                  <span className="text-[11px] text-slate-500 block leading-relaxed">
                    Jika tidak dicentang, kolom N. Karakter tetap tercatat di tabel tetapi tidak mempengaruhi angka Nilai Akhir kognitif.
                  </span>
                </div>
              </label>

              {/* Opsi Terapkan ke Kelas Paralel */}
              {parallelClasses.length > 1 && (
                <label className="flex items-start gap-2.5 p-3 rounded-xl border border-indigo-100 bg-indigo-50/40 hover:bg-indigo-50 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={applyToParallel}
                    onChange={(e) => setApplyToParallel(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-indigo-300 mt-0.5"
                  />
                  <div>
                    <span className="font-bold text-indigo-950 block text-xs">
                      Terapkan ke Semua Kelas Paralel Tingkat {String(activeTabKelas).replace(/[^0-9]/g, '')}
                    </span>
                    <span className="text-[11px] text-indigo-700 block leading-relaxed">
                      Pengaturan ini akan otomatis disimpan ke: <strong>{parallelClasses.join(', ')}</strong>
                    </span>
                  </div>
                </label>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowConfigAkhirModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-all"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleSaveConfigAkhir(tempConfigAkhir, applyToParallel)}
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-xs"
              >
                Simpan Pengaturan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL AUDIT & CEK LINGKUP PTS SEMUA MAPEL (ADMIN & KURIKULUM) ─────── */}
      {showPtsAuditModal && isKurikulumOrAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 11 12 14 22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-bold text-white">Status Lingkup Materi Rapor PTS</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                      Admin &amp; Kurikulum
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Cek apakah setiap mapel sudah memilih BAB yang akan ditampilkan di Rapor PTS
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPtsAuditModal(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition-colors"
                title="Tutup"
              >
                <IconClose />
              </button>
            </div>

            {/* Sub-Header Toolbar (Pilih Kelas & Filter) */}
            <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/80 flex flex-col gap-3 shrink-0">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                {/* Kelas Selector */}
                <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
                  <span className="text-xs font-bold text-slate-700 shrink-0">Target Kelas:</span>
                  <div className="flex items-center gap-1.5 bg-slate-200/80 p-1 rounded-xl">
                    {allKelasList.map(cls => (
                      <button
                        key={cls}
                        type="button"
                        onClick={() => {
                          setPtsAuditSelectedClass(cls)
                          fetchPtsAuditData(cls)
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          ptsAuditSelectedClass === cls
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                        }`}
                      >
                        {cls}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search Bar */}
                <div className="relative w-full md:w-64 shrink-0">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <IconSearch />
                  </span>
                  <input
                    type="text"
                    value={ptsAuditSearch}
                    onChange={(e) => setPtsAuditSearch(e.target.value)}
                    placeholder="Cari mapel / guru..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              {/* KPI Summary Cards */}
              {(() => {
                const total = ptsAuditData.length
                const confirmed = ptsAuditData.filter(d => d.status === 'confirmed').length
                const pending = ptsAuditData.filter(d => d.status === 'pending').length
                const withMissingScores = ptsAuditData.filter(d => d.missingCount > 0).length
                const noBab = ptsAuditData.filter(d => d.status === 'no_bab').length

                return (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
                    <div
                      onClick={() => setPtsAuditStatusFilter('all')}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                        ptsAuditStatusFilter === 'all'
                          ? 'bg-indigo-50 border-indigo-300 shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Mapel</span>
                      <div className="text-base sm:text-lg font-black text-slate-800">{total} <span className="text-xs font-semibold text-slate-400">Mapel</span></div>
                    </div>

                    <div
                      onClick={() => setPtsAuditStatusFilter('confirmed')}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                        ptsAuditStatusFilter === 'confirmed'
                          ? 'bg-emerald-50 border-emerald-300 shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-[10px] font-bold text-emerald-700 uppercase block">Sudah Set PTS</span>
                      <div className="text-base sm:text-lg font-black text-emerald-700">{confirmed} <span className="text-xs font-semibold text-emerald-600/70">Mapel</span></div>
                    </div>

                    <div
                      onClick={() => setPtsAuditStatusFilter('pending')}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                        ptsAuditStatusFilter === 'pending'
                          ? 'bg-amber-50 border-amber-300 shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-[10px] font-bold text-amber-700 uppercase block">Belum Konfirmasi</span>
                      <div className="text-base sm:text-lg font-black text-amber-700">{pending} <span className="text-xs font-semibold text-amber-600/70">Mapel</span></div>
                    </div>

                    <div
                      onClick={() => setPtsAuditStatusFilter('missing_score')}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                        ptsAuditStatusFilter === 'missing_score'
                          ? 'bg-rose-50 border-rose-300 shadow-2xs ring-1 ring-rose-400'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-[10px] font-bold text-rose-700 uppercase block">Ada Nilai Kosong (-)</span>
                      <div className="text-base sm:text-lg font-black text-rose-700">{withMissingScores} <span className="text-xs font-semibold text-rose-600/70">Mapel</span></div>
                    </div>

                    <div
                      onClick={() => setPtsAuditStatusFilter('no_bab')}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                        ptsAuditStatusFilter === 'no_bab'
                          ? 'bg-slate-100 border-slate-300 shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-[10px] font-bold text-slate-500 uppercase block">Belum Ada BAB</span>
                      <div className="text-base sm:text-lg font-black text-slate-600">{noBab} <span className="text-xs font-semibold text-slate-400">Mapel</span></div>
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Table Content */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1">
              {ptsAuditLoading ? (
                <div className="py-20 text-center">
                  <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-xs font-bold text-slate-600">Memeriksa status lingkup materi &amp; kelengkapan nilai PTS...</p>
                </div>
              ) : (
                (() => {
                  const filtered = ptsAuditData.filter(item => {
                    // Filter status
                    if (ptsAuditStatusFilter === 'confirmed' && item.status !== 'confirmed') return false
                    if (ptsAuditStatusFilter === 'pending' && item.status !== 'pending') return false
                    if (ptsAuditStatusFilter === 'missing_score' && item.missingCount === 0) return false
                    if (ptsAuditStatusFilter === 'no_bab' && item.status !== 'no_bab') return false
                    // Search
                    if (ptsAuditSearch) {
                      const q = ptsAuditSearch.toLowerCase()
                      const mMatch = (item.mapelNama || '').toLowerCase().includes(q)
                      const gMatch = (item.guruNama || '').toLowerCase().includes(q)
                      if (!mMatch && !gMatch) return false
                    }
                    return true
                  })

                  if (filtered.length === 0) {
                    return (
                      <div className="py-16 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <p className="text-sm font-bold text-slate-600">Tidak ada mata pelajaran yang sesuai filter</p>
                        <p className="text-xs text-slate-400 mt-1">Ubah kata kunci pencarian atau ganti filter status.</p>
                      </div>
                    )
                  }

                  return (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs bg-white">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-100/90 text-slate-700 font-extrabold uppercase border-b border-slate-200 text-[11px]">
                            <th className="py-3 px-3 text-center w-10">No</th>
                            <th className="py-3 px-4">Mata Pelajaran &amp; Pengampu</th>
                            <th className="py-3 px-3 text-center w-32">Status PTS</th>
                            <th className="py-3 px-4">Lingkup Materi / BAB Terpilih</th>
                            <th className="py-3 px-3 text-center w-40">Audit Nilai (-)</th>
                            <th className="py-3 px-3 text-center w-28">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filtered.map((r, idx) => {
                            const isConfirmed = r.status === 'confirmed'
                            const isPending = r.status === 'pending'
                            const isNoBab = r.status === 'no_bab'

                            return (
                              <tr key={r.mapelId} className="hover:bg-slate-50/70 transition-colors">
                                <td className="py-3 px-3 text-center font-bold text-slate-400 align-middle">
                                  {idx + 1}
                                </td>

                                <td className="py-3 px-4 align-middle">
                                  <div className="font-extrabold text-slate-900 text-xs">
                                    {r.mapelNama}
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="text-[10px] text-slate-400 font-medium">Guru:</span>
                                    <span className={`text-[11px] font-semibold ${
                                      r.guruNama === 'Belum Ditugaskan'
                                        ? 'text-rose-500 italic'
                                        : 'text-indigo-700'
                                    }`}>
                                      {r.guruNama}
                                    </span>
                                  </div>
                                </td>

                                <td className="py-3 px-3 text-center align-middle">
                                  {isConfirmed ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                                      <svg className="w-3 h-3 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                      <span>Terkonfirmasi</span>
                                    </span>
                                  ) : isPending ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs animate-pulse">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                      <span>Belum Set</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                      <span>Belum Ada BAB</span>
                                    </span>
                                  )}
                                </td>

                                <td className="py-3 px-4 align-middle">
                                  {isConfirmed ? (
                                    <div className="space-y-1">
                                      <div className="flex flex-wrap gap-1">
                                        {r.selectedBabs.map((bab, bIdx) => (
                                          <span
                                            key={bIdx}
                                            className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200"
                                          >
                                            {bab}
                                          </span>
                                        ))}
                                      </div>
                                      <div className="text-[10px] text-slate-500">
                                        {r.selectedBabs.length} dari {r.availableBabs.length} BAB terpilih masuk Rapor PTS
                                      </div>
                                    </div>
                                  ) : isPending ? (
                                    <div className="text-slate-600">
                                      <div className="text-[11px] font-semibold text-amber-800">
                                        Tersedia {r.availableBabs.length} BAB ({r.availableBabs.join(', ')})
                                      </div>
                                      <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                                        Guru belum mengonfirmasi BAB khusus PTS (secara default semua BAB akan tampil).
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="text-[11px] text-slate-400 italic">
                                      Belum ada materi pembelajaran yang dibuat di kelas ini.
                                    </div>
                                  )}
                                </td>

                                {/* Kolom Audit Nilai (-) */}
                                <td className="py-3 px-3 text-center align-middle">
                                  {r.missingCount > 0 ? (
                                    <div className="flex flex-col items-center gap-1">
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                        <span>{r.missingCount} Nilai Kosong (-)</span>
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setSelectedMissingDetail(r)}
                                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer flex items-center gap-0.5"
                                        title="Klik untuk melihat daftar siswa dan TP yang belum dinilai"
                                      >
                                        <span>Rincian {r.affectedStudentCount} siswa</span>
                                        <span>&rarr;</span>
                                      </button>
                                    </div>
                                  ) : r.describedTpsCount > 0 ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      <svg className="w-3 h-3 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                      <span>Semua Terisi (100%)</span>
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 italic">
                                      Belum ada deskripsi TP
                                    </span>
                                  )}
                                </td>

                                <td className="py-3 px-3 text-center align-middle">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingPtsMapel(r)
                                      setTempAuditSelectedBabs(
                                        r.selectedBabs.length > 0
                                          ? r.selectedBabs
                                          : r.availableBabs.slice(0, raporSettings.rapor_max_lingkup || 3)
                                      )
                                    }}
                                    disabled={r.availableBabs.length === 0}
                                    className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all shadow-2xs flex items-center justify-center gap-1.5 mx-auto ${
                                      r.availableBabs.length === 0
                                        ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
                                        : isConfirmed
                                        ? 'bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50 cursor-pointer'
                                        : 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
                                    }`}
                                    title={
                                      r.availableBabs.length === 0
                                        ? 'Belum ada materi BAB yang dibuat'
                                        : 'Atur / Ubah Pilihan BAB untuk Rapor PTS'
                                    }
                                  >
                                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                    <span>{isConfirmed ? 'Ubah BAB' : 'Atur BAB'}</span>
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                })()
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Batas maksimal Rapor PTS: <strong>{raporSettings.rapor_max_lingkup} BAB</strong></span>
              </div>
              <button
                type="button"
                onClick={() => setShowPtsAuditModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── SUB-MODAL ATUR / PILIH BAB PTS UNTUK MAPEL TERTENTU ─────────────── */}
      {editingPtsMapel && (
        <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-indigo-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center font-bold">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="9 11 12 14 22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Atur Lingkup Materi Rapor PTS</h3>
                  <p className="text-[11px] text-indigo-200">
                    {editingPtsMapel.mapelNama} &bull; Rombel Kelas {editingPtsMapel.targetClass}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingPtsMapel(null)}
                className="text-indigo-300 hover:text-white p-1 rounded-lg hover:bg-indigo-800 transition-colors"
              >
                <IconClose />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-700">
              {(() => {
                const availableBabs = editingPtsMapel.availableBabs || []
                const maxLimit = raporSettings.rapor_max_lingkup || 3
                const isUnderOrEqual = availableBabs.length <= maxLimit

                return (
                  <>
                    <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200/70 text-indigo-900 space-y-1.5">
                      <div className="font-bold text-xs flex items-center justify-between">
                        <span>Batas Maksimal Rapor: {maxLimit} BAB</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          tempAuditSelectedBabs.length === maxLimit
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}>
                          Terpilih: {tempAuditSelectedBabs.length} / {maxLimit}
                        </span>
                      </div>
                      <p className="text-[11px] text-indigo-700 leading-relaxed">
                        Centang BAB yang akan dimuat ke Rapor PTS. BAB yang <strong>tidak dicentang tidak akan ditampilkan</strong> di lembar Rapor Siswa maupun Rincian Capaian TP.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setTempAuditSelectedBabs(availableBabs.slice(0, maxLimit))}
                        className="flex-1 py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1"
                      >
                        Pilih {Math.min(availableBabs.length, maxLimit)} BAB Pertama
                      </button>
                      <button
                        type="button"
                        onClick={() => setTempAuditSelectedBabs([])}
                        className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs transition-colors"
                      >
                        Reset
                      </button>
                    </div>

                    <div className="space-y-2 pt-1">
                      <label className="font-bold text-slate-700 block text-xs uppercase tracking-wide">
                        Daftar BAB / Lingkup Materi:
                      </label>
                      {availableBabs.length === 0 ? (
                        <div className="p-4 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                          Belum ada BAB materi yang dibuat untuk rombel ini.
                        </div>
                      ) : (
                        availableBabs.map(bab => {
                          const isChecked = tempAuditSelectedBabs.includes(bab)
                          const disabled = !isChecked && tempAuditSelectedBabs.length >= maxLimit

                          return (
                            <label
                              key={bab}
                              className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                                isChecked
                                  ? 'bg-indigo-50/70 border-indigo-300 text-indigo-950 font-bold'
                                  : disabled
                                  ? 'bg-slate-50 border-slate-200 text-slate-400 opacity-60 cursor-not-allowed'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={disabled}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      if (tempAuditSelectedBabs.length < maxLimit) {
                                        setTempAuditSelectedBabs([...tempAuditSelectedBabs, bab])
                                      }
                                    } else {
                                      setTempAuditSelectedBabs(tempAuditSelectedBabs.filter(b => b !== bab))
                                    }
                                  }}
                                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                                />
                                <span>{bab}</span>
                              </div>
                              {isChecked && (
                                <span className="text-[10px] text-indigo-600 font-extrabold px-1.5 py-0.5 rounded bg-indigo-100">
                                  Tampil di PTS
                                </span>
                              )}
                            </label>
                          )
                        })
                      )}
                    </div>
                  </>
                )
              })()}
            </div>

            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setEditingPtsMapel(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-all"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveAuditPts}
                disabled={savingAuditPts}
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl transition-all shadow-xs flex items-center gap-2 cursor-pointer"
              >
                {savingAuditPts && (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                <span>Simpan Pilihan PTS</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL RINCIAN NILAI KOSONG (-) PADA TP BERDESKRIPSI (KURIKULUM & ADMIN) ─ */}
      {selectedMissingDetail && (
        <div className="fixed inset-0 z-[70] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center font-bold">
                  <span className="text-lg">⚠️</span>
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-white">
                    Audit Nilai Kosong (-) pada TP Berdeskripsi
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    {selectedMissingDetail.mapelNama} &bull; Kelas {selectedMissingDetail.targetClass} &bull; Guru: {selectedMissingDetail.guruNama}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedMissingDetail(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition-colors"
              >
                <IconClose />
              </button>
            </div>

            {/* Info & Action Banner */}
            <div className="p-4 sm:p-5 bg-rose-50/70 border-b border-rose-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
              <div>
                <div className="text-xs font-black text-rose-950 flex items-center gap-2">
                  <span>🚨 Terdeteksi {selectedMissingDetail.missingCount} Nilai Kosong (-)</span>
                  <span className="px-2 py-0.5 rounded-full bg-rose-200 text-rose-900 text-[10px] font-black">
                    {selectedMissingDetail.affectedStudentCount} Siswa Terdampak
                  </span>
                </div>
                <p className="text-[11px] text-rose-800 mt-0.5 leading-relaxed">
                  Guru telah menulis deskripsi capaian pembelajaran pada TP berikut, namun nilai siswa belum diinput.
                </p>
              </div>

              {/* Salin Pesan Pengingat */}
              <button
                type="button"
                onClick={() => {
                  const uniqueNames = [...new Set(selectedMissingDetail.missingScores.map(m => m.studentNama))].slice(0, 8).join(', ')
                  const text = `Yth. Bpk/Ibu ${selectedMissingDetail.guruNama},\n\nMohon bantuannya untuk melengkapi nilai Rapor PTS mata pelajaran *${selectedMissingDetail.mapelNama}* Kelas *${selectedMissingDetail.targetClass}*.\n\nDitemukan ${selectedMissingDetail.missingCount} nilai siswa yang masih kosong (-) pada TP yang sudah berdeskripsi.\nContoh siswa: ${uniqueNames}${selectedMissingDetail.affectedStudentCount > 8 ? ', dll.' : ''}.\n\nMohon dapat segera diinput sebelum cetak rapor. Terima kasih.`
                  navigator.clipboard.writeText(text)
                  setRealtimeToast('Pesan pengingat untuk guru berhasil disalin ke clipboard!')
                  setTimeout(() => setRealtimeToast(null), 3500)
                }}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
                title="Salin template pengingat untuk dikirim ke guru via WhatsApp"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>Salin Pesan Pengingat Guru</span>
              </button>
            </div>

            {/* List Table */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1">
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs bg-white">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-extrabold uppercase border-b border-slate-200 text-[10.5px]">
                      <th className="py-2.5 px-3 text-center w-10">No</th>
                      <th className="py-2.5 px-4 w-44">Nama Siswa</th>
                      <th className="py-2.5 px-3 text-center w-28">NISN</th>
                      <th className="py-2.5 px-3 text-center w-28">Materi &amp; TP</th>
                      <th className="py-2.5 px-4">Deskripsi TP</th>
                      <th className="py-2.5 px-3 text-center w-24">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedMissingDetail.missingScores.map((ms, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3 text-center font-bold text-slate-400 align-middle">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-4 font-extrabold text-slate-900 align-middle">
                          {ms.studentNama}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-600 align-middle">
                          {ms.studentNisn}
                        </td>
                        <td className="py-2.5 px-3 text-center align-middle">
                          <span className="inline-block px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 font-bold text-[10px] border border-indigo-200">
                            {ms.babNama} &bull; {ms.tpNama}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 italic text-[11px] leading-relaxed align-middle">
                          {ms.deskripsi}
                        </td>
                        <td className="py-2.5 px-3 text-center align-middle">
                          <span className="inline-block px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-black text-[10px] border border-rose-200">
                            Nilai (-)
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedMissingDetail(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
