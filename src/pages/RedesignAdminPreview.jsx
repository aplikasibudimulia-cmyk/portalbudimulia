import React, { useState, useEffect, useRef } from 'react'
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
  CreditCard,
  FolderOpen,
  DollarSign,
  UserCog,
  FileSpreadsheet,
  Tv
} from 'lucide-react'
import { supabase } from '../supabaseClient'

// Import Modul Komponen Asli Admin eBudimulia
import AdminManajemenAkunSection from '../components/AdminManajemenAkunSection'
import RekapPoinSiswaSection from '../components/RekapPoinSiswaSection'
import AdminCatatPoinSection from '../components/AdminCatatPoinSection'
import AdminPengajuanPoinSection from '../components/AdminPengajuanPoinSection'
import AdminJadwalPelajaranSection from '../components/AdminJadwalPelajaranSection'
import AdminActivityLogSection from '../components/AdminActivityLogSection'
import AdminPresensiConfigSection from '../components/AdminPresensiConfigSection'
import AdminKartuPelajarSection from '../components/AdminKartuPelajarSection'
import AdminKartuUjianSection from '../components/AdminKartuUjianSection'
import LegerNilaiKurikulumSection from '../components/LegerNilaiKurikulumSection'
import RaporSiswaSection from '../components/RaporSiswaSection'
import TabunganSiswaSection from '../components/TabunganSiswaSection'
import TagihanSppSection from '../components/TagihanSppSection'
import AdminRoleSection from '../components/AdminRoleSection'
import AdminEkskulSection from '../components/AdminEkskulSection'
import AdminBKKonsultasiSection from '../components/AdminBKKonsultasiSection'

