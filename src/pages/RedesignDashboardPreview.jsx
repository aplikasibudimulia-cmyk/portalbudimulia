import React, { useState, useEffect } from 'react'
import { 
  Bell, 
  Calendar, 
  Award, 
  CheckCircle2, 
  Clock, 
  Sparkles, 
  BookOpen, 
  User, 
  Home, 
  CalendarDays, 
  GraduationCap, 
  ChevronRight,
  QrCode,
  Laptop,
  Smartphone,
  Layers,
  LogOut,
  FileText,
  Shield,
  ArrowUpRight,
  ChevronLeft,
  Eye,
  EyeOff,
  SlidersHorizontal,
  FileCheck2,
  Send,
  CreditCard,
  Grid,
  TrendingUp,
  Flame,
  FlameKindling
} from 'lucide-react'
import { supabase } from '../supabaseClient'

// Import Modul Komponen Asli eBudimulia
import SiswaPresensiSection from '../components/SiswaPresensiSection'
import SiswaPoinSection from '../components/SiswaPoinSection'
import SiswaNilaiSection from '../components/SiswaNilaiSection'
import SiswaCbtPortalSection from '../components/cbt/SiswaCbtPortalSection'
import SiswaJadwalSection from '../components/SiswaJadwalSection'
import SiswaBKKonsultasiSection from '../components/SiswaBKKonsultasiSection'
import SiswaProfilSection from '../components/SiswaProfilSection'

