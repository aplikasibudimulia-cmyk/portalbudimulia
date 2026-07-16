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
        supabase.from('guru').select('*', { count: 'exact', head: true }),
        supabase.from('roles').select('*', { count: 'exact', head: true }),
        supabase.from('jenis_pengumuman').select('*', { count: 'exact', head: true }),
        supabase.from('berkas_pengumuman').select('kode_jenis', { count: 'exact' }),
        supabase.from('presensi_harian').select('tanggal, status').order('tanggal', { ascending: false }).limit(2000)
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

      // Proses Tren Presensi (7 hari terakhir)
      const trenMap = {}
      presensiData?.forEach(p => {
        if (p.status === 'P') return // Skip pulang
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
    return <div className="p-8 text-center text-slate-500 animate-pulse">Memuat Dashboard Analytics...</div>
  }

  return (
    <div className="animate-slide-up space-y-6">
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 md:p-8 shadow-lg text-white relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-2xl md:text-3xl font-bold mb-2">Dashboard Analytics</h2>
          <p className="text-slate-300 text-sm md:text-base max-w-xl">
            Ringkasan data operasional dan performa akademik eBudiMulia secara real-time.
          </p>
        </div>
        <svg className="absolute right-0 bottom-0 opacity-10 w-64 h-64 -mb-16 -mr-16 transform rotate-12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 22h20L12 2zm0 3.8l7.5 14.2H4.5L12 5.8z"/></svg>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <IconUsers />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Siswa Aktif</p>
            <h3 className="text-2xl font-black text-slate-800">{stats.totalSiswa}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <IconTeacher />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Guru</p>
            <h3 className="text-2xl font-black text-slate-800">{stats.totalGuru}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <IconShield />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Roles</p>
            <h3 className="text-2xl font-black text-slate-800">{stats.totalRole}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <IconFile />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Dokumen</p>
            <h3 className="text-2xl font-black text-slate-800">{stats.totalBerkas}</h3>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CHART 1: Distribusi Siswa per Kelas */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            Distribusi Siswa per Kelas
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData.kelasDist} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{fontSize: 12}} tickLine={false} axisLine={false} />
                <YAxis tick={{fontSize: 12}} tickLine={false} axisLine={false} />
                <RechartsTooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                <Bar dataKey="Siswa" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART 2: Tren Presensi 7 Hari Terakhir */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"/></svg>
            Tren Presensi Harian
          </h3>
          <div className="h-72">
            {chartData.presensiTren.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData.presensiTren} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{fontSize: 10}} tickLine={false} axisLine={false} />
                  <YAxis tick={{fontSize: 12}} tickLine={false} axisLine={false} />
                  <RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
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

        {/* WIDGET: Akses Cepat Fitur Admin */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-2">
          <h3 className="font-bold text-slate-800 mb-5 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
            Akses Cepat Fitur Admin
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {quickAccessItems.map(item => (
              <button
                key={item.id}
                onClick={() => onNavigate && onNavigate(item.id)}
                className={`flex flex-col text-left p-4 rounded-xl border transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-md ${item.bgColor}`}
              >
                <div className="p-2 bg-white rounded-lg w-10 h-10 flex items-center justify-center shadow-sm mb-3">
                  {item.icon}
                </div>
                <h4 className="font-bold text-sm text-slate-800 mb-1 leading-tight">{item.title}</h4>
                <p className="text-[11px] text-slate-500 leading-normal">{item.desc}</p>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
