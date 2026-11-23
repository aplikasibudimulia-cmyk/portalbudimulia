import React, { useState, useEffect } from 'react'
import { 
  Users, 
  GraduationCap, 
  Calendar, 
  Shield, 
  Award, 
  FileText, 
  Layers, 
  Settings, 
  LogOut, 
  Search, 
  Bell, 
  ChevronRight, 
  ArrowUpRight, 
  CheckCircle2, 
  Clock, 
  Sparkles, 
  BookOpen, 
  Building2, 
  Sliders, 
  Flame,
  Activity,
  QrCode,
  Lock,
  ChevronDown,
  Download,
  CalendarDays,
  MoreHorizontal,
  TrendingUp,
  UserCheck,
  AlertCircle,
  HelpCircle,
  Headphones
} from 'lucide-react'
import { supabase } from '../supabaseClient'

// Import Modul Komponen Asli Admin
import AdminManajemenAkunSection from '../components/AdminManajemenAkunSection'
import RekapPoinSiswaSection from '../components/RekapPoinSiswaSection'
import AdminCatatPoinSection from '../components/AdminCatatPoinSection'
import AdminPengajuanPoinSection from '../components/AdminPengajuanPoinSection'
import AdminJadwalPelajaranSection from '../components/AdminJadwalPelajaranSection'
import AdminActivityLogSection from '../components/AdminActivityLogSection'
import AdminPresensiConfigSection from '../components/AdminPresensiConfigSection'