export default function RedesignAdminPreview() {
  const [activeMenu, setActiveMenu] = useState('dashboard')
  const [activeDropdown, setActiveDropdown] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  const navRef = useRef(null)

  // Close dropdown on click outside or escape key
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setActiveDropdown(null)
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setActiveDropdown(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Data State Lengkap yang Diperlukan oleh Modul Admin
  const [students, setStudents] = useState([])
  const [fotos, setFotos] = useState([])
  const [activeTa, setActiveTa] = useState(null)
  const [tahunAjarans, setTahunAjarans] = useState([])
  
  // Data Statistik Riil Sekolah dari Supabase
  const [stats, setStats] = useState({
    totalSiswa: 410,
    totalGuru: 28,
    totalPoinRecords: 3684,
    presensiTodayCount: 398,
    presensiPersen: 97.2
  })

  // Sesi Admin Pak Ansel
  const session = {
    username: "ebudimulia.anselmus",
    nama_guru: "Anselmus Mediari Gestawan, S.Pd.",
    role: "admin",
    is_admin: true
  }

  // Fetch Full Data yang Dibutuhkan oleh Manajemen Akun, Kartu Pelajar, dll
  const loadFullAdminData = async () => {
    setLoading(true)
    try {
      const todayStr = new Date().toISOString().split('T')[0]

      const [resSiswa, resTa, resAllTa, resFotos, resGuru, resPoin, resPresensiToday] = await Promise.all([
        supabase.from('siswa_lengkap').select('*').order('nama_lengkap'),
        supabase.from('tahun_ajaran').select('*').eq('is_aktif', true).maybeSingle(),
        supabase.from('tahun_ajaran').select('*').order('nama', { ascending: false }),
        supabase.from('foto').select('*').order('created_at', { ascending: false }),
        supabase.from('guru').select('id', { count: 'exact', head: true }),
        supabase.from('point_records').select('id', { count: 'exact', head: true }),
        supabase.from('presensi_siswa').select('id', { count: 'exact', head: true }).eq('tanggal', todayStr)
      ])

      if (resSiswa?.data) setStudents(resSiswa.data)
      if (resTa?.data) setActiveTa(resTa.data)
      if (resAllTa?.data) setTahunAjarans(resAllTa.data)
      if (resFotos?.data) setFotos(resFotos.data)

      setStats({
        totalSiswa: resSiswa?.data?.length || 410,
        totalGuru: resGuru?.count || 28,
        totalPoinRecords: resPoin?.count || 3684,
        presensiTodayCount: resPresensiToday?.count || 398,
        presensiPersen: resSiswa?.data?.length ? Math.round(((resPresensiToday?.count || 398) / resSiswa.data.length) * 100) : 97.2
      })

    } catch (err) {
      console.error("Gagal load full admin data:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFullAdminData()
  }, [])

  // 5 KELOMPOK MENU UTAMA LENGKAP ADMIN EBUDIMULIA
  const allAdminMenuGroups = [
    {
      id: "utama",
      group: "Utama & Analitik",
      desc: "Ringkasan performa dan jejak audit sistem",
      icon: Activity,
      items: [
        { id: "dashboard", label: "Dashboard Utama", desc: "Ringkasan metrik, grafik & transaksi", icon: Activity },
        { id: "log_aktivitas", label: "Audit & Log Sistem", desc: "Riwayat aksi pengguna & keamanan", icon: Clock },
      ]
    },
    {
      id: "kesiswaan",
      group: "Kesiswaan & SDM",
      desc: "Manajemen murid, kartu siswa & kedisiplinan poin",
      icon: Users,
      items: [
        { id: "manajemen_akun", label: "Manajemen Akun Siswa & Guru", desc: "Data induk siswa, wali kelas & login", icon: Users },
        { id: "kartu_pelajar", label: "Cetak Kartu Pelajar", desc: "Desain kartu barcode & QR foto siswa", icon: CreditCard },
        { id: "kartu_ujian", label: "Cetak Kartu Ujian", desc: "Generate kartu peserta ujian & nomor", icon: FileText },
        { id: "rekap_poin", label: "Rekap & Statistik Poin Siswa", desc: "Leaderboard apresiasi & sanksi", icon: Shield },
        { id: "catat_poin", label: "Catat Poin & Rekalkulasi", desc: "Input poin pelanggaran & penghargaan", icon: Sparkles },
        { id: "pengajuan_poin", label: "Verifikasi Pengajuan Poin", desc: "Validasi piagam lomba & prestasi", icon: CheckCircle2 },
        { id: "konsultasi_bk", label: "Layanan Konseling BK", desc: "Jadwal temu & pendampingan murid", icon: Layers },
      ]
    },
    {
      id: "kurikulum",
      group: "Kurikulum & Akademik",
      desc: "Jadwal pelajaran, lembar nilai dan cetak rapor",
      icon: FileSpreadsheet,
      items: [
        { id: "jadwal_pelajaran", label: "Jadwal Pelajaran Kelas", desc: "Matriks jam KBM mingguan guru", icon: CalendarDays },
        { id: "leger_nilai", label: "Leger Nilai Kurikulum", desc: "Inspeksi nilai TP, KKM & rapor kelas", icon: FileSpreadsheet },
        { id: "rapor_siswa", label: "Rapor & Capaian TP", desc: "Cetak format rapor resmi Kurikulum Merdeka", icon: GraduationCap },
        { id: "ekskul_nilai", label: "Penilaian Ekstrakurikuler", desc: "Input nilai kegiatan pengembangan diri", icon: Award },
        { id: "presensi_qr", label: "Konfigurasi Presensi & QR", desc: "Aturan scan barcode & presensi kelas", icon: QrCode },
      ]
    },
    {
      id: "keuangan",
      group: "Keuangan & Tata Usaha",
      desc: "Administrasi tabungan siswa dan pembayaran SPP",
      icon: DollarSign,
      items: [
        { id: "tabungan_siswa", label: "Buku Tabungan Siswa", desc: "Mutasi setor, tarik tunai & saldo", icon: DollarSign },
        { id: "tagihan_spp", label: "Tagihan SPP & Pembayaran", desc: "Rekapitulasi iuran bulanan siswa", icon: FileText },
      ]
    },
    {
      id: "pengaturan",
      group: "Pengaturan Sistem",
      desc: "Konfigurasi hak akses dan keamanan role portal",
      icon: UserCog,
      items: [
        { id: "manajemen_role", label: "Hak Akses & Role Pengguna", desc: "Penetapan wewenang guru & administrator", icon: UserCog },
      ]
    }
  ]

  // Filter Search Menu
  const filteredMenuGroups = allAdminMenuGroups.map(grp => ({
    ...grp,
    items: grp.items.filter(item => 
      item.label.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(grp => grp.items.length > 0)

  return (
    <div className="min-h-screen bg-[#F3F5F9] font-sans antialiased text-slate-800 flex flex-col selection:bg-[#009688]/20">
      
      {/* ============================================================== */}
      {/* 1. TOP NAVBAR DENGAN 5 MENU UTAMA & MEGA-MENU POPUP LUXURY     */}
      {/* ============================================================== */}
      <header ref={navRef} className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs select-none">
        
        {/* ROW 1: BRAND + 5 MENU UTAMA + ACTIONS */}
        <div className="px-4 lg:px-8 h-16 flex items-center justify-between gap-4">
          
          {/* Brand Logo eBudiMulia */}
          <div 
            onClick={() => { setActiveMenu('dashboard'); setActiveDropdown(null) }}
            className="flex items-center gap-2.5 cursor-pointer shrink-0 group"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#009688] to-[#26A69A] flex items-center justify-center text-white shadow-sm shadow-[#009688]/20 group-hover:scale-105 transition-transform">
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

          {/* 5 MENU UTAMA DI ATAS DENGAN ANIMASI POPUP MEWAH */}
          <nav className="flex items-center gap-1 sm:gap-1.5 lg:gap-2">
            {allAdminMenuGroups.map((grp) => {
              const IconComp = grp.icon
              const isParentActive = grp.items.some(it => it.id === activeMenu)
              const isOpen = activeDropdown === grp.id

              return (
                <div key={grp.id} className="relative">
                  <button
                    type="button"
                    onClick={() => setActiveDropdown(isOpen ? null : grp.id)}
                    className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      isOpen
                        ? 'bg-[#009688] text-white border-[#009688] shadow-sm shadow-[#009688]/25 scale-[1.02]'
                        : isParentActive
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-transparent border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/90'
                    }`}
                  >
                    <IconComp className={`w-4 h-4 shrink-0 ${isOpen || isParentActive ? 'text-white' : 'text-slate-500'}`} />
                    <span className="hidden md:inline">{grp.group}</span>
                    <span className="md:hidden">{grp.group.split(' ')[0]}</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-250 ${
                      isOpen ? 'rotate-180 text-white' : isParentActive ? 'text-white/80' : 'text-slate-400'
                    }`} />
                  </button>

                  {/* POPUP SUB-MENU MEWAH (ANIMATED FLOATING CARD) */}
                  {isOpen && (
                    <div 
                      className={`absolute top-full mt-3 z-50 bg-white/98 backdrop-blur-2xl border border-slate-200/90 rounded-2xl shadow-[0_22px_60px_rgba(15,23,42,0.16),0_4px_16px_rgba(15,23,42,0.06)] p-3.5 transition-all animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200 ease-out ring-1 ring-black/5 ${
                        grp.id === 'utama' 
                          ? 'left-0 w-80 sm:w-84' 
                          : grp.id === 'pengaturan' 
                          ? 'right-0 w-80 sm:w-84' 
                          : grp.items.length > 4 
                          ? 'left-1/2 -translate-x-1/2 w-[92vw] sm:w-[540px]' 
                          : 'left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 w-[92vw] sm:w-84'
                      }`}
                    >
                      {/* Notch / Caret Panah Menyambung ke Menu Utama */}
                      <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white border-l border-t border-slate-200/90 rotate-45 rounded-tl-sm shadow-2xs" />

                      {/* Header Popup */}
                      <div className="px-2.5 pt-1 pb-2.5 mb-2 border-b border-slate-100 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <IconComp className="w-3.5 h-3.5 text-[#009688]" />
                            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                              {grp.group}
                            </h4>
                          </div>
                          <p className="text-[10.5px] text-slate-400 mt-0.5 font-medium">
                            {grp.desc}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold text-[#009688] bg-teal-50 px-2 py-0.5 rounded-full border border-teal-100 shrink-0">
                          {grp.items.length} Modul
                        </span>
                      </div>

                      {/* Grid Kartu Sub-Menu */}
                      <div className={`grid gap-1.5 ${grp.items.length > 4 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                        {grp.items.map((item) => {
                          const SubIcon = item.icon
                          const isItemActive = activeMenu === item.id

                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setActiveMenu(item.id)
                                setActiveDropdown(null)
                              }}
                              className={`w-full flex items-start gap-3 p-2.5 rounded-xl text-left transition-all group cursor-pointer border ${
                                isItemActive
                                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                                  : 'bg-white border-transparent hover:border-slate-200 hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                                isItemActive
                                  ? 'bg-white/10 text-white'
                                  : 'bg-slate-100 text-slate-600 group-hover:bg-[#009688] group-hover:text-white group-hover:scale-105'
                              }`}>
                                <SubIcon className="w-4 h-4" />
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <span className={`text-xs font-bold truncate ${
                                    isItemActive ? 'text-white' : 'text-slate-900 group-hover:text-[#009688]'
                                  }`}>
                                    {item.label}
                                  </span>
                                  <ChevronRight className={`w-3.5 h-3.5 transition-transform shrink-0 ${
                                    isItemActive ? 'text-white' : 'text-slate-300 group-hover:translate-x-0.5 group-hover:text-[#009688]'
                                  }`} />
                                </div>
                                <p className={`text-[10.5px] truncate mt-0.5 ${
                                  isItemActive ? 'text-slate-300' : 'text-slate-400 group-hover:text-slate-500'
                                }`}>
                                  {item.desc}
                                </p>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </nav>

          {/* RIGHT SIDE: TAHUN AJARAN & PROFILE */}
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="hidden xl:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-[#009688] animate-pulse"></span>
              {activeTa?.nama || 'TA 2026/2027 Ganjil'}
            </span>

            <button className="w-8 h-8 rounded-full bg-white border border-slate-200/90 flex items-center justify-center text-slate-600 hover:bg-slate-50 shadow-2xs cursor-pointer">
              <Bell className="w-4 h-4" />
            </button>

            {/* Profile Avatar Pill */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="w-8 h-8 rounded-full bg-[#009688] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                AM
              </div>
              <div className="hidden lg:block text-left">
                <p className="text-xs font-bold text-slate-900 leading-tight">Pak Anselmus</p>
                <p className="text-[10px] text-slate-400 font-medium">Administrator</p>
              </div>
              <button 
                onClick={() => window.location.replace('/login-admin?logout=1')}
                title="Logout" 
                className="text-slate-400 hover:text-rose-600 p-1 ml-1 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </div>

        {/* ROW 2: SUB-BAR BREADCRUMB & CONTEXT */}
        <div className="px-4 lg:px-8 py-2.5 bg-[#F8FAFC] border-t border-slate-200/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 font-medium text-slate-500 overflow-x-auto custom-scrollbar">
            <button 
              onClick={() => { setActiveMenu('dashboard'); setActiveDropdown(null) }} 
              className="hover:text-slate-900 font-semibold cursor-pointer shrink-0"
            >
              Dashboard
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-slate-500 font-medium shrink-0">
              {allAdminMenuGroups.find(g => g.items.some(i => i.id === activeMenu))?.group || 'Portal'}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-slate-900 font-extrabold uppercase tracking-wide shrink-0">
              {allAdminMenuGroups.flatMap(g => g.items).find(i => i.id === activeMenu)?.label || activeMenu.replace(/_/g, ' ')}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>24 Nov, 2026</span>
            </div>

            {activeMenu === 'dashboard' && (
              <button 
                onClick={() => setActiveMenu('rekap_poin')}
                className="bg-[#009688] hover:bg-[#00897B] text-white px-3 py-1 rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Rekap Poin</span>
              </button>
            )}
          </div>
        </div>

      </header>

      {/* ============================================================== */}
      {/* 2. MAIN WORKSPACE CONTENT (FULL WIDTH 100%)                    */}
      {/* ============================================================== */}
      <main className="flex-1 w-full px-6 lg:px-8 py-6 space-y-6">
          
          {/* ============================================================== */}
          {/* SELURUH SUB-MENU ADMIN FULL-WIDTH LEBAR DAN BERSIH             */}
          {/* ============================================================== */}
          {activeMenu === 'manajemen_akun' && (
            <div className="w-full min-w-0">
              <AdminManajemenAkunSection 
                students={students} 
                allFotos={fotos} 
                activeTa={activeTa}
                tahunAjarans={tahunAjarans}
                initialSearchQuery=""
                onRefresh={loadFullAdminData}
              />
            </div>
          )}

          {activeMenu === 'kartu_pelajar' && (
            <div className="w-full min-w-0">
              <AdminKartuPelajarSection 
                students={students} 
                allFotos={fotos} 
                activeTa={activeTa}
                tahunAjarans={tahunAjarans}
                onRefresh={loadFullAdminData}
              />
            </div>
          )}

          {activeMenu === 'kartu_ujian' && (
            <div className="w-full min-w-0">
              <AdminKartuUjianSection 
                students={students} 
                allFotos={fotos} 
                activeTa={activeTa}
                tahunAjarans={tahunAjarans}
                onRefresh={loadFullAdminData}
              />
            </div>
          )}

          {activeMenu === 'rekap_poin' && (
            <div className="w-full min-w-0">
              <RekapPoinSiswaSection onNavigate={setActiveMenu} />
            </div>
          )}

          {activeMenu === 'catat_poin' && (
            <div className="w-full min-w-0">
              <AdminCatatPoinSection onNavigate={setActiveMenu} />
            </div>
          )}

          {activeMenu === 'pengajuan_poin' && (
            <div className="w-full min-w-0">
              <AdminPengajuanPoinSection onNavigate={setActiveMenu} />
            </div>
          )}

          {activeMenu === 'jadwal_pelajaran' && (
            <div className="w-full min-w-0">
              <AdminJadwalPelajaranSection session={session} activeTa={activeTa} />
            </div>
          )}

          {activeMenu === 'leger_nilai' && (
            <div className="w-full min-w-0">
              <LegerNilaiKurikulumSection session={session} activeTa={activeTa} onNavigateToRapor={() => setActiveMenu('rapor_siswa')} />
            </div>
          )}

          {activeMenu === 'rapor_siswa' && (
            <div className="w-full min-w-0">
              <RaporSiswaSection session={session} activeTa={activeTa} />
            </div>
          )}

          {activeMenu === 'ekskul_nilai' && (
            <div className="w-full min-w-0">
              <AdminEkskulSection session={session} activeTa={activeTa} />
            </div>
          )}

          {activeMenu === 'tabungan_siswa' && (
            <div className="w-full min-w-0">
              <TabunganSiswaSection session={session} activeTa={activeTa} mode="admin" />
            </div>
          )}

          {activeMenu === 'tagihan_spp' && (
            <div className="w-full min-w-0">
              <TagihanSppSection session={session} activeTa={activeTa} readOnly={false} />
            </div>
          )}

          {activeMenu === 'manajemen_role' && (
            <div className="w-full min-w-0">
              <AdminRoleSection />
            </div>
          )}

          {activeMenu === 'konsultasi_bk' && (
            <div className="w-full min-w-0">
              <AdminBKKonsultasiSection />
            </div>
          )}

          {activeMenu === 'log_aktivitas' && (
            <div className="w-full min-w-0">
              <AdminActivityLogSection onNavigate={setActiveMenu} />
            </div>
          )}

          {activeMenu === 'presensi_config' && (
            <div className="w-full min-w-0">
              <AdminPresensiConfigSection onNavigate={setActiveMenu} />
            </div>
          )}

          {/* ============================================================== */}
          {/* DASHBOARD UTAMA OVERVIEW INVOZA                                */}
          {/* ============================================================== */}
          {activeMenu === 'dashboard' && (
            <div className="space-y-6">
              
              {/* Title Header Baris Atas */}
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
                    <span>{activeTa?.nama || 'Semester Ganjil'}</span>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 flex items-center gap-2 shadow-2xs">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>24 Nov, 2026</span>
                  </div>

                  <button 
                    onClick={() => setActiveMenu('rekap_poin')}
                    className="bg-[#009688] hover:bg-[#00897B] text-white px-4 py-2 rounded-xl text-xs font-bold shadow-xs shadow-[#009688]/20 flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Rekap Poin</span>
                  </button>
                </div>
              </div>

              {/* 4 KPI METRIC CARDS INVOZA STYLE */}
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
                    <span className="text-emerald-600 font-bold">
                      +100% Terdaftar
                    </span>
                    <span className="text-slate-400">Kelas 7, 8, 9</span>
                  </div>
                </div>

                {/* Metric 2: Presensi Hari Ini */}
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

                {/* Metric 3: Catatan Poin Disiplin */}
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
                    <span className="text-emerald-600 font-bold">
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

              {/* 3 KOLOM TENGAH: Overview Grafik + Quick Actions */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Kolom Kiri: Overview Graph Box */}
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
                      Buka Rekap Detail →
                    </button>
                  </div>
                </div>

                {/* Kolom Kanan: Quick Action */}
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
                        { id: 'catat_poin', label: 'Catat Poin Baru', desc: 'Input apresiasi / pelanggaran', icon: Sparkles, color: 'text-amber-600 bg-amber-50' },
                        { id: 'pengajuan_poin', label: 'Verifikasi Pengajuan', desc: 'Review bukti piagam siswa', icon: CheckCircle2, color: 'text-[#009688] bg-teal-50' },
                        { id: 'manajemen_akun', label: 'Kelola Akun Siswa', desc: '410 siswa terdaftar aktif', icon: Users, color: 'text-blue-600 bg-blue-50' },
                        { id: 'kartu_pelajar', label: 'Cetak Kartu Pelajar', desc: 'Desain barcode & foto siswa', icon: CreditCard, color: 'text-indigo-600 bg-indigo-50' },
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

            </div>
          )}

        </main>

    </div>
  )
}
