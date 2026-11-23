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
  FileCheck2,
  CreditCard,
  Grid,
  TrendingUp,
  Flame,
  BadgeCheck,
  BookMarked
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
  const [activeTab, setActiveTab] = useState('hari_ini') // 'hari_ini', 'akademik', 'kesiswaan'

  // Ambil Data Sesi Siswa Riil
  const [student, setStudent] = useState(() => {
    try {
      const raw = localStorage.getItem('siswa_session')
      if (raw) return JSON.parse(raw)
    } catch (e) {}
    return {
      nama: "Axel Jonathan",
      nisn: "0089218291",
      kelas: "8-A",
      waliKelas: "Anselmus M. Gestawan, S.Pd.",
      tahun_ajaran: "2026/2027 Ganjil",
      foto: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80"
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

  // 8 Fitur Pilihan Grid Gaya Wondr dengan Palet Budi Mulia
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

  const jadwalHariIni = [
    { jam: "07.00 - 08.20", mapel: "Matematika", guru: "Anselmus M. Gestawan, S.Pd.", ruang: "R. " + (student?.kelas || "8-A"), status: "Selesai" },
    { jam: "08.20 - 09.40", mapel: "Bahasa Indonesia", guru: "Maria Fransiska, M.Pd.", ruang: "R. " + (student?.kelas || "8-A"), status: "Sedang Berlangsung" },
    { jam: "10.00 - 11.20", mapel: "IPA Terpadu", guru: "Budi Santoso, M.Si.", ruang: "Lab IPA", status: "Akan Datang" },
  ]

  const panggilanNama = student?.nama?.split(' ')[0] || "Axel"

  return (
    <div className="min-h-screen bg-[#F0F3F8] font-sans antialiased text-slate-800 flex flex-col">
      
      {/* Top Controller Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between text-xs sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#0B2B7A] border border-amber-400"></div>
          <span className="font-extrabold text-[#0B2B7A] tracking-wider text-sm">eBudiMulia</span>
          <span className="text-[10px] text-slate-400 font-bold">Portal Siswa</span>
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
              
              {/* TOP HEADER: Logo Asli eBudiMulia (Bukan Wondr Lagi!) */}
              <div className="px-5 pt-5 pb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#0B2B7A] flex items-center justify-center text-white shadow-xs border border-amber-400">
                    <Flame className="w-4 h-4 text-amber-400 fill-amber-400" />
                  </div>
                  <div>
                    <h1 className="text-lg font-black tracking-tight text-[#0B2B7A] leading-none">
                      eBudi<span className="text-[#D31725]">Mulia</span>
                    </h1>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mt-0.5">
                      SMP Budi Mulia
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setActiveMenu('POIN')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-200 bg-[#FFFDF0] shadow-2xs text-xs font-black text-amber-900 hover:bg-amber-100/60 transition-colors"
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
                /* HALAMAN UTAMA BERANDA SISWA */
                <div className="px-5 space-y-4">
                  
                  {/* Greeting & Action Icons Row */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-[#0B2B7A] text-amber-300 flex items-center justify-center font-bold text-xs shadow-xs">
                        {panggilanNama.substring(0, 2).toUpperCase()}
                      </div>
                      <h2 className="text-lg font-black text-slate-900 tracking-tight">
                        Hi, {panggilanNama}! 👋
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

                  {/* 3 Tab Filter Fungsional: Hari Ini / Akademik / Kesiswaan */}
                  <div className="bg-slate-100 p-1 rounded-full flex items-center justify-between text-xs font-bold text-slate-600">
                    <button 
                      onClick={() => setActiveTab('hari_ini')}
                      className={`flex-1 py-2 rounded-full transition-all text-center ${
                        activeTab === 'hari_ini' ? 'bg-[#F6C800] text-slate-950 font-black shadow-2xs' : 'hover:text-slate-900'
                      }`}
                    >
                      Hari Ini
                    </button>
                    <button 
                      onClick={() => setActiveTab('akademik')}
                      className={`flex-1 py-2 rounded-full transition-all text-center ${
                        activeTab === 'akademik' ? 'bg-[#F6C800] text-slate-950 font-black shadow-2xs' : 'hover:text-slate-900'
                      }`}
                    >
                      Akademik
                    </button>
                    <button 
                      onClick={() => setActiveTab('kesiswaan')}
                      className={`flex-1 py-2 rounded-full transition-all text-center ${
                        activeTab === 'kesiswaan' ? 'bg-[#F6C800] text-slate-950 font-black shadow-2xs' : 'hover:text-slate-900'
                      }`}
                    >
                      Kesiswaan
                    </button>
                  </div>

                  {/* KARTU IDENTITAS SISWA (Bukan Kartu ATM/Rekening Lagi!) */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Kartu Pelajar Digital</h4>
                      <button 
                        onClick={() => setActiveMenu('PROFIL')}
                        className="text-xs font-bold text-[#0B2B7A] hover:underline"
                      >
                        Detail Siswa →
                      </button>
                    </div>

                    {/* Card Pelajar Budi Mulia dengan Foto, NISN, dan Kelas */}
                    <div className="relative rounded-3xl p-4 sm:p-5 text-white shadow-xl overflow-hidden bg-gradient-to-br from-[#0B2B7A] via-[#103896] to-[#071E54] border border-blue-900">
                      
                      {/* Pola Strip Merah Obor & Lingkaran Emas di Latar */}
                      <div className="absolute top-0 right-0 w-28 h-28 bg-[#D31725]/30 rounded-bl-full pointer-events-none"></div>
                      <div className="absolute -left-10 -bottom-10 w-36 h-36 bg-[#F6C800]/15 rounded-full pointer-events-none"></div>

                      {/* Header Kartu */}
                      <div className="flex items-center justify-between relative z-10 pb-3 border-b border-white/15">
                        <div className="flex items-center gap-1.5">
                          <Flame className="w-4 h-4 text-amber-400 fill-amber-400" />
                          <span className="text-[11px] font-black uppercase tracking-wider text-white">
                            SMP BUDI MULIA JAKARTA
                          </span>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 backdrop-blur-md text-[10px] font-black text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
                          <BadgeCheck className="w-3 h-3" /> Siswa Aktif
                        </span>
                      </div>

                      {/* Body Kartu: FOTO SISWA + NAMA + KELAS + NISN */}
                      <div className="pt-3.5 flex items-center gap-3.5 relative z-10">
                        {/* Foto Siswa Asli */}
                        <div className="relative shrink-0">
                          <img 
                            src={student?.foto || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80"}
                            alt={student?.nama}
                            className="w-14 h-14 rounded-2xl object-cover border-2 border-amber-400 shadow-md"
                          />
                          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-[#0B2B7A] rounded-full"></div>
                        </div>

                        {/* Detail Info Siswa */}
                        <div className="overflow-hidden flex-1">
                          <h3 className="text-base font-black text-white truncate leading-tight">
                            {student?.nama}
                          </h3>
                          <p className="text-xs font-semibold text-amber-300 mt-0.5">
                            Kelas {student?.kelas} • Ruang Belajar
                          </p>
                          <p className="text-[11px] text-blue-200 font-mono mt-0.5">
                            NISN: <span className="text-white font-bold tracking-wide">{student?.nisn}</span>
                          </p>
                        </div>
                      </div>

                      {/* Footer Kartu: Poin & Status Disiplin */}
                      <div className="mt-3.5 pt-3 border-t border-white/15 flex items-center justify-between relative z-10 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          <span className="text-blue-100 text-[11px]">Kredit Poin:</span>
                          <span className="font-black font-mono text-amber-400">+{stats.poinPositif}</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-blue-100 text-[11px]">Kehadiran:</span>
                          <span className="font-black text-emerald-400 font-mono">{stats.kehadiranPersen}%</span>
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* KONTEN BERDASARKAN TAB YANG DIPILIH */}
                  {activeTab === 'hari_ini' && (
                    <div className="space-y-4">
                      {/* FITUR PILIHAN GRID (8 SQUIRCLE ICONS DENGAN WARNA LOGO RESMI) */}
                      <div>
                        <div className="flex items-center justify-between mb-2.5">
                          <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Layanan Utama Siswa</h4>
                          <span className="text-[10px] text-slate-400">Pintasan Cepat</span>
                        </div>

                        <div className="grid grid-cols-4 gap-y-3.5 gap-x-2">
                          {fiturBudiMulia.map((fitur) => {
                            const IconC = fitur.icon
                            return (
                              <div 
                                key={fitur.id}
                                onClick={() => setActiveMenu(fitur.id === "MENU_LAIN" ? null : fitur.id)}
                                className="flex flex-col items-center cursor-pointer group active:scale-95 transition-transform"
                              >
                                <div className={`w-13 h-13 sm:w-14 sm:h-14 rounded-2xl ${fitur.bg} flex items-center justify-center shadow-xs group-hover:shadow-md transition-shadow`}>
                                  <IconC className="w-6 h-6 stroke-[2.2]" />
                                </div>
                                <span className="text-[11px] font-bold text-slate-800 text-center mt-1.5 leading-tight">
                                  {fitur.label}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* BANNER MAPEL AKTIF HARI INI */}
                      <div className="bg-[#FFFDF0] rounded-3xl p-4 shadow-xs border border-amber-200">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#D31725] text-white text-[10px] font-extrabold uppercase">
                            Sedang Berlangsung
                          </span>
                          <span className="text-xs text-slate-500 font-mono font-bold">08.20 - 09.40 WIB</span>
                        </div>
                        <h3 className="text-sm font-black text-slate-900">
                          Bahasa Indonesia — Kelas {student?.kelas}
                        </h3>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Guru: Maria Fransiska, M.Pd. • R. 8-A
                        </p>
                        <div className="mt-3 flex items-center justify-between pt-2 border-t border-amber-200/60">
                          <span className="text-[11px] text-slate-500">Materi: Teks Eksplanasi</span>
                          <button 
                            onClick={() => setActiveMenu('JADWAL')}
                            className="text-xs font-bold text-[#0B2B7A] hover:underline"
                          >
                            Jadwal Hari Ini →
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'akademik' && (
                    <div className="space-y-3 bg-white p-4 rounded-3xl border border-slate-200 shadow-2xs">
                      <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2">Jadwal Kelas Hari Ini</h4>
                      <div className="divide-y divide-slate-100">
                        {jadwalHariIni.map((j, idx) => (
                          <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                            <div>
                              <p className="font-bold text-slate-900">{j.mapel}</p>
                              <p className="text-[11px] text-slate-500">{j.guru} • {j.ruang}</p>
                            </div>
                            <div className="text-right">
                              <span className="font-mono text-slate-400 block">{j.jam}</span>
                              <span className={`text-[10px] font-bold ${j.status === 'Sedang Berlangsung' ? 'text-[#D31725]' : 'text-slate-500'}`}>
                                {j.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button 
                        onClick={() => setActiveMenu('NILAI')}
                        className="w-full py-2 bg-[#0B2B7A] text-white font-bold text-xs rounded-xl hover:bg-[#08205C] transition-colors mt-2"
                      >
                        Lihat Transkrip Rapor TP Siswa
                      </button>
                    </div>
                  )}

                  {activeTab === 'kesiswaan' && (
                    <div className="space-y-3 bg-white p-4 rounded-3xl border border-slate-200 shadow-2xs">
                      <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2">Buku Saku & Kedisiplinan</h4>
                      <div className="flex items-center justify-between p-3 bg-blue-50 rounded-2xl border border-blue-100 text-xs">
                        <div>
                          <p className="text-[10px] text-blue-600 font-bold uppercase">Poin Prestasi</p>
                          <p className="text-lg font-black text-[#0B2B7A]">+{stats.poinPositif} Poin</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-emerald-700 font-bold uppercase">Pelanggaran</p>
                          <p className="text-lg font-black text-emerald-700">{stats.poinPelanggaran} Poin</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setActiveMenu('POIN')}
                        className="w-full py-2 bg-[#F6C800] text-slate-950 font-black text-xs rounded-xl hover:bg-amber-400 transition-colors mt-2"
                      >
                        Buka Buku Saku Lengkap
                      </button>
                    </div>
                  )}

                </div>
              )}

            </div>

            {/* FLOATING BOTTOM NAV BAR DENGAN TOMBOL SCAN QR PRESENSI DI TENGAH */}
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

              {/* TOMBOL SCAN QR PRESENSI MELAYANG DI TENGAH */}
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
