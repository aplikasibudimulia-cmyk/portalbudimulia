import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../supabaseClient'
import { getSemesterAktif } from '../utils/semesterUtils'
import { getNilaiEkskulKelas } from '../utils/ekskulService'
import { generateDeskripsiKurikulumMerdeka } from '../utils/deskripsiGenerator'
import { getPortalBaseUrl } from '../utils/urlHelper'

// ─── Standard Canonical Order for SMP Budi Mulia Subjects ────────────────────
const CANONICAL_MAPEL_ORDER = [
  'agama',
  'pancasila',
  'bahasa indonesia',
  'matematika',
  'ilmu pengetahuan alam',
  'ilmu pengetahuan sosial',
  'bahasa inggris',
  'jasmani',
  'informatika',
  'seni musik',
  'seni budaya',
  'bahasa mandarin',
  'english plus',
  'psbm'
]

// ─── 11 Official Subjects for Kurikulum Merdeka Report Card (including Mandarin) ─
const OFFICIAL_REPORT_MAPELS = [
  'agama',
  'pancasila',
  'bahasa indonesia',
  'matematika',
  'ilmu pengetahuan alam',
  'ilmu pengetahuan sosial',
  'bahasa inggris',
  'jasmani',
  'informatika',
  'seni musik',
  'bahasa mandarin'
]

// ─── Roman Numeral Formatter for Classes (e.g. IX-A, VIII-B, VII-C) ─────────
const toRomanClass = (kelasStr) => {
  if (!kelasStr) return ''
  const trimmed = String(kelasStr).trim().toUpperCase()
  const match = trimmed.match(/^(9|8|7|IX|VIII|VII)[\s\-_]*([A-Z0-9]+)?$/i)
  if (match) {
    const grade = match[1].toUpperCase()
    const sub = match[2] || ''
    let roman = grade
    if (grade === '9') roman = 'IX'
    else if (grade === '8') roman = 'VIII'
    else if (grade === '7') roman = 'VII'
    return sub ? `${roman}-${sub}` : roman
  }
  return trimmed
}

// ─── Helper to identify character assessment components (Nilai Karakter / NIK / NK / Sikap) ──
const isKarakterKomponen = (nama, deskripsi = '') => {
  const n = (nama || '').toUpperCase().trim()
  const d = (deskripsi || '').toUpperCase().trim()
  return (
    n.includes('KARAKTER') ||
    n.includes('SIKAP') ||
    n === 'NK' ||
    n.startsWith('NK ') ||
    n.startsWith('NK-') ||
    n.startsWith('NK.') ||
    n.includes('N. KARAKTER') ||
    n.includes('N.KARAKTER') ||
    n === 'NIK' ||
    n.startsWith('NIK ') ||
    n.startsWith('NIK-') ||
    n.startsWith('NIK.') ||
    n.includes('INDIKATOR KARAKTER') ||
    d.includes('KARAKTER') ||
    d.includes('INDIKATOR_KARAKTER')
  )
}

// ─── Helper to match class names flexibly (e.g. "TEST", "Kelas Test", "7A", "Kelas 7A", "VII-A", "7", "Kelas 7") ──
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

  // If target is just a rombel number (e.g. "7") and current class belongs to that rombel (e.g. "7C"):
  const rombelT = act.replace(/\D/g, '')
  const rombelC = acc.replace(/\D/g, '')
  if (rombelT && rombelT === rombelC) {
    if (/^\d+$/.test(act)) return true
  }

  return false
}

// ─── Helper to normalize BAB names for comparison ─────────────────────────────
const normalizeBab = (name) => String(name || 'BAB 1').trim().toLowerCase().replace(/\s+/g, ' ')

// ─── Helper to match BAB names (supports fuzzy prefix/suffix/number matching) ──
const isBabMatching = (selectedBab, candidateBab) => {
  const s = normalizeBab(selectedBab)
  const c = normalizeBab(candidateBab)
  if (!s || !c) return false
  if (s === c) return true
  if (c.startsWith(s) || s.startsWith(c)) return true
  const cleanS = s.replace(/^(?:lingkup\s*(?:materi)?\s*\d*\s*[:\-.]?\s*|bab\s*\d*\s*[:\-.]?\s*)/i, '').trim()
  const cleanC = c.replace(/^(?:lingkup\s*(?:materi)?\s*\d*\s*[:\-.]?\s*|bab\s*\d*\s*[:\-.]?\s*)/i, '').trim()
  if (cleanS && cleanC && (cleanS === cleanC || cleanC.includes(cleanS) || cleanS.includes(cleanC))) return true
  const numS = s.match(/(?:bab|lingkup)\s*(\d+)/i)?.[1]
  const numC = c.match(/(?:bab|lingkup)\s*(\d+)/i)?.[1]
  if (numS && numC && numS === numC) return true
  return false
}

const isPstsBabName = (name) => {
  const s = normalizeBab(name)
  return s.includes('psts') || s.includes('pts') || s.includes('sts') || s.includes('sumatif tengah')
}

const getBobotForBab = (targetBabName, bobotDetail) => {
  if (!bobotDetail || typeof bobotDetail !== 'object') return 0
  if (bobotDetail[targetBabName] !== undefined && bobotDetail[targetBabName] !== '') {
    return Number(bobotDetail[targetBabName]) || 0
  }
  for (const [key, val] of Object.entries(bobotDetail)) {
    if (key === 'include_karakter' || key === 'pts_selected_babs' || key === 'pts_confirmed') continue
    if (isPstsBabName(key)) continue
    if (isBabMatching(key, targetBabName)) {
      return Number(val) || 0
    }
  }
  return 0
}

const getBobotForPsts = (bobotDetail) => {
  if (!bobotDetail || typeof bobotDetail !== 'object') return 0
  for (const [key, val] of Object.entries(bobotDetail)) {
    if (key === 'include_karakter' || key === 'pts_selected_babs' || key === 'pts_confirmed') continue
    if (isPstsBabName(key)) {
      return Number(val) || 0
    }
  }
  return 0
}

// ─── Date Formatter (Indonesian Format) ───────────────────────────────────────
const formatTanggalIndo = (dateInput) => {
  if (!dateInput) return ''
  try {
    const d = new Date(dateInput)
    if (isNaN(d.getTime())) return String(dateInput)
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ]
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
  } catch {
    return String(dateInput)
  }
}

// ─── Corner Ribbon Graphic Accents ───────────────────────────────────────────
const CornerRibbon = ({ position = 'top-left' }) => {
  if (position === 'top-left') {
    return (
      <svg
        className="absolute top-0 left-0 w-24 h-24 sm:w-28 sm:h-28 pointer-events-none z-10"
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M 0 0 L 80 0 C 45 35 35 45 0 80 Z" fill="#004e85" />
        <path d="M 0 84 C 40 40 40 40 84 0 L 98 0 C 45 50 50 45 0 98 Z" fill="#d32f2f" />
      </svg>
    )
  }
  return (
    <svg
      className="absolute bottom-0 right-0 w-24 h-24 sm:w-28 sm:h-28 pointer-events-none z-10 rotate-180"
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M 0 0 L 80 0 C 45 35 35 45 0 80 Z" fill="#004e85" />
      <path d="M 0 84 C 40 40 40 40 84 0 L 98 0 C 45 50 50 45 0 98 Z" fill="#d32f2f" />
    </svg>
  )
}

// ─── Icons ───────────────────────────────────────────────────────────────────
const IconPrinter = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
)

const IconUsers = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

const IconRefresh = ({ spinning }) => (
  <svg className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
)

const IconBarChart = () => (
  <svg className="w-3.5 h-3.5 text-[#004e85]" viewBox="0 0 24 24" fill="currentColor">
    <path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z" />
  </svg>
)

const IconCalendar = () => (
  <svg className="w-3.5 h-3.5 text-[#004e85]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
)