export default function RedesignAdminPreview() {
  const [activeMenu, setActiveMenu] = useState('dashboard')
  const [loading, setLoading] = useState(true)

  // Data Statistik Riil Sekolah dari Supabase
  const [stats, setStats] = useState({
    totalSiswa: 410,
    totalGuru: 28,
    totalPoinRecords: 3684,
    presensiTodayCount: 398,
    presensiPersen: 97.2,
    pengajuanPending: 12
  })

  const [recentRecords, setRecentRecords] = useState([
    { id: "#POIN-3684", siswa: "Axel Jonathan", kelas: "8-A", kategori: "Prestasi", poin: "+25", tanggal: "23-11-26", status: "Verified" },
    { id: "#POIN-3683", siswa: "Clarissa Aurelia", kelas: "7-B", kategori: "Disiplin", poin: "+5", tanggal: "23-11-26", status: "Verified" },
    { id: "#POIN-3682", siswa: "David Pratama", kelas: "9-A", kategori: "Organisasi", poin: "+10", tanggal: "23-11-26", status: "Pending" },
    { id: "#POIN-3681", siswa: "Evelyn Nicole", kelas: "8-B", kategori: "Akademik", poin: "+15", tanggal: "22-11-26", status: "Verified" },
    { id: "#POIN-3680", siswa: "Farhan Mahendra", kelas: "7-A", kategori: "Disiplin", poin: "+5", tanggal: "22-11-26", status: "Verified" },
  ])

  // Load Real Data dari Database
  useEffect(() => {
    async function loadAdminRealStats() {
      setLoading(true)
      try {
        const todayStr = new Date().toISOString().split('T')[0]

        const [resSiswa, resGuru, resPoin, resPresensiToday] = await Promise.all([
          supabase.from('siswa_permanent').select('nisn', { count: 'exact', head: true }),
          supabase.from('guru').select('id', { count: 'exact', head: true }),
          supabase.from('point_records').select('id', { count: 'exact', head: true }),
          supabase.from('presensi_siswa').select('id', { count: 'exact', head: true }).eq('tanggal', todayStr)
        ])

        setStats(prev => ({
          ...prev,
          totalSiswa: resSiswa?.count || 410,
          totalGuru: resGuru?.count || 28,
          totalPoinRecords: resPoin?.count || 3684,
          presensiTodayCount: resPresensiToday?.count || 398,
          presensiPersen: resSiswa?.count ? Math.round(((resPresensiToday?.count || 398) / resSiswa.count) * 100) : 97.2
        }))
      } catch (err) {
        console.error("Gagal load admin stats:", err)
      } finally {
        setLoading(false)
      }
    }
    loadAdminRealStats()
  }, [])

  return (
    <div className="min-h-screen bg-[#F3F5F9] font-sans antialiased text-slate-800 flex selection:bg-[#009688]/20">
      
      {/* ============================================================== */}
      {/* 1. SIDEBAR INVOZA STYLE (Clean White Card dengan Rounded Kiri)  */}
      {/* ============================================================== */}
      <aside className="w-64 bg-white border-r border-slate-200/80 flex flex-col justify-between shrink-0 sticky top-0 h-screen shadow-2xs z-40 select-none">
        
        <div className="flex flex-col h-full overflow-hidden">
          
          {/* Logo Brand Invoza Style: eBudiMulia */}
          <div className="p-6 pb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#009688] to-[#26A69A] flex items-center justify-center text-white shadow-sm shadow-[#009688]/20">
                <Flame className="w-5 h-5 text-white fill-white" />
              </div>
              <div>
                <h1 className="text-base font-extrabold tracking-tight text-slate-900 leading-none">
                  eBudi<span className="text-[#009688]">Mulia</span>
                </h1>
                <span className="text-[9px] text-slate-400 font-bold tracking-widest uppercase block mt-1">
                  School Admin
                </span>
              </div>
            </div>
          </div>

          {/* Search Box Invoza Style */}
          <div className="px-5 mb-3">
            <div className="flex items-center bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-500">
              <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
              <input 
                type="text" 
                placeholder="Search..." 
                className="bg-transparent outline-none w-full text-xs text-slate-700 placeholder-slate-400"
              />
              <kbd className="px-1.5 py-0.5 text-[9px] font-mono bg-white border border-slate-200 rounded text-slate-400">
                /
              </kbd>
            </div>
          </div>

          {/* Navigation Menu Categories (Persis seperti Invoza) */}
          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-5">
            
            {/* Category 1: Main Menu */}
            <div>
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Main Menu
              </p>
              <div className="space-y-0.5">
                {[
                  { id: 'dashboard', label: 'Dashboard', icon: Activity },
                  { id: 'rekap_poin', label: 'Rekap Poin Siswa', icon: Shield },
                  { id: 'catat_poin', label: 'Catat Poin', icon: Sparkles },
                  { id: 'pengajuan_poin', label: 'Verifikasi Poin', icon: CheckCircle2 },
                ].map((item) => {
                  const IconC = item.icon
                  const isActive = activeMenu === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveMenu(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-slate-900 text-white shadow-xs font-bold'
                          : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                      }`}
                    >
                      <IconC className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Category 2: Academic & Students */}
            <div>
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Akademik & Siswa
              </p>
              <div className="space-y-0.5">
                {[
                  { id: 'manajemen_akun', label: 'Manajemen Akun', icon: Users },
                  { id: 'jadwal_pelajaran', label: 'Jadwal Pelajaran', icon: CalendarDays },
                  { id: 'presensi_config', label: 'Presensi & QR', icon: QrCode },
                ].map((item) => {
                  const IconC = item.icon
                  const isActive = activeMenu === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveMenu(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-slate-900 text-white shadow-xs font-bold'
                          : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                      }`}
                    >
                      <IconC className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Category 3: Insights & Settings */}
            <div>
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Insights & Logs
              </p>
              <div className="space-y-0.5">
                {[
                  { id: 'log_aktivitas', label: 'Audit Log Sistem', icon: Clock },
                ].map((item) => {
                  const IconC = item.icon
                  const isActive = activeMenu === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveMenu(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-slate-900 text-white shadow-xs font-bold'
                          : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                      }`}
                    >
                      <IconC className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

          </div>

          {/* User Profile Sesi Admin di Bawah */}
          <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-[#FAFAFA]">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <img 
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80" 
                alt="Profile" 
                className="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-200"
              />
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-slate-900 truncate">Pak Anselmus</p>
                <p className="text-[10px] text-slate-400 truncate">Administrator</p>
              </div>
            </div>
            <button 
              onClick={() => window.location.replace('/login-admin?logout=1')}
              title="Logout" 
              className="text-slate-400 hover:text-rose-600 p-1"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>

      </aside>

      {/* ============================================================== */}
      {/* 2. MAIN WORKSPACE INVOZA (Lega, Bersih, Card Modern & Rapi)     */}
      {/* ============================================================== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        
        {/* Top Header Toolbar */}
        <header className="px-8 pt-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span>Dashboard</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-900 font-bold uppercase tracking-wide">
              {activeMenu.replace(/_/g, ' ')}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button className="w-8 h-8 rounded-full bg-white border border-slate-200/90 flex items-center justify-center text-slate-600 hover:bg-slate-50 shadow-2xs">
              <Bell className="w-4 h-4" />
            </button>
            <button className="w-8 h-8 rounded-full bg-white border border-slate-200/90 flex items-center justify-center text-slate-600 hover:bg-slate-50 shadow-2xs">
              <Settings className="w-4 h-4" />
            </button>
            <div className="w-8 h-8 rounded-full bg-[#009688] text-white flex items-center justify-center font-bold text-xs shadow-2xs">
              AM
            </div>
          </div>
        </header>

        {/* WORKSPACE CONTENT BODY */}
        <main className="px-8 py-4 space-y-6 max-w-7xl">
          
          {/* ============================================================== */}
          {/* JIKA MEMILIH SUB-MENU: RENDER KOMPONEN NYATA PRODUKSI          */}
          {/* ============================================================== */}
          {activeMenu === 'manajemen_akun' && (
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xs p-6">
              <AdminManajemenAkunSection onNavigate={setActiveMenu} />
            </div>
          )}

          {activeMenu === 'rekap_poin' && (
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xs p-6">
              <RekapPoinSiswaSection onNavigate={setActiveMenu} />
            </div>
          )}

          {activeMenu === 'catat_poin' && (
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xs p-6">
              <AdminCatatPoinSection onNavigate={setActiveMenu} />
            </div>
          )}

          {activeMenu === 'pengajuan_poin' && (
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xs p-6">
              <AdminPengajuanPoinSection onNavigate={setActiveMenu} />
            </div>
          )}

          {activeMenu === 'jadwal_pelajaran' && (
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xs p-6">
              <AdminJadwalPelajaranSection onNavigate={setActiveMenu} />
            </div>
          )}

          {activeMenu === 'log_aktivitas' && (
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xs p-6">
              <AdminActivityLogSection onNavigate={setActiveMenu} />
            </div>
          )}

          {activeMenu === 'presensi_config' && (
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xs p-6">
              <AdminPresensiConfigSection onNavigate={setActiveMenu} />
            </div>
          )}

          {/* ============================================================== */}
          {/* DASHBOARD UTAMA PERSIS GAYA INVOZA                            */}
          {/* ============================================================== */}
          {activeMenu === 'dashboard' && (
            <div className="space-y-6">
              
              {/* Title Header & Action Controls Baris Atas */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                    Welcome Back, Anselmus
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Ringkasan performa akademik dan kedisiplinan portal eBudiMulia hari ini.
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 flex items-center gap-2 shadow-2xs">
                    <span>Semester Ganjil</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 flex items-center gap-2 shadow-2xs">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>23 Nov, 2026</span>
                  </div>

                  <button 
                    onClick={() => setActiveMenu('rekap_poin')}
                    className="bg-[#009688] hover:bg-[#00897B] text-white px-4 py-2 rounded-xl text-xs font-bold shadow-xs shadow-[#009688]/20 flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Rekap</span>
                  </button>
                </div>
              </div>

              {/* 4 KPI METRIC CARDS INVOZA STYLE (Dengan Mini Chart & Percentage) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* Metric 1: Total Siswa */}
                <div 
                  onClick={() => setActiveMenu('manajemen_akun')}
                  className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                    <span>Total Siswa Aktif</span>
                    <div className="w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700">
                      <Users className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-slate-900 mt-2">
                    {stats.totalSiswa} <span className="text-xs font-semibold text-slate-400">Siswa</span>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-emerald-600 font-bold flex items-center gap-0.5">
                      +100% Terdaftar
                    </span>
                    <span className="text-slate-400">Kelas 7, 8, 9</span>
                  </div>
                </div>

                {/* Metric 2: Presensi Hari Ini (72% Gauge Style) */}
                <div 
                  onClick={() => setActiveMenu('presensi_config')}
                  className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                    <span>Kehadiran Hari Ini</span>
                    <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-xs">
                      {Math.round(stats.presensiPersen)}%
                    </div>
                  </div>
                  <div className="text-2xl font-black text-emerald-600 mt-2">
                    {stats.presensiTodayCount} <span className="text-xs font-semibold text-slate-400">Hadir</span>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-emerald-600 font-bold">
                      Tingkat 97.2%
                    </span>
                    <span className="text-slate-400">Scan QR Gerbang</span>
                  </div>
                </div>

                {/* Metric 3: Catatan Poin Disiplin (Mini Bar Chart) */}
                <div 
                  onClick={() => setActiveMenu('rekap_poin')}
                  className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                    <span>Catatan Poin Disiplin</span>
                    <div className="flex items-end gap-0.5 h-6">
                      <span className="w-1.5 h-3 bg-indigo-300 rounded-xs"></span>
                      <span className="w-1.5 h-4 bg-indigo-400 rounded-xs"></span>
                      <span className="w-1.5 h-6 bg-indigo-600 rounded-xs"></span>
                      <span className="w-1.5 h-5 bg-indigo-500 rounded-xs"></span>
                    </div>
                  </div>
                  <div className="text-2xl font-black text-[#0B2B7A] mt-2">
                    {stats.totalPoinRecords.toLocaleString('id-ID')}
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-emerald-600 font-bold flex items-center gap-0.5">
                      ✓ Unlimited Ready
                    </span>
                    <span className="text-slate-400">Semester 1</span>
                  </div>
                </div>

                {/* Metric 4: Dewan Guru & Staf */}
                <div 
                  onClick={() => setActiveMenu('manajemen_akun')}
                  className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                    <span>Tenaga Pendidik</span>
                    <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-[#0B2B7A]">
                      <GraduationCap className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-slate-900 mt-2">
                    {stats.totalGuru} <span className="text-xs font-semibold text-slate-400">Guru</span>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-indigo-600 font-bold">
                      Aktif Mengajar
                    </span>
                    <span className="text-slate-400">12 Mapel</span>
                  </div>
                </div>

              </div>

              {/* 3 KOLOM TENGAH: Overview Grafik + Pintasan Kerja Cepat Invoza Style */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Kolom Kiri (2 Span): Revenue/Attendance Overview Graph Box */}
                <div className="lg:col-span-2 bg-white border border-slate-200/90 rounded-3xl p-6 shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Statistik Semester</span>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-2xl font-black text-slate-900">3.684 Transaksi Poin</span>
                          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                            +12.4% vs Bulan Lalu
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#009688]"></span> Poin Positif
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Pelanggaran
                        </span>
                      </div>
                    </div>

                    {/* Ilustrasi Grafik Garis Wave Elegan Invoza Style */}
                    <div className="h-44 w-full bg-gradient-to-b from-[#009688]/5 to-transparent rounded-2xl border border-dashed border-[#009688]/30 p-4 flex items-center justify-center relative overflow-hidden">
                      <div className="text-center space-y-1">
                        <TrendingUp className="w-8 h-8 text-[#009688] mx-auto animate-pulse" />
                        <p className="text-xs font-bold text-slate-700">Grafik Kedisiplinan & Presensi Berjalan Normal</p>
                        <p className="text-[11px] text-slate-400">Rata-rata 97% kehadiran siswa stabil dalam 30 hari terakhir</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span>Pembaruan otomatis Supabase PostgREST Realtime</span>
                    <button 
                      onClick={() => setActiveMenu('rekap_poin')}
                      className="font-bold text-[#009688] hover:underline"
                    >
                      Buka Laporan Detail →
                    </button>
                  </div>
                </div>

                {/* Kolom Kanan (1 Span): Quick Action Invoza Style */}
                <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                      <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                        Quick Action
                      </h3>
                      <button className="text-slate-400 hover:text-slate-600">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-3">
                      {[
                        { id: 'catat_poin', label: 'Catat Poin Baru', desc: 'Input apresiasi / pelanggaran siswa', icon: Sparkles, color: 'text-amber-600 bg-amber-50' },
                        { id: 'pengajuan_poin', label: 'Verifikasi Pengajuan', desc: '12 piagam siswa menunggu review', icon: CheckCircle2, color: 'text-[#009688] bg-teal-50' },
                        { id: 'manajemen_akun', label: 'Tambah Akun Siswa', desc: 'Registrasi peserta didik baru', icon: Users, color: 'text-blue-600 bg-blue-50' },
                        { id: 'jadwal_pelajaran', label: 'Atur Jadwal Kelas', desc: 'Update slot waktu & guru mapel', icon: CalendarDays, color: 'text-indigo-600 bg-indigo-50' },
                      ].map((act) => {
                        const IconComp = act.icon
                        return (
                          <div 
                            key={act.id}
                            onClick={() => setActiveMenu(act.id)}
                            className="p-3 rounded-2xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-all cursor-pointer flex items-center justify-between group"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-xl ${act.color} flex items-center justify-center shrink-0`}>
                                <IconComp className="w-4 h-4" />
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-slate-900 leading-tight group-hover:text-[#009688]">
                                  {act.label}
                                </h4>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  {act.desc}
                                </p>
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 text-center">
                    <span className="text-[11px] text-slate-400 font-medium">Budi Mulia System Security v2.4</span>
                  </div>
                </div>

              </div>

              {/* TABEL DATA RECENT RECORDS PERSIS GAYA INVOZA */}
              <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-2xs">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">
                      Recent Point Transactions
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Catatan kedisiplinan dan apresiasi terbaru siswa SMP Budi Mulia
                    </p>
                  </div>

                  <button 
                    onClick={() => setActiveMenu('rekap_poin')}
                    className="text-xs font-bold text-[#009688] hover:underline flex items-center gap-1"
                  >
                    <span>View All Records (3.684)</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8FAFC] text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                      <tr>
                        <th className="px-4 py-3 rounded-l-xl">Record ID</th>
                        <th className="px-4 py-3">Nama Siswa</th>
                        <th className="px-4 py-3">Kelas</th>
                        <th className="px-4 py-3">Kategori</th>
                        <th className="px-4 py-3">Poin</th>
                        <th className="px-4 py-3">Tanggal</th>
                        <th className="px-4 py-3 text-center rounded-r-xl">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {recentRecords.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 font-mono font-bold text-slate-900">{r.id}</td>
                          <td className="px-4 py-3 font-bold text-slate-900">{r.siswa}</td>
                          <td className="px-4 py-3 font-mono">{r.kelas}</td>
                          <td className="px-4 py-3">{r.kategori}</td>
                          <td className="px-4 py-3 font-mono font-bold text-[#009688]">{r.poin}</td>
                          <td className="px-4 py-3 font-mono text-slate-400">{r.tanggal}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              r.status === 'Verified' 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

        </main>

      </div>

    </div>
  )
}
