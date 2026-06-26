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

export default function AdminDashboardSection() {
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

        {/* CHART 3: Proporsi Berkas Pengumuman */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-2">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"/></svg>
            Proporsi Dokumen Berdasarkan Jenis
          </h3>
          <div className="h-72 flex justify-center">
            {chartData.berkasDist.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData.berkasDist}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {chartData.berkasDist.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                Belum ada berkas yang diunggah.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
