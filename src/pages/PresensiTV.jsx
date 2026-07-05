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
  const [stats, setStats] = useState({ hadir: 0, terlambat: 0, sakit: 0, izin: 0, alpha: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [sekolahNama, setSekolahNama] = useState('SMP Budi Mulia Jakarta')
  const [themeColor, setThemeColor] = useState('indigo')
  const [activeTa, setActiveTa] = useState(null)

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

    const { data: presensi } = await supabase.from('presensi_harian').select('status').eq('tanggal', today)
    const hadir = presensi?.filter(p => p.status === 'H' || p.status === 'T').length ?? 0
    const terlambat = presensi?.filter(p => p.status === 'T').length ?? 0
    const sakit = presensi?.filter(p => p.status === 'S').length ?? 0
    const izin = presensi?.filter(p => p.status === 'I').length ?? 0
    const alpha = presensi?.filter(p => p.status === 'A').length ?? 0
    setStats({ hadir, terlambat, sakit, izin, alpha, total })
  }, [])

  // Fetch 6 latest checked-in students dynamically
  const fetchLatestCheckins = useCallback(async () => {
    const todayStr = new Date().toLocaleDateString('en-CA')
    const { data, error } = await supabase
      .from('presensi_harian')
      .select('siswa_nisn, waktu, status, tipe')
      .eq('tanggal', todayStr)
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
  const generateNewToken = useCallback(async (iv) => {
    const newToken = generateToken()
    const expMs = (iv || interval) * 1000
    const expiresAt = new Date(Date.now() + expMs).toISOString()

    // Clean old tokens and insert new one
    await supabase.from('qr_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    const { data } = await supabase.from('qr_tokens').insert({
      token: newToken,
      expires_at: expiresAt
    }).select().single()

    setToken(data?.token || newToken)
    setExpiresAt(new Date(expiresAt))
    return iv || interval
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

  // Realtime events listener for attendance changes
  useEffect(() => {
    const todayStr = new Date().toLocaleDateString('en-CA')
    const channel = supabase
      .channel('presensi-tv-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'presensi_harian', filter: `tanggal=eq.${todayStr}` }, () => {
        fetchStats()
        fetchLatestCheckins()
      })
      .subscribe()

    fetchStats()
    fetchLatestCheckins()

    return () => supabase.removeChannel(channel)
  }, [fetchStats, fetchLatestCheckins])

  const percentHadir = stats.total > 0 ? Math.round(((stats.hadir + stats.terlambat) / stats.total) * 100) : 0
  const qrValue = token ? JSON.stringify({ token, ts: Date.now() }) : '{}'
  const countdownPct = interval > 0 ? (countdown / interval) * 100 : 0

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden select-none relative" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      
      {/* BACKGROUND DECORATIVE FLOATING AURORA SPHERES */}
      <div 
        className="absolute w-[500px] h-[500px] rounded-full blur-[100px] opacity-35 pointer-events-none -top-20 -left-20"
        style={{
          animation: 'float-glow-1 10s infinite alternate ease-in-out',
          background: `radial-gradient(circle, ${theme.colorHex || '#6366f1'} 0%, transparent 70%)`
        }}
      />
      <div 
        className="absolute w-[500px] h-[500px] rounded-full blur-[100px] opacity-25 pointer-events-none -bottom-20 -right-20"
        style={{
          animation: 'float-glow-2 12s infinite alternate ease-in-out',
          background: 'radial-gradient(circle, #10b981 0%, transparent 70%)'
        }}
      />
      <div 
        className="absolute w-[400px] h-[400px] rounded-full blur-[90px] opacity-20 pointer-events-none top-1/3 left-1/3"
        style={{
          animation: 'float-glow-3 15s infinite alternate ease-in-out',
          background: 'radial-gradient(circle, #a855f7 0%, transparent 70%)'
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-10 bg-slate-900/60 border-b border-slate-800/60 backdrop-blur-md shadow-sm shrink-0 h-24 relative z-10">
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="Logo" className="w-20 h-20 object-contain shrink-0" />
          <div>
            <h1 className={`text-xl font-black ${theme.text} tracking-tight leading-tight`}>eBudiMulia Presensi</h1>
            <p className="text-xs text-slate-400 font-semibold">{sekolahNama}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-4xl font-black tabular-nums tracking-tighter ${theme.text}`}>{formatJam(now)}</p>
          <p className="text-xs text-slate-400 font-bold mt-0.5">{formatTanggal(now)}</p>
        </div>
      </div>

      {/* Main Content: 6:2:4 Grid Layout */}
      <div className="flex-1 grid grid-cols-12 gap-6 px-10 py-8 items-start relative z-10">

        {/* Column 1 (Left - span 6): Giant QR Code in High Contrast White Card */}
        <div className="col-span-6 flex flex-col items-center gap-4 justify-center">
          <div className="relative">
            {/* Glowing border ring effect */}
            <div className={`absolute inset-0 rounded-[48px] blur-2xl opacity-40 bg-gradient-to-r ${theme.bar} scale-105`} />
            <div className="relative bg-white rounded-[48px] p-5 shadow-2xl border border-slate-200/85 flex flex-col items-center">
              {loading || !token ? (
                <div className="w-[660px] h-[660px] flex items-center justify-center">
                  <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                </div>
              ) : (
                <QRCodeSVG
                  value={qrValue}
                  size={660} // Maximized QR Code size (660px) to reduce empty vertical space
                  bgColor="#ffffff"
                  fgColor="#0f172a"
                  level="M"
                  includeMargin={false}
                />
              )}
            </div>
          </div>

          {/* Countdown Bar */}
          <div className="w-full max-w-[692px] px-2">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Token Valid</span>
              <span className={`text-sm font-black tabular-nums ${countdown <= 5 ? 'text-rose-450' : countdown <= 10 ? 'text-amber-405' : 'text-emerald-450'}`}>
                {countdown} Detik
              </span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-linear ${countdown <= 5 ? 'bg-rose-500' : countdown <= 10 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                style={{ width: `${countdownPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Column 2 (Center - span 2): Kehadiran Hari Ini (Glassmorphism Dark) */}
        <div className="col-span-2">
          <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-md rounded-[36px] p-4 shadow-2xl h-[720px] flex flex-col">
            <h2 className="text-sm font-black text-slate-350 uppercase tracking-widest mb-3 text-center">Kehadiran</h2>
            
            <div className="flex flex-col items-center justify-center py-4 px-2 bg-slate-950/40 border border-slate-855/60 rounded-2xl mb-4 text-center">
              <span className={`text-3xl font-black ${theme.text} leading-none`}>
                {percentHadir}%
              </span>
              <span className="text-xs text-slate-400 font-black uppercase tracking-wider mt-1.5">Hadir</span>
              
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-3">
                <div
                  className={`h-full bg-gradient-to-r ${theme.bar} rounded-full transition-all duration-700`}
                  style={{ width: `${percentHadir}%` }}
                />
              </div>
            </div>

            <div className="flex-1 flex flex-col gap-4 justify-center">
              {[
                { label: 'Hadir', value: stats.hadir, color: 'text-emerald-400', bg: 'bg-emerald-950/20 border-emerald-900/30', icon: '✅' },
                { label: 'Telat', value: stats.terlambat, color: 'text-amber-400', bg: 'bg-amber-950/20 border-amber-900/30', icon: '⏰' },
                { label: 'Alpha', value: stats.alpha, color: 'text-rose-400', bg: 'bg-rose-950/20 border-rose-900/30', icon: '❌' },
              ].map((s, idx) => (
                <div key={idx} className={`${s.bg} border rounded-2xl p-4 flex items-center justify-between shadow-sm`}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xl shrink-0">{s.icon}</span>
                    <span className="text-xs font-black text-slate-400 uppercase tracking-wide truncate">{s.label}</span>
                  </div>
                  <p className={`text-3xl font-black tabular-nums ${s.color} shrink-0`}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Column 3 (Right - span 4): Widen Real-time Live Activity Feed (Glassmorphism Dark) */}
        <div className="col-span-4 bg-slate-900/60 border border-slate-800/80 backdrop-blur-md rounded-[36px] p-5 shadow-2xl h-[720px] flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-850 pb-3 mb-3 shrink-0 justify-center">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            <h2 className="text-sm font-black text-slate-300 uppercase tracking-widest">Aktivitas Realtime</h2>
          </div>

          <div
            ref={listContainerRef}
            className="flex-1 overflow-y-auto space-y-2.5 pr-0.5 no-scrollbar scroll-smooth"
          >
            {latestPresensi.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4">
                <div className="w-10 h-10 bg-slate-850 rounded-2xl flex items-center justify-center mb-2.5 text-slate-455 border border-slate-800">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <p className="text-xs font-bold text-slate-400">Belum Ada</p>
              </div>
            ) : (
              latestPresensi.map((p, idx) => {
                const fotoUrl = getStudentPhotoUrl(p.siswa_nisn, activeTa?.id)
                return (
                  <div key={`${p.siswa_nisn}-${idx}`} className="flex items-center justify-between p-3 bg-slate-950/40 border border-slate-855/60 rounded-2xl animate-fade-in-up hover:border-slate-750 transition-colors gap-3">
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      {/* Enlarged Photo Container */}
                      <div className="w-11 h-11 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400 overflow-hidden relative shrink-0 border border-slate-700/50 shadow-sm">
                        <span className="absolute z-0">{p.nama.substring(0,2).toUpperCase()}</span>
                        <img 
                          src={fotoUrl} 
                          alt={p.nama}
                          className="w-full h-full object-cover relative z-10"
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        {/* Enlarged Student Name */}
                        <p className="text-sm font-extrabold text-slate-200 truncate leading-tight">{p.nama}</p>
                        <p className="text-xs text-slate-400 font-bold mt-0.5">Kelas {p.kelas}</p>
                      </div>
                    </div>
                    
                    <div className="text-right shrink-0 flex flex-col items-end gap-1 justify-center">
                      <span className="text-xs font-bold text-slate-400 font-mono leading-none">{p.waktu}</span>
                      <span className="text-emerald-400 text-2xl leading-none shrink-0" title="Berhasil Absen">
                        ✅
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

      </div>

      {/* Footer */}
      <div className="px-10 py-3 bg-slate-900/60 border-t border-slate-800/60 text-center shrink-0 relative z-10">
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
