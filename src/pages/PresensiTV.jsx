import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { QRCodeSVG } from 'qrcode.react'

// Theme Colors Mapping (Based on data-theme config in index.css)
const THEME_MAP = {
  indigo: {
    text: 'text-indigo-400',
    textLight: 'text-indigo-300',
    bg: 'bg-indigo-600',
    bgHover: 'hover:bg-indigo-700',
    bgLight: 'bg-indigo-950/40',
    border: 'border-indigo-500/20',
    glow: 'from-indigo-500/20 to-transparent',
    bar: 'from-indigo-500 to-emerald-500',
    colorHex: '#6366f1'
  },
  blue: {
    text: 'text-blue-400',
    textLight: 'text-blue-300',
    bg: 'bg-blue-600',
    bgHover: 'hover:bg-blue-700',
    bgLight: 'bg-blue-950/40',
    border: 'border-blue-500/20',
    glow: 'from-blue-500/20 to-transparent',
    bar: 'from-blue-500 to-emerald-500',
    colorHex: '#3b82f6'
  },
  emerald: {
    text: 'text-emerald-400',
    textLight: 'text-emerald-300',
    bg: 'bg-emerald-600',
    bgHover: 'hover:bg-emerald-700',
    bgLight: 'bg-emerald-950/40',
    border: 'border-emerald-500/20',
    glow: 'from-emerald-500/20 to-transparent',
    bar: 'from-emerald-500 to-teal-500',
    colorHex: '#10b981'
  },
  rose: {
    text: 'text-rose-400',
    textLight: 'text-rose-300',
    bg: 'bg-rose-600',
    bgHover: 'hover:bg-rose-700',
    bgLight: 'bg-rose-950/40',
    border: 'border-rose-500/20',
    glow: 'from-rose-500/20 to-transparent',
    bar: 'from-rose-500 to-orange-500',
    colorHex: '#f43f5e'
  },
  amber: {
    text: 'text-amber-400',
    textLight: 'text-amber-300',
    bg: 'bg-amber-600',
    bgHover: 'hover:bg-amber-700',
    bgLight: 'bg-amber-950/40',
    border: 'border-amber-500/20',
    glow: 'from-amber-500/20 to-transparent',
    bar: 'from-amber-500 to-yellow-500',
    colorHex: '#f59e0b'
  },
  slate: {
    text: 'text-slate-400',
    textLight: 'text-slate-300',
    bg: 'bg-slate-600',
    bgHover: 'hover:bg-slate-700',
    bgLight: 'bg-slate-900/40',
    border: 'border-slate-500/20',
    glow: 'from-slate-550/20 to-transparent',
    bar: 'from-slate-500 to-slate-400',
    colorHex: '#64748b'
  }
}

function generateToken() {
  const arr = new Uint8Array(24)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')
}

// Fixed format to query for student photo by NISN
function getStudentPhotoUrl(nisn, activeTaId) {
  if (!activeTaId) return `https://res.cloudinary.com/dwyhpysp5/image/upload/c_fill,w_100,h_100/SKL-BM/FOTO_${nisn}`
  return `https://res.cloudinary.com/dwyhpysp5/image/upload/c_fill,w_100,h_100/SKL-BM/FOTO_${nisn}_${activeTaId}`
}