const IconActivity = () => (
  <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
)

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT: RaporSiswaSection
// ══════════════════════════════════════════════════════════════════════════════
export default function RaporSiswaSection({ session, activeTa }) {
  // ─── Filters & Control States ───────────────────────────────────────────────
  const [allKelasList, setAllKelasList] = useState([])
  const [selectedKelas, setSelectedKelas] = useState('')
  const [semesters, setSemesters] = useState([])
  const [selectedSemesterId, setSelectedSemesterId] = useState('')
  const [tipeRaport, setTipeRaport] = useState('tengah') // 'tengah' | 'akhir'
  const [selectedNisn, setSelectedNisn] = useState('')
  const [isBatchMode, setIsBatchMode] = useState(false)
  const [kktpValue, setKktpValue] = useState(75)
  const [tanggalCetak, setTanggalCetak] = useState(formatTanggalIndo(new Date()))
  const [waliKelasCustom, setWaliKelasCustom] = useState('')

  // ─── Data States ───────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState([])
  const [mapels, setMapels] = useState([])
  const [guruMapelList, setGuruMapelList] = useState([])
  const [komponenList, setKomponenList] = useState([])
  const [nilaiMap, setNilaiMap] = useState({}) // { [komponen_id]: { [siswa_nisn]: nilai } }
  const [attendanceMap, setAttendanceMap] = useState({}) // { [siswa_nisn]: { sakit: 0, izin: 0, alpa: 0 } }
  const [ekskulMap, setEkskulMap] = useState({}) // { [siswa_nisn]: { pramuka_nilai, ... } }
  const [waliKelasInfo, setWaliKelasInfo] = useState(null)
  const [realtimeToast, setRealtimeToast] = useState(null)
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const refreshTimeoutRef = useRef(null)

  // ─── Hak Akses & Kelas Perwalian ───────────────────────────────────────────
  const canViewAllClasses = useMemo(() => {
    if (!session) return false
    if (session.is_admin) return true
    const roleStr = String(session.role || session.app_role || '').toLowerCase()
    if (roleStr.includes('admin') || roleStr.includes('superadmin')) return true

    return session.roles?.some(r => {
      const n = String(r?.nama || r || '').toLowerCase()
      return n.includes('admin') || n.includes('superadmin') || n.includes('kurikulum') || n.includes('kepala sekolah')
    })
  }, [session])

  const myWaliClasses = useMemo(() => {
    if (!session?.kelas || !Array.isArray(session.kelas) || session.kelas.length === 0) return []
    const taId = activeTa?.id
    if (taId) {
      const filtered = session.kelas.filter(k => k.tahun_ajaran_id == taId)
      if (filtered.length > 0) {
        return filtered.map(k => typeof k === 'string' ? k : k.kelas).filter(Boolean)
      }
    }
    return session.kelas.map(k => typeof k === 'string' ? k : k.kelas).filter(Boolean)
  }, [session, activeTa])

  // Safeguard: Wali Kelas cannot select outside their assigned class
  useEffect(() => {
    if (!canViewAllClasses && myWaliClasses.length > 0 && selectedKelas) {
      if (!myWaliClasses.includes(selectedKelas)) {
        setSelectedKelas(myWaliClasses[0])
      }
    }
  }, [canViewAllClasses, myWaliClasses, selectedKelas])

  // ─── Dynamic Rapor Settings from Kurikulum / Admin ─────────────────────────
  const [raporSettings, setRaporSettings] = useState({
    status_rapor_pts: 'tutup',
    show_kolom_psts: 'true',
    rapor_max_lingkup: 3,
    rapor_max_tp_per_lingkup: 3,
    metode_hitung_nilai_akhir: 'rata_rata',
    include_karakter_nilai_akhir: 'false'
  })
  const [configAkhirMap, setConfigAkhirMap] = useState({}) // { [mapel_id]: { metode_hitung, bobot_detail, include_karakter, pts_selected_babs } }

  const fetchRaporSettings = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('pengaturan_sekolah')
        .select('setting_key, setting_value')
        .in('setting_key', [
          'status_rapor_pts',
          'show_kolom_psts',
          'rapor_max_lingkup',
          'rapor_max_tp_per_lingkup',
          'metode_hitung_nilai_akhir',
          'include_karakter_nilai_akhir'
        ])
      if (data && data.length > 0) {
        const map = {}
        data.forEach(d => { map[d.setting_key] = d.setting_value })
        setRaporSettings({
          status_rapor_pts: map.status_rapor_pts || 'tutup',
          show_kolom_psts: map.show_kolom_psts !== undefined ? map.show_kolom_psts : 'true',
          rapor_max_lingkup: map.rapor_max_lingkup ? parseInt(map.rapor_max_lingkup, 10) : 3,
          rapor_max_tp_per_lingkup: map.rapor_max_tp_per_lingkup ? parseInt(map.rapor_max_tp_per_lingkup, 10) : 3,
          metode_hitung_nilai_akhir: map.metode_hitung_nilai_akhir || 'rata_rata',
          include_karakter_nilai_akhir: map.include_karakter_nilai_akhir || 'false'
        })
      }
    } catch (err) {
      console.error('Error fetching settings in RaporSiswaSection:', err)
    }
  }, [])

  useEffect(() => {
    fetchRaporSettings()
  }, [fetchRaporSettings])

  // ─── 1. Initialize Master Data (Classes, Semesters, Mapels) ─────────────────
  useEffect(() => {
    const initMaster = async () => {
      setLoading(true)
      try {
        let taId = activeTa?.id
        if (!taId) {
          const { data: taData } = await supabase.from('tahun_ajaran').select('id, nama').eq('is_aktif', true).maybeSingle()
          taId = taData?.id
        }

        // 1. Fetch Semesters
        let semQuery = supabase.from('semester').select('*').order('nomor')
        if (taId) semQuery = semQuery.eq('tahun_ajaran_id', taId)
        const { data: semData } = await semQuery
        if (semData && semData.length > 0) {
          setSemesters(semData)
          const aktif = getSemesterAktif(semData) || semData[0]
          setSelectedSemesterId(aktif.id)
        }

        // 2. Fetch Mata Pelajaran
        const { data: mapelData } = await supabase.from('mata_pelajaran').select('id, nama, singkatan').order('nama')
        if (mapelData && mapelData.length > 0) {
          const sorted = [...mapelData].sort((a, b) => {
            const nameA = (a.nama || '').toLowerCase()
            const nameB = (b.nama || '').toLowerCase()
            let idxA = CANONICAL_MAPEL_ORDER.findIndex(k => nameA.includes(k))
            let idxB = CANONICAL_MAPEL_ORDER.findIndex(k => nameB.includes(k))
            if (idxA === -1) idxA = 999
            if (idxB === -1) idxB = 999
            if (idxA !== idxB) return idxA - idxB
            return nameA.localeCompare(nameB)
          })
          const officialOnly = sorted.filter(m => {
            const name = (m.nama || '').toLowerCase()
            return OFFICIAL_REPORT_MAPELS.some(k => name.includes(k))
          })
          setMapels(officialOnly)
        }

        // 3. Fetch Classes from siswa_lengkap
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
          let finalClasses = unique
          if (!canViewAllClasses && myWaliClasses.length > 0) {
            const matched = unique.filter(c => myWaliClasses.includes(c))
            finalClasses = matched.length > 0 ? matched : myWaliClasses
          }

          setAllKelasList(finalClasses)

          const matchedWaliClass = myWaliClasses.find(c => finalClasses.includes(c))
          const defaultClass = matchedWaliClass || finalClasses[0] || (unique.includes('9A') ? '9A' : (unique.includes('7A') ? '7A' : unique[0]))
          setSelectedKelas(defaultClass)
        }
      } catch (err) {
        console.error('Error init master rapor:', err)
      } finally {
        setLoading(false)
      }
    }
    initMaster()
  }, [activeTa?.id, canViewAllClasses, myWaliClasses])

  // ─── 2. Fetch Class Data (Students, Biodata, Guru Mapel, Grades, Attendance, Ekskul) ─
  const fetchClassReportData = useCallback(async (isSilent = false) => {
    if (!selectedKelas || !selectedSemesterId) return
    if (!isSilent) setLoading(true)

    try {
      const taId = activeTa?.id

      // 1. Fetch Students from siswa_lengkap
      let stdQuery = supabase.from('siswa_lengkap')
        .select('nisn, nipd, nama_lengkap, kelas')
        .eq('kelas', selectedKelas)
      if (taId) stdQuery = stdQuery.eq('tahun_ajaran_id', taId)
      let { data: stdData } = await stdQuery.order('nama_lengkap', { ascending: true })

      if (!stdData || stdData.length === 0) {
        const { data: fbStds } = await supabase.from('siswa_lengkap')
          .select('nisn, nipd, nama_lengkap, kelas')
          .eq('kelas', selectedKelas)
          .order('nama_lengkap', { ascending: true })
        stdData = fbStds || []
      }

      const nisnList = (stdData || []).map(s => String(s.nisn))

      // 2. Fetch Supplementary Biodata from siswa_permanent
      let permMap = {}
      if (nisnList.length > 0) {
        const { data: permData } = await supabase.from('siswa_permanent')
          .select('nisn, tempat_lahir, tanggal_lahir, nipd')
          .in('nisn', nisnList)
        ;(permData || []).forEach(p => {
          permMap[String(p.nisn)] = p
        })
      }

      const fullStudents = (stdData || []).map(s => {
        const perm = permMap[String(s.nisn)] || {}
        return {
          ...s,
          tempat_lahir: perm.tempat_lahir || '',
          tanggal_lahir: perm.tanggal_lahir || '',
          nipd: s.nipd || perm.nipd || ''
        }
      })
      setStudents(fullStudents)

      if (fullStudents.length > 0 && !selectedNisn) {
        setSelectedNisn(String(fullStudents[0].nisn))
      }

      // 3. Fetch Wali Kelas for this class & TA
      let wkQuery = supabase.from('guru_kelas')
        .select('guru_id, kelas, guru(id, nama_guru, kode)')
        .eq('kelas', selectedKelas)
      if (taId) wkQuery = wkQuery.eq('tahun_ajaran_id', taId)
      const { data: wkData } = await wkQuery.maybeSingle()

      const namaWali = wkData?.guru?.nama_guru || ''
      setWaliKelasInfo(namaWali)
      setWaliKelasCustom(namaWali)

      // 4. Fetch Guru Pengampu for each mapel in this class (flexible class matching)
      let gmQuery = supabase.from('guru_mapel')
        .select('guru_id, kelas, mata_pelajaran_id, guru(id, nama_guru, kode)')
      if (taId) gmQuery = gmQuery.or(`tahun_ajaran_id.eq.${taId},tahun_ajaran_id.is.null`)
      const { data: gmData } = await gmQuery
      const matchedGm = (gmData || []).filter(g => isClassMatch(g.kelas, selectedKelas))
      setGuruMapelList(matchedGm)

      // 5. Fetch Nilai Komponen with pagination (prevents 1000-row PostgREST truncation!)
      let allKData = []
      let kPage = 0
      const kPageSize = 1000
      let kHasMore = true
      while (kHasMore) {
        let kompQuery = supabase.from('nilai_komponen')
          .select('*')
          .range(kPage * kPageSize, (kPage + 1) * kPageSize - 1)
          .order('urutan', { ascending: true })
        if (taId) {
          kompQuery = kompQuery.or(`tahun_ajaran_id.eq.${taId},tahun_ajaran_id.is.null`)
        }
        const { data: pageData, error } = await kompQuery
        if (error) {
          console.error('Error fetching nilai_komponen page:', error)
          break
        }
        if (pageData && pageData.length > 0) {
          allKData.push(...pageData)
          if (pageData.length < kPageSize) kHasMore = false
          else kPage++
        } else {
          kHasMore = false
        }
      }

      if (allKData.length === 0) {
        let fbPage = 0
        let fbHasMore = true
        while (fbHasMore) {
          const { data: fbData, error } = await supabase.from('nilai_komponen')
            .select('*')
            .range(fbPage * kPageSize, (fbPage + 1) * kPageSize - 1)
            .order('urutan', { ascending: true })
          if (error) break
          if (fbData && fbData.length > 0) {
            allKData.push(...fbData)
            if (fbData.length < kPageSize) fbHasMore = false
            else fbPage++
          } else {
            fbHasMore = false
          }
        }
      }

      // Deduplicate components by ID
      const uniqueKompsMap = new Map()
      allKData.forEach(k => {
        if (k && k.id) uniqueKompsMap.set(k.id, k)
      })
      const uniqueKomps = Array.from(uniqueKompsMap.values())

      const validKomps = uniqueKomps.filter(k => {
        // Exclude only if component explicitly belongs to a different semester
        if (k.semester_id && selectedSemesterId && String(k.semester_id) !== String(selectedSemesterId)) {
          return false
        }
        // Match class flexibly (target_kelas or kelas)
        return isClassMatch(k.target_kelas, selectedKelas) || isClassMatch(k.kelas, selectedKelas)
      })
      setKomponenList(validKomps)

      // 6. Fetch Nilai Siswa for all students in this class
      const kompIds = validKomps.map(k => k.id)
      if (kompIds.length > 0 && nisnList.length > 0) {
        // Prepare NISN list supporting both with & without leading zeroes
        const queryNisnList = [...new Set(nisnList.flatMap(n => {
          const str = String(n || '').trim()
          if (!str) return []
          const noZero = str.replace(/^0+/, '')
          return [str, noZero, noZero ? '0' + noZero : ''].filter(Boolean)
        }))]

        // Keep chunkSize <= 25 so total rows per request (25 * numStudents) never exceeds PostgREST's 1000 limit
        const chunkSize = 25
        let allNData = []
        for (let i = 0; i < kompIds.length; i += chunkSize) {
          const chunkIds = kompIds.slice(i, i + chunkSize)
          let page = 0
          const pageSize = 1000
          let hasMore = true
          while (hasMore) {
            const { data: nData, error } = await supabase.from('nilai_siswa')
              .select('komponen_id, siswa_nisn, nilai')
              .in('komponen_id', chunkIds)
              .in('siswa_nisn', queryNisnList)
              .range(page * pageSize, (page + 1) * pageSize - 1)
            if (error) {
              console.error('Error fetching nilai_siswa chunk:', error)
              break
            }
            if (nData && nData.length > 0) {
              allNData.push(...nData)
              if (nData.length < pageSize) hasMore = false
              else page++
            } else {
              hasMore = false
            }
          }
        }

        const map = {}
        allNData.forEach(n => {
          if (!map[n.komponen_id]) map[n.komponen_id] = {}
          const sNisn = String(n.siswa_nisn ?? '').trim()
          map[n.komponen_id][sNisn] = n.nilai
          const noZero = sNisn.replace(/^0+/, '')
          if (noZero) {
            map[n.komponen_id][noZero] = n.nilai
            map[n.komponen_id]['0' + noZero] = n.nilai
          }
        })
        setNilaiMap(map)
      } else {
        setNilaiMap({})
      }

      // 7. Fetch Presensi Siswa (Sakit, Izin, Alpa) for this class
      if (nisnList.length > 0) {
        const queryNisnList = [...new Set(nisnList.flatMap(n => {
          const str = String(n || '').trim()
          if (!str) return []
          const noZero = str.replace(/^0+/, '')
          return [str, noZero, noZero ? '0' + noZero : ''].filter(Boolean)
        }))]

        // Menentukan rentang tanggal presensi semester
        // Semester 1 (Ganjil) dihitung mulai 1 Juli tahun ajaran berjalan
        const curSem = (semesters || []).find(s => s.id === selectedSemesterId)
        const taNama = activeTa?.nama || ''
        const taStartYear = taNama.split('/')[0]?.trim() || new Date().getFullYear().toString()
        const taEndYear = taNama.split('/')[1]?.trim() || (parseInt(taStartYear, 10) + 1).toString()

        let startDate = `${taStartYear}-07-01`
        let endDate = curSem?.tanggal_selesai || `${taStartYear}-12-31`

        if (curSem?.nomor === 2) {
          // Semester 2 (Genap)
          startDate = curSem.tanggal_mulai || `${taEndYear}-01-01`
          endDate = curSem.tanggal_selesai || `${taEndYear}-06-30`
        }

        // Ambil data presensi khusus status Sakit (S), Izin (I), dan Alpa (A) dengan pagination
        let allPresData = []
        let pPage = 0
        const pPageSize = 1000
        let pHasMore = true

        while (pHasMore) {
          let presQuery = supabase.from('presensi_harian')
            .select('siswa_nisn, tanggal, status, tipe')
            .in('siswa_nisn', queryNisnList)
            .gte('tanggal', startDate)
            .in('status', ['S', 'I', 'A', 's', 'i', 'a'])
            .range(pPage * pPageSize, (pPage + 1) * pPageSize - 1)
            .order('tanggal', { ascending: true })

          if (endDate) {
            presQuery = presQuery.lte('tanggal', endDate)
          }

          const { data: pageData, error: presErr } = await presQuery
          if (presErr) {
            console.error('Error fetching presensi_harian for report:', presErr)
            break
          }

          if (pageData && pageData.length > 0) {
            allPresData.push(...pageData)
            if (pageData.length < pPageSize) pHasMore = false
            else pPage++
          } else {
            pHasMore = false
          }
        }

        const attMap = {}
        nisnList.forEach(n => { attMap[n] = { sakit: 0, izin: 0, alpa: 0 } })

        // Deduplikasi per tanggal: 1 hari dihitung 1 kali per siswa (mencegah double count masuk & pulang)
        const seenDay = new Set()
        allPresData.forEach(p => {
          const sNisn = String(p.siswa_nisn ?? '').trim()
          const matchedKey = nisnList.find(n => n === sNisn || n.replace(/^0+/, '') === sNisn.replace(/^0+/, '')) || sNisn
          if (!attMap[matchedKey]) attMap[matchedKey] = { sakit: 0, izin: 0, alpa: 0 }

          const dayKey = `${matchedKey}_${p.tanggal}`
          if (seenDay.has(dayKey)) return
          seenDay.add(dayKey)

          const s = String(p.status || '').trim().toUpperCase()
          if (s === 'S' || s.includes('SAKIT')) {
            attMap[matchedKey].sakit++
          } else if (s === 'I' || s.includes('IZIN')) {
            attMap[matchedKey].izin++
          } else if (s === 'A' || s.includes('ALPA') || s.includes('TANPA')) {
            attMap[matchedKey].alpa++
          }
        })
        setAttendanceMap(attMap)
      } else {
        setAttendanceMap({})
      }

      // 8. Fetch Ekstrakurikuler Data for this Class
      const ekskuls = await getNilaiEkskulKelas(selectedKelas, selectedSemesterId, taId)
      setEkskulMap(ekskuls || {})

      // 9. Fetch Nilai Akhir Config (PTS selection & bobot) for this Class & Rombel (per guru pengampu)
      const targetRombel = selectedKelas ? selectedKelas.replace(/\D/g, '') : ''
      let { data: cfgData } = await supabase
        .from('nilai_akhir_config')
        .select('*')
        .eq('semester_id', selectedSemesterId)
      
      if (taId) {
        cfgData = (cfgData || []).filter(c => !c.tahun_ajaran_id || c.tahun_ajaran_id === taId)
      }

      // Map assigned teacher for each mapel in this class
      const assignedGuruByMapel = {}
      ;(gmData || []).forEach(gm => {
        if (gm.mata_pelajaran_id) {
          assignedGuruByMapel[gm.mata_pelajaran_id] = gm.guru_id
        }
      })

      const cfgMap = {}
      // Pass 1: populate from any class in the same rombel taught by the SAME assigned teacher
      ;(cfgData || []).forEach(c => {
        const assignedGuruId = assignedGuruByMapel[c.mata_pelajaran_id]
        const isSameTeacher = !assignedGuruId || !c.guru_id || c.guru_id === assignedGuruId
        if (isSameTeacher && c.kelas && targetRombel && c.kelas.replace(/\D/g, '') === targetRombel) {
          if (!cfgMap[c.mata_pelajaran_id]) {
            cfgMap[c.mata_pelajaran_id] = {
              metode_hitung: c.metode_hitung,
              bobot_detail: c.bobot_detail || {},
              include_karakter: c.bobot_detail?.include_karakter,
              pts_selected_babs: c.pts_selected_babs || c.bobot_detail?.pts_selected_babs || []
            }
          }
        }
      })
      // Pass 2: exact class match for the assigned teacher takes precedence
      ;(cfgData || []).forEach(c => {
        const assignedGuruId = assignedGuruByMapel[c.mata_pelajaran_id]
        const isSameTeacher = !assignedGuruId || !c.guru_id || c.guru_id === assignedGuruId
        if (isSameTeacher && c.kelas === selectedKelas) {
          cfgMap[c.mata_pelajaran_id] = {
            metode_hitung: c.metode_hitung || cfgMap[c.mata_pelajaran_id]?.metode_hitung,
            bobot_detail: {
              ...(cfgMap[c.mata_pelajaran_id]?.bobot_detail || {}),
              ...(c.bobot_detail || {})
            },
            include_karakter: c.bobot_detail?.include_karakter ?? cfgMap[c.mata_pelajaran_id]?.include_karakter,
            pts_selected_babs: c.pts_selected_babs || c.bobot_detail?.pts_selected_babs || cfgMap[c.mata_pelajaran_id]?.pts_selected_babs || []
          }
        }
      })
      setConfigAkhirMap(cfgMap)

    } catch (err) {
      console.error('Error fetching class report data:', err)
    } finally {
      if (!isSilent) setLoading(false)
    }
  }, [selectedKelas, selectedSemesterId, activeTa?.id])

  useEffect(() => {
    fetchClassReportData()
  }, [fetchClassReportData])

  // ─── Realtime Subscriptions & Window Focus Sync (Always in sync with Input Nilai Guru & Kurikulum) ───
  useEffect(() => {
    if (!selectedKelas || !selectedSemesterId) return

    const triggerSilentRefresh = () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
      refreshTimeoutRef.current = setTimeout(() => {
        fetchRaporSettings()
        fetchClassReportData(true)
        setRealtimeToast('Nilai & konfigurasi rapor baru saja tersinkronisasi!')
        setTimeout(() => setRealtimeToast(null), 3500)
      }, 500)
    }

    // 1. Supabase Realtime Channel for live grade/component/config changes
    const channel = supabase
      .channel(`rapor-live-${selectedKelas}-${selectedSemesterId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nilai_siswa' }, triggerSilentRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nilai_komponen' }, triggerSilentRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nilai_akhir_config' }, triggerSilentRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pengaturan_sekolah' }, () => {
        fetchRaporSettings()
        triggerSilentRefresh()
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') setRealtimeConnected(true)
        else setRealtimeConnected(false)
      })

    // 2. Custom Event from NilaiGuruSection / LegerNilaiKurikulumSection
    const handleCustomSync = () => triggerSilentRefresh()
    window.addEventListener('ebudimulia:nilai_updated', handleCustomSync)

    // 3. Window Focus Sync (ketika guru/kurikulum kembali dari tab/window lain)
    const handleFocus = () => {
      fetchRaporSettings()
      fetchClassReportData(true)
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('ebudimulia:nilai_updated', handleCustomSync)
      window.removeEventListener('focus', handleFocus)
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
    }
  }, [selectedKelas, selectedSemesterId, fetchClassReportData, fetchRaporSettings])

  // ─── Computed Semester & Title Info ─────────────────────────────────────────
  const activeSemester = useMemo(() => {
    return semesters.find(s => s.id === selectedSemesterId) || semesters[0]
  }, [semesters, selectedSemesterId])

  const semesterNumber = activeSemester?.nomor || 1
  const isSemesterGanjil = semesterNumber % 2 !== 0

  const semesterText = isSemesterGanjil
    ? `${semesterNumber === 1 ? 'I' : semesterNumber} (Ganjil)`
    : `${semesterNumber === 2 ? 'II' : semesterNumber} (Genap)`

  const tipeRaportJudul = tipeRaport === 'tengah'
    ? `TENGAH SEMESTER ${semesterNumber}`
    : `AKHIR SEMESTER ${semesterNumber}`

  // ─── 3-Color Conditional Grade Formatter Helper ─────────────────────────────
  // Kuning: numVal < KKM (75) && numVal > 0 -> Perlu perbaikan
  // Merah:  numVal === 0 -> Belum dikerjakan
  // Strip:  '-' -> Guru belum input nilai / tidak ada TP
  const renderGradeCell = (val, isBold = false, extraClasses = '') => {
    if (val === '-' || val === '' || val === null || val === undefined) {
      return (
        <td className={`border-r border-slate-200 py-1 text-slate-400 font-normal text-center ${extraClasses}`}>
          -
        </td>
      )
    }

    const num = Number(val)
    if (isNaN(num)) {
      return (
        <td className={`border-r border-slate-200 py-1 text-slate-700 text-center ${extraClasses}`}>
          {val}
        </td>
      )
    }

    // 1. Merah jika belum dikerjakan / nilai 0
    if (num === 0) {
      return (
        <td
          className={`border-r border-slate-200 py-1 font-bold text-center ${extraClasses}`}
          style={{
            backgroundColor: '#fee2e2',
            color: '#b91c1c',
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact'
          }}
          title="Belum dikerjakan (0)"
        >
          0
        </td>
      )
    }

    // 2. Kuning jika butuh perbaikan / di bawah KKM (< 75)
    if (num < kktpValue) {
      return (
        <td
          className={`border-r border-slate-200 py-1 font-bold text-center ${extraClasses}`}
          style={{
            backgroundColor: '#fef3c7',
            color: '#92400e',
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact'
          }}
          title={`Perlu bimbingan / perbaikan (< ${kktpValue})`}
        >
          {num}
        </td>
      )
    }

    // 3. Standar / Normal (>= 75)
    return (
      <td className={`border-r border-slate-200 py-1 text-center text-slate-900 ${isBold ? 'font-bold' : 'font-medium'} ${extraClasses}`}>
        {num}
      </td>
    )
  }

  // ─── Compute Student Grades Matrix ──────────────────────────────────────────
  const computeStudentGrades = useCallback((studentNisn) => {
    if (!studentNisn) return []

    // Helper to retrieve score safely regardless of leading zero format
    const getScore = (kompId, nisn) => {
      if (!kompId || !nisn || !nilaiMap[kompId]) return undefined
      const s = String(nisn).trim()
      if (nilaiMap[kompId][s] !== undefined && nilaiMap[kompId][s] !== null && nilaiMap[kompId][s] !== '') return nilaiMap[kompId][s]
      const noZero = s.replace(/^0+/, '')
      if (noZero && nilaiMap[kompId][noZero] !== undefined && nilaiMap[kompId][noZero] !== null && nilaiMap[kompId][noZero] !== '') return nilaiMap[kompId][noZero]
      if (noZero && nilaiMap[kompId]['0' + noZero] !== undefined && nilaiMap[kompId]['0' + noZero] !== null && nilaiMap[kompId]['0' + noZero] !== '') return nilaiMap[kompId]['0' + noZero]
      return undefined
    }

    const subjectCards = mapels.map((m, idx) => {
      // 1. Find teacher assigned to this mapel in this class
      const gm = guruMapelList.find(g => g.mata_pelajaran_id === m.id)
      const assignedGuruId = gm?.guru_id

      // 2. Filter components for this mapel (and teacher if assigned)
      let mKomps = komponenList.filter(k => k.mata_pelajaran_id === m.id)
      if (assignedGuruId) {
        const teacherKomps = mKomps.filter(k => k.guru_id === assignedGuruId)
        if (teacherKomps.length > 0) {
          // Prioritize teacher's components. Only allow non-teacher components if they are
          // shared sumatif (PSTS/PSAS) or Nilai Karakter (if the teacher hasn't created their own).
          // Do NOT pull foreign regular TP components into the assigned teacher's curriculum.
          const teacherHasNk = teacherKomps.some(k => isKarakterKomponen(k.nama, k.deskripsi))
          const nonTeacherKomps = mKomps.filter(k => k.guru_id !== assignedGuruId)
          const extraKomps = nonTeacherKomps.filter(k => {
            const b = (k.bab_nama || '').toLowerCase()
            const n = (k.nama || '').toLowerCase()
            const isPsts = b.includes('psts') || n.includes('psts') || b.includes('pts') || n.includes('pts')
            const isPsas = b.startsWith('psas') || b.startsWith('psat') || n.includes('psas') || n.includes('psat')
            const isNk = !teacherHasNk && isKarakterKomponen(k.nama, k.deskripsi)
            return isPsts || isPsas || isNk
          })
          mKomps = [...teacherKomps, ...extraKomps]
        }
      }

      // 3. Find PSTS (Penilaian Sumatif Tengah Semester) Score
      let pstsVal = '-'
      const targetPstsBab = semesterNumber === 2 ? 'psts 2' : 'psts 1'
      // Cari komponen PSTS yang memiliki nilai nyata untuk siswa ini terlebih dahulu
      let pstsKomp = mKomps.find(k => {
        const b = (k.bab_nama || '').toLowerCase()
        const n = (k.nama || '').toLowerCase()
        const isZombie = (b === 'psts' && n === 'nilai psts') || b === 'psas/psat'
        if (isZombie) return false
        const isMatch = b === targetPstsBab || b.includes('psts') || n.includes('psts')
        return isMatch && getScore(k.id, studentNisn) !== undefined
      })
      // Fallback ke komponen canonical target semester
      if (!pstsKomp) {
        pstsKomp = mKomps.find(k => {
          const b = (k.bab_nama || '').toLowerCase()
          return b === targetPstsBab
        })
      }
      // Fallback ke komponen PSTS non-zombie apapun
      if (!pstsKomp) {
        pstsKomp = mKomps.find(k => {
          const n = (k.nama || '').toLowerCase()
          const b = (k.bab_nama || '').toLowerCase()
          const isZombie = (b === 'psts' && n === 'nilai psts') || b === 'psas/psat'
          if (isZombie) return false
          return n.includes('psts') || n.includes('pts') || n.includes('sts') || n.includes('sumatif tengah') ||
                 b.includes('psts') || b.includes('pts') || b.includes('sts') || b.includes('sumatif tengah')
        })
      }
      if (pstsKomp) {
        const rawPsts = getScore(pstsKomp.id, studentNisn)
        if (rawPsts !== undefined && rawPsts !== null && rawPsts !== '') {
          const numP = Number(rawPsts)
          if (!isNaN(numP)) pstsVal = Math.round(numP)
        }
      }

      // 4. Group components into Lingkup Materi (exclude PSTS/PTS/PSAS)
      let regularBabs = [...new Set(
        mKomps
          .filter(k => {
            const b = (k.bab_nama || '').toLowerCase()
            const n = (k.nama || '').toLowerCase()
            return !b.startsWith('psas') &&
                   !b.startsWith('psat') &&
                   !b.startsWith('penilaian sumatif akhir') &&
                   !b.includes('psts') &&
                   !b.includes('pts') &&
                   !b.includes('sts') &&
                   !b.includes('sumatif tengah') &&
                   !n.includes('psts') &&
                   !n.includes('psas') &&
                   !isKarakterKomponen(k.nama, k.deskripsi)
          })
          .map(k => k.bab_nama || 'BAB 1')
      )].sort((a, b) => {
        // Sort by minimum urutan of components in that BAB (preserves teacher's intended sequence!)
        const kompsA = mKomps.filter(k => (k.bab_nama || 'BAB 1') === a)
        const kompsB = mKomps.filter(k => (k.bab_nama || 'BAB 1') === b)
        const minUrutanA = kompsA.length > 0 ? Math.min(...kompsA.map(k => typeof k.urutan === 'number' ? k.urutan : 999)) : 999
        const minUrutanB = kompsB.length > 0 ? Math.min(...kompsB.map(k => typeof k.urutan === 'number' ? k.urutan : 999)) : 999
        if (minUrutanA !== minUrutanB) return minUrutanA - minUrutanB

        const numA = parseInt(a.replace(/\D/g, '') || '0', 10)
        const numB = parseInt(b.replace(/\D/g, '') || '0', 10)
        if (numA !== numB && numA > 0 && numB > 0) return numA - numB
        return a.localeCompare(b)
      })

      if (regularBabs.length === 0) {
        regularBabs = [...new Set(mKomps.map(k => k.bab_nama || 'BAB 1'))].filter(b => {
          const lower = b.toLowerCase()
          return !lower.includes('psts') && !lower.includes('psas')
        })
      }

      let babNames = regularBabs

      // Dynamic limits from settings
      const maxLingkup = Math.max(1, raporSettings.rapor_max_lingkup || 3)
      const maxTp = Math.max(1, raporSettings.rapor_max_tp_per_lingkup || 3)

      // If Rapor PTS is active or viewing PTS, and teacher has selected BABs for PTS:
      const teacherPtsBabs = configAkhirMap[m.id]?.pts_selected_babs
      if ((tipeRaport === 'tengah' || raporSettings.status_rapor_pts === 'buka') && Array.isArray(teacherPtsBabs) && teacherPtsBabs.length > 0) {
        const filtered = babNames.filter(b => teacherPtsBabs.some(t => normalizeBab(t) === normalizeBab(b)))
        if (filtered.length > 0) {
          // If filtered has fewer BABs than maxLingkup, also include any regular BAB that this student has scores for!
          const scoredOtherBabs = regularBabs.filter(b => 
            !filtered.some(f => normalizeBab(f) === normalizeBab(b)) &&
            mKomps.some(k => normalizeBab(k.bab_nama) === normalizeBab(b) && getScore(k.id, studentNisn) !== undefined)
          )
          babNames = [...filtered, ...scoredOtherBabs].slice(0, maxLingkup)
        }
      }

      // Configuration for this subject (overridden per mapel/guru/class, or fallback to general raporSettings)
      const subjectConfig = configAkhirMap[m.id] || {}
      const isBobotManual = subjectConfig.metode_hitung === 'bobot_manual'
      const metodeHitung = isBobotManual ? 'bobot_manual' : (raporSettings.metode_hitung_nilai_akhir || subjectConfig.metode_hitung || 'rata_rata')
      const includeKarakter = isBobotManual && subjectConfig.include_karakter !== undefined
        ? Boolean(subjectConfig.include_karakter)
        : (raporSettings.include_karakter_nilai_akhir === 'true')

      // Collect all character/NK components for this mapel
      const allMapelKarakterKomps = mKomps
        .filter(k => isKarakterKomponen(k.nama, k.deskripsi))
        .sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0))

      const lingkupList = Array.from({ length: maxLingkup }, (_, lIdx) => {
        const bName = babNames[lIdx]
        if (!bName) {
          // If no babName for this Lingkup, check if there is an NK component for this index
          const fallbackNk = allMapelKarakterKomps[lIdx]
          let fallbackNkVal = '-'
          if (fallbackNk) {
            const rawVal = getScore(fallbackNk.id, studentNisn)
            if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
              const parsed = Number(rawVal)
              if (!isNaN(parsed)) fallbackNkVal = Math.round(parsed)
            }
          }
          return {
            bName: `Lingkup Materi ${lIdx + 1}`,
            tps: Array(maxTp).fill('-'),
            tp1: '-', tp2: '-', tp3: '-', tp4: '-',
            nk: fallbackNkVal,
            avg: (includeKarakter && fallbackNkVal !== '-') ? fallbackNkVal : '-',
            desc: '-'
          }
        }

        const bKomps = mKomps.filter(k => normalizeBab(k.bab_nama) === normalizeBab(bName))
        let tps = Array(maxTp).fill('-')
        let nk = '-'
        let validScores = []

        const regularTpKomps = bKomps.filter(k => !isKarakterKomponen(k.nama, k.deskripsi)).sort((a, b) => {
          const numA = parseInt((a.nama || '').replace(/\D/g, '') || '0', 10)
          const numB = parseInt((b.nama || '').replace(/\D/g, '') || '0', 10)
          if (numA !== numB) return numA - numB
          return (a.urutan ?? 0) - (b.urutan ?? 0)
        })

        // Find NK component and score for this bab:
        // Collect all character components in this BAB
        const babKarKomps = bKomps.filter(k => isKarakterKomponen(k.nama, k.deskripsi))
        
        // Priority 1: Pick the character component in this BAB that HAS A SCORE for this student!
        let nkKomp = babKarKomps.find(k => {
          const score = getScore(k.id, studentNisn)
          return score !== undefined && score !== null && score !== ''
        })
        
        // Priority 2: Pick the character component in this BAB that has scores for ANY student in this class
        if (!nkKomp) {
          nkKomp = babKarKomps.find(k => nilaiMap[k.id] && Object.values(nilaiMap[k.id]).some(v => v !== undefined && v !== null && v !== ''))
        }
        
        // Priority 3: Pick the character component in this BAB that has description (indikator terkonfigurasi)
        if (!nkKomp) {
          nkKomp = babKarKomps.find(k => k.deskripsi && k.deskripsi.trim())
        }
        
        // Priority 4: Any character component in this BAB
        if (!nkKomp) {
          nkKomp = babKarKomps[0]
        }
        
        // Priority 5: Karakter component matching BAB name across mapel (prioritizing scored ones)
        if (!nkKomp) {
          const crossBab = allMapelKarakterKomps.filter(k => normalizeBab(k.bab_nama) === normalizeBab(bName))
          nkKomp = crossBab.find(k => {
            const score = getScore(k.id, studentNisn)
            return score !== undefined && score !== null && score !== ''
          }) || crossBab[0]
        }
        
        // Priority 6: By index
        if (!nkKomp && allMapelKarakterKomps.length > 0) {
          nkKomp = allMapelKarakterKomps[lIdx] || allMapelKarakterKomps[0]
        }

        // Get the score from the chosen component, or ANY matching character component in this BAB
        let rawVal = nkKomp ? getScore(nkKomp.id, studentNisn) : undefined
        if (rawVal === undefined || rawVal === null || rawVal === '') {
          for (const bk of babKarKomps) {
            const v = getScore(bk.id, studentNisn)
            if (v !== undefined && v !== null && v !== '') {
              rawVal = v
              nkKomp = bk
              break
            }
          }
        }

        if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
          const parsed = Number(rawVal)
          if (!isNaN(parsed)) {
            nk = Math.round(parsed)
            if (includeKarakter) {
              validScores.push(nk)
            }
          }
        }

        regularTpKomps.slice(0, maxTp).forEach((k, tIdx) => {
          const rawVal = getScore(k.id, studentNisn)
          if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
            const parsed = Number(rawVal)
            if (!isNaN(parsed)) {
              const val = Math.round(parsed)
              tps[tIdx] = val
              validScores.push(val)
            }
          }
        })

        // Rata-rata Lingkup
        const avg = validScores.length > 0
          ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
          : '-'

        // Kurikulum Merdeka merged narrative
        const tpObjectsForDesc = regularTpKomps.map(k => ({
          nama: k.nama,
          deskripsi: k.deskripsi,
          nilai: getScore(k.id, studentNisn) !== undefined && getScore(k.id, studentNisn) !== null && getScore(k.id, studentNisn) !== ''
            ? Number(getScore(k.id, studentNisn))
            : null
        }))
        const desc = generateDeskripsiKurikulumMerdeka(tpObjectsForDesc, kktpValue, bName)

        return {
          bName,
          tps,
          tp1: tps[0] ?? '-',
          tp2: tps[1] ?? '-',
          tp3: tps[2] ?? '-',
          tp4: tps[3] ?? '-',
          nk,
          avg,
          desc
        }
      })

      // Calculate Rerata Nilai across Lingkup + PSTS sesuai metode perhitungan kurikulum / admin
      const showPsts = raporSettings.show_kolom_psts !== 'false'
      const validAvgs = lingkupList.map(l => l.avg).filter(a => a !== '-' && !isNaN(a))
      const hasPsts = showPsts && pstsVal !== '-' && pstsVal !== '' && pstsVal !== null && pstsVal !== undefined && !isNaN(pstsVal)

      let rerataNilai = '-'

      if (metodeHitung === 'rata_rata_langsung') {
        // METODE 1: Rata-rata langsung seluruh item nilai individual (tanpa diratakan per bab)
        const allIndividualScores = []
        lingkupList.forEach(l => {
          l.tps.forEach(t => {
            if (t !== '-' && t !== '' && t !== null && t !== undefined && !isNaN(t)) {
              allIndividualScores.push(Number(t))
            }
          })
          if (includeKarakter && l.nk !== '-' && l.nk !== '' && l.nk !== null && l.nk !== undefined && !isNaN(l.nk)) {
            allIndividualScores.push(Number(l.nk))
          }
        })
        if (hasPsts) {
          allIndividualScores.push(Number(pstsVal))
        }

        if (allIndividualScores.length > 0) {
          rerataNilai = Math.round(allIndividualScores.reduce((a, b) => a + b, 0) / allIndividualScores.length)
        }
      } else if (metodeHitung === 'bobot_manual') {
        // METODE 2: Bobot manual per BAB dan PSTS
        let totalNilaiBobot = 0
        let totalBobot = 0

        lingkupList.forEach(l => {
          if (l.avg !== '-' && !isNaN(l.avg)) {
            const bobot = getBobotForBab(l.bName, subjectConfig.bobot_detail)
            if (bobot > 0) {
              totalNilaiBobot += Number(l.avg) * bobot
              totalBobot += bobot
            }
          }
        })

        if (hasPsts) {
          const bobotPsts = getBobotForPsts(subjectConfig.bobot_detail)
          if (bobotPsts > 0) {
            totalNilaiBobot += Number(pstsVal) * bobotPsts
            totalBobot += bobotPsts
          }
        }

        if (totalBobot > 0) {
          rerataNilai = Math.round(totalNilaiBobot / totalBobot)
        } else {
          // Fallback jika belum diisi bobot
          const scoresForRerata = [...validAvgs]
          if (hasPsts) scoresForRerata.push(Number(pstsVal))
          rerataNilai = scoresForRerata.length > 0
            ? Math.round(scoresForRerata.reduce((a, b) => a + b, 0) / scoresForRerata.length)
            : '-'
        }
      } else {
        // METODE 3: Rata-rata bertingkat per bab + PSTS (default)
        const scoresForRerata = [...validAvgs]
        if (hasPsts) scoresForRerata.push(Number(pstsVal))
        rerataNilai = scoresForRerata.length > 0
          ? Math.round(scoresForRerata.reduce((a, b) => a + b, 0) / scoresForRerata.length)
          : '-'
      }

      return {
        index: idx + 1,
        mapelId: m.id,
        mapelNama: m.nama.trim(),
        singkatan: m.singkatan,
        psts: pstsVal,
        lingkupList,
        lingkup1: lingkupList[0],
        lingkup2: lingkupList[1],
        lingkup3: lingkupList[2],
        rerataNilai
      }
    })

    return subjectCards
  }, [mapels, guruMapelList, komponenList, nilaiMap, raporSettings, configAkhirMap, kktpValue, tipeRaport])

  const currentStudent = useMemo(() => {
    return students.find(s => String(s.nisn) === String(selectedNisn)) || students[0] || null
  }, [students, selectedNisn])

  // ─── Print Handler ──────────────────────────────────────────────────────────
  useEffect(() => {
    const handleAfterPrint = () => {
      setIsBatchMode(false)
    }
    window.addEventListener('afterprint', handleAfterPrint)
    return () => window.removeEventListener('afterprint', handleAfterPrint)
  }, [])

  const handlePrint = (batch = false) => {
    setIsBatchMode(batch)
    setTimeout(() => {
      window.print()
    }, 350)
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: SINGLE REPORT SHEET
  // ════════════════════════════════════════════════════════════════════════════
  const renderReportSheet = (student, pageIndex = 1, totalPages = 1) => {
    if (!student) return null
    const studentGrades = computeStudentGrades(String(student.nisn))
    const attendance = attendanceMap[String(student.nisn)] || { sakit: 0, izin: 0, alpa: 0 }
    const studentEkskul = ekskulMap[String(student.nisn)] || {}

    const studentBirthdate = student.tanggal_lahir ? formatTanggalIndo(student.tanggal_lahir) : '-'
    const studentBirthPlace = student.tempat_lahir || 'Jakarta'

    // Direct URL encoded into QR Code for instant scanning
    const qrUrl = `${getPortalBaseUrl()}/rapor/deskripsi-tp/${student.nisn}?sem=${selectedSemesterId}&ta=${activeTa?.id || ''}`

    return (
      <div
        key={student.nisn}
        className="rapor-page-container relative bg-white mx-auto shadow-md border border-slate-200 rounded-sm print:rounded-none print:shadow-none print:border-none overflow-hidden text-slate-800"
        style={{
          width: '210mm',
          minHeight: '297mm',
          maxHeight: '297mm',
          padding: '7mm 11mm 5mm 11mm',
          boxSizing: 'border-box',
          position: 'relative'
        }}
      >
        {/* ─── Transparent Watermark Logo in Center Background (Clearly Visible) ─ */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-0 overflow-hidden">
          <img
            src="/logo_budimulia_transparent.png"
            alt="Watermark SMP Budi Mulia"
            className="w-[380px] h-[380px] object-contain select-none"
            style={{ width: '380px', height: '380px', opacity: 0.13 }}
            onError={(e) => {
              e.target.onerror = null
              e.target.src = '/logo_budimulia.png'
            }}
          />
        </div>

        {/* 1. Corner Ribbons (Top-Left & Bottom-Right) */}
        <CornerRibbon position="top-left" />
        <CornerRibbon position="bottom-right" />

        {/* 2. Header Area */}
        <div className="relative z-10 flex items-start justify-between mb-0.5">
          {/* Logo & School Name */}
          <div className="flex items-center gap-3 pl-8 sm:pl-10">
            <img
              src="/logo_budimulia_transparent.png"
              alt="Logo SMP Budi Mulia"
              className="w-14 h-14 object-contain shrink-0"
              style={{ width: '52px', height: '52px', maxWidth: '52px', maxHeight: '52px' }}
              onError={(e) => {
                e.target.onerror = null
                e.target.src = '/logo_budimulia.png'
              }}
            />
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#004e85] uppercase leading-none font-serif">
                SMP BUDI MULIA
              </h1>
              <p className="text-xs sm:text-sm font-medium text-slate-700 mt-0.5">
                Jakarta
              </p>
            </div>
          </div>

          {/* Slogan Top Right: "Cerdas Berkualitas" */}
          <div className="text-right leading-none pr-8 sm:pr-10 pt-1">
            <span
              className="block text-2xl sm:text-3xl font-bold italic tracking-wide text-[#004e85]"
              style={{ fontFamily: "'Dancing Script', 'Segoe Script', 'Brush Script MT', cursive, sans-serif" }}
            >
              Cerdas
            </span>
            <span
              className="block text-2xl sm:text-3xl font-bold italic tracking-wide text-[#004e85] relative"
              style={{ fontFamily: "'Dancing Script', 'Segoe Script', 'Brush Script MT', cursive, sans-serif" }}
            >
              Berkualitas
              <span className="block h-[3px] bg-[#d32f2f] rounded-full mt-0.5 w-full"></span>
            </span>
          </div>
        </div>

        {/* 3. Center Report Title (Pulled UP with balanced breathing room) */}
        <div className="text-center -mt-1 mb-2.5 relative z-10">
          <h2 className="text-sm sm:text-base font-black tracking-wider text-[#004e85] uppercase leading-snug">
            LAPORAN HASIL BELAJAR
          </h2>
          <h3 className="text-lg sm:text-xl font-black tracking-wide text-[#004e85] uppercase leading-tight">
            {tipeRaportJudul}
          </h3>
          <div className="flex items-center justify-center gap-3 mt-1">
            <div className="h-[1.5px] bg-[#004e85] w-28"></div>
            <span className="text-[10.5px] font-extrabold tracking-widest text-[#004e85] uppercase">
              TAHUN AJARAN {activeTa?.nama || '2025/2026'}
            </span>
            <div className="h-[1.5px] bg-[#004e85] w-28"></div>
          </div>
        </div>

        {/* 4. Student Biodata Card (Fixed Table Layout for 100% Aligned Colons) */}
        <div className="rounded-xl border border-[#70a6cf] p-2.5 px-4 mb-2 text-[10px] leading-relaxed text-slate-800 bg-white/75 relative z-10 shadow-none">
          <div className="grid grid-cols-2 gap-x-8">
            {/* Left Column Table */}
            <table className="w-full text-[10px] border-collapse">
              <tbody>
                <tr>
                  <td style={{ width: '100px' }} className="font-medium text-slate-700 py-0.5 whitespace-nowrap">
                    Nama Sekolah
                  </td>
                  <td style={{ width: '12px' }} className="text-center text-slate-700 font-bold py-0.5">
                    :
                  </td>
                  <td className="font-bold text-slate-900 py-0.5">
                    SMP BUDI MULIA
                  </td>
                </tr>
                <tr>
                  <td className="font-medium text-slate-700 py-0.5 align-top whitespace-nowrap">
                    Alamat
                  </td>
                  <td className="text-center text-slate-700 font-bold py-0.5 align-top">
                    :
                  </td>
                  <td className="text-slate-800 py-0.5 leading-snug">
                    Jl. Mangga Besar Raya No. 135, Jakarta Pusat
                  </td>
                </tr>
                <tr>
                  <td className="font-medium text-slate-700 py-0.5 whitespace-nowrap">
                    Nama Siswa
                  </td>
                  <td className="text-center text-slate-700 font-bold py-0.5">
                    :
                  </td>
                  <td className="font-bold text-slate-950 uppercase py-0.5">
                    {student.nama_lengkap}
                  </td>
                </tr>
                <tr>
                  <td className="font-medium text-slate-700 py-0.5 whitespace-nowrap">
                    Tempat/Tgl. Lahir
                  </td>
                  <td className="text-center text-slate-700 font-bold py-0.5">
                    :
                  </td>
                  <td className="text-slate-800 py-0.5">
                    {studentBirthPlace} &nbsp;/&nbsp; {studentBirthdate}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Right Column Table */}
            <table className="w-full text-[10px] border-collapse">
              <tbody>
                <tr>
                  <td style={{ width: '90px' }} className="font-medium text-slate-700 py-0.5 whitespace-nowrap">
                    NIS / NISN
                  </td>
                  <td style={{ width: '12px' }} className="text-center text-slate-700 font-bold py-0.5">
                    :
                  </td>
                  <td className="font-semibold text-slate-900 py-0.5">
                    {student.nipd || student.nis || '-'} &nbsp;/&nbsp; {student.nisn}
                  </td>
                </tr>
                <tr>
                  <td className="font-medium text-slate-700 py-0.5 whitespace-nowrap">
                    Kelas
                  </td>
                  <td className="text-center text-slate-700 font-bold py-0.5">
                    :
                  </td>
                  <td className="font-bold text-slate-900 py-0.5">
                    {toRomanClass(student.kelas)}
                  </td>
                </tr>
                <tr>
                  <td className="font-medium text-slate-700 py-0.5 whitespace-nowrap">
                    Semester
                  </td>
                  <td className="text-center text-slate-700 font-bold py-0.5">
                    :
                  </td>
                  <td className="font-semibold text-slate-900 py-0.5">
                    {semesterText}
                  </td>
                </tr>
                <tr>
                  <td className="font-medium text-slate-700 py-0.5 whitespace-nowrap">
                    Tahun Ajaran
                  </td>
                  <td className="text-center text-slate-700 font-bold py-0.5">
                    :
                  </td>
                  <td className="font-semibold text-slate-900 py-0.5">
                    {activeTa?.nama || '2025/2026'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 5. KKTP Label */}
        <div className="text-[10px] font-bold italic text-[#004e85] mb-1 pl-0.5 relative z-10 flex justify-between items-center">
          <span>KKTP Mata Pelajaran : {kktpValue}</span>
          <span className="text-[9px] font-normal text-slate-500 not-italic">
            Skala Nilai 0 - 100
          </span>
        </div>

        {/* 6. Main Grades Matrix Table (Nilai Formatif / Sumatif) */}
        {(() => {
          const maxLingkup = Math.max(1, raporSettings.rapor_max_lingkup || 3)
          const maxTp = Math.max(1, raporSettings.rapor_max_tp_per_lingkup || 3)
          const showPsts = raporSettings.show_kolom_psts !== 'false'

          return (
            <div className="relative z-10 mb-2 border border-slate-300 overflow-hidden bg-white/70">
              <table className="w-full text-center border-collapse text-[9px]">
                <thead>
                  {/* Row 1 Header */}
                  <tr className="bg-[#005088] text-white font-bold leading-tight">
                    <th rowSpan={3} className="w-7 border-r border-b border-white/20 p-1 text-center">
                      No.
                    </th>
                    <th rowSpan={3} className="w-48 border-r border-b border-white/20 p-1 text-center px-1.5">
                      Mata Pelajaran
                    </th>
                    {/* Dedicated PSTS Column (Between Mapel & Lingkup Materi) */}
                    {showPsts && (
                      <th rowSpan={3} className="w-12 border-r border-b border-white/20 p-1 text-center bg-[#004373]">
                        PSTS {semesterNumber}
                      </th>
                    )}
                    <th colSpan={maxLingkup * (maxTp + 2)} className="border-r border-b border-white/20 p-1 text-center font-bold tracking-wide">
                      Nilai (Formatif / Sumatif)
                    </th>
                    <th rowSpan={1} className="w-16 border-b border-white/20 p-1 text-center">
                      Keterangan Penilaian
                    </th>
                  </tr>

                  {/* Row 2 Header: Dynamic Lingkup Materi 1, 2, ... */}
                  <tr className="bg-[#005088] text-white font-bold leading-tight text-[8.5px]">
                    {Array.from({ length: maxLingkup }, (_, lIdx) => (
                      <th key={lIdx} colSpan={maxTp + 2} className="border-r border-b border-white/20 py-1 text-center whitespace-normal break-words leading-tight px-1">
                        Lingkup Materi {lIdx + 1}
                      </th>
                    ))}
                    <th rowSpan={2} className="border-b border-white/20 py-1 text-center text-[8px] leading-tight px-1 bg-[#004373]">
                      Rerata<br />Nilai
                    </th>
                  </tr>

                  {/* Row 3 Header */}
                  <tr className="bg-[#005088] text-white font-bold text-[8px] leading-snug">
                    {Array.from({ length: maxLingkup }, (_, lIdx) => (
                      <React.Fragment key={lIdx}>
                        {Array.from({ length: maxTp }, (_, tIdx) => (
                          <th key={tIdx} className="border-r border-b border-white/20 w-5 py-0.5">TP{tIdx + 1}</th>
                        ))}
                        <th className="border-r border-b border-white/20 w-6 py-0.5 font-extrabold bg-[#004373]">NK</th>
                        <th className="border-r border-b border-white/20 w-7 py-0.5 font-extrabold bg-[#00375f]">Rata²</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200 text-slate-800">
                  {studentGrades.map((row) => (
                    <tr key={row.mapelId} className="hover:bg-slate-50/50 leading-tight">
                      <td className="border-r border-slate-200 py-[2.5px] font-medium">{row.index}</td>
                      <td className="border-r border-slate-200 py-[2.5px] text-left px-1.5 font-medium truncate max-w-[160px]">
                        {row.mapelNama}
                      </td>

                      {/* PSTS */}
                      {showPsts && (
                        renderGradeCell(row.psts, true, 'bg-slate-50/60 font-bold')
                      )}

                      {/* Dynamic Lingkup Columns */}
                      {row.lingkupList.map((lingkup, lIdx) => (
                        <React.Fragment key={lIdx}>
                          {lingkup.tps.map((score, tIdx) => (
                            <React.Fragment key={tIdx}>
                              {renderGradeCell(score)}
                            </React.Fragment>
                          ))}
                          {renderGradeCell(lingkup.nk, true, 'bg-slate-50/50 font-bold')}
                          {renderGradeCell(lingkup.avg, true, 'bg-blue-50/40 font-bold')}
                        </React.Fragment>
                      ))}

                      {/* Rerata Nilai */}
                      {renderGradeCell(row.rerataNilai, true, 'text-[9.5px] bg-slate-100/70 font-extrabold')}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })()}

        {/* 7. Keterangan Nilai Raport: Tabel Terstruktur 3 Kolom Simetris & Rapi Presisi */}
        <div className="relative z-10 border border-slate-300 rounded-md p-1.5 px-2.5 bg-white/85 mb-2 shadow-none text-[8.5px]">
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-200">
            <div className="flex items-center gap-1.5 font-bold text-[#004e85] text-[9px]">
              <IconBarChart />
              <span className="uppercase tracking-wider">Keterangan Nilai Rapor &amp; Singkatan</span>
            </div>
            <div className="text-[7.5px] font-semibold text-slate-500 italic">
              * Kriteria Ketercapaian Tujuan Pembelajaran (KKTP) = {kktpValue}
            </div>
          </div>

          {/* Tabel 3 Kolom Simetris dengan Kolom Badge & Titik Dua Tersendiri */}
          <table className="w-full text-[8.5px] border-collapse leading-tight">
            <tbody>
              <tr>
                {/* Kolom 1: Merah (0) */}
                <td className="w-1/3 py-0.5 pr-2.5 align-middle border-r border-slate-200">
                  <table className="w-full border-collapse">
                    <tbody>
                      <tr>
                        <td style={{ width: '68px' }}>
                          <span className="inline-block w-full py-0.5 rounded text-[8px] font-bold bg-rose-100 text-rose-700 border border-rose-300 text-center shrink-0">
                            Merah (0)
                          </span>
                        </td>
                        <td style={{ width: '12px' }} className="text-center font-bold text-slate-400">:</td>
                        <td className="text-slate-700 whitespace-nowrap">Murid belum mengerjakan asesmen</td>
                      </tr>
                    </tbody>
                  </table>
                </td>

                {/* Kolom 2: Kuning (< 75) */}
                <td className="w-1/3 py-0.5 px-2.5 align-middle border-r border-slate-200">
                  <table className="w-full border-collapse">
                    <tbody>
                      <tr>
                        <td style={{ width: '68px' }}>
                          <span className="inline-block w-full py-0.5 rounded text-[8px] font-bold bg-amber-100 text-amber-800 border border-amber-300 text-center shrink-0">
                            Kuning (&lt; {kktpValue})
                          </span>
                        </td>
                        <td style={{ width: '12px' }} className="text-center font-bold text-slate-400">:</td>
                        <td className="text-slate-700 whitespace-nowrap">Perlu perbaikan / di bawah KKTP</td>
                      </tr>
                    </tbody>
                  </table>
                </td>

                {/* Kolom 3: Strip (-) */}
                <td className="w-1/3 py-0.5 pl-2.5 align-middle">
                  <table className="w-full border-collapse">
                    <tbody>
                      <tr>
                        <td style={{ width: '68px' }}>
                          <span className="inline-block w-full py-0.5 rounded text-[8px] font-bold bg-slate-100 text-slate-600 border border-slate-300 text-center shrink-0">
                            Strip (-)
                          </span>
                        </td>
                        <td style={{ width: '12px' }} className="text-center font-bold text-slate-400">:</td>
                        <td className="text-slate-700 whitespace-nowrap">Belum ada asesmen diinput guru</td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>

              <tr className="border-t border-slate-100">
                {/* Kolom 1: PSTS */}
                <td className="w-1/3 py-0.5 pr-2.5 align-middle border-r border-slate-200">
                  <table className="w-full border-collapse">
                    <tbody>
                      <tr>
                        <td style={{ width: '68px' }}>
                          <span className="inline-block w-full py-0.5 rounded text-[8px] font-bold bg-[#004e85]/10 text-[#004e85] border border-[#004e85]/30 text-center shrink-0">
                            PSTS {semesterNumber}
                          </span>
                        </td>
                        <td style={{ width: '12px' }} className="text-center font-bold text-slate-400">:</td>
                        <td className="text-slate-700 whitespace-nowrap">Sumatif Tengah Semester {semesterNumber}</td>
                      </tr>
                    </tbody>
                  </table>
                </td>

                {/* Kolom 2: TP / NK */}
                <td className="w-1/3 py-0.5 px-2.5 align-middle border-r border-slate-200">
                  <table className="w-full border-collapse">
                    <tbody>
                      <tr>
                        <td style={{ width: '68px' }}>
                          <span className="inline-block w-full py-0.5 rounded text-[8px] font-bold bg-[#004e85]/10 text-[#004e85] border border-[#004e85]/30 text-center shrink-0">
                            TP / NK
                          </span>
                        </td>
                        <td style={{ width: '12px' }} className="text-center font-bold text-slate-400">:</td>
                        <td className="text-slate-700 whitespace-nowrap">Capaian TP &amp; Nilai Karakter</td>
                      </tr>
                    </tbody>
                  </table>
                </td>

                {/* Kolom 3: Rata² */}
                <td className="w-1/3 py-0.5 pl-2.5 align-middle">
                  <table className="w-full border-collapse">
                    <tbody>
                      <tr>
                        <td style={{ width: '68px' }}>
                          <span className="inline-block w-full py-0.5 rounded text-[8px] font-bold bg-[#004e85]/10 text-[#004e85] border border-[#004e85]/30 text-center shrink-0">
                            Rata²
                          </span>
                        </td>
                        <td style={{ width: '12px' }} className="text-center font-bold text-slate-400">:</td>
                        <td className="text-slate-700 whitespace-nowrap">Rata-rata Nilai Tiap BAB</td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 8. Lower Section: Ekskul Table + Barcode (Left) | Ketidakhadiran + Signatures (Right) */}
        <div className="relative z-10 grid grid-cols-12 gap-2.5 text-[9px] leading-tight">
          {/* 8.1 Left: Tabel Ekstrakurikuler + Barcode Capaian TP (col-span-7) */}
          <div className="col-span-7 flex flex-col space-y-2">
            {/* Tabel Kegiatan Ekstrakurikuler */}
            <div>
              <div className="bg-[#005088] text-white px-2.5 py-1 rounded-t-md flex items-center gap-1.5 shadow-none">
                <IconActivity />
                <span className="text-[9.5px] font-bold uppercase tracking-wider">
                  KEGIATAN EKSTRAKURIKULER
                </span>
              </div>

              <div className="border border-slate-300 border-t-0 rounded-b-md overflow-hidden bg-white/75">
                <table className="w-full text-left border-collapse text-[8.5px]">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-800 font-bold">
                      <th className="py-1 px-1.5 w-6 text-center border-r border-slate-200">No.</th>
                      <th className="py-1 px-2 w-36 border-r border-slate-200">Kegiatan Ekstrakurikuler</th>
                      <th className="py-1 px-1.5 w-12 text-center border-r border-slate-200">Predikat</th>
                      <th className="py-1 px-2">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-800">
                    {/* 1. Pramuka (Wajib) */}
                    <tr className="leading-snug">
                      <td className="py-1 px-1.5 text-center font-bold border-r border-slate-200">1</td>
                      <td className="py-1 px-2 font-bold text-slate-900 border-r border-slate-200">
                        Pramuka <span className="text-[8px] font-semibold text-rose-600">(Wajib)</span>
                      </td>
                      <td className="py-1 px-1.5 text-center font-extrabold border-r border-slate-200 text-[#004e85] text-[9.5px]">
                        {studentEkskul.pramuka_nilai || 'A'}
                      </td>
                      <td className="py-1 px-2 text-slate-700 leading-tight">
                        {studentEkskul.pramuka_keterangan || 'Sangat aktif, berinisiatif, dan menunjukkan perkembangan keterampilan kepramukaan yang memuaskan.'}
                      </td>
                    </tr>

                    {/* 2. Ekskul Utama */}
                    <tr className="leading-snug">
                      <td className="py-1 px-1.5 text-center font-bold border-r border-slate-200">2</td>
                      <td className="py-1 px-2 font-bold text-slate-900 border-r border-slate-200">
                        {studentEkskul.ekskul_utama_nama || 'Ekskul Utama'}
                      </td>
                      <td className="py-1 px-1.5 text-center font-extrabold border-r border-slate-200 text-[#004e85] text-[9.5px]">
                        {studentEkskul.ekskul_utama_nilai || '-'}
                      </td>
                      <td className="py-1 px-2 text-slate-700 leading-tight">
                        {studentEkskul.ekskul_utama_keterangan || (studentEkskul.ekskul_utama_nilai ? 'Aktif mengikuti kegiatan ekstrakurikuler dengan baik.' : '-')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Barcode / QR Code Box: Scan untuk Deskripsi Capaian Tiap TP Siswa */}
            <div className="border border-slate-300 rounded-lg p-2 bg-white/85 shadow-none flex items-center gap-3">
              <div className="bg-white p-1.5 rounded-lg border border-slate-200 shrink-0 shadow-xs flex items-center justify-center">
                <QRCodeSVG
                  value={qrUrl}
                  size={80}
                  level="M"
                  includeMargin={false}
                />
              </div>
              <div className="text-[8.5px] leading-tight text-slate-700">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="font-black text-[#004e85] text-[9px] uppercase tracking-wide">
                    Barcode Capaian Tujuan Pembelajaran (TP)
                  </span>
                </div>
                <p className="text-slate-600 leading-snug">
                  Pindai barcode ini menggunakan kamera smartphone untuk melihat <strong>Rincian &amp; Deskripsi Lengkap Seluruh TP</strong> mata pelajaran siswa.
                </p>
                <a
                  href={qrUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-[8px] font-bold text-[#004e85] hover:underline mt-1 no-print"
                >
                  Buka Rincian TP di Tab Baru ↗
                </a>
              </div>
            </div>
          </div>

          {/* 8.2 Right: Ketidakhadiran (Menurun ke Bawah) + Tanda Tangan (col-span-5) */}
          <div className="col-span-5 flex flex-col justify-between space-y-2">
            {/* Ketidakhadiran (Menurun Ke Bawah Secara Vertikal) */}
            <div className="border border-slate-300 rounded-lg p-2 bg-white/75 shadow-none">
              <div className="flex items-center gap-1 text-[#004e85] font-bold text-[9px] mb-1 pb-1 border-b border-slate-200">
                <IconCalendar />
                <span>Keterangan Ketidakhadiran</span>
              </div>
              <table className="w-full text-[8.5px] border-collapse text-slate-700">
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="py-0.5 w-36 font-medium">1. Sakit</td>
                    <td className="py-0.5 font-bold text-slate-900">
                      : &nbsp;{attendance.sakit > 0 ? `${attendance.sakit} hari` : '- hari'}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-0.5 font-medium">2. Izin</td>
                    <td className="py-0.5 font-bold text-slate-900">
                      : &nbsp;{attendance.izin > 0 ? `${attendance.izin} hari` : '- hari'}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-0.5 font-medium">3. Tanpa Keterangan</td>
                    <td className="py-0.5 font-bold text-slate-900">
                      : &nbsp;{attendance.alpa > 0 ? `${attendance.alpa} hari` : '- hari'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Signatures */}
            <div className="grid grid-cols-2 gap-2 text-[8px] text-slate-800 pt-1">
              <div className="text-left">
                <p>Mengetahui,</p>
                <p>Orang Tua/Wali</p>
                <div className="h-9"></div>
                <p className="font-medium text-slate-700">( ................................ )</p>
              </div>

              <div className="text-right pr-1">
                <p>Jakarta, {tanggalCetak}</p>
                <p>Wali Kelas,</p>
                <div className="h-9"></div>
                <p className="font-bold text-slate-950 underline underline-offset-2">
                  ( {waliKelasCustom || waliKelasInfo || '................................'} )
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 9. Running Footer */}
        <div className="absolute bottom-1 left-10 right-10 flex justify-between items-center text-[7.5px] italic text-slate-500 z-10">
          <span>
            Kelas {toRomanClass(student.kelas)} / {student.nama_lengkap} / {student.nipd || student.nis || '-'} / {student.nisn} / SMP BM Mangga Besar Tahun Ajaran {activeTa?.nama || '2025/2026'}
          </span>
          <span className="pr-12">
            Halaman : {pageIndex}
          </span>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER INTERACTIVE INTERFACE (CONTROLS & PREVIEW)
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-4 animate-fade-in text-slate-800 pb-16">
      {/* ─── Control Bar (Excluded from Print via .no-print) ──────────────────── */}
      <div className="no-print bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#004e85]/10 text-[#004e85]">
                Kurikulum Merdeka
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                Official Report Card
              </span>
              <span 
                className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1.5"
                title={`Metode perhitungan nilai akhir rapor standar kurikulum: ${
                  raporSettings.metode_hitung_nilai_akhir === 'rata_rata_langsung' 
                    ? 'Rata-rata Langsung (Semua TP + PSTS)' 
                    : raporSettings.metode_hitung_nilai_akhir === 'bobot_manual' 
                    ? 'Bobot Manual' 
                    : 'Rata-rata Bertingkat per BAB'
                }`}
              >
                <span>Hitung Nilai Akhir:</span>
                <span className="font-bold">
                  {raporSettings.metode_hitung_nilai_akhir === 'rata_rata_langsung' 
                    ? 'Rata-rata Langsung' 
                    : raporSettings.metode_hitung_nilai_akhir === 'bobot_manual' 
                    ? 'Bobot Manual' 
                    : 'Rata-rata Bertingkat'}
                </span>
                {raporSettings.include_karakter_nilai_akhir === 'true' && (
                  <span className="text-[10px] bg-indigo-200 text-indigo-800 px-1 rounded font-bold">+ NK</span>
                )}
              </span>
            </div>
            <h1 className="text-xl font-black text-slate-900 mt-1 flex items-center gap-2">
              Rapor Siswa SMP Budi Mulia
            </h1>
            <p className="text-xs text-slate-500">
              Cetak laporan hasil belajar siswa format resmi per siswa atau per kelas (batch A4).
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div 
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                realtimeConnected 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}
              title="Sinkronisasi otomatis aktif dengan input nilai guru"
            >
              <span className={`w-2 h-2 rounded-full ${realtimeConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
              <span>{realtimeConnected ? 'Sinkron Realtime' : 'Tersinkron'}</span>
            </div>

            <button
              onClick={() => fetchClassReportData()}
              disabled={loading}
              className="px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 transition-all shadow-sm"
              title="Refresh Data Manual"
            >
              <IconRefresh spinning={loading} />
              <span>Refresh</span>
            </button>

            <button
              onClick={() => handlePrint(false)}
              disabled={loading || !currentStudent}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[#004e85] hover:bg-[#003d68] text-white flex items-center gap-2 shadow-sm transition-all"
            >
              <IconPrinter />
              <span>Cetak Rapor Siswa</span>
            </button>

            <button
              onClick={() => handlePrint(true)}
              disabled={loading || students.length === 0}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-2 shadow-sm transition-all"
            >
              <IconUsers />
              <span>Cetak 1 Kelas ({students.length} Siswa)</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-4 pt-4 border-t border-slate-100">
          {/* 1. Pilih Kelas */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
              Kelas {(!canViewAllClasses && myWaliClasses.length > 0) ? '(Kelas Perwalian)' : ''}
            </label>
            <select
              value={selectedKelas}
              onChange={(e) => setSelectedKelas(e.target.value)}
              disabled={!canViewAllClasses && allKelasList.length <= 1}
              className={`w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 bg-slate-50 outline-none focus:ring-2 focus:ring-[#004e85] ${(!canViewAllClasses && allKelasList.length <= 1) ? 'opacity-90 cursor-not-allowed bg-slate-100' : ''}`}
            >
              {allKelasList.map((k) => (
                <option key={k} value={k}>Kelas {k} ({toRomanClass(k)})</option>
              ))}
            </select>
          </div>

          {/* 2. Pilih Siswa (Single Preview) */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Siswa</label>
            <select
              value={selectedNisn}
              onChange={(e) => setSelectedNisn(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 bg-slate-50 outline-none focus:ring-2 focus:ring-[#004e85]"
            >
              {students.map((s, i) => (
                <option key={s.nisn} value={s.nisn}>
                  {i + 1}. {s.nama_lengkap} ({s.nisn})
                </option>
              ))}
            </select>
          </div>

          {/* 3. Semester */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Semester</label>
            <select
              value={selectedSemesterId}
              onChange={(e) => setSelectedSemesterId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 bg-slate-50 outline-none focus:ring-2 focus:ring-[#004e85]"
            >
              {semesters.map((s) => (
                <option key={s.id} value={s.id}>
                  Semester {s.nomor} ({s.nomor % 2 !== 0 ? 'Ganjil' : 'Genap'})
                </option>
              ))}
            </select>
          </div>

          {/* 4. Tipe Rapor */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Jenis Rapor</label>
            <select
              value={tipeRaport}
              onChange={(e) => setTipeRaport(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 bg-slate-50 outline-none focus:ring-2 focus:ring-[#004e85]"
            >
              <option value="tengah">Tengah Semester</option>
              <option value="akhir">Akhir Semester</option>
            </select>
          </div>

          {/* 5. Tanggal Cetak */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Tanggal Cetak</label>
            <input
              type="text"
              value={tanggalCetak}
              onChange={(e) => setTanggalCetak(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 bg-slate-50 outline-none focus:ring-2 focus:ring-[#004e85]"
              placeholder="e.g. 15 Oktober 2025"
            />
          </div>

          {/* 6. Wali Kelas Name */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Nama Wali Kelas</label>
            <input
              type="text"
              value={waliKelasCustom}
              onChange={(e) => setWaliKelasCustom(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 bg-slate-50 outline-none focus:ring-2 focus:ring-[#004e85]"
              placeholder="Nama Wali Kelas & Gelar"
            />
          </div>
        </div>

        {/* Tips Cetak Pas A4 Penuh */}
        <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-start gap-2 text-[11px] text-sky-900 bg-sky-50/80 border border-sky-200/70 p-3 rounded-xl shadow-2xs">
          <span className="text-base leading-none select-none shrink-0 mt-0.5">💡</span>
          <div className="space-y-0.5">
            <span className="font-bold text-sky-950">Panduan Setelan Print agar Pas Penuh di Kertas A4 (Tidak Mengecil):</span>
            <p className="text-[10.5px] text-sky-800 leading-relaxed">
              Saat jendela print browser muncul, pastikan: 
              <span className="font-bold text-sky-900"> ① Ukuran Kertas = A4</span> (bukan Letter) &bull; 
              <span className="font-bold text-sky-900"> ② Margin = None / Tidak Ada</span> &bull; 
              <span className="font-bold text-sky-900"> ③ Skala (Scale) = 100% / Default</span> (jangan <em>'Fit to printable area'</em>) &bull; 
              <span className="font-bold text-sky-900"> ④ Header &amp; Footer = Hapus centang</span>.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Print Stylesheet (Clean Vector A4 Output in DOM Flow) ───────── */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0mm;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body, #root, #root > div, main {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            overflow: visible !important;
          }
          /* Sembunyikan elemen dashboard, navigasi, dan tombol kontrol */
          .no-print, nav, header, aside, .sticky, button {
            display: none !important;
          }
          /* Tampilkan area cetak rapor */
          #rapor-print-area {
            display: block !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
          }
          .rapor-page-container {
            width: 210mm !important;
            max-width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            margin: 0 auto !important;
            padding: 7mm 11mm 5mm 11mm !important;
            box-sizing: border-box !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            position: relative !important;
            overflow: hidden !important;
          }
          .rapor-page-container:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* ─── Preview Area & Print Layout ────────────────────────────────────── */}
      {loading ? (
        <div className="no-print bg-white p-12 rounded-2xl border border-slate-200 text-center shadow-sm">
          <div className="w-10 h-10 border-4 border-[#004e85]/20 border-t-[#004e85] rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm font-semibold text-slate-700">Memuat data rapor kelas {selectedKelas}...</p>
          <p className="text-xs text-slate-400 mt-1">Mengambil nilai TP, PSTS, nilai ekskul, dan barcode presensi</p>
        </div>
      ) : students.length === 0 ? (
        <div className="no-print bg-white p-12 rounded-2xl border border-slate-200 text-center shadow-sm">
          <p className="text-base font-bold text-slate-700">Tidak ada siswa ditemukan di kelas {selectedKelas}</p>
          <p className="text-xs text-slate-400 mt-1">Pastikan kelas memiliki siswa terdaftar pada tahun ajaran ini.</p>
        </div>
      ) : (
        <div id="rapor-print-area" className="overflow-x-auto pb-8 flex flex-col items-center">
          {isBatchMode ? (
            <div className="space-y-8 print:space-y-0 w-full flex flex-col items-center">
              {students.map((student, idx) =>
                renderReportSheet(student, idx + 1, students.length)
              )}
            </div>
          ) : (
            <div className="w-full flex flex-col items-center">
              {renderReportSheet(currentStudent, 1, 1)}
            </div>
          )}
        </div>
      )}

      {/* Toast Notifikasi Realtime Sync */}
      {realtimeToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-xs font-bold animate-bounce no-print">
          <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
          <span>{realtimeToast}</span>
        </div>
      )}
    </div>
  )
}
