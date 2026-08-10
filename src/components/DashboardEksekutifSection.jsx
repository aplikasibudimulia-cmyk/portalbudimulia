import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  BarChart, Bar
} from 'recharts'

export default function DashboardEksekutifSection({ session, activeTa, onNavigate }) {
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({
    totalSiswa: 0,
    totalGuru: 0,
    kehadiranHariIni: 0,
    pelanggaranBulanIni: 0,
    programBerjalan: 0
  })

  const [attendanceRange, setAttendanceRange] = useState(7) // 7 or 30 days
  const [attendanceTren, setAttendanceTren] = useState([])
  const [topClassesViolations, setTopClassesViolations] = useState([])
  const [upcomingPrograms, setUpcomingPrograms] = useState([])
  const [latestAnnouncements, setLatestAnnouncements] = useState([])

  // Modal Details for widget clicks
  const [selectedProgram, setSelectedProgram] = useState(null)
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null)

  // Fetch school settings for announcement kop
  const [schoolSettings, setSchoolSettings] = useState({
    nama_sekolah: 'SMP BUDI MULIA JAKARTA',
    logo_url: '/logo.png',
    alamat: 'Jl. Mangga Besar No. 3, Jakarta Pusat',
    telepon: '(021) 6296366'
  })

  const fetchStatsAndWidgets = useCallback(async () => {
    if (!activeTa?.id) return
    setLoading(true)
    try {
      const todayStr = new Date().toISOString().slice(0, 10)
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      const startOfMonthStr = startOfMonth.toISOString().slice(0, 10)

      // 1. Fetch Total Siswa Aktif
      const { count: studentCount } = await supabase.from('siswa_lengkap')
        .select('*', { count: 'exact', head: true })
        .eq('is_aktif', true)
      
      // 2. Fetch Total Guru
      const { count: guruCount } = await supabase.from('guru')
        .select('*', { count: 'exact', head: true })

      // 3. Fetch Rata-rata Kehadiran Hari Ini
      const { data: presensiHariIni } = await supabase.from('presensi_harian')
        .select('status')
        .eq('tanggal', todayStr)
      
      const hadirHariIni = presensiHariIni?.filter(p => p.status === 'H' || p.status === 'T').length || 0
      const rateKehadiran = studentCount > 0 ? Math.round((hadirHariIni / studentCount) * 100) : 0

      // 4. Fetch Jumlah Pelanggaran Bulan Ini
      const { data: pointRecords } = await supabase.from('point_records')
        .select('poin_diberikan')
        .eq('tahun_ajaran_id', activeTa.id)
        .gte('tanggal', startOfMonthStr)
        .lte('tanggal', todayStr)
        .lt('poin_diberikan', 0)
      
      const pelanggaranCount = pointRecords?.length || 0

      // 5. Fetch Program Sekolah Sedang Berjalan
      const { count: programCount } = await supabase.from('program_sekolah')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'Berjalan')

      setStats({
        totalSiswa: studentCount || 0,
        totalGuru: guruCount || 0,
        kehadiranHariIni: rateKehadiran,
        pelanggaranBulanIni: pelanggaranCount,
        programBerjalan: programCount || 0
      })

      // 6. Fetch Upcoming Programs (limit 3)
      const { data: programs } = await supabase.from('program_sekolah')
        .select('*')
        .gte('tanggal_mulai', todayStr)
        .order('tanggal_mulai', { ascending: true })
        .limit(3)
      setUpcomingPrograms(programs || [])

      // 7. Fetch Latest Published Announcements (limit 3)
      const { data: ann } = await supabase.from('pengumuman_resmi')
        .select('*')
        .eq('status', 'Terbit')
        .order('tanggal_terbit', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(3)
      setLatestAnnouncements(ann || [])

      // 8. Fetch Top 5 Kelas Pelanggaran Terbanyak
      const { data: monthlyViolations } = await supabase.from('point_records')
        .select('kelas, poin_diberikan')
        .eq('tahun_ajaran_id', activeTa.id)
        .gte('tanggal', startOfMonthStr)
        .lte('tanggal', todayStr)
        .lt('poin_diberikan', 0)
      
      const classVMap = {}
      monthlyViolations?.forEach(r => {
        classVMap[r.kelas] = (classVMap[r.kelas] || 0) + Math.abs(r.poin_diberikan)
      })
      const topClasses = Object.entries(classVMap)
        .map(([kelas, poin]) => ({ name: kelas, Pelanggaran: poin }))
        .sort((a, b) => b.Pelanggaran - a.Pelanggaran)
        .slice(0, 5)
      setTopClassesViolations(topClasses)

      // 9. Fetch School Settings
      const { data: sch } = await supabase.from('pengaturan_sekolah').select('*')
      if (sch) {
        const settings = { ...schoolSettings }
        sch.forEach(s => {
          if (s.setting_key === 'nama_sekolah') settings.nama_sekolah = s.setting_value
          if (s.setting_key === 'logo_sekolah' || s.setting_key === 'logo_url') settings.logo_url = s.setting_value
          if (s.setting_key === 'alamat_sekolah') settings.alamat = s.setting_value
          if (s.setting_key === 'telepon_sekolah') settings.telepon = s.setting_value
        })
        setSchoolSettings(settings)
      }

    } catch (err) {
      console.error('Error loading Executive Dashboard metrics:', err)
    } finally {
      setLoading(false)
    }
  }, [activeTa])

  // Fetch Attendance Trend based on Range (7 or 30 days)
  const fetchAttendanceTrend = useCallback(async () => {
    if (!activeTa?.id) return
    try {
      const today = new Date()
      const startRange = new Date()
      startRange.setDate(today.getDate() - attendanceRange)
      const startRangeStr = startRange.toISOString().slice(0, 10)
      const todayStr = today.toISOString().slice(0, 10)

      // Fetch active students to compute rate correctly
      const { count: studentCount } = await supabase.from('siswa_lengkap')
        .select('*', { count: 'exact', head: true })
        .eq('is_aktif', true)

      const { data: presence } = await supabase.from('presensi_harian')
        .select('tanggal, status')
        .gte('tanggal', startRangeStr)
        .lte('tanggal', todayStr)
      
      const trenMap = {}
      presence?.forEach(p => {
        if (!trenMap[p.tanggal]) {
          trenMap[p.tanggal] = { name: p.tanggal, present: 0 }
        }
        if (p.status === 'H' || p.status === 'T') {
          trenMap[p.tanggal].present++
        }
      })

      const totalSiswa = studentCount || 1
      const trenList = Object.values(trenMap).map(item => ({
        name: new Date(item.name).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        Kehadiran: Math.round((item.present / totalSiswa) * 100),
        rawDate: item.name
      })).sort((a, b) => a.rawDate.localeCompare(b.rawDate))

      setAttendanceTren(trenList)
    } catch (err) {
      console.error('Error fetching attendance trend:', err)
    }
  }, [activeTa, attendanceRange])

  useEffect(() => {
    fetchStatsAndWidgets()
  }, [fetchStatsAndWidgets])

  useEffect(() => {
    fetchAttendanceTrend()
  }, [fetchAttendanceTrend])

  if (loading) {
    return <div className="p-8 text-center text-slate-500 animate-pulse">Memuat Dashboard Eksekutif...</div>
  }

  return (
    <div className="animate-slide-up space-y-6">
      
      {/* Welcome Banner */}
      <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-3xl p-6 md:p-8 shadow-lg text-white relative overflow-hidden">
        <div className="relative z-10 space-y-2">
          <span className="px-3 py-1 bg-indigo-500/30 text-indigo-200 border border-indigo-500/20 text-xs font-bold rounded-full uppercase tracking-wider">Dashboard Eksekutif</span>
          <h2 className="text-2xl md:text-3xl font-black">Selamat Datang, {session?.nama_guru || 'Kepala Sekolah'}! 👋</h2>
          <p className="text-slate-300 text-sm md:text-base max-w-xl">
            Ringkasan indikator performa sekolah, kedisiplinan poin, kehadiran murid, dan kegiatan tahunan eBudiMulia.
          </p>
        </div>
        <svg className="absolute right-0 bottom-0 opacity-10 w-64 h-64 -mb-16 -mr-16 transform rotate-12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 22h20L12 2zm0 3.8l7.5 14.2H4.5L12 5.8z" /></svg>
      </div>

      {/* Grid Kartu Statistik */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Siswa Aktif */}
        <div
          onClick={() => onNavigate && onNavigate('denah_kehadiran')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md cursor-pointer transition-all flex items-start gap-4"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Siswa Aktif</span>
            <span className="text-xl font-black text-slate-800 block mt-0.5">{stats.totalSiswa}</span>
          </div>
        </div>

        {/* Guru & Staff */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Guru & Staff</span>
            <span className="text-xl font-black text-slate-800 block mt-0.5">{stats.totalGuru}</span>
          </div>
        </div>

        {/* Rerata Kehadiran */}
        <div
          onClick={() => onNavigate && onNavigate('denah_kehadiran')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md cursor-pointer transition-all flex items-start gap-4"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Presensi Hari Ini</span>
            <span className="text-xl font-black text-slate-800 block mt-0.5">{stats.kehadiranHariIni}%</span>
          </div>
        </div>

        {/* Kasus Pelanggaran */}
        <div
          onClick={() => onNavigate && onNavigate('rekap_poin')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md cursor-pointer transition-all flex items-start gap-4"
        >
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pelanggaran MoM</span>
            <span className="text-xl font-black text-slate-800 block mt-0.5">{stats.pelanggaranBulanIni} Kasus</span>
          </div>
        </div>

        {/* Program Sekolah */}
        <div
          onClick={() => onNavigate && onNavigate('program_sekolah')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md cursor-pointer transition-all flex items-start gap-4"
        >
          <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Program Berjalan</span>
            <span className="text-xl font-black text-slate-800 block mt-0.5">{stats.programBerjalan} Kegiatan</span>
          </div>
        </div>
      </div>

      {/* Row Grafik & Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Grafik Kehadiran Sekolah */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
              <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
              Tren Persentase Kehadiran Harian
            </h3>
            <div className="flex bg-slate-100 p-0.5 rounded-lg border text-xs">
              <button onClick={() => setAttendanceRange(7)} className={`px-2.5 py-1 rounded font-bold ${attendanceRange === 7 ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>7 Hari</button>
              <button onClick={() => setAttendanceRange(30)} className={`px-2.5 py-1 rounded font-bold ${attendanceRange === 30 ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>30 Hari</button>
            </div>
          </div>
          <div className="h-64">
            {attendanceTren.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <LineChart data={attendanceTren} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 'bold' }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <RechartsTooltip />
                  <Line type="monotone" dataKey="Kehadiran" stroke="#6366f1" strokeWidth={3} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">Tidak ada data tren presensi.</div>
            )}
          </div>
        </div>

        {/* Grafik Top 5 Kelas Pelanggar Terbanyak */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2 text-sm">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            5 Kelas Pelanggaran Poin Terbanyak (Bulan Ini)
          </h3>
          <div className="h-64">
            {topClassesViolations.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <BarChart data={topClassesViolations} layout="vertical" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fontWeight: 'bold' }} tickLine={false} axisLine={false} />
                  <RechartsTooltip />
                  <Bar dataKey="Pelanggaran" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">Tidak ada data pelanggaran kelas bulan ini.</div>
            )}
          </div>
        </div>

      </div>

      {/* Row Widgets Mendatang & Pengumuman */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Widget Program Mendatang */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              Agenda Kegiatan Sekolah Terdekat
            </h3>
            <button onClick={() => onNavigate && onNavigate('program_sekolah')} className="text-xs font-bold text-indigo-600 hover:text-indigo-800">
              Lihat Kalender →
            </button>
          </div>
          <div className="space-y-3 flex-1">
            {upcomingPrograms.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-4">Belum ada agenda program terjadwal dalam waktu dekat.</p>
            ) : (
              upcomingPrograms.map(prog => (
                <div
                  key={prog.id}
                  onClick={() => setSelectedProgram(prog)}
                  className="p-3 border border-slate-100 hover:border-indigo-150 rounded-xl hover:bg-slate-50/50 cursor-pointer transition-all flex items-center justify-between gap-3"
                >
                  <div>
                    <h4 className="font-bold text-xs text-slate-800">{prog.nama}</h4>
                    <p className="text-[10px] text-slate-400 font-semibold mt-1">
                      Mulai: {new Date(prog.tanggal_mulai).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full font-bold text-[9px] bg-indigo-50 border border-indigo-100 text-indigo-700">
                    PIC: {prog.created_by ? 'Staff' : 'Panitia'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Widget Pengumuman Resmi Terbaru */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1M19 20a2 2 0 002-2V8a2 2 0 00-2-2h-5M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m-1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              Pengumuman Resmi Terbaru
            </h3>
            <button onClick={() => onNavigate && onNavigate('pengumuman_resmi_kepsek')} className="text-xs font-bold text-indigo-600 hover:text-indigo-800">
              Arsip Surat →
            </button>
          </div>
          <div className="space-y-3 flex-1">
            {latestAnnouncements.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-4">Belum ada pengumuman resmi yang diterbitkan.</p>
            ) : (
              latestAnnouncements.map(ann => (
                <div
                  key={ann.id}
                  onClick={() => setSelectedAnnouncement(ann)}
                  className="p-3 border border-slate-100 hover:border-indigo-150 rounded-xl hover:bg-slate-50/50 cursor-pointer transition-all flex items-center justify-between gap-3"
                >
                  <div className="truncate">
                    <h4 className="font-bold text-xs text-slate-800 truncate">{ann.judul}</h4>
                    <p className="text-[10px] text-slate-400 font-mono mt-1">{ann.nomor_surat || '—'}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 font-bold text-[9px] shrink-0">
                    {new Date(ann.tanggal_terbit).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* Widget Modal Program Detail */}
      {selectedProgram && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-sm">Detail Kegiatan</h3>
              <button onClick={() => setSelectedProgram(null)} className="text-slate-400 hover:text-slate-600 font-bold">×</button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 block font-semibold">Nama Program:</span>
                <span className="font-bold text-slate-800">{selectedProgram.nama}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400 block font-semibold">Tanggal Mulai:</span>
                  <span className="font-bold text-slate-800">{selectedProgram.tanggal_mulai}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold">Tanggal Selesai:</span>
                  <span className="font-bold text-slate-800">{selectedProgram.tanggal_selesai || '—'}</span>
                </div>
              </div>
              <div>
                <span className="text-slate-400 block font-semibold">Status Pelaksanaan:</span>
                <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full font-bold text-[9px] bg-indigo-50 border border-indigo-100 text-indigo-700">
                  {selectedProgram.status}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-semibold">Deskripsi:</span>
                <p className="text-slate-600 mt-1 leading-normal">{selectedProgram.deskripsi || '—'}</p>
              </div>
            </div>
            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button onClick={() => setSelectedProgram(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl">Tutup</button>
            </div>
          </div>
        </div>
      )}

      {/* Widget Modal Announcement Detail Preview */}
      {selectedAnnouncement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
              <span className="text-xs font-bold text-slate-700">Preview Pengumuman Resmi</span>
              <button onClick={() => setSelectedAnnouncement(null)} className="text-slate-400 hover:text-slate-600 font-bold">×</button>
            </div>
            
            <div className="p-8 overflow-y-auto flex-1 font-serif text-slate-900 bg-slate-50/10">
              <div className="border border-slate-200 bg-white p-6 shadow-inner max-w-md mx-auto rounded-xl">
                {/* Kop */}
                <div className="flex items-center gap-3 border-b-2 border-slate-800 pb-3 text-center sm:text-left">
                  <img src={schoolSettings.logo_url} alt="Logo" className="w-12 h-12 object-contain hidden sm:block shrink-0" />
                  <div className="flex-1">
                    <h4 className="font-extrabold text-xs tracking-wide uppercase">{schoolSettings.nama_sekolah}</h4>
                    <p className="text-[9px] font-sans text-slate-500 leading-normal">{schoolSettings.alamat}</p>
                  </div>
                </div>

                {/* Nomor */}
                <div className="mt-4 text-center">
                  <h5 className="font-bold text-xs underline">SURAT PENGUMUMAN RESMI</h5>
                  <p className="text-[10px] text-slate-500 mt-0.5">Nomor: {selectedAnnouncement.nomor_surat || '—'}</p>
                </div>

                {/* Hal */}
                <div className="mt-4 text-[10px] font-bold">
                  Hal: {selectedAnnouncement.judul}
                </div>

                {/* Content */}
                <div 
                  className="mt-4 text-[10px] leading-relaxed text-justify space-y-2 prose max-w-none font-serif"
                  dangerouslySetInnerHTML={{ __html: selectedAnnouncement.isi }}
                />

                {/* Signature */}
                <div className="mt-8 flex justify-end text-[10px]">
                  <div className="text-center w-36 space-y-1">
                    <p>Hormat Kami,</p>
                    <p className="font-bold">Kepala Sekolah</p>
                    {selectedAnnouncement.tanda_tangan_url && (
                      <div className="h-10 flex items-center justify-center overflow-hidden">
                        <img src={selectedAnnouncement.tanda_tangan_url} alt="Tanda Tangan" className="h-full object-contain" />
                      </div>
                    )}
                    <p className="font-bold underline mt-4">ANSELMA J.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end bg-slate-50/50 shrink-0">
              <button onClick={() => setSelectedAnnouncement(null)} className="px-4 py-2 bg-slate-150 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl">Tutup</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
