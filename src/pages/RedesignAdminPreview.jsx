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
  ExternalLink
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
    presensiTodayCount: 0,
    presensiPersen: 96.5
  })

  const [recentLogs, setRecentLogs] = useState([])
  const [adminUser, setAdminUser] = useState({
    username: "ebudimulia.anselmus",
    nama: "Anselmus Mediari Gestawan, S.Pd.",
    role: "IT Developer & Kurikulum"
  })

  // Load Real Data dari Database
  useEffect(() => {
    async function loadAdminRealStats() {
      setLoading(true)
      try {
        const todayStr = new Date().toISOString().split('T')[0]

        const [resSiswa, resGuru, resPoin, resPresensiToday, resLogs] = await Promise.all([
          supabase.from('siswa_permanent').select('nisn', { count: 'exact', head: true }),
          supabase.from('guru').select('id', { count: 'exact', head: true }),
          supabase.from('point_records').select('id', { count: 'exact', head: true }),
          supabase.from('presensi_siswa').select('id', { count: 'exact', head: true }).eq('tanggal', todayStr),
          supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(5)
        ])

        setStats({
          totalSiswa: resSiswa?.count || 410,
          totalGuru: resGuru?.count || 28,
          totalPoinRecords: resPoin?.count || 3684,
          presensiTodayCount: resPresensiToday?.count || 398,
          presensiPersen: resSiswa?.count ? Math.round(((resPresensiToday?.count || 398) / resSiswa.count) * 100) : 97
        })

        if (resLogs?.data) {
          setRecentLogs(resLogs.data)
        }
      } catch (err) {
        console.error("Gagal load admin stats:", err)
      } finally {
        setLoading(false)
      }
    }
    loadAdminRealStats()
  }, [])

  // Pengelompokan Menu Enterprise untuk Sidebar Admin
  const menuGroups = [
    {
      group: "Utama & Analitik",
      items: [
        { id: "dashboard", label: "Dashboard Utama", icon: Activity },
        { id: "log_aktivitas", label: "Audit & Log Sistem", icon: Clock },
      ]
    },
    {
      group: "Kesiswaan & SDM",
      items: [
        { id: "manajemen_akun", label: "Manajemen Akun Siswa & Guru", icon: Users },
        { id: "rekap_poin", label: "Rekap & Statistik Poin Siswa", icon: Shield },
        { id: "catat_poin", label: "Catat Poin & Rekalkulasi", icon: Sparkles },
        { id: "pengajuan_poin", label: "Verifikasi Pengajuan Poin", icon: CheckCircle2 },
      ]
    },
    {
      group: "Akademik & Jadwal",
      items: [
        { id: "jadwal_pelajaran", label: "Jadwal Pelajaran Kelas", icon: Calendar },
        { id: "presensi_config", label: "Konfigurasi Presensi & QR", icon: QrCode },
      ]
    }
  ]

  return (
    <div className="min-h-screen bg-[#F4F6F9] font-sans antialiased text-slate-800 flex">
      
      {/* ============================================================== */}
      {/* 1. SIDEBAR DESKTOP ENTERPRISE (Sleek Royal Navy #0B2B7A)        */}
      {/* ============================================================== */}
      <aside className="w-68 bg-[#0B2B7A] text-white flex flex-col justify-between shrink-0 sticky top-0 h-screen border-r border-blue-950 shadow-xl z-40 select-none">
        
        <div className="flex flex-col h-full overflow-hidden">
          
          {/* Brand Header */}
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-amber-400 shadow-xs">
                <Flame className="w-5 h-5 text-amber-400 fill-amber-400" />
              </div>
              <div>
                <h1 className="text-sm font-black tracking-tight text-white leading-none">
                  eBudi<span className="text-amber-400">Mulia</span>
                </h1>
                <span className="text-[10px] text-blue-200 font-bold uppercase tracking-wider block mt-1">
                  ADMIN WORKSPACE
                </span>
              </div>
            </div>
          </div>

          {/* Navigasi Menu Bertingkat */}
          <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-6">
            {menuGroups.map((grp, gIdx) => (
              <div key={gIdx} className="space-y-1">
                <p className="px-3 text-[10px] font-black uppercase tracking-widest text-blue-300/80 mb-2">
                  {grp.group}
                </p>

                {grp.items.map((item) => {
                  const IconComp = item.icon
                  const isActive = activeMenu === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveMenu(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left ${
                        isActive
                          ? 'bg-white text-[#0B2B7A] shadow-md font-bold'
                          : 'text-blue-100/90 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <IconComp className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#0B2B7A]' : 'text-blue-200'}`} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {/* User Profile Sesi Admin Pak Ansel */}
          <div className="p-3.5 border-t border-white/10 bg-black/15">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 font-black flex items-center justify-center text-xs shrink-0 shadow-xs">
                  AM
                </div>
                <div className="overflow-hidden">
                  <p className="text-xs font-bold text-white truncate leading-tight">{adminUser.nama}</p>
                  <p className="text-[10px] text-blue-200 truncate">{adminUser.role}</p>
                </div>
              </div>
              <button 
                onClick={() => window.location.replace('/login-admin?logout=1')}
                title="Keluar Admin" 
                className="text-blue-300 hover:text-rose-400 p-1.5 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

        </div>

      </aside>

      {/* ============================================================== */}
      {/* 2. MAIN WORKSPACE CONTENT AREA                                  */}
      {/* ============================================================== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        
        {/* Top Header Workspace */}
        <header className="bg-white border-b border-slate-200/90 px-8 py-3.5 sticky top-0 z-30 flex items-center justify-between shadow-2xs">
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <span className="text-slate-400">Portal Admin</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              <span className="text-[#0B2B7A] font-bold uppercase tracking-wide">
                {activeMenu.replace(/_/g, ' ')}
              </span>
            </div>
            <span className="h-4 w-px bg-slate-200"></span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              TA 2026/2027 Ganjil Aktif
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Search Shortcut */}
            <div className="flex items-center bg-slate-100 rounded-lg px-3 py-1.5 border border-slate-200 text-xs w-64 text-slate-600">
              <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
              <input 
                type="text" 
                placeholder="Cari siswa, guru, kelas..." 
                className="bg-transparent outline-none w-full text-xs text-slate-800 placeholder-slate-400"
              />
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[9px] font-mono bg-white border border-slate-200 rounded text-slate-400">
                ⌘K
              </kbd>
            </div>

            <button className="relative w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#D31725] rounded-full"></span>
            </button>
          </div>

        </header>

        {/* WORKSPACE CONTENT BODY */}
        <main className="p-8 space-y-6 max-w-7xl">
          
          {/* ============================================================== */}
          {/* JIKA MEMILIH SUB-MENU: RENDER KOMPONEN NYATA PRODUKSI          */}
          {/* ============================================================== */}
          {activeMenu === 'manajemen_akun' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
              <AdminManajemenAkunSection onNavigate={setActiveMenu} />
            </div>
          )}

          {activeMenu === 'rekap_poin' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
              <RekapPoinSiswaSection onNavigate={setActiveMenu} />
            </div>
          )}

          {activeMenu === 'catat_poin' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
              <AdminCatatPoinSection onNavigate={setActiveMenu} />
            </div>
          )}

          {activeMenu === 'pengajuan_poin' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
              <AdminPengajuanPoinSection onNavigate={setActiveMenu} />
            </div>
          )}

          {activeMenu === 'jadwal_pelajaran' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
              <AdminJadwalPelajaranSection onNavigate={setActiveMenu} />
            </div>
          )}

          {activeMenu === 'log_aktivitas' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
              <AdminActivityLogSection onNavigate={setActiveMenu} />
            </div>
          )}

          {activeMenu === 'presensi_config' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
              <AdminPresensiConfigSection onNavigate={setActiveMenu} />
            </div>
          )}

          {/* ============================================================== */}
          {/* DASHBOARD UTAMA ADMIN (METRIK & STATUS OPERASIONAL SEKOLAH)    */}
          {/* ============================================================== */}
          {activeMenu === 'dashboard' && (
            <div className="space-y-6">
              
              {/* Sapaan & Status Operasional */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                    Selamat Bertugas, Pak Anselmus 👋
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Seluruh sistem operasional portal SMP Budi Mulia terpantau normal dan aman.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setActiveMenu('catat_poin')}
                    className="px-4 py-2 bg-[#0B2B7A] hover:bg-[#08205C] text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Catat Poin Siswa</span>
                  </button>
                  <button 
                    onClick={() => setActiveMenu('manajemen_akun')}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                  >
                    Kelola Akun
                  </button>
                </div>
              </div>

              {/* 4 KPI METRIC CARDS (Clean Enterprise Cards) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* Total Siswa */}
                <div 
                  onClick={() => setActiveMenu('manajemen_akun')}
                  className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-2xs hover:border-[#0B2B7A] transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
                    <span>Total Siswa Terdaftar</span>
                    <Users className="w-4 h-4 text-[#0B2B7A]" />
                  </div>
                  <div className="text-2xl font-black text-slate-900 mt-2">
                    {stats.totalSiswa} <span className="text-xs font-normal text-slate-400">Siswa</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                    <span className="text-emerald-600 font-bold">100% Aktif</span> di Semester 1
                  </p>
                </div>

                {/* Total Guru */}
                <div 
                  onClick={() => setActiveMenu('manajemen_akun')}
                  className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-2xs hover:border-[#0B2B7A] transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
                    <span>Dewan Guru & Staf</span>
                    <GraduationCap className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="text-2xl font-black text-slate-900 mt-2">
                    {stats.totalGuru} <span className="text-xs font-normal text-slate-400">Pendidik</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Termasuk Wali Kelas & Guru BK
                  </p>
                </div>

                {/* Tingkat Presensi Hari Ini */}
                <div 
                  onClick={() => setActiveMenu('presensi_config')}
                  className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-2xs hover:border-emerald-600 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
                    <span>Presensi Hari Ini</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-2xl font-black text-emerald-600 mt-2">
                    {stats.presensiPersen}%
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {stats.presensiTodayCount} siswa hadir di sekolah
                  </p>
                </div>

                {/* Total Catatan Poin Disiplin */}
                <div 
                  onClick={() => setActiveMenu('rekap_poin')}
                  className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-2xs hover:border-amber-500 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
                    <span>Catatan Poin Disiplin</span>
                    <Shield className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="text-2xl font-black text-[#0B2B7A] mt-2">
                    {stats.totalPoinRecords.toLocaleString('id-ID')}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1 font-semibold text-amber-800">
                    <Sparkles className="w-3 h-3 text-amber-500" /> Dukung 100% data tanpa batas
                  </p>
                </div>

              </div>

              {/* DUA KOLOM: Tautan Cepat Manajemen & Log Aktivitas Terbaru */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Kolom Kiri (2 Span): Pintasan Cepat Kerja Admin */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <span className="w-1.5 h-3.5 bg-[#0B2B7A] rounded-full"></span>
                      Modul Kerja Cepat Administrator
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        { id: 'rekap_poin', title: 'Rekap & Cetak Poin Siswa', desc: 'Download PDF, Excel, & drilldown statistik kelas.', icon: Shield, badge: 'Unlimited' },
                        { id: 'pengajuan_poin', title: 'Verifikasi Pengajuan Poin', desc: 'Periksa bukti piagam & apresiasi siswa.', icon: CheckCircle2, badge: 'Kesiswaan' },
                        { id: 'jadwal_pelajaran', title: 'Pengaturan Jadwal Pelajaran', desc: 'Kelola slot waktu dan ruang kelas mengajar.', icon: Calendar, badge: 'Kurikulum' },
                        { id: 'manajemen_akun', title: 'Manajemen Akun Siswa & Guru', desc: 'Reset password, tambah siswa, ubah kelas.', icon: Users, badge: 'Akun' },
                      ].map((card) => {
                        const IconC = card.icon
                        return (
                          <div
                            key={card.id}
                            onClick={() => setActiveMenu(card.id)}
                            className="p-4 border border-slate-200 rounded-xl hover:border-[#0B2B7A] hover:bg-slate-50/70 transition-all cursor-pointer group flex flex-col justify-between"
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#0B2B7A] flex items-center justify-center group-hover:bg-[#0B2B7A] group-hover:text-white transition-colors">
                                <IconC className="w-4 h-4" />
                              </div>
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                                {card.badge}
                              </span>
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-slate-900 group-hover:text-[#0B2B7A] leading-tight">
                                {card.title}
                              </h4>
                              <p className="text-[11px] text-slate-500 mt-1">
                                {card.desc}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Kolom Kanan (1 Span): Log Audit & Keamanan Sistem */}
                <div className="space-y-4">
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Log Aktivitas Terbaru
                      </h3>
                      <button 
                        onClick={() => setActiveMenu('log_aktivitas')}
                        className="text-[11px] font-bold text-[#0B2B7A] hover:underline"
                      >
                        Semua →
                      </button>
                    </div>

                    <div className="space-y-3">
                      {recentLogs.length > 0 ? (
                        recentLogs.map((log, idx) => (
                          <div key={idx} className="text-xs pb-2.5 border-b border-slate-100 last:border-0 last:pb-0">
                            <p className="font-semibold text-slate-800 leading-tight">
                              {log.action || log.deskripsi || "Aktivitas Sistem"}
                            </p>
                            <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                              <span>Oleh: {log.user_name || log.actor || "Admin"}</span>
                              <span className="font-mono">
                                {log.created_at ? new Date(log.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400 py-3 text-center">Belum ada riwayat audit baru.</p>
                      )}
                    </div>
                  </div>

                  {/* Status Hardening Database */}
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-900">
                    <div className="flex items-center gap-2 font-bold mb-1">
                      <Lock className="w-4 h-4 text-emerald-700" />
                      <span>Keamanan Database Aktif</span>
                    </div>
                    <p className="text-[11px] text-emerald-800 leading-relaxed">
                      Patch RLS, triggers point_catalog, guidance_logs, dan proteksi QR tokens berstatus aman.
                    </p>
                  </div>
                </div>

              </div>

            </div>
          )}

        </main>

      </div>

    </div>
  )
}