function formatJam(date) {
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function formatTanggal(date) {
  return date.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

export default function PresensiTV() {
  const [now, setNow] = useState(new Date())
  const [token, setToken] = useState('')
  const [expiresAt, setExpiresAt] = useState(null)
  const [countdown, setCountdown] = useState(0)
  const [interval, setInterval_] = useState(20) // detik
  const [stats, setStats] = useState({ hadir: 0, terlambat: 0, sakit: 0, izin: 0, alpha: 0, belum: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [sekolahNama, setSekolahNama] = useState('SMP Budi Mulia Jakarta')
  const [themeColor, setThemeColor] = useState('indigo')
  const [activeTa, setActiveTa] = useState(null)
  const [jamBatasPulang, setJamBatasPulang] = useState('')
  const [jamMulaiPresensi, setJamMulaiPresensi] = useState('')
  const [hariAktifPresensi, setHariAktifPresensi] = useState('1,2,3,4,5')
  const [jadwalOtomatisAktif, setJadwalOtomatisAktif] = useState(false)
  const [isNativeFullScreen, setIsNativeFullScreen] = useState(false)
  const [sesiAktif, setSesiAktif] = useState(true)
  const [zoomLevel, setZoomLevel] = useState(() => {
    const saved = localStorage.getItem('tv_zoom_level')
    return saved ? parseFloat(saved) : 0.78
  })

  const changeZoom = (delta) => {
    setZoomLevel(prev => {
      const next = Math.max(0.4, Math.min(1.5, Math.round((prev + delta) * 100) / 100))
      localStorage.setItem('tv_zoom_level', String(next))
      return next
    })
  }

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }

  useEffect(() => {
    const handleFs = () => setIsNativeFullScreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handleFs)
    document.addEventListener('webkitfullscreenchange', handleFs)
    return () => {
      document.removeEventListener('fullscreenchange', handleFs)
      document.removeEventListener('webkitfullscreenchange', handleFs)
    }
  }, [])

  useEffect(() => {
    const savedFont = localStorage.getItem('fontPreference') || 'jakarta'
    document.documentElement.classList.remove('font-ubuntu', 'font-bricolage')
    if (savedFont === 'ubuntu') document.documentElement.classList.add('font-ubuntu')
    if (savedFont === 'bricolage') document.documentElement.classList.add('font-bricolage')
  }, [])

  // Realtime checkins list state
  const [latestPresensi, setLatestPresensi] = useState([])

  const intervalRef = useRef(null)
  const countdownRef = useRef(null)
  const listContainerRef = useRef(null) // Ref to auto-scroll realtime feed

  // Real-time clock tick
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

  // Resolve active theme properties
  const theme = useMemo(() => THEME_MAP[themeColor] || THEME_MAP.indigo, [themeColor])

  // Auto-scroll to top when a new checked-in student is loaded
  useEffect(() => {
    if (listContainerRef.current) {
      listContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [latestPresensi])

  // Fetch settings, theme config & active year
  const fetchPengaturan = useCallback(async () => {
    const { data } = await supabase.from('pengaturan_sekolah').select('setting_key, setting_value')
    if (data) {
      const map = {}
      data.forEach(d => { map[d.setting_key] = d.setting_value })
      const iv = parseInt(map['qr_interval_detik'] || '20', 10)
      setInterval_(iv)
      if (map['nama_sekolah']) setSekolahNama(map['nama_sekolah'])
      if (map['tema_warna']) {
        setThemeColor(map['tema_warna'])
        document.documentElement.setAttribute('data-theme', map['tema_warna'])
      }
      if (map['jam_batas_pulang']) setJamBatasPulang(map['jam_batas_pulang'])
      if (map['jam_mulai_presensi']) setJamMulaiPresensi(map['jam_mulai_presensi'])
      if (map['hari_aktif_presensi']) setHariAktifPresensi(map['hari_aktif_presensi'])
      if (map['jadwal_otomatis_aktif']) setJadwalOtomatisAktif(map['jadwal_otomatis_aktif'] === 'true')
    }

    const { data: taData } = await supabase.from('tahun_ajaran').select('*').eq('is_aktif', true).maybeSingle()
    if (taData) {
      setActiveTa(taData)
    }
  }, [])

  // Fetch stats presensi hari ini
  const fetchStats = useCallback(async () => {
    const today = new Date().toLocaleDateString('en-CA')
    const { data: siswaAll } = await supabase.from('siswa_lengkap').select('nisn').eq('is_aktif', true)
    const total = siswaAll?.length ?? 0

    const { data: presensi } = await supabase.from('presensi_harian').select('status, tipe').eq('tanggal', today)
    const filteredPresensi = presensi?.filter(p => !p.tipe || p.tipe !== 'pulang') || []
    
    const hadir = filteredPresensi.filter(p => p.status === 'H' || p.status === 'T').length
    const terlambat = filteredPresensi.filter(p => p.status === 'T').length
    const sakit = filteredPresensi.filter(p => p.status === 'S').length
    const izin = filteredPresensi.filter(p => p.status === 'I').length
    const alpha = filteredPresensi.filter(p => p.status === 'A').length
    const belum = total - filteredPresensi.length
    setStats({ hadir, terlambat, sakit, izin, alpha, belum, total })

    // Check if session is active in DB for today
    const { data: sesi } = await supabase.from('sesi_presensi').select('tanggal').eq('tanggal', today).maybeSingle()
    setSesiAktif(!!sesi)
  }, [])

  // Fetch 6 latest checked-in students dynamically
  const fetchLatestCheckins = useCallback(async () => {
    const todayStr = new Date().toLocaleDateString('en-CA')
    const { data, error } = await supabase
      .from('presensi_harian')
      .select('siswa_nisn, waktu, status, tipe')
      .eq('tanggal', todayStr)
      .in('status', ['H', 'T', 'P'])
      .order('updated_at', { ascending: false })
      .limit(6)

    if (!error && data && data.length > 0) {
      const nisns = data.map(p => p.siswa_nisn)
      const { data: siswaData } = await supabase
        .from('siswa_lengkap')
        .select('nisn, nama_lengkap, kelas')
        .in('nisn', nisns)

      const merged = data.map(p => {
        const s = siswaData?.find(x => x.nisn === p.siswa_nisn)
        return {
          ...p,
          nama: s?.nama_lengkap || p.siswa_nisn,
          kelas: s?.kelas || '-'
        }
      })
      setLatestPresensi(merged)
    } else {
      setLatestPresensi([])
    }
  }, [])

  // Generate new dynamic token
  // NOTE: expires_at in DB is intentionally LONGER than the display interval.
  // This gives students enough time to open camera & submit even if TV QR has rotated.
  const generateNewToken = useCallback(async (iv) => {
    const currentInterval = iv || interval
    const newToken = generateToken()
    // Token stays valid for at least 60s or 3× the display interval (whichever is longer)
    const tokenValiditySec = Math.max(currentInterval * 3, 60)
    const expiresAt = new Date(Date.now() + tokenValiditySec * 1000).toISOString()

    // Clean tokens older than tokenValiditySec and insert new one
    const cutoff = new Date(Date.now() - tokenValiditySec * 1000).toISOString()
    await supabase.from('qr_tokens').delete().lt('expires_at', cutoff)
    const { data } = await supabase.from('qr_tokens').insert({
      token: newToken,
      expires_at: expiresAt
    }).select().single()

    setToken(data?.token || newToken)
    setExpiresAt(new Date(expiresAt))
    return currentInterval
  }, [interval])

  // Initialize data
  useEffect(() => {
    const init = async () => {
      await fetchPengaturan()
      setLoading(false)
    }
    init()
  }, [fetchPengaturan])

  // Start Token Cycles
  useEffect(() => {
    if (loading) return

    const startCycle = async () => {
      const iv = await generateNewToken(interval)
      fetchStats()
      fetchLatestCheckins()

      let remaining = iv
      setCountdown(remaining)
      if (countdownRef.current) clearInterval(countdownRef.current)
      countdownRef.current = setInterval(() => {
        remaining -= 1
        setCountdown(remaining)
        if (remaining <= 0) clearInterval(countdownRef.current)
      }, 1000)
    }

    startCycle()

    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      startCycle()
    }, interval * 1000)

    return () => {
      clearInterval(intervalRef.current)
      clearInterval(countdownRef.current)
    }
  }, [loading, interval, generateNewToken, fetchStats, fetchLatestCheckins])

  // Cache NISN → student info to avoid repeated lookups
  const siswaCache = useRef({})

  // Fetch student info for a NISN, using cache
  const getSiswaInfo = useCallback(async (nisn) => {
    if (siswaCache.current[nisn]) return siswaCache.current[nisn]
    const { data } = await supabase
      .from('siswa_lengkap')
      .select('nisn, nama_lengkap, kelas')
      .eq('nisn', nisn)
      .maybeSingle()
    if (data) {
      siswaCache.current[nisn] = { nama: data.nama_lengkap, kelas: data.kelas }
    }
    return siswaCache.current[nisn] || { nama: nisn, kelas: '-' }
  }, [])

  // Realtime events listener — instant update via payload, then full refresh
  useEffect(() => {
    const todayStr = new Date().toLocaleDateString('en-CA')

    const channel = supabase
      .channel('presensi-tv-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'presensi_harian' }, async (payload) => {
        const rec = payload.new
        if (!rec || rec.tanggal !== todayStr) return

        // Instant update: prepend with known data, name resolved async
        const siswa = await getSiswaInfo(rec.siswa_nisn)
        setLatestPresensi(prev => {
          const updated = [{
            siswa_nisn: rec.siswa_nisn,
            waktu: rec.waktu || new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
            status: rec.status,
            tipe: rec.tipe,
            nama: siswa.nama,
            kelas: siswa.kelas
          }, ...prev].slice(0, 6)
          return updated
        })
        fetchStats()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'presensi_harian' }, async (payload) => {
        const rec = payload.new
        if (!rec || rec.tanggal !== todayStr) return
        // On update (e.g. pulang), refresh list fully
        fetchStats()
        fetchLatestCheckins()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sesi_presensi' }, () => {
        fetchStats()
      })
      .subscribe()

    fetchStats()
    fetchLatestCheckins()

    return () => supabase.removeChannel(channel)
  }, [fetchStats, fetchLatestCheckins, getSiswaInfo])

  // Fast-poll fallback for activity feed (2s) — catches missed realtime events
  useEffect(() => {
    if (loading) return
    const poll = setInterval(() => {
      fetchLatestCheckins()
      fetchStats()
    }, 2000)
    return () => clearInterval(poll)
  }, [loading, fetchLatestCheckins, fetchStats])

  const percentHadir = stats.total > 0 ? Math.round(((stats.hadir + stats.terlambat) / stats.total) * 100) : 0
  const qrValue = useMemo(() => token ? JSON.stringify({ token }) : '{}', [token])
  const countdownPct = interval > 0 ? (countdown / interval) * 100 : 0

  const isHariAktif = useMemo(() => {
    if (!jadwalOtomatisAktif) return true
    const todayDow = now.getDay()
    const activeDays = (hariAktifPresensi || '1,2,3,4,5').split(',').map(Number)
    return activeDays.includes(todayDow)
  }, [now, jadwalOtomatisAktif, hariAktifPresensi])

  const presensiBelumMulai = useMemo(() => {
    if (!sesiAktif) return true
    if (!jadwalOtomatisAktif || !jamMulaiPresensi) return false
    if (!isHariAktif) return false
    const [mh, mm] = jamMulaiPresensi.split(':').map(Number)
    const [nh, nm] = [now.getHours(), now.getMinutes()]
    return nh < mh || (nh === mh && nm < mm)
  }, [now, jadwalOtomatisAktif, jamMulaiPresensi, isHariAktif, sesiAktif])

  const presensiSelesai = useMemo(() => {
    if (!jadwalOtomatisAktif || !jamBatasPulang) return false
    if (!isHariAktif) return false
    const [bh, bm] = jamBatasPulang.split(':').map(Number)
    const [nh, nm] = [now.getHours(), now.getMinutes()]
    return nh > bh || (nh === bh && nm >= bm)
  }, [now, jadwalOtomatisAktif, jamBatasPulang, isHariAktif])

  return (
    <div className="h-screen bg-slate-50 text-slate-800 flex flex-col overflow-hidden select-none relative">
      
      {/* BACKGROUND DECORATIVE FLOATING AURORA SPHERES */}
      <div 
        className="absolute w-[500px] h-[500px] rounded-full blur-[100px] opacity-10 pointer-events-none -top-20 -left-20"
        style={{
          animation: 'float-glow-1 10s infinite alternate ease-in-out',
          background: `radial-gradient(circle, ${theme.colorHex || '#6366f1'} 0%, transparent 70%)`
        }}
      />
      <div 
        className="absolute w-[500px] h-[500px] rounded-full blur-[100px] opacity-10 pointer-events-none -bottom-20 -right-20"
        style={{
          animation: 'float-glow-2 12s infinite alternate ease-in-out',
          background: 'radial-gradient(circle, #10b981 0%, transparent 70%)'
        }}
      />
      <div 
        className="absolute w-[400px] h-[400px] rounded-full blur-[90px] opacity-05 pointer-events-none top-1/3 left-1/3"
        style={{
          animation: 'float-glow-3 15s infinite alternate ease-in-out',
          background: 'radial-gradient(circle, #a855f7 0%, transparent 70%)'
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-10 bg-white border-b border-slate-200 shadow-sm shrink-0 h-24 relative z-10">
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="Logo" className="w-20 h-20 object-contain shrink-0" />
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight leading-tight">eBudiMulia Presensi</h1>
            <p className="text-xs text-slate-500 font-bold mt-1">{sekolahNama}</p>
          </div>
          {/* Attendance Stats Chips — inline in header */}
          <div className="flex items-center gap-2 ml-6">
            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-1.5">
              <span className="text-sm">✅</span>
              <span className="text-xs font-black text-slate-500 uppercase tracking-wide">Hadir</span>
              <span className="text-lg font-black text-emerald-600 tabular-nums">{stats.hadir}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5">
              <span className="text-sm">⏰</span>
              <span className="text-xs font-black text-slate-500 uppercase tracking-wide">Telat</span>
              <span className="text-lg font-black text-amber-600 tabular-nums">{stats.terlambat}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-xl px-3 py-1.5">
              <span className="text-sm">❌</span>
              <span className="text-xs font-black text-slate-505 uppercase tracking-wide">Alpha</span>
              <span className="text-lg font-black text-rose-600 tabular-nums">{stats.alpha}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-sky-50 border border-sky-200 rounded-xl px-3 py-1.5">
              <span className="text-sm">⏳</span>
              <span className="text-xs font-black text-slate-505 uppercase tracking-wide">Belum</span>
              <span className="text-lg font-black text-sky-600 tabular-nums">{stats.belum}</span>
            </div>
            <div className={`flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5`}>
              <span className="text-xs font-black text-slate-500 uppercase tracking-wide">Kehadiran</span>
              <span className={`text-lg font-black tabular-nums ${theme.text}`}>{percentHadir}%</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-4xl font-black tabular-nums tracking-tighter text-slate-900">{formatJam(now)}</p>
            <p className="text-xs text-slate-505 font-bold mt-0.5">{formatTanggal(now)}</p>
          </div>
          {/* Fullscreen Button */}
          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1">
            <button
              onClick={() => changeZoom(-0.05)}
              className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-200 rounded-lg text-base font-bold transition-colors"
              title="Perkecil"
            >−</button>
            <button
              onClick={() => { const v = 0.78; setZoomLevel(v); localStorage.setItem('tv_zoom_level', String(v)) }}
              className="text-[11px] font-black text-slate-500 w-10 text-center hover:text-indigo-600 transition-colors"
              title="Reset zoom"
            >{Math.round(zoomLevel * 100)}%</button>
            <button
              onClick={() => changeZoom(0.05)}
              className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-200 rounded-lg text-base font-bold transition-colors"
              title="Perbesar"
            >+</button>
          </div>
          <button
            onClick={toggleFullScreen}
            title={isNativeFullScreen ? 'Keluar Layar Penuh' : 'Layar Penuh'}
            className={`p-3 rounded-xl border transition-all duration-300 ${
              isNativeFullScreen
                ? 'bg-indigo-600 border-indigo-700 text-white'
                : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-indigo-600'
            }`}
          >
            {isNativeFullScreen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0v4m0-4h4m12 0l-5 5m5-5v4m0-4h-4M4 20l5-5m-5 5v-4m0 4h4m12 0l-5-5m5 5v-4m0 4h-4"/></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5"/></svg>
            )}
          </button>
        </div>
      </div>

      {/* Presensi Belum Dimulai Overlay */}
      {presensiBelumMulai && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-sm">
          <div className="text-center space-y-6 max-w-lg px-8 animate-fade-in">
            <div className="text-8xl">🌅</div>
            <h2 className="text-4xl font-black text-white tracking-tight">Presensi Belum Dimulai</h2>
            <p className="text-xl text-slate-300 font-semibold">
              {!sesiAktif 
                ? "Presensi hari ini belum dimulai"
                : <>Presensi hari ini akan dimulai pukul <span className="text-emerald-400 font-black">{jamMulaiPresensi}</span>.</>}
            </p>
            <p className="text-slate-400 text-base">
              {!sesiAktif
                ? "Silakan tunggu hingga petugas piket mengaktifkan sesi presensi."
                : "Silakan tunggu hingga waktu presensi dimulai. 👋"}
            </p>
            <div className="mt-4 inline-flex items-center gap-2 px-6 py-3 bg-slate-800 border border-slate-600 rounded-2xl text-slate-300 text-sm font-semibold">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              {formatTanggal(now)}
            </div>
          </div>
        </div>
      )}

      {/* Presensi Tidak Aktif Hari Ini Overlay */}
      {jadwalOtomatisAktif && !isHariAktif && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-sm">
          <div className="text-center space-y-6 max-w-lg px-8 animate-fade-in">
            <div className="text-8xl">🏖️</div>
            <h2 className="text-4xl font-black text-white tracking-tight">Hari Bebas Presensi</h2>
            <p className="text-xl text-slate-300 font-semibold">Presensi otomatis tidak dijadwalkan untuk hari ini.</p>
            <p className="text-slate-400 text-base">Sampai jumpa di hari aktif presensi berikutnya! 👋</p>
            <div className="mt-4 inline-flex items-center gap-2 px-6 py-3 bg-slate-800 border border-slate-600 rounded-2xl text-slate-300 text-sm font-semibold">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              {formatTanggal(now)}
            </div>
          </div>
        </div>
      )}

      {/* Presensi Selesai Overlay */}
      {presensiSelesai && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-sm">
          <div className="text-center space-y-6 max-w-lg px-8 animate-fade-in">
            <div className="text-8xl">🌙</div>
            <h2 className="text-4xl font-black text-white tracking-tight">Presensi Selesai</h2>
            <p className="text-xl text-slate-300 font-semibold">Presensi hari ini telah selesai pukul <span className="text-amber-400 font-black">{jamBatasPulang}</span>.</p>
            <p className="text-slate-400 text-base">Sampai jumpa besok! 👋</p>
            <div className="mt-4 inline-flex items-center gap-2 px-6 py-3 bg-slate-800 border border-slate-600 rounded-2xl text-slate-300 text-sm font-semibold">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              {formatTanggal(now)}
            </div>
          </div>
        </div>
      )}

      {/* Main Content: zoomed area */}
      <div className="flex-1 overflow-hidden relative z-10" style={{ zoom: zoomLevel }}>
      <div className="grid grid-cols-12 gap-4 px-8 py-4 items-start h-full">

        {/* Column 1 (Left - span 8): QR Code — bounded by viewport height */}
        <div className="col-span-8 flex flex-col items-center gap-3">
          {/* Square QR wrapper: max-width fills column, max-height fits viewport */}
          <div style={{
            width: '100%',
            maxHeight: `calc((100vh - 220px) / ${zoomLevel})`,
            aspectRatio: '1 / 1',
          }}>
            <div className="relative w-full h-full">
              {/* Glowing border ring effect */}
              <div className={`absolute inset-0 rounded-[40px] blur-2xl opacity-40 bg-gradient-to-r ${theme.bar} scale-105`} />
              <div className="relative bg-white rounded-[40px] p-4 shadow-2xl border border-slate-200/85 w-full h-full flex items-center justify-center overflow-hidden">
                {loading || !token ? (
                  <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                ) : (
                  <QRCodeSVG
                    value={qrValue}
                    size={900}
                    bgColor="#ffffff"
                    fgColor="#0f172a"
                    level="M"
                    includeMargin={false}
                    style={{ width: '100%', height: '100%', display: 'block' }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Countdown Bar */}
          <div className="w-full px-2">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">Token Valid</span>
              <span className={`text-sm font-black tabular-nums ${countdown <= 5 ? 'text-rose-600' : countdown <= 10 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {countdown} Detik
              </span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-linear ${countdown <= 5 ? 'bg-rose-500' : countdown <= 10 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                style={{ width: `${countdownPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Column 2 (Right - span 4): Real-time Live Activity Feed */}
        <div className="col-span-4 bg-white border border-slate-200 rounded-[36px] p-5 shadow-md flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-3 shrink-0 justify-center">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            <h2 className="text-sm font-black text-slate-500 uppercase tracking-widest">Aktivitas Realtime</h2>
          </div>

          <div
            ref={listContainerRef}
            className="flex-1 overflow-y-auto space-y-2.5 pr-0.5 no-scrollbar scroll-smooth"
          >
            {latestPresensi.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4">
                <div className="w-10 h-10 bg-slate-50 rounded-2xl flex items-center justify-center mb-2.5 text-slate-400 border border-slate-150">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <p className="text-xs font-bold text-slate-400">Belum Ada</p>
              </div>
            ) : (
              latestPresensi.map((p, idx) => {
                const fotoUrl = getStudentPhotoUrl(p.siswa_nisn, activeTa?.id)
                const isPulang = p.tipe === 'pulang'
                const isTerlambat = p.status === 'T' && !isPulang
                const initials = (p.nama || '??').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
                const avatarColors = ['bg-indigo-500','bg-emerald-500','bg-amber-500','bg-rose-500','bg-violet-500','bg-teal-500','bg-sky-500','bg-orange-500']
                const colorIdx = (p.siswa_nisn?.charCodeAt(0) || 0) % avatarColors.length
                return (
                  <div key={`${p.siswa_nisn}-${idx}`} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-2xl animate-fade-in-up hover:border-slate-300 transition-colors gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {/* Photo with colored initials fallback */}
                      <div className={`w-10 h-10 rounded-full shrink-0 overflow-hidden relative flex items-center justify-center ${avatarColors[colorIdx]} shadow-sm`}>
                        <span className="text-white font-black text-sm z-0 absolute select-none">{initials}</span>
                        <img
                          src={fotoUrl}
                          alt={p.nama}
                          className="w-full h-full object-cover absolute inset-0 z-10"
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-extrabold text-slate-800 truncate leading-tight">{p.nama}</p>
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          <span className="text-xs text-slate-500 font-bold">Kelas {p.kelas}</span>
                          <span className="text-slate-300">•</span>
                          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase ${
                            isPulang
                              ? 'bg-blue-50 text-blue-600 border border-blue-200'
                              : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                          }`}>
                            {isPulang ? 'Pulang' : 'Masuk'}
                          </span>
                          {isTerlambat && (
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded uppercase bg-amber-50 text-amber-600 border border-amber-200">
                              ⏰ Terlambat
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-0.5 justify-center">
                      <span className="text-xs font-bold text-slate-500 font-mono leading-none">{p.waktu}</span>
                      <span className="text-emerald-500 text-xl leading-none">✅</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

      </div>{/* end grid */}
      </div>{/* end zoom wrapper */}

      {/* Footer */}
      <div className="px-10 py-2 bg-white border-t border-slate-200 text-center shrink-0 relative z-10">
        <p className="text-[10px] text-slate-500 font-medium">
          eBudiMulia — Sistem Akademik Digital SMP Budi Mulia Jakarta · TV Monitor Presensi Kehadiran Realtime
        </p>
      </div>

      {/* Inline styles for keyframe animations (AURORA BUBBLES) */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes float-glow-1 {
          0% { transform: translate(0px, 0px) scale(1); }
          50% { transform: translate(150px, -80px) scale(1.2); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes float-glow-2 {
          0% { transform: translate(0px, 0px) scale(1); }
          50% { transform: translate(-100px, 120px) scale(1.25); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes float-glow-3 {
          0% { transform: translate(0px, 0px) scale(0.9); }
          50% { transform: translate(120px, 80px) scale(1.15); }
          100% { transform: translate(0px, 0px) scale(0.9); }
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
    </div>
  )
}