export default function RedesignDashboardPreview() {
  const [viewMode, setViewMode] = useState('mobile_mockup')
  const [activeMenu, setActiveMenu] = useState(null)
  const [activeSegment, setActiveSegment] = useState('akademik') // 'ringkasan', 'akademik', 'disiplin'
  const [showPoin, setShowPoin] = useState(true)

  // Ambil Data Sesi Siswa Riil
  const [student, setStudent] = useState(() => {
    try {
      const raw = localStorage.getItem('siswa_session')
      if (raw) return JSON.parse(raw)
    } catch (e) {}
    return {
      nama: "Anselmus Mediari",
      panggilan: "Gesta",
      nisn: "890104481",
      kelas: "8-A",
      waliKelas: "Anselmus M. Gestawan, S.Pd.",
      tahun_ajaran: "2026/2027 Ganjil"
    }
  })

  // Data Poin & Presensi Riil
  const [stats, setStats] = useState({
    kehadiranPersen: 98.6,
    presensiHariIni: "Hadir (06.42 WIB)",
    poinPositif: 85,
    poinPelanggaran: 0
  })

  useEffect(() => {
    async function loadStats() {
      if (!student?.nisn) return
      try {
        const { data: pData } = await supabase
          .from('student_points')
          .select('*')
          .eq('nisn', student.nisn)
          .maybeSingle()

        if (pData) {
          setStats(prev => ({
            ...prev,
            poinPositif: pData.total_positif || 0,
            poinPelanggaran: pData.total_pelanggaran || 0
          }))
        }
      } catch (err) {
        console.error("Gagal muat poin:", err)
      }
    }
    loadStats()
  }, [student?.nisn])

  // 8 Fitur Pilihan Grid Gaya Wondr dengan Palet Logo Budi Mulia (Navy, Crimson, Gold, Azure)
  const fiturBudiMulia = [
    { id: "PRESENSI", label: "Presensi QR", icon: QrCode, bg: "bg-[#0B2B7A] text-white shadow-blue-900/10" },
    { id: "JADWAL", label: "Jadwal", icon: CalendarDays, bg: "bg-[#1E50C8] text-white shadow-blue-600/10" },
    { id: "POIN", label: "Buku Poin", icon: Shield, bg: "bg-[#F6C800] text-slate-950 shadow-amber-400/20 font-bold" },
    { id: "CBT", label: "CBT Ujian", icon: Award, bg: "bg-[#D31725] text-white shadow-red-700/10" },
    { id: "NILAI", label: "Rapor TP", icon: FileText, bg: "bg-[#0B2B7A] text-white" },
    { id: "BK", label: "Konseling BK", icon: Layers, bg: "bg-[#4B6CB7] text-white" },
    { id: "PROFIL", label: "Kartu Pelajar", icon: CreditCard, bg: "bg-[#D31725] text-white" },
    { id: "MENU_LAIN", label: "Lihat Semua", icon: Grid, bg: "bg-white text-slate-700 border border-slate-200" },
  ]

  const panggilanNama = student?.nama?.split(' ')[1] || student?.nama?.split(' ')[0] || "Gesta"

  return (
    <div className="min-h-screen bg-[#F0F3F8] font-sans antialiased text-slate-800 flex flex-col">
      
      {/* Top Controller Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between text-xs sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#0B2B7A] border border-amber-400"></div>
          <span className="font-extrabold text-[#0B2B7A] tracking-wider text-sm">wondr</span>
          <span className="text-[10px] text-slate-400 font-bold">x SMP Budi Mulia</span>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
          <button 
            onClick={() => setViewMode('mobile_mockup')}
            className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              viewMode === 'mobile_mockup' 
                ? 'bg-[#0B2B7A] text-white shadow-2xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" /> 
            <span>Tampilan HP</span>
          </button>
          <button 
            onClick={() => setViewMode('responsive')}
            className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              viewMode === 'responsive' 
                ? 'bg-[#0B2B7A] text-white shadow-2xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" /> 
            <span>Web Desktop</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className={`flex-1 ${viewMode === 'mobile_mockup' ? 'flex justify-center items-center py-4 px-2' : 'w-full'}`}>
        
        <div className={`w-full bg-[#FAFBFD] transition-all duration-200 ${
          viewMode === 'mobile_mockup' 
            ? 'max-w-[420px] h-[870px] rounded-[44px] shadow-2xl border-[6px] border-slate-900 overflow-hidden relative flex flex-col justify-between'
            : 'flex min-h-[calc(100vh-41px)]'
        }`}>

          {/* ============================================================== */}
          {/* BODY UTAMA DASHBOARD                                           */}
          {/* ============================================================== */}
          <div className="flex-1 flex flex-col justify-between overflow-y-auto">
            
            <div className="pb-24">
              
              {/* TOP HEADER: Logo Navy Budi Mulia & Tombol Poin Emas */}
              <div className="px-5 pt-5 pb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-2xl font-black text-[#0B2B7A] tracking-tighter">wondr</span>
                  <span className="text-[10px] font-extrabold text-[#D31725] uppercase mt-2">by Budi Mulia</span>
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setActiveMenu('POIN')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-200 bg-[#FFFDF0] shadow-2xs text-xs font-extrabold text-amber-900 hover:bg-amber-100/60 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                    <span>{stats.poinPositif} Poin</span>
                  </button>
                  <button className="w-8 h-8 rounded-full border border-slate-200 bg-white shadow-2xs flex items-center justify-center text-slate-600 hover:bg-slate-50">
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* JIKA MEMILIH SUB-MENU: TAMPILKAN KOMPONEN ASLI PRODUKSI */}
              {activeMenu ? (
                <div className="p-4">
                  <button 
                    onClick={() => setActiveMenu(null)}
                    className="mb-4 inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-bold text-[#0B2B7A] shadow-2xs"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Kembali ke Beranda</span>
                  </button>

                  <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs">
                    {activeMenu === 'PRESENSI' && <SiswaPresensiSection studentData={student} />}
                    {activeMenu === 'POIN' && <SiswaPoinSection studentData={student} onNavigateToAjukan={() => {}} />}
                    {activeMenu === 'JADWAL' && <SiswaJadwalSection studentData={student} />}
                    {activeMenu === 'CBT' && <SiswaCbtPortalSection student={student} />}
                    {activeMenu === 'NILAI' && <SiswaNilaiSection studentData={student} />}
                    {activeMenu === 'BK' && <SiswaBKKonsultasiSection studentData={student} />}
                    {activeMenu === 'PROFIL' && <SiswaProfilSection studentData={student} menuTypes={[]} onOpenEditBiodata={() => {}} />}
                  </div>
                </div>
              ) : (
                /* HALAMAN UTAMA BERANDA GAYA WONDR DENGAN WARNA LOGO BUDI MULIA */
                <div className="px-5 space-y-5">
                  
                  {/* Greeting & Action Icons Row */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-[#0B2B7A] text-amber-300 flex items-center justify-center font-bold text-xs shadow-xs">
                        {panggilanNama.substring(0, 2).toUpperCase()}
                      </div>
                      <h2 className="text-lg font-black text-slate-900 tracking-tight">
                        Hi, {panggilanNama}!
                      </h2>
                    </div>

                    <div className="flex items-center gap-3">
                      <button className="flex flex-col items-center text-slate-700 hover:text-black">
                        <div className="relative">
                          <Bell className="w-5 h-5" />
                          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[#D31725] rounded-full"></span>
                        </div>
                        <span className="text-[10px] font-semibold mt-0.5">Notifikasi</span>
                      </button>

                      <button 
                        onClick={() => setActiveMenu('PRESENSI')}
                        className="flex flex-col items-center text-slate-700 hover:text-black"
                      >
                        <FileCheck2 className="w-5 h-5" />
                        <span className="text-[10px] font-semibold mt-0.5">Presensi</span>
                      </button>
                    </div>
                  </div>

                  {/* Segmented Pill Tabs Wondr dengan Aksen Emas (#F6C800) */}
                  <div className="bg-slate-100 p-1 rounded-full flex items-center justify-between text-xs font-bold text-slate-600">
                    <button 
                      onClick={() => setActiveSegment('ringkasan')}
                      className={`flex-1 py-2 rounded-full transition-all text-center ${
                        activeSegment === 'ringkasan' ? 'bg-[#F6C800] text-slate-950 font-black shadow-2xs' : 'hover:text-slate-900'
                      }`}
                    >
                      Ringkasan
                    </button>
                    <button 
                      onClick={() => setActiveSegment('akademik')}
                      className={`flex-1 py-2 rounded-full transition-all text-center ${
                        activeSegment === 'akademik' ? 'bg-[#F6C800] text-slate-950 font-black shadow-2xs' : 'hover:text-slate-900'
                      }`}
                    >
                      Akademik
                    </button>
                    <button 
                      onClick={() => setActiveSegment('disiplin')}
                      className={`flex-1 py-2 rounded-full transition-all text-center ${
                        activeSegment === 'disiplin' ? 'bg-[#F6C800] text-slate-950 font-black shadow-2xs' : 'hover:text-slate-900'
                      }`}
                    >
                      Buku Saku
                    </button>
                  </div>

                  {/* KARTU UTAMA HORIZONTAL (ROYAL NAVY #0B2B7A DENGAN LOGO BUDI MULIA & STRIP MERAH #D31725) */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-extrabold text-slate-900">Kartu Pelajar & Poin Kamu</h4>
                      <button 
                        onClick={() => setActiveMenu('PROFIL')}
                        className="text-xs font-bold text-[#0B2B7A] hover:underline"
                      >
                        Lihat Kartu
                      </button>
                    </div>

                    {/* Card Navy Budi Mulia Berwibawa */}
                    <div className="relative rounded-3xl p-5 text-white shadow-xl overflow-hidden bg-gradient-to-br from-[#0B2B7A] via-[#103896] to-[#071E54] border border-blue-900">
                      
                      {/* Pola Strip Merah Obor & Lingkaran Emas di Latar */}
                      <div className="absolute top-0 right-0 w-24 h-24 bg-[#D31725]/30 rounded-bl-full pointer-events-none"></div>
                      <div className="absolute -left-10 -bottom-10 w-36 h-36 bg-[#F6C800]/15 rounded-full pointer-events-none"></div>

                      <div className="flex items-center justify-between relative z-10">
                        <div className="flex items-center gap-1.5">
                          <Flame className="w-4 h-4 text-amber-400 fill-amber-400" />
                          <span className="text-[11px] font-black uppercase tracking-wider text-white">
                            SMP BUDI MULIA
                          </span>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full bg-white/15 backdrop-blur-md text-[10px] font-black text-amber-300 border border-white/20">
                          Kelas {student?.kelas}
                        </span>
                      </div>

                      <div className="mt-3.5 relative z-10">
                        <span className="text-xl font-black tracking-widest font-mono text-white">
                          {student?.nisn}
                        </span>
                      </div>

                      <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between relative z-10">
                        <div>
                          <p className="text-[10px] text-blue-200 font-medium">Kredit Poin Apresiasi</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-lg font-black font-mono text-amber-400">
                              {showPoin ? `${stats.poinPositif} POIN` : "••••••••"}
                            </span>
                            <button onClick={() => setShowPoin(!showPoin)} className="text-blue-200 hover:text-white">
                              {showPoin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-blue-200 font-medium block">Status Disiplin</span>
                          <span className="inline-block px-2.5 py-0.5 rounded bg-emerald-400 text-slate-950 text-[10px] font-black mt-0.5">
                            BERSIH (0)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* FITUR PILIHAN GRID (8 SQUIRCLE ICONS DENGAN WARNA LOGO RESMI) */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-extrabold text-slate-900">Fitur Pilihan Kamu</h4>
                      <button className="text-xs font-bold text-[#0B2B7A] hover:underline">Atur</button>
                    </div>

                    <div className="grid grid-cols-4 gap-y-4 gap-x-2">
                      {fiturBudiMulia.map((fitur) => {
                        const IconC = fitur.icon
                        return (
                          <div 
                            key={fitur.id}
                            onClick={() => setActiveMenu(fitur.id === "MENU_LAIN" ? null : fitur.id)}
                            className="flex flex-col items-center cursor-pointer group active:scale-95 transition-transform"
                          >
                            <div className={`w-14 h-14 rounded-2xl ${fitur.bg} flex items-center justify-center shadow-xs group-hover:shadow-md transition-shadow`}>
                              <IconC className="w-6 h-6 stroke-[2.2]" />
                            </div>
                            <span className="text-[11px] font-bold text-slate-800 text-center mt-2 leading-tight">
                              {fitur.label}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* BANNER INFORMASI JADWAL AKADEMIK */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-extrabold text-slate-900">Jadwal & Agenda Hari Ini</h4>
                      <button 
                        onClick={() => setActiveMenu('JADWAL')}
                        className="text-xs font-bold text-[#0B2B7A] hover:underline"
                      >
                        Lihat Semua
                      </button>
                    </div>

                    {/* Card Banner Melengkung dengan Aksen Biru-Emas Budi Mulia */}
                    <div className="bg-[#FFFDF0] rounded-3xl p-5 shadow-xs border border-amber-200 relative overflow-hidden">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#D31725] text-white text-[10px] font-extrabold uppercase">
                          Sesi Aktif
                        </span>
                        <span className="text-xs text-slate-500 font-semibold">08.20 - 09.40 WIB</span>
                      </div>
                      <h3 className="text-base font-black text-slate-950 leading-snug">
                        Bahasa Indonesia — Kelas {student?.kelas}
                      </h3>
                      <p className="text-xs text-slate-600 mt-1 font-medium">
                        Guru: Maria Fransiska, M.Pd. • R. 8-A
                      </p>
                      <button 
                        onClick={() => setActiveMenu('JADWAL')}
                        className="mt-3 px-4 py-2 bg-[#0B2B7A] text-white text-xs font-bold rounded-xl shadow-xs hover:bg-[#08205C] transition-colors"
                      >
                        Buka Jadwal Lengkap
                      </button>
                    </div>
                  </div>

                </div>
              )}

            </div>

            {/* FLOATING BOTTOM NAV BAR DENGAN TOMBOL SCAN QR PRESENSI DI TENGAH (#0B2B7A + GOLD) */}
            <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 px-6 py-2.5 flex items-center justify-between z-40">
              
              <button 
                onClick={() => setActiveMenu(null)}
                className={`flex flex-col items-center gap-0.5 ${activeMenu === null ? 'text-[#0B2B7A] font-extrabold' : 'text-slate-400'}`}
              >
                <Home className="w-5 h-5" />
                <span className="text-[10px]">Beranda</span>
              </button>

              <button 
                onClick={() => setActiveMenu('JADWAL')}
                className={`flex flex-col items-center gap-0.5 ${activeMenu === 'JADWAL' ? 'text-[#0B2B7A] font-extrabold' : 'text-slate-400'}`}
              >
                <CalendarDays className="w-5 h-5" />
                <span className="text-[10px]">Jadwal</span>
              </button>

              {/* TOMBOL SCAN QR PRESENSI MELAYANG DI TENGAH (NAVY DENGAN IKON EMAS) */}
              <div className="-mt-6">
                <button 
                  onClick={() => setActiveMenu('PRESENSI')}
                  className="w-14 h-14 rounded-2xl bg-[#0B2B7A] text-white flex flex-col items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all border-2 border-white"
                >
                  <QrCode className="w-6 h-6 text-[#F6C800]" />
                  <span className="text-[8px] font-black uppercase text-[#F6C800] tracking-wider">SCAN</span>
                </button>
              </div>

              <button 
                onClick={() => setActiveMenu('CBT')}
                className={`flex flex-col items-center gap-0.5 ${activeMenu === 'CBT' ? 'text-[#0B2B7A] font-extrabold' : 'text-slate-400'}`}
              >
                <Award className="w-5 h-5" />
                <span className="text-[10px]">CBT</span>
              </button>

              <button 
                onClick={() => setActiveMenu('PROFIL')}
                className={`flex flex-col items-center gap-0.5 ${activeMenu === 'PROFIL' ? 'text-[#0B2B7A] font-extrabold' : 'text-slate-400'}`}
              >
                <User className="w-5 h-5" />
                <span className="text-[10px]">Profil</span>
              </button>

            </div>

          </div>

        </div>

      </div>

    </div>
  )
}
