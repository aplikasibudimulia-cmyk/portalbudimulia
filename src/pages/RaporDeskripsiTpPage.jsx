import React, { useState, useEffect } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { getPredikatKarakter, parseKarakterDeskripsi } from '../data/indikatorKarakter'

const isKarakterKomponen = (nama, deskripsi) => {
  const n = (nama || '').toUpperCase().trim()
  if (
    n.includes('KARAKTER') ||
    n.includes('SIKAP') ||
    n === 'NK' ||
    n.startsWith('NK ') ||
    n.startsWith('N. KARAKTER') ||
    n === 'NIK' ||
    n.startsWith('NIK ')
  ) {
    return true
  }
  if (deskripsi && typeof deskripsi === 'string') {
    const d = deskripsi.trim()
    if (/^\[[^\]]+(\s*-\s*[^\]]+)?\]/i.test(d)) {
      const parsed = parseKarakterDeskripsi(d)
      if (parsed.elemenNama) return true
    }
  }
  return false
}

// ─── Canonical Mapel Order for SMP Budi Mulia ─────────────────────────────────
const CANONICAL_MAPEL_ORDER = [
  'agama', 'pancasila', 'bahasa indonesia', 'matematika',
  'ilmu pengetahuan alam', 'ilmu pengetahuan sosial', 'bahasa inggris',
  'jasmani', 'informatika', 'seni musik', 'seni budaya',
  'bahasa mandarin', 'english plus', 'psbm'
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

// ─── Report Theme Pastel Colors for BAB Headers ──────────────────────────────
const BAB_THEMES = [
  { bg: '#e8f2f9', border: '#b3d4ec', text: '#004e85', badgeBg: '#004e85' }, // Bab 1: Navy Accent
  { bg: '#edf7ed', border: '#c8e6c9', text: '#1b5e20', badgeBg: '#2e7d32' }, // Bab 2: Sage Green Accent
  { bg: '#fef8e7', border: '#ffe082', text: '#7c4a03', badgeBg: '#d97706' }, // Bab 3: Warm Amber Accent
  { bg: '#fdf2e9', border: '#ffccbc', text: '#bf360c', badgeBg: '#ea580c' }, // Bab 4: Warm Peach Accent
  { bg: '#f5eef8', border: '#d7bde2', text: '#4a235a', badgeBg: '#7c3aed' }, // Bab 5: Royal Purple Accent
  { bg: '#e0f2f1', border: '#b2dfdb', text: '#004d40', badgeBg: '#0d9488' }, // Bab 6: Teal Accent
]

// ─── Corner Ribbon Graphic Accents (from official Report Card) ───────────────
const CornerRibbon = ({ position = 'top-left' }) => {
  if (position === 'top-left') {
    return (
      <svg
        className="absolute top-0 left-0 w-20 h-20 sm:w-24 sm:h-24 pointer-events-none z-10"
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
      className="absolute bottom-0 right-0 w-20 h-20 sm:w-24 sm:h-24 pointer-events-none z-10 rotate-180"
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M 0 0 L 80 0 C 45 35 35 45 0 80 Z" fill="#004e85" />
      <path d="M 0 84 C 40 40 40 40 84 0 L 98 0 C 45 50 50 45 0 98 Z" fill="#d32f2f" />
    </svg>
  )
}

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

const formatBabTitle = (rawName, index) => {
  if (!rawName) return `Bab ${index + 1}`
  const clean = rawName
    .replace(/^(?:lingkup\s*(?:materi)?\s*\d*\s*[:\-.]?\s*|bab\s*\d*\s*[:\-.]?\s*)/i, '')
    .trim()
  if (!clean) return `Bab ${index + 1}`
  return clean
}

const formatTpName = (rawName, index) => {
  if (!rawName) return `TP ${index + 1}`
  const match = rawName.match(/(?:TP|Tujuan\s*Pembelajaran)\s*(\d+)/i)
  if (match) return `TP ${match[1]}`
  if (/^\d+$/.test(rawName.trim())) return `TP ${rawName.trim()}`
  return rawName.trim()
}

// ─── Helper to match class names flexibly (e.g. "7A", "Kelas 7A", "VII-A", "7") ──
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

// ─── Helper to normalize and match BAB names ──────────────────────────────────
const normalizeBab = (name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')

const isBabMatching = (selectedBab, candidateBab) => {
  const s = normalizeBab(selectedBab)
  const c = normalizeBab(candidateBab)
  if (!s || !c) return false
  if (s === c) return true
  if (c.startsWith(s) || s.startsWith(c)) return true

  const cleanS = s.replace(/^(?:lingkup\s*(?:materi)?\s*\d*\s*[:\-.]?\s*|bab\s*\d*\s*[:\-.]?\s*)/i, '').trim()
  const cleanC = c.replace(/^(?:lingkup\s*(?:materi)?\s*\d*\s*[:\-.]?\s*|bab\s*\d*\s*[:\-.]?\s*)/i, '').trim()
  if (cleanS && cleanC && (cleanS === cleanC || cleanC.includes(cleanS) || cleanS.includes(cleanC))) {
    return true
  }

  const numS = s.match(/(?:bab|lingkup)\s*(\d+)/i)?.[1]
  const numC = c.match(/(?:bab|lingkup)\s*(\d+)/i)?.[1]
  if (numS && numC && numS === numC) return true

  return false
}

export default function RaporDeskripsiTpPage() {
  const { nisn } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const semParam = searchParams.get('sem')
  const taParam = searchParams.get('ta')

  const [loading, setLoading] = useState(true)
  const [student, setStudent] = useState(null)
  const [activeTa, setActiveTa] = useState(null)
  const [activeSemester, setActiveSemester] = useState(null)
  const [subjectsWithTp, setSubjectsWithTp] = useState([])

  useEffect(() => {
    const fetchData = async () => {
      if (!nisn) return
      setLoading(true)

      try {
        let stdData = null
        let taObj = null
        let semObj = null
        let sortedMapels = []
        let validKomps = []
        let gradeMap = {}
        let configAkhirByMapel = {}

        // ─── 0. TRY HIGH-PERFORMANCE RPC (Bypass RLS via SECURITY DEFINER) ───────
        let rpcSuccess = false
        try {
          const { data: rpcRes, error: rpcErr } = await supabase.rpc('get_rapor_deskripsi_tp_public', {
            p_nisn: nisn,
            p_semester_id: semParam || null,
            p_tahun_ajaran_id: taParam || null
          })

          if (!rpcErr && rpcRes && rpcRes.success) {
            rpcSuccess = true
            stdData = rpcRes.student
            taObj = rpcRes.tahun_ajaran
            semObj = rpcRes.semester

            const rawMapels = rpcRes.mata_pelajaran || []
            if (rawMapels.length > 0) {
              sortedMapels = [...rawMapels].sort((a, b) => {
                const nameA = (a.nama || '').toLowerCase()
                const nameB = (b.nama || '').toLowerCase()
                let idxA = CANONICAL_MAPEL_ORDER.findIndex(k => nameA.includes(k))
                let idxB = CANONICAL_MAPEL_ORDER.findIndex(k => nameB.includes(k))
                if (idxA === -1) idxA = 999
                if (idxB === -1) idxB = 999
                if (idxA !== idxB) return idxA - idxB
                return nameA.localeCompare(nameB)
              }).filter(m => {
                const name = (m.nama || '').toLowerCase()
                return OFFICIAL_REPORT_MAPELS.some(k => name.includes(k))
              })
            }

            const studentClass = String(stdData?.kelas || '').trim().toUpperCase()
            const kData = rpcRes.nilai_komponen || []
            validKomps = kData.filter(k => {
              if (!studentClass) return true
              return isClassMatch(k.target_kelas, studentClass) || isClassMatch(k.kelas, studentClass)
            })

            const nData = rpcRes.nilai_siswa || []
            nData.forEach(n => {
              gradeMap[n.komponen_id] = n.nilai
            })

            const cfgData = rpcRes.nilai_akhir_config || []
            const targetRombel = studentClass.replace(/\D/g, '')
            cfgData.forEach(c => {
              if (c.kelas && targetRombel && c.kelas.replace(/\D/g, '') === targetRombel) {
                if (!configAkhirByMapel[c.mata_pelajaran_id]) {
                  configAkhirByMapel[c.mata_pelajaran_id] = c.bobot_detail || {}
                }
              }
            })
            cfgData.forEach(c => {
              if (isClassMatch(c.kelas, studentClass)) {
                configAkhirByMapel[c.mata_pelajaran_id] = {
                  ...(configAkhirByMapel[c.mata_pelajaran_id] || {}),
                  ...(c.bobot_detail || {})
                }
              }
            })
          }
        } catch (rpcEx) {
          console.warn('RPC get_rapor_deskripsi_tp_public not available, falling back to direct table queries:', rpcEx)
        }

        // ─── DIRECT TABLE QUERY FALLBACK (If RPC not available) ─────────────────
        if (!rpcSuccess) {
          // 1. Fetch Student Info
          let stdQuery = supabase.from('siswa_lengkap')
            .select('nisn, nipd, nama_lengkap, kelas, tahun_ajaran_id')
            .eq('nisn', nisn)
          if (taParam) stdQuery = stdQuery.eq('tahun_ajaran_id', taParam)
          let { data: rawStd } = await stdQuery.maybeSingle()

          if (!rawStd) {
            const { data: fbData } = await supabase.from('siswa_lengkap')
              .select('nisn, nipd, nama_lengkap, kelas, tahun_ajaran_id')
              .eq('nisn', nisn)
              .maybeSingle()
            rawStd = fbData
          }
          stdData = rawStd

          // 2. Fetch Tahun Ajaran
          const targetTaId = taParam || stdData?.tahun_ajaran_id
          if (targetTaId) {
            const { data: taRes } = await supabase.from('tahun_ajaran').select('*').eq('id', targetTaId).maybeSingle()
            taObj = taRes
          }
          if (!taObj) {
            const { data: taDef } = await supabase.from('tahun_ajaran').select('*').eq('is_aktif', true).maybeSingle()
            taObj = taDef
          }

          // 3. Fetch Semester
          if (semParam) {
            const { data: sRes } = await supabase.from('semester').select('*').eq('id', semParam).maybeSingle()
            semObj = sRes
          }
          if (!semObj && taObj) {
            const { data: sRes } = await supabase.from('semester').select('*').eq('tahun_ajaran_id', taObj.id).order('nomor').limit(1).maybeSingle()
            semObj = sRes
          }

          // 4. Fetch Mata Pelajaran
          const { data: mapelData } = await supabase.from('mata_pelajaran').select('id, nama, singkatan').order('nama')
          const rawMapels = mapelData || []
          if (rawMapels.length > 0) {
            sortedMapels = [...rawMapels].sort((a, b) => {
              const nameA = (a.nama || '').toLowerCase()
              const nameB = (b.nama || '').toLowerCase()
              let idxA = CANONICAL_MAPEL_ORDER.findIndex(k => nameA.includes(k))
              let idxB = CANONICAL_MAPEL_ORDER.findIndex(k => nameB.includes(k))
              if (idxA === -1) idxA = 999
              if (idxB === -1) idxB = 999
              if (idxA !== idxB) return idxA - idxB
              return nameA.localeCompare(nameB)
            }).filter(m => {
              const name = (m.nama || '').toLowerCase()
              return OFFICIAL_REPORT_MAPELS.some(k => name.includes(k))
            })
          }

          // 5. Fetch Komponen Nilai & Deskripsi TP
          let kompQuery = supabase.from('nilai_komponen').select('*').order('urutan', { ascending: true })
          if (semObj) kompQuery = kompQuery.eq('semester_id', semObj.id)
          if (taObj) kompQuery = kompQuery.or(`tahun_ajaran_id.eq.${taObj.id},tahun_ajaran_id.is.null`)
          let { data: kData } = await kompQuery

          if (!kData || kData.length === 0) {
            let fbQuery = supabase.from('nilai_komponen').select('*').order('urutan', { ascending: true })
            if (semObj) fbQuery = fbQuery.eq('semester_id', semObj.id)
            const { data: fbData } = await fbQuery
            if (fbData && fbData.length > 0) kData = fbData
          }

          if (!kData || kData.length === 0) {
            const { data: allData } = await supabase.from('nilai_komponen').select('*').order('urutan', { ascending: true })
            kData = allData || []
          }

          const studentClass = String(stdData?.kelas || '').trim().toUpperCase()
          validKomps = (kData || []).filter(k => {
            if (!studentClass) return true
            return isClassMatch(k.target_kelas, studentClass) || isClassMatch(k.kelas, studentClass)
          })

          // 5b. Fetch Guru Pengampu & nilai_akhir_config
          let gmQuery = supabase.from('guru_mapel').select('guru_id, kelas, mata_pelajaran_id')
          if (taObj?.id) gmQuery = gmQuery.or(`tahun_ajaran_id.eq.${taObj.id},tahun_ajaran_id.is.null`)
          const { data: gmData } = await gmQuery
          const matchedGm = (gmData || []).filter(g => isClassMatch(g.kelas, studentClass))

          const assignedGuruByMapel = {}
          matchedGm.forEach(gm => {
            if (gm.mata_pelajaran_id) {
              assignedGuruByMapel[gm.mata_pelajaran_id] = gm.guru_id
            }
          })

          let cfgQuery = supabase.from('nilai_akhir_config')
            .select('mata_pelajaran_id, bobot_detail, kelas, guru_id, tahun_ajaran_id')
          if (semObj?.id) cfgQuery = cfgQuery.eq('semester_id', semObj.id)
          if (taObj?.id) cfgQuery = cfgQuery.or(`tahun_ajaran_id.eq.${taObj.id},tahun_ajaran_id.is.null`)
          const { data: cfgData } = await cfgQuery

          const targetRombel = studentClass.replace(/\D/g, '')
          ;(cfgData || []).forEach(c => {
            const assignedGuruId = assignedGuruByMapel[c.mata_pelajaran_id]
            const isSameTeacher = !assignedGuruId || !c.guru_id || c.guru_id === assignedGuruId
            if (isSameTeacher && c.kelas && targetRombel && c.kelas.replace(/\D/g, '') === targetRombel) {
              if (!configAkhirByMapel[c.mata_pelajaran_id]) {
                configAkhirByMapel[c.mata_pelajaran_id] = c.bobot_detail || {}
              }
            }
          })

          ;(cfgData || []).forEach(c => {
            const assignedGuruId = assignedGuruByMapel[c.mata_pelajaran_id]
            const isSameTeacher = !assignedGuruId || !c.guru_id || c.guru_id === assignedGuruId
            if (isSameTeacher && isClassMatch(c.kelas, studentClass)) {
              configAkhirByMapel[c.mata_pelajaran_id] = {
                ...(configAkhirByMapel[c.mata_pelajaran_id] || {}),
                ...(c.bobot_detail || {})
              }
            }
          })

          // 6. Fetch Student Scores directly for this student
          const { data: nData } = await supabase.from('nilai_siswa')
            .select('komponen_id, nilai')
            .eq('siswa_nisn', nisn)
          ;(nData || []).forEach(n => {
            gradeMap[n.komponen_id] = n.nilai
          })
        }

        setStudent(stdData)
        setActiveTa(taObj)
        setActiveSemester(semObj)

        // 7. Group ALL Mapels (applying PTS selected BAB filter if configured)
        const fullSubjectList = sortedMapels.map(m => {
          const mKomps = validKomps.filter(k => k.mata_pelajaran_id === m.id)
          
          // Group by BAB
          const babMap = {}
          mKomps.forEach(k => {
            const kNameLower = (k.nama || '').toLowerCase().trim()
            const bNameLower = (k.bab_nama || '').toLowerCase().trim()

            // Exclude exams (PSTS, PTS, PSAS, PSAT, Penilaian Sumatif)
            if (
              kNameLower.includes('psts') || kNameLower.includes('pts') || kNameLower.includes('psas') || kNameLower.includes('psat') ||
              bNameLower.includes('psts') || bNameLower.includes('pts') || bNameLower.includes('psas') || bNameLower.includes('psat') ||
              bNameLower.includes('penilaian sumatif')
            ) {
              return
            }

            const rawBabName = (k.bab_nama || '').trim() || 'Materi Pembelajaran'
            const normKey = rawBabName.toLowerCase().replace(/\s+/g, ' ')
            if (!babMap[normKey]) {
              babMap[normKey] = {
                babName: rawBabName,
                tps: [],
                karakters: []
              }
            }
            
            const rawVal = gradeMap[k.id]
            let numVal = null
            if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
              const p = Number(rawVal)
              if (!isNaN(p)) numVal = Math.round(p)
            }

            const isKar = isKarakterKomponen(k.nama, k.deskripsi)

            if (isKar) {
              babMap[normKey].karakters.push({
                id: k.id,
                nama: k.nama || 'N. Karakter',
                deskripsi: k.deskripsi || null,
                nilai: numVal,
                urutan: k.urutan ?? 999,
                isKarakter: true
              })
            } else {
              babMap[normKey].tps.push({
                id: k.id,
                nama: k.nama || 'TP',
                deskripsi: k.deskripsi || null,
                nilai: numVal,
                urutan: k.urutan ?? 0,
                isKarakter: false
              })
            }
          })

          const babs = Object.values(babMap).map(babData => {
            const sortedTps = [...babData.tps].sort((a, b) => {
              const numA = parseInt((a.nama || '').replace(/\D/g, '') || '0', 10)
              const numB = parseInt((b.nama || '').replace(/\D/g, '') || '0', 10)
              if (numA !== numB) return numA - numB
              return (a.urutan ?? 0) - (b.urutan ?? 0)
            })

            const sortedKarakters = [...babData.karakters].sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0))

            return {
              babName: babData.babName,
              tps: sortedTps,
              karakters: sortedKarakters,
              karakter: sortedKarakters[0] || null
            }
          }).sort((a, b) => {
            const numA = parseInt(a.babName.replace(/\D/g, '') || '0', 10)
            const numB = parseInt(b.babName.replace(/\D/g, '') || '0', 10)
            if (numA !== numB) return numA - numB
            return a.babName.localeCompare(b.babName)
          })

          // Filter BABs according to teacher/kurikulum PTS selection (pts_selected_babs)
          let finalBabs = babs
          const teacherPtsBabs = configAkhirByMapel[m.id]?.pts_selected_babs
          const isPtsConfirmed = configAkhirByMapel[m.id]?.pts_confirmed ?? false

          if (Array.isArray(teacherPtsBabs) && teacherPtsBabs.length > 0) {
            // Keep ONLY BABs that are checked/selected for PTS
            const filtered = babs.filter(b => teacherPtsBabs.some(t => isBabMatching(t, b.babName)))
            // Resilient fallback: jika ada matching gunakan filtered; jika tidak match sama sekali (karena beda format nama), tetap tampilkan babs agar tidak kosong
            if (filtered.length > 0) {
              finalBabs = filtered
            }
          } else if (isPtsConfirmed && Array.isArray(teacherPtsBabs) && teacherPtsBabs.length === 0) {
            // Confirmed with 0 BABs selected
            finalBabs = []
          }

          return {
            mapelId: m.id,
            mapelNama: m.nama,
            singkatan: m.singkatan,
            babs: finalBabs,
            totalTp: finalBabs.reduce((acc, b) => acc + b.tps.length + b.karakters.length, 0)
          }
        })

        // SHOW ALL MAPELS unconditionally as requested
        setSubjectsWithTp(fullSubjectList)

      } catch (err) {
        console.error('Error fetching TP descriptions:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [nisn, semParam, taParam])

  const semesterText = activeSemester?.nomor % 2 !== 0 ? 'I (Satu) / Ganjil' : 'II (Dua) / Genap'

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 py-4 sm:py-8 px-2 sm:px-6 print:bg-white print:p-0">
      {/* ─── Top Action Bar (Print / PDF) ───────────────────────────────────── */}
      <div className="max-w-4xl mx-auto mb-4 flex items-center justify-between print:hidden">
        <button
          onClick={() => navigate(-1)}
          className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-all flex items-center gap-1.5 shadow-xs"
        >
          <span>←</span> Kembali
        </button>

        <button
          onClick={() => window.print()}
          className="px-4 py-2 rounded-xl bg-[#004e85] hover:bg-[#003d69] text-white text-xs font-bold flex items-center gap-2 transition-all shadow-md active:scale-95"
          title="Cetak atau Simpan sebagai PDF"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          <span>Cetak / Simpan PDF</span>
        </button>
      </div>



      {/* ─── Main Paper Card (A4 Report Card Themed Canvas) ─────────────────── */}
      <div className="max-w-4xl mx-auto bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-slate-200/80 p-5 sm:p-8 relative overflow-hidden print:border-none print:shadow-none print:p-4 print:rounded-none">
        
        {/* Transparent Watermark Logo in Center Background (Matching Report Card) */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-0 overflow-hidden">
          <img
            src="/logo_budimulia_transparent.png"
            alt="Watermark SMP Budi Mulia"
            className="w-[380px] h-[380px] object-contain select-none"
            style={{ width: '380px', height: '380px', opacity: 0.08 }}
            onError={(e) => {
              e.target.onerror = null
              e.target.src = '/logo_budimulia.png'
            }}
          />
        </div>

        {/* Corner Ribbons Top-Left & Bottom-Right (Official Report Theme) */}
        <CornerRibbon position="top-left" />
        <CornerRibbon position="bottom-right" />

        {loading ? (
          <div className="py-24 text-center relative z-10">
            <div className="w-12 h-12 border-4 border-[#004e85]/20 border-t-[#004e85] rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-base font-bold text-slate-800">Memuat Rapor Tujuan Pembelajaran...</p>
            <p className="text-xs text-slate-400 mt-1">Menghubungkan ke basis data Kurikulum Merdeka SMP Budi Mulia</p>
          </div>
        ) : !student ? (
          <div className="py-20 text-center relative z-10">
            <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold border border-rose-200">
              ✕
            </div>
            <h2 className="text-lg font-black text-slate-900 uppercase">Data Siswa Tidak Ditemukan</h2>
            <p className="text-xs text-slate-500 mt-1">
              NISN: <span className="font-mono font-bold text-slate-800">{nisn}</span> tidak terdaftar pada sistem rapor.
            </p>
          </div>
        ) : (
          <div className="relative z-10 space-y-4">
            
            {/* 1. Header Area (School Logo, School Name & Slogan) */}
            <div className="flex items-start justify-between border-b border-[#70a6cf]/40 pb-3">
              <div className="flex items-center gap-3 pl-8 sm:pl-10">
                <img
                  src="/logo_budimulia_transparent.png"
                  alt="Logo SMP Budi Mulia"
                  className="w-12 h-12 sm:w-14 sm:h-14 object-contain shrink-0"
                  onError={(e) => {
                    e.target.onerror = null
                    e.target.src = '/logo_budimulia.png'
                  }}
                />
                <div>
                  <h1 className="text-lg sm:text-2xl font-black tracking-tight text-[#004e85] uppercase leading-none font-serif">
                    SMP BUDI MULIA
                  </h1>
                  <p className="text-xs sm:text-sm font-semibold text-slate-600 mt-0.5">
                    Jakarta Pusat
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

            {/* 2. Center Report Title */}
            <div className="text-center pt-1 pb-1">
              <h2 className="text-xs sm:text-sm font-black tracking-widest text-[#004e85] uppercase">
                LAPORAN CAPAIAN TUJUAN PEMBELAJARAN (TP)
              </h2>
              <h3 className="text-base sm:text-lg font-black tracking-wide text-[#004e85] uppercase leading-tight">
                RINCIAN ASESMEN FORMATIF & SUMATIF SISWA
              </h3>
              <div className="flex items-center justify-center gap-3 mt-1.5">
                <div className="h-[1.5px] bg-[#004e85] w-20 sm:w-28"></div>
                <span className="text-[10px] sm:text-[11px] font-extrabold tracking-wider text-[#004e85] uppercase">
                  TAHUN AJARAN {activeTa?.nama || '2025/2026'} • SEMESTER {activeSemester?.nomor % 2 !== 0 ? 'I (GANJIL)' : 'II (GENAP)'}
                </span>
                <div className="h-[1.5px] bg-[#004e85] w-20 sm:w-28"></div>
              </div>
            </div>

            {/* 3. Student Biodata Card (Aligned Colons with Official Blue Border) */}
            <div className="rounded-xl border border-[#70a6cf] p-3 sm:p-4 text-[11px] leading-relaxed text-slate-800 bg-white/85 shadow-none mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                {/* Left Column Table */}
                <table className="w-full text-[11px] border-collapse">
                  <tbody>
                    <tr>
                      <td style={{ width: '130px' }} className="font-semibold text-slate-600 py-0.5 whitespace-nowrap">
                        Nama Peserta Didik
                      </td>
                      <td style={{ width: '12px' }} className="text-center text-slate-600 font-bold py-0.5">
                        :
                      </td>
                      <td className="font-black text-slate-900 py-0.5 uppercase tracking-tight">
                        {student.nama_lengkap}
                      </td>
                    </tr>
                    <tr>
                      <td className="font-semibold text-slate-600 py-0.5 whitespace-nowrap">
                        NISN / NIPD
                      </td>
                      <td className="text-center text-slate-600 font-bold py-0.5">
                        :
                      </td>
                      <td className="font-mono font-bold text-slate-800 py-0.5">
                        {student.nisn} {student.nipd ? ` / ${student.nipd}` : ''}
                      </td>
                    </tr>
                    <tr>
                      <td className="font-semibold text-slate-600 py-0.5 whitespace-nowrap">
                        Nama Sekolah
                      </td>
                      <td className="text-center text-slate-600 font-bold py-0.5">
                        :
                      </td>
                      <td className="font-bold text-slate-800 py-0.5">
                        SMP BUDI MULIA JAKARTA
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Right Column Table */}
                <table className="w-full text-[11px] border-collapse">
                  <tbody>
                    <tr>
                      <td style={{ width: '100px' }} className="font-semibold text-slate-600 py-0.5 whitespace-nowrap">
                        Kelas
                      </td>
                      <td style={{ width: '12px' }} className="text-center text-slate-600 font-bold py-0.5">
                        :
                      </td>
                      <td className="font-black text-[#004e85] py-0.5">
                        <span className="px-2 py-0.5 bg-[#004e85]/10 rounded border border-[#004e85]/20 font-bold">
                          Kelas {toRomanClass(student.kelas)}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td className="font-semibold text-slate-600 py-0.5 whitespace-nowrap">
                        Semester
                      </td>
                      <td className="text-center text-slate-600 font-bold py-0.5">
                        :
                      </td>
                      <td className="font-semibold text-slate-800 py-0.5">
                        {semesterText}
                      </td>
                    </tr>
                    <tr>
                      <td className="font-semibold text-slate-600 py-0.5 whitespace-nowrap">
                        Tahun Ajaran
                      </td>
                      <td className="text-center text-slate-600 font-bold py-0.5">
                        :
                      </td>
                      <td className="font-semibold text-slate-800 py-0.5">
                        {activeTa?.nama || '2025/2026'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 4. Official Report Card Table */}
            <div className="border border-[#005088]/40 rounded-xl overflow-hidden shadow-xs bg-white">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  {/* ─── Table Header (Navy Blue Theme #005088) ──────────────── */}
                  <thead>
                    <tr className="bg-[#005088] text-white font-bold leading-tight">
                      <th
                        rowSpan={2}
                        className="w-12 sm:w-14 border-r border-b border-white/25 py-2.5 px-2 text-center align-middle font-bold text-xs"
                      >
                        NO
                      </th>
                      <th
                        rowSpan={2}
                        className="w-48 sm:w-60 border-r border-b border-white/25 py-2.5 px-3 text-center align-middle font-bold text-xs"
                      >
                        Mata Pelajaran
                      </th>
                      <th
                        colSpan={3}
                        className="border-b border-white/25 py-2 px-3 text-center font-black tracking-wider uppercase text-xs"
                      >
                        LINGKUP MATERI
                      </th>
                    </tr>
                    <tr className="bg-[#004373] text-white font-bold text-[11px]">
                      <th className="w-16 sm:w-20 border-r border-white/20 py-1.5 px-2 text-center">
                        TP
                      </th>
                      <th className="border-r border-white/20 py-1.5 px-3 text-center">
                        Deskripsi Tujuan Pembelajaran
                      </th>
                      <th className="w-16 sm:w-20 py-1.5 px-2 text-center">
                        Nilai
                      </th>
                    </tr>
                  </thead>

                  {/* ─── Table Body ──────────────────────────────────────────── */}
                  <tbody className="divide-y divide-slate-200">
                    {subjectsWithTp.map((m, mIdx) => {
                      const hasBabs = m.babs && m.babs.length > 0

                      // If subject has BABs: flatten rows
                      if (hasBabs) {
                        const items = []
                        m.babs.forEach((b, bIdx) => {
                          const effectiveTps = b.tps || []
                          const effectiveKarakters = b.karakters || []

                          items.push({ type: 'bab_header', bab: b, bIdx })
                          const hasTps = effectiveTps && effectiveTps.length > 0
                          const hasKarakters = effectiveKarakters && effectiveKarakters.length > 0

                          if (!hasTps && !hasKarakters) {
                            items.push({ type: 'tp_empty', bIdx })
                          } else {
                            if (hasTps) {
                              effectiveTps.forEach((tp, tpIdx) => {
                                items.push({ type: 'tp_row', tp, tpIdx, bIdx })
                              })
                            }
                            if (hasKarakters) {
                              effectiveKarakters.forEach((kar, karIdx) => {
                                items.push({ type: 'karakter_row', karakter: kar, karIdx, bIdx })
                              })
                            }
                          }
                        })
                        const totalRows = items.length

                        return (
                          <React.Fragment key={m.mapelId}>
                            {items.map((item, rowIdx) => {
                              const theme = BAB_THEMES[item.bIdx % BAB_THEMES.length]

                              return (
                                <tr
                                  key={`${m.mapelId}-${rowIdx}`}
                                  className="hover:bg-slate-50/50 transition-colors"
                                >
                                  {/* NO & Mata Pelajaran Span Full Subject */}
                                  {rowIdx === 0 && (
                                    <>
                                      <td
                                        rowSpan={totalRows}
                                        className="border-r border-b border-slate-300 text-center align-middle font-bold text-slate-800 bg-white px-2 py-2 text-xs"
                                      >
                                        {mIdx + 1}
                                      </td>
                                      <td
                                        rowSpan={totalRows}
                                        className="border-r border-b border-slate-300 text-center align-middle font-bold text-slate-900 bg-white px-3 py-2 text-xs"
                                      >
                                        {m.mapelNama}
                                      </td>
                                    </>
                                  )}

                                  {/* Bab Header Row (Themed Pastel Band) */}
                                  {item.type === 'bab_header' && (
                                    <td
                                      colSpan={3}
                                      style={{
                                        backgroundColor: theme.bg,
                                        borderColor: theme.border
                                      }}
                                      className="border-b px-3 py-1.5 text-left font-bold text-xs"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span
                                          style={{ backgroundColor: theme.badgeBg }}
                                          className="px-2 py-0.5 rounded text-[10px] font-extrabold text-white uppercase shadow-2xs"
                                        >
                                          Bab {item.bIdx + 1}
                                        </span>
                                        <span style={{ color: theme.text }} className="font-extrabold text-xs">
                                          {formatBabTitle(item.bab.babName, item.bIdx)}
                                        </span>
                                      </div>
                                    </td>
                                  )}

                                  {/* TP Row */}
                                  {item.type === 'tp_row' && (
                                    <>
                                      <td className="border-r border-b border-slate-200 text-center align-middle py-2 px-2 bg-white">
                                        <span className="inline-block px-2 py-0.5 rounded-md bg-[#004e85]/10 text-[#004e85] font-black text-[11px] border border-[#004e85]/20">
                                          {formatTpName(item.tp.nama, item.tpIdx)}
                                        </span>
                                      </td>
                                      <td className="border-r border-b border-slate-200 text-left align-middle text-xs text-slate-800 py-2 px-3.5 leading-relaxed bg-white">
                                        {item.tp.deskripsi ? (
                                          item.tp.deskripsi
                                        ) : (
                                          <span className="italic text-slate-400">
                                            Deskripsi capaian belum dilengkapi guru pengampu
                                          </span>
                                        )}
                                      </td>
                                      <td className="border-b border-slate-200 text-center align-middle py-2 px-2 bg-white">
                                        {item.tp.nilai !== null && item.tp.nilai !== undefined && item.tp.nilai !== '' ? (
                                          Number(item.tp.nilai) >= 75 ? (
                                            <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-black text-xs">
                                              {item.tp.nilai}
                                            </span>
                                          ) : Number(item.tp.nilai) > 0 ? (
                                            <span className="inline-block px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-black text-xs">
                                              {item.tp.nilai}
                                            </span>
                                          ) : (
                                            <span className="inline-block px-2 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200 font-black text-xs">
                                              0
                                            </span>
                                          )
                                        ) : (
                                          <span className="text-slate-400 font-medium">-</span>
                                        )}
                                      </td>
                                    </>
                                  )}

                                  {/* Karakter (NIK) Row */}
                                  {item.type === 'karakter_row' && (
                                    <>
                                      <td className="border-r border-b border-slate-200 text-center align-middle py-2 px-2 bg-indigo-50/25">
                                        <span className="inline-block px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold text-[10.5px] whitespace-nowrap shadow-2xs">
                                          N. Karakter
                                        </span>
                                      </td>
                                      <td className="border-r border-b border-slate-200 text-left align-middle text-xs text-slate-800 py-2 px-3.5 leading-relaxed bg-white">
                                        {(() => {
                                          const rawDesc = item.karakter.deskripsi || ''
                                          const parsed = parseKarakterDeskripsi(rawDesc)
                                          const hasDimensi = parsed.elemenNama || parsed.subIndikatorNama

                                          if (!rawDesc) {
                                            return (
                                              <span className="italic text-slate-400">
                                                Deskripsi indikator karakter belum dilengkapi guru pengampu
                                              </span>
                                            )
                                          }

                                          return (
                                            <div className="space-y-1">
                                              {hasDimensi && (
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50/80 text-indigo-900 border border-indigo-200">
                                                    {parsed.elemenNama}
                                                    {parsed.subIndikatorNama ? ` • ${parsed.subIndikatorNama}` : ''}
                                                  </span>
                                                </div>
                                              )}
                                              <p className="text-slate-700 leading-relaxed font-normal">
                                                {parsed.catatan || rawDesc}
                                              </p>
                                            </div>
                                          )
                                        })()}
                                      </td>
                                      <td className="border-b border-slate-200 text-center align-middle py-2 px-2 bg-white">
                                        {item.karakter.nilai !== null && item.karakter.nilai !== undefined && !isNaN(Number(item.karakter.nilai)) ? (
                                          (() => {
                                            const numVal = Math.round(Number(item.karakter.nilai))
                                            const predObj = getPredikatKarakter(numVal)
                                            return (
                                              <div className="flex flex-col items-center justify-center gap-0.5">
                                                <div className="inline-flex items-center justify-center gap-1.5">
                                                  <span className="font-mono font-black text-xs text-slate-800">
                                                    {numVal}
                                                  </span>
                                                  <span
                                                    className={`inline-flex items-center justify-center min-w-[22px] px-1.5 py-0.5 rounded font-black text-[10.5px] border shadow-2xs ${
                                                      predObj?.bgBadge || 'bg-slate-100 text-slate-700 border-slate-200'
                                                    }`}
                                                    title={`${predObj?.kriteria || ''}: ${predObj?.deskripsiKriteria || ''}`}
                                                  >
                                                    {predObj?.predikat || '-'}
                                                  </span>
                                                </div>
                                                {predObj?.kriteria && (
                                                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">
                                                    {predObj.kriteria}
                                                  </span>
                                                )}
                                              </div>
                                            )
                                          })()
                                        ) : (
                                          <span className="text-slate-400 font-medium">-</span>
                                        )}
                                      </td>
                                    </>
                                  )}

                                  {/* Empty TP placeholder inside BAB */}
                                  {item.type === 'tp_empty' && (
                                    <>
                                      <td className="border-r border-b border-slate-200 text-center text-xs text-slate-400 py-2 px-2 bg-white">-</td>
                                      <td className="border-r border-b border-slate-200 text-left text-xs italic text-slate-400 py-2 px-3 bg-white">
                                        Belum ada rincian TP pada bab ini
                                      </td>
                                      <td className="border-b border-slate-200 text-center text-xs text-slate-400 py-2 px-2 bg-white">-</td>
                                    </>
                                  )}
                                </tr>
                              )
                            })}

                            {/* Accent separator between subjects */}
                            {mIdx < subjectsWithTp.length - 1 && (
                              <tr className="bg-[#004e85]/10 h-2 border-y border-[#004e85]/20">
                                <td colSpan={5} className="p-0"></td>
                              </tr>
                            )}
                          </React.Fragment>
                        )
                      }

                      // If subject has NO BABs yet: show full subject row with placeholder
                      return (
                        <React.Fragment key={m.mapelId}>
                          <tr className="hover:bg-slate-50/50 transition-colors">
                            <td className="border-r border-b border-slate-300 text-center align-middle font-bold text-slate-800 bg-white px-2 py-2.5 text-xs">
                              {mIdx + 1}
                            </td>
                            <td className="border-r border-b border-slate-300 text-center align-middle font-bold text-slate-900 bg-white px-3 py-2.5 text-xs">
                              {m.mapelNama}
                            </td>
                            <td className="border-r border-b border-slate-200 text-center align-middle py-2 px-2 bg-white text-slate-400">
                              -
                            </td>
                            <td className="border-r border-b border-slate-200 text-left align-middle text-xs italic text-slate-400 py-2 px-3.5 bg-white">
                              Belum ada lingkup materi / TP yang diinput guru pengampu
                            </td>
                            <td className="border-b border-slate-200 text-center align-middle py-2 px-2 bg-white text-slate-400">
                              -
                            </td>
                          </tr>

                          {/* Accent separator between subjects */}
                          {mIdx < subjectsWithTp.length - 1 && (
                            <tr className="bg-[#004e85]/10 h-2 border-y border-[#004e85]/20">
                              <td colSpan={5} className="p-0"></td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 5. Footer Information & Grade Legend */}
            <div className="pt-3 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-[10.5px] text-slate-600">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-700">Keterangan Nilai TP:</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                  ≥ 75 : Tercapai Optimal
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                  &lt; 75 : Perlu Bimbingan
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  - : Belum Ada Nilai
                </span>
                <span className="mx-1 text-slate-300">|</span>
                <span className="font-bold text-slate-700">Predikat Karakter:</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                  A (92-100)
                </span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-bold">
                  B (83-91)
                </span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-bold">
                  C (75-82)
                </span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                  D (65-74)
                </span>
              </div>

              <p className="text-[10px] text-slate-400 italic">
                SMP Budi Mulia Jakarta • Verifikasi Rapor Digital
              </p>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
