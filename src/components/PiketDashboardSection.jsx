import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export default function PiketDashboardSection({ session, activeTa, filterKelas }) {
  const [tanggal, setTanggal] = useState(new Date().toLocaleDateString('en-CA'))
  const [semuaKelas, setSemuaKelas] = useState([])
  const [semuaSiswa, setSemuaSiswa] = useState([])
  const [presensiHariIni, setPresensiHariIni] = useState([])
  const [presensiMingguan, setPresensiMingguan] = useState([])
  const [presensiHariIniFull, setPresensiHariIniFull] = useState([])
  const [semuaKelasFull, setSemuaKelasFull] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [tanggal, activeTa, filterKelas])

  useEffect(() => {
    const channel = supabase.channel('realtime_piket_dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'presensi_harian', filter: `tanggal=eq.${tanggal}` }, () => {
        fetchDashboardData()
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [tanggal, filterKelas])

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      let siswaQuery = supabase.from('siswa_lengkap').select('nisn, nama_lengkap, kelas').eq('is_aktif', true)
      if (filterKelas && filterKelas.length > 0) {
        siswaQuery = siswaQuery.in('kelas', filterKelas)
      }
      const { data: siswaData } = await siswaQuery

      const siswaMap = {}
      let nisnList = []

      if (siswaData) {
        setSemuaSiswa(siswaData)
        const uniqueClasses = [...new Set(siswaData.map(s => s.kelas).filter(Boolean))].sort()
        setSemuaKelas(uniqueClasses)
        siswaData.forEach(s => { 
          siswaMap[s.nisn] = s.kelas 
          nisnList.push(s.nisn)
        })
      }

      // Fetch ALL classes and ALL presence today for the full bar chart
      const { data: semuaSiswaFullDB } = await supabase.from('siswa_lengkap').select('nisn, kelas').eq('is_aktif', true)
      const fullSiswaMap = {}
      if (semuaSiswaFullDB) {
        const uniqueKelasFull = [...new Set(semuaSiswaFullDB.map(s => s.kelas).filter(Boolean))].sort()
        setSemuaKelasFull(uniqueKelasFull)
        semuaSiswaFullDB.forEach(s => { fullSiswaMap[s.nisn] = s.kelas })
      }

      const { data: presensiFullData } = await supabase.from('presensi_harian').select('siswa_nisn, kelas, status').eq('tanggal', tanggal)
      if (presensiFullData) {
        const syncedFull = presensiFullData.map(p => ({ ...p, kelas: fullSiswaMap[p.siswa_nisn] || p.kelas }))
        setPresensiHariIniFull(syncedFull)
      }

      let presensiQuery = supabase.from('presensi_harian').select('*').eq('tanggal', tanggal)
      if (filterKelas && filterKelas.length > 0 && nisnList.length > 0) {
        // Fetch presensi for current students in these classes, ignoring the old class they were saved with
        presensiQuery = presensiQuery.in('siswa_nisn', nisnList)
      } else if (filterKelas && filterKelas.length > 0) {
        // If there are no students in the filtered classes, just force an empty result
        presensiQuery = presensiQuery.in('siswa_nisn', ['0000000000'])
      }
      const { data: presensiDataDB } = await presensiQuery
      
      if (presensiDataDB) {
        // Sync class to current student class
        const updatedPresensi = presensiDataDB.map(p => ({ ...p, kelas: siswaMap[p.siswa_nisn] || p.kelas }))
        setPresensiHariIni(updatedPresensi)
      }

      const dateObj = new Date(tanggal)
      dateObj.setDate(dateObj.getDate() - 7)
      const startDate = dateObj.toLocaleDateString('en-CA')

      let mingguanQuery = supabase.from('presensi_harian').select('*').gte('tanggal', startDate).lte('tanggal', tanggal).order('tanggal', { ascending: true })
      if (filterKelas && filterKelas.length > 0 && nisnList.length > 0) {
        mingguanQuery = mingguanQuery.in('siswa_nisn', nisnList)
      } else if (filterKelas && filterKelas.length > 0) {
        mingguanQuery = mingguanQuery.in('siswa_nisn', ['0000000000'])
      }
      const { data: presensiMingguanDB } = await mingguanQuery

      if (presensiMingguanDB) {
        // Sync class to current student class
        const updatedMingguan = presensiMingguanDB.map(p => ({ ...p, kelas: siswaMap[p.siswa_nisn] || p.kelas }))
        setPresensiMingguan(updatedMingguan)
      }

    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
  }

  // Summary statistics (Hari Ini)
  const totalSiswaCount = semuaSiswa.length
  // Sesuai logika baru: siswa yang hadir dan terlambat keduanya dihitung sebagai Hadir
  const hadirCount = presensiHariIni.filter(p => p.status === 'H' || p.status === 'T').length
  const telatCount = presensiHariIni.filter(p => p.status === 'T').length
  const sakitIzinCount = presensiHariIni.filter(p => p.status === 'S' || p.status === 'I').length
  const alpaCount = presensiHariIni.filter(p => p.status === 'A').length
  
  // Line Chart (7 Days Attendance)
  const lineChartData = useMemo(() => {
    const data = []
    for(let i=6; i>=0; i--) {
      const d = new Date(tanggal)
      d.setDate(d.getDate() - i)
      const dateStr = d.toLocaleDateString('en-CA')
      const label = d.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })
      const count = presensiMingguan.filter(p => p.tanggal === dateStr && (p.status === 'H' || p.status === 'T')).length
      data.push({ dateStr, label, total: count })
    }
    return data
  }, [presensiMingguan, tanggal])

  // Bar Chart (Students Present by Class Today)
  const barChartData = useMemo(() => {
    return semuaKelasFull.map(c => {
      const hadir = presensiHariIniFull.filter(p => p.kelas === c && (p.status === 'H' || p.status === 'T')).length
      return { kelas: c, hadir }
    })
  }, [semuaKelasFull, presensiHariIniFull])

  // Pie Chart
  const pieChartData = useMemo(() => {
    return [
      { name: 'Sakit', value: presensiHariIni.filter(p => p.status === 'S').length, color: '#3b82f6' },
      { name: 'Izin', value: presensiHariIni.filter(p => p.status === 'I').length, color: '#a855f7' },
      { name: 'Alpha', value: presensiHariIni.filter(p => p.status === 'A').length, color: '#f43f5e' },
      { name: 'Terlambat', value: telatCount, color: '#f97316' },
    ].filter(d => d.value > 0)
  }, [presensiHariIni, telatCount])

  const totalPerhatian = pieChartData.reduce((acc, curr) => acc + curr.value, 0)

  // Top 6 Attendant (over last 7 days)
  const topAttendant = useMemo(() => {
    const studentCount = {}
    presensiMingguan.forEach(p => {
      if (p.status === 'H' || p.status === 'T') {
        studentCount[p.siswa_nisn] = (studentCount[p.siswa_nisn] || 0) + 1
      }
    })
    
    const sorted = Object.entries(studentCount)
      .map(([nisn, count]) => ({ nisn, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return sorted.map(item => {
      const s = semuaSiswa.find(x => x.nisn === item.nisn)
      return {
        ...item,
        nama: s?.nama_lengkap || item.nisn,
        kelas: s?.kelas || '-',
        percentage: Math.min(Math.round((item.count / 7) * 100), 100)
      }
    })
  }, [presensiMingguan, semuaSiswa])

  // Unrecorded students today
  const unrecordedStudents = useMemo(() => {
    const recordedNisn = new Set(presensiHariIni.map(p => p.siswa_nisn))
    return semuaSiswa.filter(s => !recordedNisn.has(s.nisn))
  }, [semuaSiswa, presensiHariIni])

  if (loading && semuaKelas.length === 0) {
    return <div className="flex justify-center items-center h-full"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div></div>
  }

  const CustomTooltipLine = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 text-white text-xs px-3 py-2 rounded-2xl shadow-lg">
          <p className="font-semibold mb-1">{label}</p>
          <p className="text-emerald-400">{payload[0].value} Siswa Hadir</p>
        </div>
      )
    }
    return null
  }

  const CustomTooltipBar = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 text-white text-xs px-3 py-2 rounded-2xl shadow-lg">
          <p className="font-semibold mb-1">Kelas {label}</p>
          <p className="text-indigo-400">{payload[0].value} Siswa Hadir</p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="animate-fade-in font-sans text-slate-800 flex flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Dashboard Presensi</h2>
          <p className="text-sm text-slate-500 font-medium mt-1">Ringkasan harian dan statistik kehadiran siswa.</p>
        </div>
        <div className="flex items-center gap-3">
          <input 
            type="date" 
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
            className="px-4 py-2 bg-white border-none rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm cursor-pointer"
          />
        </div>
      </div>

      {/* Row 1: Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 transition-all hover:-translate-y-1 hover:shadow-md">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-0.5">Total Siswa</p>
            <p className="text-2xl font-black text-slate-800 leading-none">{totalSiswaCount}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 transition-all hover:-translate-y-1 hover:shadow-md relative overflow-hidden">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0 relative z-10">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </div>
          <div className="relative z-10">
            <p className="text-xs font-semibold text-slate-500 mb-0.5">Hadir Hari Ini</p>
            <p className="text-2xl font-black text-emerald-600 leading-none">{hadirCount}</p>
          </div>
          <div className="absolute right-0 top-0 h-full w-2 bg-emerald-500"></div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 transition-all hover:-translate-y-1 hover:shadow-md">
          <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-0.5">Sakit / Izin</p>
            <p className="text-2xl font-black text-slate-800 leading-none">{sakitIzinCount}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 transition-all hover:-translate-y-1 hover:shadow-md">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6"></path></svg>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-0.5">Alpha</p>
            <p className="text-2xl font-black text-slate-800 leading-none">{alpaCount}</p>
          </div>
        </div>
      </div>

      {/* Row 2: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Laporan Kehadiran Total (Line Chart) */}
        <div className="col-span-1 lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800">Laporan Kehadiran Total</h3>
            <button className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"></path></svg>
            </button>
          </div>
          <div className="flex-1 min-h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip content={<CustomTooltipLine />} />
                <Line 
                  type="monotone" 
                  dataKey="total" 
                  stroke="#10b981" 
                  strokeWidth={3} 
                  dot={{ r: 4, strokeWidth: 2, fill: '#fff', stroke: '#10b981' }} 
                  activeDot={{ r: 6, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Siswa per Kelas (Bar Chart) */}
        <div className="col-span-1 bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800">Kehadiran per Kelas</h3>
            <button className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"></path></svg>
            </button>
          </div>
          <div className="flex-1 min-h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="kelas" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip content={<CustomTooltipBar />} cursor={{fill: '#f8fafc'}} />
                <Bar dataKey="hadir" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Row 3: Bottom Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Perlu Perhatian Total (Pie Chart) */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-800">Total Perlu Perhatian</h3>
            <button className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"></path></svg>
            </button>
          </div>
          
          {presensiHariIni.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
              <div className="w-12 h-12 bg-slate-50 border border-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
              <p className="text-sm font-semibold text-slate-700">Belum Ada Data</p>
              <p className="text-xs text-slate-500 mt-1">Belum ada data presensi yang masuk hari ini.</p>
            </div>
          ) : totalPerhatian === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
              </div>
              <p className="text-emerald-600 font-bold mb-1">Aman Terkendali</p>
              <p className="text-slate-500 text-sm">Tidak ada catatan Sakit, Izin, atau Alpha sejauh ini.</p>
            </div>
          ) : (
            <>
              <div className="h-[180px] w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value) => [`${value} Siswa`, '']} 
                      contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none flex-col">
                  <span className="text-2xl font-black text-slate-800 leading-none">{totalPerhatian}</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Siswa</span>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2">
                {pieChartData.map((d, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }}></div>
                    {d.name} <span className="text-slate-400 font-bold ml-0.5">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Top 6 Attendant (Siswa Terajin) */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-800">Siswa Terajin (Minggu Ini)</h3>
            <button className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"></path></svg>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3 max-h-[220px]">
            {topAttendant.length === 0 ? (
              <div className="text-center text-slate-500 py-6 text-sm">Belum ada data absensi yang mencukupi.</div>
            ) : topAttendant.map((s, idx) => (
              <div key={s.nisn} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0 overflow-hidden relative border border-slate-200">
                  <span className="absolute z-0">{getInitials(s.nama)}</span>
                  <img 
                    src={`https://res.cloudinary.com/dwyhpysp5/image/upload/c_fill,w_100,h_100/SKL-BM/FOTO_${s.nisn}_${activeTa?.id}`} 
                    alt={s.nama}
                    className="w-full h-full object-cover relative z-10"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{s.nama}</p>
                  <p className="text-[11px] text-slate-500">Kelas {s.kelas}</p>
                </div>
                <div className="text-right shrink-0 flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{s.percentage}%</span>
                  <span className="text-xs font-bold text-emerald-600">{s.count} hr</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Siswa Belum Presensi (List) */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-800">Siswa Belum Presensi</h3>
            <div className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-1 rounded-2xl">
              {unrecordedStudents.length} Siswa
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3 max-h-[220px]">
            {unrecordedStudents.length === 0 ? (
              <div className="text-center text-slate-500 py-6 text-sm">Semua siswa sudah dipresensi.</div>
            ) : unrecordedStudents.sort((a,b) => a.kelas.localeCompare(b.kelas) || a.nama_lengkap.localeCompare(b.nama_lengkap)).map((s, idx) => {
              return (
                <div key={`${s.nisn}-${idx}`} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0 overflow-hidden relative border border-slate-200">
                    <span className="absolute z-0">{getInitials(s.nama_lengkap)}</span>
                    <img 
                      src={`https://res.cloudinary.com/dwyhpysp5/image/upload/c_fill,w_100,h_100/SKL-BM/FOTO_${s.nisn}_${activeTa?.id}`} 
                      alt={s.nama_lengkap}
                      className="w-full h-full object-cover relative z-10"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{s.nama_lengkap}</p>
                    <p className="text-[11px] text-slate-500">Kls {s.kelas}</p>
                  </div>
                  <div className="shrink-0">
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-200 px-2 py-1 rounded-md">Belum Ada Data</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 10px;
        }
        .custom-scrollbar:hover::-webkit-scrollbar-thumb {
          background-color: #94a3b8;
        }
      `}} />
    </div>
  )
}
