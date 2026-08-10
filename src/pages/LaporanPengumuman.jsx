import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// ─── Donut Chart Component ─────────────────────────────────────────────────
function DonutChart({ percentage, size = 120, strokeWidth = 12, color = '#6366f1', label, sublabel }) {
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (percentage / 100) * circ
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none" stroke={color}
          strokeWidth={strokeWidth} strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div className="flex flex-col items-center -mt-2" style={{ marginTop: `calc(-${size/2}px - 1rem)`, position: 'relative', zIndex: 1 }}>
        <span className="text-2xl font-black" style={{ color }}>{percentage}%</span>
      </div>
      {label && <p className="text-xs font-bold text-slate-700 text-center leading-tight">{label}</p>}
      {sublabel && <p className="text-[10px] text-slate-500 text-center">{sublabel}</p>}
    </div>
  )
}

// ─── Bar Chart Component ───────────────────────────────────────────────────
function BarChart({ data, onBarClick, activeFilter }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="flex items-end gap-2 h-40 w-full">
      {data.map((item, i) => {
        const pct = (item.value / max) * 100
        const isActive = activeFilter === item.key
        return (
          <div key={i} className="flex flex-col items-center justify-end gap-1 flex-1 h-full cursor-pointer group"
            onClick={() => onBarClick(item.key)}>
            <span className="text-[10px] font-bold text-slate-600 group-hover:text-indigo-600 transition-colors">{item.value}</span>
            <div className="w-full flex-1 flex items-end">
              <div className="w-full rounded-t-md transition-all duration-500 relative overflow-hidden"
                style={{
                  height: `${Math.max(pct, 4)}%`,
                  background: isActive
                    ? 'linear-gradient(180deg, #4f46e5 0%, #818cf8 100%)'
                    : 'linear-gradient(180deg, #a5b4fc 0%, #c7d2fe 100%)',
                  boxShadow: isActive ? '0 4px 12px rgba(99,102,241,0.4)' : 'none',
                  transform: isActive ? 'scaleY(1.05)' : 'scaleY(1)',
                  transformOrigin: 'bottom'
                }}
              />
            </div>
            <span className="text-[9px] text-slate-500 font-medium truncate w-full text-center" title={item.label}>{item.label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Stacked Progress Bar ─────────────────────────────────────────────────
function StackedBar({ items, total }) {
  return (
    <div className="flex h-4 w-full rounded-full overflow-hidden gap-px">
      {items.map((item, i) => (
        <div key={i}
          className="h-full transition-all duration-700"
          style={{ width: `${total > 0 ? (item.value / total) * 100 : 0}%`, background: item.color }}
          title={`${item.label}: ${item.value}`}
        />
      ))}
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color, bgColor, onClick, isActive, subtext }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col gap-2 p-4 rounded-2xl border-2 transition-all duration-200 text-left w-full ${
        isActive
          ? 'shadow-lg scale-[1.02]'
          : 'border-slate-200 hover:border-indigo-200 hover:shadow-md hover:scale-[1.01]'
      }`}
      style={{ background: isActive ? bgColor : 'white', borderColor: isActive ? color : '' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: bgColor }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <p className="text-3xl font-black" style={{ color: isActive ? color : '#1e293b' }}>{value}</p>
      {subtext && <p className="text-[10px] text-slate-500">{subtext}</p>}
    </button>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────
export default function LaporanPengumuman() {
  const { typeId } = useParams()
  const [searchParams] = useSearchParams()

  const [type, setType] = useState(null)
  const typeRef = useRef(null)  // simpan type untuk diakses dari realtime callback
  const [students, setStudents] = useState([])
  const [fileData, setFileData] = useState({})   // nisn -> { url, name, access, reqs }
  const [activityLogs, setActivityLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [schoolName, setSchoolName] = useState('eBudiMulia')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const [flashUpdate, setFlashUpdate] = useState(false)

  // Modal Popup state
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState('')
  const [modalFilters, setModalFilters] = useState({ class: 'all', stat: null })
  const [modalSearchQ, setModalSearchQ] = useState('')
  const printDate = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
  const showDownloadStats = type?.show_download_stats ?? true

  // ── Fetch berkas (dipanggil ulang saat realtime event) ─────────────────
  const fetchBerkas = useRef(null)
  fetchBerkas.current = async (typeData) => {
    const t = typeData || typeRef.current
    if (!t) return
    const kodeJenis = t.dokumen_kode_jenis || t.kode_jenis
    const { data: berkasData } = await supabase.from('berkas_pengumuman')
      .select('kode_siswa, file_name, file_url, is_accessible, persyaratan_terpenuhi')
      .eq('kode_jenis', kodeJenis)

    const kodes = (berkasData || []).map(d => d.kode_siswa)
    const { data: enrKode } = kodes.length > 0
      ? await supabase.from('enrollment').select('kode, nisn').in('kode', kodes)
      : { data: [] }
    const { data: enrNisn } = kodes.length > 0
      ? await supabase.from('enrollment').select('kode, nisn').in('nisn', kodes)
      : { data: [] }
    const enrAll = [...(enrKode || []), ...(enrNisn || [])]
    const kodeToNisn = new Map(enrAll.map(e => [e.kode, e.nisn]))
    const nisnToKode = new Map(enrAll.map(e => [e.nisn, e.kode]))

    const fd = {}
    ;(berkasData || []).forEach(f => {
      const nisn = kodeToNisn.get(f.kode_siswa) || f.kode_siswa
      const kode = nisnToKode.get(nisn) || f.kode_siswa
      const entry = {
        url: f.file_url && f.file_url !== '-' ? f.file_url : null,
        name: f.file_name,
        access: f.is_accessible,
        reqs: f.persyaratan_terpenuhi || {}
      }
      fd[nisn] = entry
      fd[kode] = entry
    })
    setFileData(fd)
    setLastUpdated(new Date())
    setFlashUpdate(true)
    setTimeout(() => setFlashUpdate(false), 2000)
  }

  // ── Fetch activity logs (dipanggil ulang saat realtime event) ──────────
  const fetchLogs = useRef(null)
  fetchLogs.current = async (typeData) => {
    const t = typeData || typeRef.current
    if (!t) return
    const { data: logData } = await supabase.from('activity_log')
      .select('*').eq('aksi', 'Unduh Dokumen')
      .ilike('detail', `%${t.nama}%`)
    setActivityLogs(logData || [])
    setLastUpdated(new Date())
    setFlashUpdate(true)
    setTimeout(() => setFlashUpdate(false), 2000)
  }

  // ── Initial full fetch ──────────────────────────────────────────────────
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true)
      try {
        // Fetch school name
        const { data: sch } = await supabase.from('pengaturan_sekolah')
          .select('setting_value').eq('setting_key', 'nama_sekolah').maybeSingle()
        if (sch?.setting_value) setSchoolName(sch.setting_value)

        // Fetch type
        const { data: typeData, error: typeErr } = await supabase
          .from('jenis_pengumuman').select('*').eq('id', typeId).single()
        if (typeErr || !typeData) { setError('Jenis pengumuman tidak ditemukan.'); setLoading(false); return }
        setType(typeData)
        typeRef.current = typeData

        // Fetch students
        const activeTaId = typeData.ta_referensi_id
        let studData = []
        let from = 0
        let to = 999
        let hasMore = true

        if (activeTaId) {
          while (hasMore) {
            const { data, error } = await supabase.from('enrollment')
              .select('*, siswa_permanent(*), tahun_ajaran(nama, is_aktif)')
              .eq('tahun_ajaran_id', activeTaId)
              .range(from, to)
            if (error) {
              console.error(error)
              break
            }
            if (!data || data.length === 0) {
              hasMore = false
            } else {
              studData = [...studData, ...data]
              if (data.length < 1000) {
                hasMore = false
              } else {
                from += 1000
                to += 1000
              }
            }
          }
        } else {
          while (hasMore) {
            const { data, error } = await supabase.from('siswa_lengkap')
              .select('*')
              .order('nama_lengkap')
              .range(from, to)
            if (error) {
              console.error(error)
              break
            }
            if (!data || data.length === 0) {
              hasMore = false
            } else {
              studData = [...studData, ...data]
              if (data.length < 1000) {
                hasMore = false
              } else {
                from += 1000
                to += 1000
              }
            }
          }
        }

        let finalStudents = []
        if (activeTaId && studData) {
          finalStudents = studData.map(e => ({
            ...e.siswa_permanent,
            nisn: e.nisn,
            kelas: e.kelas,
            kode: e.kode,
          }))
        } else {
          finalStudents = studData || []
        }
        if (typeData.target_kelas && typeData.target_kelas.length > 0) {
          finalStudents = finalStudents.filter(s => typeData.target_kelas.includes(s.kelas))
        }
        setStudents(finalStudents)

        // Fetch berkas & logs
        await fetchBerkas.current(typeData)
        await fetchLogs.current(typeData)

      } catch (e) {
        setError(e.message)
      }
      setLoading(false)
    }
    if (typeId) fetchAll()
  }, [typeId])

  // ── Supabase Realtime subscription ─────────────────────────────────────
  useEffect(() => {
    if (!typeId) return
    const channel = supabase
      .channel(`laporan-pengumuman-${typeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'berkas_pengumuman' },
        () => fetchBerkas.current()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'activity_log' },
        () => fetchLogs.current()
      )
      .subscribe((status) => {
        setRealtimeConnected(status === 'SUBSCRIBED')
      })
    return () => { supabase.removeChannel(channel) }
  }, [typeId])

  // ── Computed values ───────────────────────────────────────────────────
  const uniqueClasses = useMemo(() =>
    [...new Set(students.map(s => s.kelas).filter(Boolean))].sort(), [students])

  const totalSiswa = students.length
  const withFile = useMemo(() => students.filter(s => !!fileData[s.nisn]?.url).length, [students, fileData])
  const belumFile = totalSiswa - withFile
  const allReqMet = useMemo(() => {
    if (!type?.persyaratan?.length) return null
    return students.filter(s => type.persyaratan.every(r => fileData[s.nisn]?.reqs?.[r.id])).length
  }, [students, fileData, type])
  const sudahUnduh = useMemo(() =>
    students.filter(s => activityLogs.some(l => l.detail?.includes(s.nama_lengkap))).length, [students, activityLogs])

  // Per-requirement stats
  const reqStats = useMemo(() => {
    if (!type?.persyaratan?.length) return []
    return type.persyaratan.map(req => {
      const count = students.filter(s => fileData[s.nisn]?.reqs?.[req.id]).length
      return { ...req, count, pct: totalSiswa > 0 ? Math.round((count / totalSiswa) * 100) : 0 }
    })
  }, [type, students, fileData, totalSiswa])

  // Per-class stats
  const classStats = useMemo(() => uniqueClasses.map(c => {
    const cls = students.filter(s => s.kelas === c)
    const total = cls.length
    const wf = cls.filter(s => !!fileData[s.nisn]?.url).length
    const hasReqs = type?.persyaratan?.length > 0
    const allMet = hasReqs
      ? cls.filter(s => type.persyaratan.every(r => fileData[s.nisn]?.reqs?.[r.id])).length
      : wf
    const unduh = cls.filter(s => activityLogs.some(l => l.detail?.includes(s.nama_lengkap))).length
    const reqCounts = (type?.persyaratan || []).map(req => ({
      ...req,
      count: cls.filter(s => fileData[s.nisn]?.reqs?.[req.id]).length
    }))
    return { kelas: c, total, wf, allMet, unduh, pct: total > 0 ? Math.round((allMet / total) * 100) : 0, reqCounts }
  }), [uniqueClasses, students, fileData, type, activityLogs])



  // ── Filtered rows for Modal ───────────────────────────────────────────
  const modalFiltered = useMemo(() => {
    if (!modalOpen) return []
    return students.filter(s => {
      if (modalFilters.class !== 'all' && s.kelas !== modalFilters.class) return false

      const fd_ = fileData[s.nisn] || {}
      const hasFile = !!fd_.url

      if (modalFilters.stat) {
        if (modalFilters.stat === 'withFile' && !hasFile) return false
        if (modalFilters.stat === 'belumFile' && hasFile) return false
        if (modalFilters.stat === 'lengkap') {
          const allMet = type?.persyaratan?.length > 0
            ? type.persyaratan.every(r => fd_.reqs?.[r.id])
            : true
          if (!hasFile || !allMet) return false
        }
        if (modalFilters.stat === 'sudahUnduh') {
          if (!activityLogs.some(l => l.detail?.includes(s.nama_lengkap))) return false
        }
        // per-req filter: 'req_<id>_true' or 'req_<id>_false'
        if (modalFilters.stat.startsWith('req_')) {
          const parts = modalFilters.stat.split('_')
          const reqId = parts.slice(1, -1).join('_')
          const val = parts[parts.length - 1] === 'true'
          if (!!(fd_?.reqs?.[reqId]) !== val) return false
        }
      }

      return true
    }).sort((a, b) => {
      if (a.kelas !== b.kelas) return (a.kelas || '').localeCompare(b.kelas || '')
      return (a.nama_lengkap || '').localeCompare(b.nama_lengkap || '')
    })
  }, [students, modalFilters, fileData, type, activityLogs, modalOpen])

  const finalModalStudents = useMemo(() => {
    const q = modalSearchQ.toLowerCase().trim()
    if (!q) return modalFiltered
    return modalFiltered.filter(s =>
      s.nama_lengkap?.toLowerCase().includes(q) || s.nisn?.includes(q)
    )
  }, [modalFiltered, modalSearchQ])

  const handleStatClick = (key, title) => {
    setModalFilters({ class: 'all', stat: key })
    setModalTitle(title)
    setModalSearchQ('')
    setModalOpen(true)
  }

  const handleClassBarClick = (kelas) => {
    setModalFilters({ class: kelas, stat: null })
    setModalTitle(`Daftar Siswa Kelas ${kelas}`)
    setModalSearchQ('')
    setModalOpen(true)
  }

  const handleClassClick = handleClassBarClick

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-slate-500 font-medium">Memuat laporan...</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-red-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-8 shadow-lg text-center max-w-sm">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-slate-800 mb-2">Laporan Tidak Tersedia</h2>
        <p className="text-slate-500 text-sm">{error}</p>
      </div>
    </div>
  )

  const hasReqs = type?.persyaratan?.length > 0

  // Colors per req index
  const reqColors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9']

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm print:static">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png?v=1784818000" alt="Logo" className="h-8 sm:h-10 object-contain shrink-0" />
            <div className="min-w-0">
              <p className="text-[9px] sm:text-[10px] font-semibold text-indigo-500 uppercase tracking-widest">Laporan Pengumuman</p>
              <h1 className="text-sm sm:text-lg font-black text-slate-900 leading-tight truncate sm:whitespace-normal" title={type?.nama}>
                {type?.nama}
              </h1>
            </div>
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-2 print:hidden shrink-0">
            <div className="flex items-center gap-2">
              {/* Realtime status badge */}
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] sm:text-[10px] font-bold transition-all duration-500 shrink-0
                ${realtimeConnected
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-amber-50 text-amber-600 border border-amber-200'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${realtimeConnected ? 'bg-green-500 animate-pulse' : 'bg-amber-400'}`} />
                {realtimeConnected ? 'Live' : 'Connecting...'}
              </div>
              {lastUpdated && (
                <span className={`text-[9px] sm:text-[10px] text-slate-500 hidden md:block transition-all duration-300
                  ${flashUpdate ? 'text-indigo-600 font-semibold scale-105' : ''}`}>
                  Diperbarui: {lastUpdated.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </div>
            <button onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold transition-all shadow-sm active:scale-95 shrink-0">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2m2 4h6a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2zm1-10V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3" />
              </svg>
              Cetak / PDF
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* ── META INFO ─────────────────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-2xl p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-indigo-200 text-xs font-semibold uppercase tracking-widest mb-1">{schoolName}</p>
              <h2 className="text-2xl font-black">{type?.nama}</h2>
              <p className="text-indigo-200 text-sm mt-1">
                Kode: <code className="bg-white/20 px-2 py-0.5 rounded text-xs font-mono">{type?.kode_jenis}</code>
                {type?.target_kelas?.length > 0 && (
                  <span className="ml-3">Target Kelas: {type.target_kelas.join(', ')}</span>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-indigo-200 text-xs">Dihasilkan pada</p>
              <p className="font-bold">{printDate}</p>
              <p className="text-indigo-200 text-xs mt-1">
                Status: <span className={`font-semibold ${type?.aktif ? 'text-green-300' : 'text-red-300'}`}>
                  {type?.aktif ? '● Aktif' : '○ Nonaktif'}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* ── STAT CARDS ────────────────────────────────────────────────── */}
        <div>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Statistik Utama
            <span className="ml-2 text-indigo-400 font-normal normal-case">(klik untuk melihat detail siswa)</span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
              label="Total Siswa" value={totalSiswa}
              color="#64748b" bgColor="#f1f5f9"
              isActive={modalOpen && modalFilters.stat === null && modalFilters.class === 'all'}
              onClick={() => handleStatClick(null, 'Daftar Semua Siswa')}
            />
            <StatCard
              icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              label="Ada Berkas" value={withFile}
              color="#10b981" bgColor="#ecfdf5"
              isActive={modalOpen && modalFilters.stat === 'withFile'}
              onClick={() => handleStatClick('withFile', 'Daftar Siswa - Ada Berkas')}
              subtext={`${totalSiswa > 0 ? Math.round((withFile/totalSiswa)*100) : 0}% dari total`}
            />
            {allReqMet !== null && (
              <StatCard
                icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>}
                label="Syarat Lengkap" value={allReqMet}
                color="#6366f1" bgColor="#eef2ff"
                isActive={modalOpen && modalFilters.stat === 'lengkap'}
                onClick={() => handleStatClick('lengkap', 'Daftar Siswa - Syarat Lengkap')}
                subtext={`${totalSiswa > 0 ? Math.round((allReqMet/totalSiswa)*100) : 0}% dari total`}
              />
            )}
            {showDownloadStats && (
              <StatCard
                icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                label="Sudah Mengunduh" value={sudahUnduh}
                color="#0ea5e9" bgColor="#f0f9ff"
                isActive={modalOpen && modalFilters.stat === 'sudahUnduh'}
                onClick={() => handleStatClick('sudahUnduh', 'Daftar Siswa - Sudah Mengunduh')}
                subtext={`${totalSiswa > 0 ? Math.round((sudahUnduh/totalSiswa)*100) : 0}% dari total`}
              />
            )}
            <StatCard
              icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>}
              label="Belum Ada Berkas" value={belumFile}
              color="#ef4444" bgColor="#fef2f2"
              isActive={modalOpen && modalFilters.stat === 'belumFile'}
              onClick={() => handleStatClick('belumFile', 'Daftar Siswa - Belum Ada Berkas')}
            />
          </div>
        </div>

        {/* ── PER-REQ STATS ─────────────────────────────────────────────── */}
        {hasReqs && (
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Status Per Syarat
              <span className="ml-2 text-indigo-400 font-normal normal-case">(klik untuk melihat detail siswa)</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {reqStats.map((req, i) => (
                <div key={req.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: reqColors[i % reqColors.length] }} />
                      <p className="text-sm font-semibold text-slate-800">{req.nama}</p>
                    </div>
                    <span className="text-lg font-black" style={{ color: reqColors[i % reqColors.length] }}>{req.pct}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-3">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${req.pct}%`, background: reqColors[i % reqColors.length] }} />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleStatClick(`req_${req.id}_true`, `Siswa yang Sudah: ${req.nama}`)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all
                        ${modalOpen && modalFilters.stat === `req_${req.id}_true`
                          ? 'bg-green-500 text-white shadow-sm'
                          : 'bg-green-50 text-green-700 hover:bg-green-100'}`}>
                      ✓ Sudah ({req.count})
                    </button>
                    <button
                      onClick={() => handleStatClick(`req_${req.id}_false`, `Siswa yang Belum: ${req.nama}`)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all
                        ${modalOpen && modalFilters.stat === `req_${req.id}_false`
                          ? 'bg-red-500 text-white shadow-sm'
                          : 'bg-red-50 text-red-700 hover:bg-red-100'}`}>
                      ✗ Belum ({totalSiswa - req.count})
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── DIAGRAMS ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Donut overall */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-6">Ringkasan Keseluruhan</h3>
            <div className="flex flex-wrap gap-6 justify-center">
              <div className="flex flex-col items-center">
                <div className="relative" style={{ width: 120, height: 120 }}>
                  <svg width={120} height={120} viewBox="0 0 120 120" className="-rotate-90">
                    <circle cx={60} cy={60} r={48} fill="none" stroke="#e2e8f0" strokeWidth={12} />
                    <circle cx={60} cy={60} r={48} fill="none" stroke="#10b981"
                      strokeWidth={12}
                      strokeDasharray={2 * Math.PI * 48}
                      strokeDashoffset={2 * Math.PI * 48 - (totalSiswa > 0 ? withFile / totalSiswa : 0) * 2 * Math.PI * 48}
                      strokeLinecap="round"
                      style={{ transition: 'stroke-dashoffset 1.2s ease' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-black text-emerald-600">{totalSiswa > 0 ? Math.round((withFile/totalSiswa)*100) : 0}%</span>
                  </div>
                </div>
                <p className="text-xs font-bold text-slate-700 mt-2 text-center">Ada Berkas</p>
                <p className="text-[10px] text-slate-500">{withFile} / {totalSiswa} siswa</p>
              </div>
              {allReqMet !== null && (
                <div className="flex flex-col items-center">
                  <div className="relative" style={{ width: 120, height: 120 }}>
                    <svg width={120} height={120} viewBox="0 0 120 120" className="-rotate-90">
                      <circle cx={60} cy={60} r={48} fill="none" stroke="#e2e8f0" strokeWidth={12} />
                      <circle cx={60} cy={60} r={48} fill="none" stroke="#6366f1"
                        strokeWidth={12}
                        strokeDasharray={2 * Math.PI * 48}
                        strokeDashoffset={2 * Math.PI * 48 - (totalSiswa > 0 ? allReqMet / totalSiswa : 0) * 2 * Math.PI * 48}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dashoffset 1.2s ease' }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl font-black text-indigo-600">{totalSiswa > 0 ? Math.round((allReqMet/totalSiswa)*100) : 0}%</span>
                    </div>
                  </div>
                  <p className="text-xs font-bold text-slate-700 mt-2 text-center">Syarat Lengkap</p>
                  <p className="text-[10px] text-slate-500">{allReqMet} / {totalSiswa} siswa</p>
                </div>
              )}
              {showDownloadStats && (
                <div className="flex flex-col items-center">
                  <div className="relative" style={{ width: 120, height: 120 }}>
                    <svg width={120} height={120} viewBox="0 0 120 120" className="-rotate-90">
                      <circle cx={60} cy={60} r={48} fill="none" stroke="#e2e8f0" strokeWidth={12} />
                      <circle cx={60} cy={60} r={48} fill="none" stroke="#0ea5e9"
                        strokeWidth={12}
                        strokeDasharray={2 * Math.PI * 48}
                        strokeDashoffset={2 * Math.PI * 48 - (totalSiswa > 0 ? sudahUnduh / totalSiswa : 0) * 2 * Math.PI * 48}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dashoffset 1.2s ease' }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl font-black text-sky-600">{totalSiswa > 0 ? Math.round((sudahUnduh/totalSiswa)*100) : 0}%</span>
                    </div>
                  </div>
                  <p className="text-xs font-bold text-slate-700 mt-2 text-center">Sudah Mengunduh</p>
                  <p className="text-[10px] text-slate-500">{sudahUnduh} / {totalSiswa} siswa</p>
                </div>
              )}
            </div>
          </div>

          {/* Bar chart per kelas */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-1">Progress Per Kelas</h3>
            <p className="text-[10px] text-slate-500 mb-4">Klik batang untuk melihat daftar siswa</p>
            {classStats.length === 0
              ? <p className="text-slate-400 text-sm text-center py-8">Tidak ada data kelas</p>
              : <BarChart
                  data={classStats.map(c => ({
                    key: c.kelas,
                    label: c.kelas,
                    value: c.allMet
                  }))}
                  onBarClick={handleClassBarClick}
                  activeFilter={modalOpen && modalFilters.class !== 'all' ? modalFilters.class : null}
                />
            }
          </div>
        </div>

        {/* ── PER-CLASS PROGRESS TABLE ──────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-800">Rekapitulasi Per Kelas</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Kelas</th>
                  <th className="text-center px-3 py-3">Total</th>
                  <th className="text-center px-3 py-3">Ada Berkas</th>
                  {hasReqs && type.persyaratan.map(req => (
                    <th key={req.id} className="text-center px-3 py-3 max-w-[80px]">
                      <span className="truncate block" title={req.nama}>{req.nama}</span>
                    </th>
                  ))}
                  <th className="text-center px-3 py-3">Syarat Lengkap</th>
                  {showDownloadStats && <th className="text-center px-3 py-3">Sudah Unduh</th>}
                  <th className="px-4 py-3 min-w-[120px]">Progress</th>
                </tr>
              </thead>
              <tbody>
                {classStats.map((c, i) => (
                  <tr key={c.kelas}
                    className={`border-b border-slate-50 hover:bg-indigo-50/30 transition-colors cursor-pointer
                      ${modalOpen && modalFilters.class === c.kelas ? 'bg-indigo-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                    onClick={() => handleClassClick(c.kelas)}>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700">{c.kelas}</span>
                    </td>
                    <td className="text-center px-3 py-3 font-bold text-slate-700">{c.total}</td>
                    <td className="text-center px-3 py-3">
                      <span className="text-emerald-600 font-bold">{c.wf}</span>
                      <span className="text-slate-400 text-[10px]">/{c.total}</span>
                    </td>
                    {hasReqs && c.reqCounts.map(r => (
                      <td key={r.id} className="text-center px-3 py-3">
                        <span className="text-indigo-600 font-bold">{r.count}</span>
                        <span className="text-slate-400 text-[10px]">/{c.total}</span>
                      </td>
                    ))}
                    <td className="text-center px-3 py-3">
                      <span className={`font-bold ${c.allMet === c.total ? 'text-green-600' : 'text-indigo-600'}`}>{c.allMet}</span>
                      <span className="text-slate-400 text-[10px]">/{c.total}</span>
                    </td>
                    {showDownloadStats && (
                        <td className="text-center px-3 py-3">
                          <span className="text-sky-600 font-bold">{c.unduh}</span>
                          <span className="text-slate-400 text-[10px]">/{c.total}</span>
                        </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${c.pct}%`,
                              background: c.pct >= 100 ? '#10b981' : c.pct >= 75 ? '#6366f1' : c.pct >= 50 ? '#f59e0b' : '#ef4444'
                            }} />
                        </div>
                        <span className="text-[10px] font-bold text-slate-600 w-8 text-right">{c.pct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>



        {/* ── FOOTER ─────────────────────────────────────────────────────── */}
        <div className="text-center py-6 text-slate-400 text-xs border-t border-slate-200 print:block">
          <p>{schoolName} &bull; Laporan {type?.nama} &bull; {printDate}</p>
          <p className="mt-1 text-[10px]">Dokumen ini dihasilkan secara otomatis oleh sistem eBudiMulia</p>
        </div>
      </div>

      {/* Modal Popup untuk Siswa Terfilter */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100 animate-scale-up">
            
            {/* Header Modal */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-50/50 to-white">
              <div>
                <h3 className="text-lg font-black text-slate-800">{modalTitle}</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Menampilkan <span className="font-bold text-indigo-600">{finalModalStudents.length}</span> dari {modalFiltered.length} siswa yang sesuai filter
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors active:scale-95"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Pencarian dan Filter dalam Modal */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  placeholder="Cari nama atau NISN di list ini..."
                  value={modalSearchQ}
                  onChange={e => setModalSearchQ(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                />
              </div>
              <select
                value={modalFilters.class}
                onChange={e => setModalFilters(prev => ({ ...prev, class: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer"
              >
                <option value="all">Semua Kelas</option>
                {uniqueClasses.map(c => (
                  <option key={c} value={c}>Kelas {c}</option>
                ))}
              </select>
            </div>

            {/* Isi Daftar Siswa */}
            <div className="overflow-y-auto flex-1 p-6">
              {finalModalStudents.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  Tidak ada data siswa yang cocok dengan filter pencarian ini.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-wider">
                      <th className="text-center px-3 py-2 w-10">No</th>
                      <th className="text-left px-3 py-2">Nama Siswa</th>
                      <th className="text-left px-3 py-2 w-28">NISN</th>
                      <th className="text-center px-3 py-2 w-16">Kelas</th>
                      <th className="text-center px-3 py-2 w-20">Berkas</th>
                      {hasReqs && type.persyaratan.map(req => (
                        <th key={req.id} className="text-center px-3 py-2 w-24">
                          <span className="truncate block max-w-[80px] mx-auto" title={req.nama}>{req.nama}</span>
                        </th>
                      ))}
                      {showDownloadStats && <th className="text-center px-3 py-2 w-24">Status Unduh</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {finalModalStudents.map((s, idx) => {
                      const fd_ = fileData[s.nisn] || {}
                      const hasFile = !!fd_.url
                      const hasUnduh = activityLogs.some(l => l.detail?.includes(s.nama_lengkap))
                      const allMet = hasReqs ? type.persyaratan.every(r => fd_.reqs?.[r.id]) : true
                      const isComplete = hasFile && allMet

                      return (
                        <tr key={s.kode ?? s.nisn ?? idx} className={`border-b border-slate-50 transition-colors hover:bg-slate-50/50 ${isComplete ? 'bg-emerald-50/20' : ''}`}>
                          <td className="text-center px-3 py-2.5 text-slate-400">{idx + 1}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-[9px] font-black shrink-0">
                                {(s.nama_lengkap || '?').charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium text-slate-900">{s.nama_lengkap}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[10px] text-slate-500">{s.nisn ?? '—'}</td>
                          <td className="text-center px-3 py-2.5">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700">{s.kelas ?? '—'}</span>
                          </td>
                          <td className="text-center px-3 py-2.5">
                            {hasFile
                              ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                                  Ada
                                </span>
                              : <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-500 border border-red-200">—</span>
                            }
                          </td>
                          {hasReqs && type.persyaratan.map(req => {
                            const met = !!(fd_.reqs?.[req.id])
                            return (
                              <td key={req.id} className="text-center px-3 py-2.5">
                                {met
                                  ? <span className="text-green-600 font-black text-sm">✓</span>
                                  : <span className="text-red-400 font-black text-sm">✗</span>
                                }
                              </td>
                            )
                          })}
                           {showDownloadStats && (
                            <td className="text-center px-3 py-2.5">
                              {hasUnduh
                                ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                                    Diakses
                                  </span>
                                : <span className="text-slate-300 text-[10px]">—</span>
                              }
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer Modal */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setModalOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold transition active:scale-95 shadow-sm"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Style kustom & print & animasi */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleUp {
          from { transform: scale(0.96); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-fade-in {
          animation: fadeIn 0.2s ease-out forwards;
        }
        .animate-scale-up {
          animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @media print {
          .print\\:hidden { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 1cm; }
        }
      `}</style>
    </div>
  )
}
