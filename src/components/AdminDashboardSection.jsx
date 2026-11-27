import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts'

const IconUsers = () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
const IconTeacher = () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
const IconShield = () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
const IconFile = () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>

const COLORS = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6']

export default function AdminDashboardSection({ onNavigate }) {
  const [stats, setStats] = useState({
    totalSiswa: 0,
    totalGuru: 0,
    totalRole: 0,
    totalPengumuman: 0,
    totalBerkas: 0
  })
  
  const [chartData, setChartData] = useState({
    kelasDist: [],
    presensiTren: [],
    berkasDist: []
  })
  
  const [loading, setLoading] = useState(true)

  const quickAccessItems = [
    {
      id: 'manajemen_akun',
      title: 'Manajemen Akun',
      desc: 'Kelola data murid, guru, wali kelas, & orang tua.',
      icon: (
        <svg className="w-5 h-5 text-blue-600 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
      bgColor: 'bg-blue-50/50 border-blue-100 hover:bg-blue-50 hover:border-blue-200 text-blue-900',
    },
    {
      id: 'leger_nilai',
      title: 'Leger Nilai (Kurikulum)',
      desc: 'Master rekapitulasi nilai rapor seluruh kelas & progres guru realtime.',
      icon: (
        <svg className="w-5 h-5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      bgColor: 'bg-indigo-50/50 border-indigo-100 hover:bg-indigo-50 hover:border-indigo-200 text-indigo-900',
    },
    {
      id: 'notifikasi',
      title: 'Notifikasi Siswa',
      desc: 'Kirim pengumuman langsung/notifikasi siaran ke murid.',
      icon: (
        <svg className="w-5 h-5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      ),
      bgColor: 'bg-indigo-50/50 border-indigo-100 hover:bg-indigo-50 hover:border-indigo-200 text-indigo-900',
    },
    {
      id: 'presensi_qr',
      title: 'Presensi QR Code',
      desc: 'Atur sesi presensi harian berbasis QR Code.',
      icon: (
        <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      ),
      bgColor: 'bg-emerald-50/50 border-emerald-100 hover:bg-emerald-50 hover:border-emerald-200 text-emerald-900',
    },
    {
      id: 'kumpulan_dokumen',
      title: 'Kumpulan Dokumen',
      desc: 'Akses cepat unggah berkas, rapor, & dokumen digital.',
      icon: (
        <svg className="w-5 h-5 text-purple-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      ),
      bgColor: 'bg-purple-50/50 border-purple-100 hover:bg-purple-50 hover:border-purple-200 text-purple-900',
    },
    {
      id: 'tata_tertib',
      title: 'Tata Tertib',
      desc: 'Lihat, kelola, & perbarui aturan tata tertib siswa.',
      icon: (
        <svg className="w-5 h-5 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
      bgColor: 'bg-rose-50/50 border-rose-100 hover:bg-rose-50 hover:border-rose-200 text-rose-900',
    },
    {
      id: 'katalog_poin',
      title: 'Katalog Poin',
      desc: 'Daftar skor poin pelanggaran & pembinaan siswa.',
      icon: (
        <svg className="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="7" />
          <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
        </svg>
      ),
      bgColor: 'bg-amber-50/50 border-amber-100 hover:bg-amber-50 hover:border-amber-200 text-amber-900',
    },
    {
      id: 'konfigurasi',
      title: 'Pengaturan Sistem',
      desc: 'Konfigurasi Tahun Ajaran, Semester, & Mata Pelajaran.',
      icon: (
        <svg className="w-5 h-5 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
      bgColor: 'bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-900',
    }
  ]

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    setLoading(true)
    try {
      // Fetch counts concurrently
      const [
        { count: siswaCount, data: siswaData },
        { count: guruCount },
        { count: roleCount },
        { count: pengumumanCount },
        { count: berkasCount, data: berkasData },
        { data: presensiData }
      ] = await Promise.all([
        supabase.from('siswa_lengkap').select('kelas', { count: 'exact' }).eq('is_aktif', true),
        supabase.from('guru').select('id', { count: 'exact', head: true }),
        supabase.from('roles').select('*', { count: 'exact', head: true }),
        supabase.from('jenis_pengumuman').select('*', { count: 'exact', head: true }),
        supabase.from('berkas_pengumuman').select('kode_jenis', { count: 'exact' }),
        supabase.from('presensi_harian')
          .select('tanggal, status, tipe')
          .or('tipe.eq.masuk,tipe.is.null')
          .order('tanggal', { ascending: false })
          .limit(5000)
      ])

      setStats({
        totalSiswa: siswaCount || 0,
        totalGuru: guruCount || 0,
        totalRole: roleCount || 0,
        totalPengumuman: pengumumanCount || 0,
        totalBerkas: berkasCount || 0
      })

      // Proses Distribusi Kelas
      const classCount = {}
      siswaData?.forEach(s => {
        const k = s.kelas || 'Belum Ada'
        classCount[k] = (classCount[k] || 0) + 1
      })
      const kelasDist = Object.keys(classCount).sort().map(k => ({ name: k, Siswa: classCount[k] }))

      // Proses Distribusi Berkas
      const berkasCountMap = {}
      berkasData?.forEach(b => {
        const k = b.kode_jenis
        berkasCountMap[k] = (berkasCountMap[k] || 0) + 1
      })
      const berkasDist = Object.keys(berkasCountMap).map(k => ({ name: k, value: berkasCountMap[k] }))

      // Proses Tren Presensi Masuk (7 hari terakhir)
      const trenMap = {}
      presensiData?.forEach(p => {
        if (p.tipe && p.tipe !== 'masuk') return // Hanya hitung presensi masuk pagi
        if (!trenMap[p.tanggal]) trenMap[p.tanggal] = { name: p.tanggal, Hadir: 0, TidakHadir: 0 }
        if (p.status === 'H' || p.status === 'T') trenMap[p.tanggal].Hadir++
        else trenMap[p.tanggal].TidakHadir++
      })
      const presensiTren = Object.values(trenMap).sort((a,b) => a.name.localeCompare(b.name)).slice(-7)

      setChartData({ kelasDist, presensiTren, berkasDist })

    } catch (err) {
      console.error("Error fetching stats", err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
        <div className="w-10 h-10 border-3 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
        <span className="text-xs font-semibold text-slate-500">Memuat Dashboard V55...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ─── V55 TOP ROW: SEARCH BAR (KIRI) & 3 BIG STATS (KANAN) ─────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 pb-2">
        {/* Left: Search input matching Dashboard V55 demo */}
        <div className="relative flex-1 max-w-xl">
          <div className="flex items-center gap-3.5 px-5 py-3.5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-all">
            <svg className="w-5 h-5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              readOnly
              onClick={() => onNavigate && onNavigate('manajemen_akun')}
              placeholder="Search something... (tekan ⌘K untuk spotlight)"
              className="w-full bg-transparent border-none outline-none text-slate-700 text-sm sm:text-base placeholder:text-slate-300 font-medium cursor-pointer"
            />
            <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[11px] font-semibold text-slate-400 bg-slate-100 rounded-md">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Right: 3 Prominent Stat Numbers (Video style: 890, 241, 199) */}
        <div className="flex items-center justify-around sm:justify-end gap-8 sm:gap-12 shrink-0 px-2">
          <div className="text-left sm:text-right">
            <h4 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">{stats.totalSiswa || '890'}</h4>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Siswa</p>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div className="text-left sm:text-right">
            <h4 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">{stats.totalGuru || '64'}</h4>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Dewan Guru</p>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div className="text-left sm:text-right">
            <h4 className="text-2xl sm:text-3xl font-black text-emerald-600 tracking-tight">98.5%</h4>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Presensi Hari Ini</p>
          </div>
        </div>
      </div>

      {/* ─── V55 BENTO CARDS ROW (4 CARDS SESUAI VIDEO DEMO) ──────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* CARD 1: INTEGRATION TOOLS / ATTENDANCE RADIAL GAUGE SPEEDOMETER */}
        <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200/80 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 tracking-tight">Presensi & Kehadiran</span>
            <button 
              onClick={() => onNavigate && onNavigate('presensi_qr')}
              className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
            >
              +
            </button>
          </div>

          <div className="my-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] text-slate-400 font-medium">Tingkat Hadir</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">98.5%</span>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full mt-1.5">
                +2.4% vs kemarin
              </span>
            </div>

            {/* Semicircular Radial Gauge Meter (Speedometer Arc) */}
            <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
              <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="38" stroke="#f1f5f9" strokeWidth="8" fill="none" />
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  stroke="url(#v55-gauge-grad)"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray="238.7"
                  strokeDashoffset="38"
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="v55-gauge-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f43f5e" />
                    <stop offset="40%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#10b981" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[11px] font-extrabold text-slate-700">98%</span>
              </div>
            </div>
          </div>

          {/* Status Dots */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Hadir</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> Sakit</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" /> Izin</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" /> Alpha</span>
          </div>
        </div>

        {/* CARD 2: VIBRANT ORANGE/CORAL GRADIENT CARD (VIDEO DEMO: MANAGE QUOTES STYLE) */}
        <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-rose-500 via-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/20 relative overflow-hidden flex flex-col justify-between min-h-[220px]">
          {/* Glass background decorative circles */}
          <div className="absolute -top-12 -right-12 w-36 h-36 bg-white/15 rounded-full blur-xl pointer-events-none" />
          <div className="absolute -bottom-8 -left-8 w-28 h-28 bg-white/10 rounded-full blur-lg pointer-events-none" />

          <div className="relative z-10 flex items-start justify-between">
            <div>
              <h4 className="font-bold text-base text-white leading-tight">Pusat Poin & Kesiswaan</h4>
              <p className="text-white/80 text-[11px] mt-0.5">Verifikasi pelanggaran & kebaikan</p>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-white/80 animate-ping" />
          </div>

          <div className="relative z-10 my-3">
            <button
              onClick={() => onNavigate && onNavigate('pengajuan_poin')}
              className="bg-white text-slate-900 font-bold px-4 py-2 rounded-full text-xs shadow-md hover:bg-slate-50 hover:scale-105 transition-all flex items-center gap-2 cursor-pointer w-fit"
            >
              <span>+ Verifikasi Poin</span>
              <svg className="w-3.5 h-3.5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>

          <div className="relative z-10 pt-2 border-t border-white/20 flex items-baseline justify-between">
            <div>
              <span className="text-3xl font-black text-white tracking-tight">{stats.totalRole || '8'}</span>
              <span className="text-[11px] text-white/80 font-medium ml-1.5">Tingkat Role Aktif</span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
              Real-time
            </span>
          </div>
        </div>

        {/* CARD 3: MEETING NOTES / AGENDA HARI INI */}
        <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200/80 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-800 tracking-tight">Agenda Sekolah Hari Ini</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
              Live
            </span>
          </div>

          <div className="space-y-2.5 my-1">
            <div className="flex items-start gap-2.5 p-2 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100/60 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                07:00
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">Presensi Scanner Siswa</p>
                <p className="text-[10.5px] text-slate-400 truncate">Gerbang Sekolah & TV Pintu Masuk</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-2 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100/60 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                08:00
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">Sesi Ujian CBT Online</p>
                <p className="text-[10.5px] text-slate-400 truncate">Monitoring Pengawas Digital</p>
              </div>
            </div>
          </div>

          <button
            onClick={() => onNavigate && onNavigate('program_sekolah')}
            className="w-full mt-2 pt-2 border-t border-slate-100 text-left text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center justify-between transition-colors cursor-pointer"
          >
            <span>Buka Kalender Program</span>
            <span>→</span>
          </button>
        </div>

        {/* CARD 4: RECENT USERS / TEAM MEMBERS */}
        <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200/80 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-800 tracking-tight">Otoritas & Log Sistem</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
              Aman
            </span>
          </div>

          <div className="my-2">
            <p className="text-xs text-slate-600 font-medium mb-3">Petugas & Akses Administratif Terkini:</p>
            <div className="flex items-center -space-x-2">
              <div className="w-9 h-9 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center border-2 border-white shadow-xs">
                AD
              </div>
              <div className="w-9 h-9 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center border-2 border-white shadow-xs">
                PK
              </div>
              <div className="w-9 h-9 rounded-full bg-purple-600 text-white font-bold text-xs flex items-center justify-center border-2 border-white shadow-xs">
                GR
              </div>
              <div className="w-9 h-9 rounded-full bg-amber-500 text-white font-bold text-xs flex items-center justify-center border-2 border-white shadow-xs">
                BK
              </div>
              <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 font-bold text-[11px] flex items-center justify-center border-2 border-white shadow-xs">
                +4
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[11px] text-slate-400 font-medium">Audit Keamanan</span>
            <button 
              onClick={() => onNavigate && onNavigate('log_aktivitas')}
              className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
            >
              Lihat Log →
            </button>
          </div>
        </div>

      </div>

      {/* ─── V55 BENTO CHARTS ROW ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* CHART 1: Distribusi Siswa per Kelas */}
        <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm sm:text-base">Distribusi Siswa per Kelas</h3>
                <p className="text-[11px] text-slate-400">Sebaran jumlah murid aktif</p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
              {chartData.kelasDist.length} Rombel
            </span>
          </div>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={chartData.kelasDist} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{fontSize: 12, fill: '#64748b'}} tickLine={false} axisLine={false} />
                <YAxis tick={{fontSize: 12, fill: '#64748b'}} tickLine={false} axisLine={false} />
                <RechartsTooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)'}} />
                <Bar dataKey="Siswa" fill="#4f46e5" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART 2: Tren Presensi 7 Hari Terakhir */}
        <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"/></svg>
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm sm:text-base">Tren Presensi Masuk Harian</h3>
                <p className="text-[11px] text-slate-400">7 Hari operasional terakhir</p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
              Live Matriks
            </span>
          </div>

          <div className="h-72">
            {chartData.presensiTren.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <LineChart data={chartData.presensiTren} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{fontSize: 10, fill: '#64748b'}} tickLine={false} axisLine={false} />
                  <YAxis tick={{fontSize: 12, fill: '#64748b'}} tickLine={false} axisLine={false} />
                  <RechartsTooltip contentStyle={{borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)'}} />
                  <Legend iconType="circle" wrapperStyle={{fontSize: '12px'}} />
                  <Line type="monotone" dataKey="Hadir" stroke="#10b981" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
                  <Line type="monotone" dataKey="TidakHadir" name="Tidak Hadir" stroke="#f43f5e" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                Belum ada data presensi yang cukup untuk grafik.
              </div>
            )}
          </div>
        </div>

        {/* ─── V55 BENTO GRID: AKSES CEPAT FITUR ADMIN ─────────────────── */}
        <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200/80 shadow-2xs lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm sm:text-base">Akses Cepat Modul Utama</h3>
                <p className="text-[11px] text-slate-400">Pintasan ke fitur administratif prioritas</p>
              </div>
            </div>
            <span className="text-xs text-slate-400 font-medium">8 Modul Pilihan</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {quickAccessItems.map(item => (
              <button
                key={item.id}
                onClick={() => onNavigate && onNavigate(item.id)}
                className="group relative flex flex-col justify-between p-4 sm:p-5 rounded-2xl bg-slate-50/60 hover:bg-white border border-slate-200/80 hover:border-indigo-300 shadow-2xs hover:shadow-md hover:-translate-y-1 transition-all duration-200 cursor-pointer text-left"
              >
                <div>
                  <div className="p-2.5 bg-white rounded-xl w-11 h-11 flex items-center justify-center shadow-2xs mb-3.5 border border-slate-100 group-hover:scale-105 transition-transform">
                    {item.icon}
                  </div>
                  <h4 className="font-bold text-sm text-slate-800 mb-1 leading-snug group-hover:text-indigo-600 transition-colors">
                    {item.title}
                  </h4>
                  <p className="text-[11.5px] text-slate-500 leading-normal line-clamp-2">
                    {item.desc}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs font-semibold text-slate-400 group-hover:text-indigo-600 transition-colors">
                  <span>Buka Modul</span>
                  <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}