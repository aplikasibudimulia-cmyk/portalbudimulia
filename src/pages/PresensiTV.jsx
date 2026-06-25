import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { QRCodeSVG } from 'qrcode.react'

function generateToken() {
  const arr = new Uint8Array(24)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')
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
  const intervalRef = useRef(null)
  const countdownRef = useRef(null)

  // Jam real-time
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

  // Fetch pengaturan
  const fetchPengaturan = useCallback(async () => {
    const { data } = await supabase.from('pengaturan_sekolah').select('setting_key, setting_value')
    if (data) {
      const map = {}
      data.forEach(d => { map[d.setting_key] = d.setting_value })
      const iv = parseInt(map['qr_interval_detik'] || '20', 10)
      setInterval_(iv)
      if (map['nama_sekolah']) setSekolahNama(map['nama_sekolah'])
    }
  }, [])

  // Fetch stats presensi hari ini secara realtime
  const fetchStats = useCallback(async () => {
    const today = new Date().toLocaleDateString('en-CA')
    const { data: siswaAll } = await supabase.from('siswa_lengkap').select('nisn').eq('is_aktif', true)
    const total = siswaAll?.length ?? 0

    const { data: presensi } = await supabase.from('presensi_harian').select('status').eq('tanggal', today)
    // Sesuai logika baru: siswa yang hadir dan terlambat keduanya dihitung sebagai Hadir
    const hadir = presensi?.filter(p => p.status === 'H' || p.status === 'T').length ?? 0
    const terlambat = presensi?.filter(p => p.status === 'T').length ?? 0
    const sakit = presensi?.filter(p => p.status === 'S').length ?? 0
    const izin = presensi?.filter(p => p.status === 'I').length ?? 0
    const alpha = presensi?.filter(p => p.status === 'A').length ?? 0
    setStats({ hadir, terlambat, sakit, izin, alpha, total })
  }, [])

  // Generate token QR baru & simpan ke Supabase
  const generateNewToken = useCallback(async (iv) => {
    const newToken = generateToken()
    const expMs = (iv || interval) * 1000
    const expiresAt = new Date(Date.now() + expMs).toISOString()

    // Simpan ke database (ganti row lama)
    await supabase.from('qr_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000') // hapus semua
    const { data } = await supabase.from('qr_tokens').insert({
      token: newToken,
      expires_at: expiresAt
    }).select().single()

    setToken(data?.token || newToken)
    setExpiresAt(new Date(expiresAt))
    return iv || interval
  }, [interval])

  // Init
  useEffect(() => {
    const init = async () => {
      await fetchPengaturan()
      setLoading(false)
    }
    init()
  }, [fetchPengaturan])

  // Setelah interval diketahui: mulai siklus token + countdown
  useEffect(() => {
    if (loading) return

    const startCycle = async () => {
      const iv = await generateNewToken(interval)
      fetchStats()

      // Countdown visual
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

    // Siklus regenerasi token
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      startCycle()
    }, interval * 1000)

    return () => {
      clearInterval(intervalRef.current)
      clearInterval(countdownRef.current)
    }
  }, [loading, interval, generateNewToken])

  // Realtime stats update
  useEffect(() => {
    const channel = supabase
      .channel('presensi-tv-stats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'presensi_harian' }, () => {
        fetchStats()
      })
      .subscribe()
    fetchStats()
    return () => supabase.removeChannel(channel)
  }, [fetchStats])

  const percentHadir = stats.total > 0 ? Math.round(((stats.hadir + stats.terlambat) / stats.total) * 100) : 0
  const qrValue = token ? JSON.stringify({ token, ts: Date.now() }) : '{}'
  const countdownPct = interval > 0 ? (countdown / interval) * 100 : 0

  return (
    <div className="min-h-screen bg-slate-950 text-indigo-600 flex flex-col overflow-hidden select-none" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-10 py-5 bg-slate-900/80 border-b border-slate-800/60 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 bg-white rounded-xl flex items-center justify-center p-1.5 shadow-sm">
            <img src="/logo.png?v=1782401880" alt="Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-lg font-black text-indigo-600 tracking-tight leading-tight">eBudiMulia Presensi</h1>
            <p className="text-xs text-slate-400 font-medium">{sekolahNama}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-4xl font-black tabular-nums tracking-tighter text-indigo-600">{formatJam(now)}</p>
          <p className="text-sm text-slate-400 font-medium mt-0.5">{formatTanggal(now)}</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center gap-12 px-10 py-6">

        {/* Left: QR Code Panel */}
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            {/* Glow Effect */}
            <div className="absolute inset-0 rounded-xl blur-2xl bg-indigo-500/20 scale-110" />
            <div className="relative bg-white rounded-xl p-6 shadow-2xl border border-slate-700">
              {loading || !token ? (
                <div className="w-64 h-64 flex items-center justify-center">
                  <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                </div>
              ) : (
                <QRCodeSVG
                  value={qrValue}
                  size={264}
                  bgColor="#ffffff"
                  fgColor="#1e293b"
                  level="M"
                  includeMargin={false}
                />
              )}
            </div>
          </div>

          {/* Countdown Bar */}
          <div className="w-80">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-widest">Berlaku</span>
              <span className={`text-sm font-black tabular-nums ${countdown <= 5 ? 'text-rose-400' : countdown <= 10 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {countdown}s
              </span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-linear ${countdown <= 5 ? 'bg-rose-500' : countdown <= 10 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                style={{ width: `${countdownPct}%` }}
              />
            </div>
            <p className="text-center text-xs text-slate-500 mt-2 font-medium">QR berganti otomatis setiap {interval} detik</p>
          </div>
        </div>

        {/* Right: Info Panel */}
        <div className="flex flex-col gap-6 flex-1 max-w-lg">

          {/* Cara Presensi */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-base font-bold text-slate-300 mb-4 uppercase tracking-widest text-xs">Cara Presensi</h2>
            <div className="space-y-3">
              {[
                { num: '1', text: 'Buka aplikasi eBudiMulia di HP Anda', color: 'bg-indigo-600' },
                { num: '2', text: 'Login, pilih menu "Presensi Hari Ini"', color: 'bg-indigo-600' },
                { num: '3', text: 'Arahkan kamera ke QR Code ini', color: 'bg-indigo-600' },
                { num: '4', text: 'Ambil selfie untuk konfirmasi', color: 'bg-indigo-600' },
                { num: '5', text: 'Selesai! Orang tua akan diberitahu', color: 'bg-emerald-600' },
              ].map(step => (
                <div key={step.num} className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full ${step.color} flex items-center justify-center text-indigo-600 text-xs font-black shrink-0`}>
                    {step.num}
                  </div>
                  <p className="text-sm text-slate-300 font-medium">{step.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Statistik Hari Ini */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Kehadiran Hari Ini</h2>
              <span className="text-xs font-bold text-indigo-400 bg-indigo-950 border border-indigo-900 px-2 py-0.5 rounded-full">
                {percentHadir}% Hadir
              </span>
            </div>

            {/* Progress Bar Total */}
            <div className="h-3 bg-slate-800 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-700"
                style={{ width: `${percentHadir}%` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Hadir', value: stats.hadir, color: 'text-emerald-400', bg: 'bg-emerald-950 border-emerald-900' },
                { label: 'Terlambat', value: stats.terlambat, color: 'text-amber-400', bg: 'bg-amber-950 border-amber-900' },
                { label: 'Sakit/Izin', value: stats.sakit + stats.izin, color: 'text-blue-400', bg: 'bg-blue-950 border-blue-900' },
                { label: 'Alpha', value: stats.alpha, color: 'text-rose-400', bg: 'bg-rose-950 border-rose-900' },
                { label: 'Belum Presensi', value: Math.max(0, stats.total - stats.hadir - stats.terlambat - stats.sakit - stats.izin - stats.alpha), color: 'text-slate-400', bg: 'bg-slate-800 border-slate-700' },
                { label: 'Total Siswa', value: stats.total, color: 'text-slate-300', bg: 'bg-slate-800 border-slate-700' },
              ].map(s => (
                <div key={s.label} className={`${s.bg} border rounded-xl p-3 text-center`}>
                  <p className={`text-2xl font-black tabular-nums ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Footer */}
      <div className="px-10 py-3 bg-slate-900/60 border-t border-slate-800/60 text-center shrink-0">
        <p className="text-xs text-slate-600 font-medium">
          eBudiMulia — Sistem Informasi Akademik Digital · Scan QR untuk presensi kehadiran
        </p>
      </div>
    </div>
  )
}
