import React, { useState } from 'react'
import { 
  Bell, 
  Search, 
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
  MessageSquare, 
  ChevronRight,
  TrendingUp,
  FileSpreadsheet,
  QrCode,
  Laptop,
  Smartphone,
  Layers,
  Settings,
  LogOut,
  Flame,
  Star
} from 'lucide-react'

export default function RedesignDashboardPreview() {
  const [viewMode, setViewMode] = useState('responsive') // 'responsive', 'mobile_mockup'
  const [activeNav, setActiveNav] = useState('home')

  // Data Realistis Siswa
  const student = {
    nama: "Axel Jonathan",
    kelas: "Kelas 8 • Ruang 8-A",
    nisn: "0089218291",
    kehadiranPersen: 98,
    poinPositif: 85,
    poinMax: 100,
    statusPresensi: "Sudah Hadir (06.42 WIB)"
  }

  // Quick Access dengan Sentuhan Warna Resmi Budi Mulia
  const quickAccess = [
    { label: "Presensi", sub: "Scan QR", icon: QrCode, bg: "bg-blue-50 text-[#0B2B7A]", border: "border-blue-100" },
    { label: "Jadwal", sub: "Mapel Hari Ini", icon: Calendar, bg: "bg-amber-50 text-amber-700", border: "border-amber-100" },
    { label: "Poin Siswa", sub: "85 Poin Emas", icon: Sparkles, bg: "bg-amber-50 text-[#D97706]", border: "border-amber-200" },
    { label: "CBT Ujian", sub: "Bank Soal", icon: Award, bg: "bg-red-50 text-[#D31725]", border: "border-red-100" },
  ]

  const jadwalHariIni = [
    { jam: "07.00 - 08.20", mapel: "Matematika", guru: "Pak Anselmus M. G., S.Pd.", ruang: "R. 8-A", status: "Selesai", iconBg: "bg-blue-100 text-[#0B2B7A]" },
    { jam: "08.20 - 09.40", mapel: "Bahasa Indonesia", guru: "Ibu Maria S., M.Pd.", ruang: "R. 8-A", status: "Sedang Berlangsung", iconBg: "bg-red-50 text-[#D31725]" },
    { jam: "10.00 - 11.20", mapel: "Ilmu Pengetahuan Alam", guru: "Pak Budi Santoso, S.Si.", ruang: "Lab IPA", status: "Akan Datang", iconBg: "bg-slate-100 text-slate-600" },
  ]

  const sideNavItems = [
    { id: 'home', label: 'Beranda', icon: Home },
    { id: 'jadwal', label: 'Jadwal Pelajaran', icon: CalendarDays },
    { id: 'poin', label: 'Poin & Disiplin', icon: Sparkles },
    { id: 'cbt', label: 'CBT Ujian', icon: Award },
    { id: 'nilai', label: 'Rapor & Nilai', icon: GraduationCap },
    { id: 'konseling', label: 'Konseling BK', icon: Layers },
  ]

  return (
    <div className="min-h-screen bg-[#F1F4FA] font-sans antialiased text-slate-900 selection:bg-blue-100 flex flex-col">
      
      {/* Top Controller Bar (Bisa Switch Mode HP vs Mode Web Desktop) */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between text-xs sticky top-0 z-50 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-3 h-3 rounded-full bg-[#0B2B7A] border-2 border-amber-400"></div>
          <span className="font-bold text-slate-800">Preview Desain eBudimulia v2</span>
          <span className="hidden sm:inline text-slate-300">|</span>
          <span className="hidden sm:inline px-2 py-0.5 rounded-full bg-blue-50 text-[#0B2B7A] font-semibold text-[10px] border border-blue-200">
            Palet Logo Resmi: Navy (#0B2B7A) • Crimson (#D31725) • Gold (#F6C800)
          </span>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          <button 
            onClick={() => setViewMode('responsive')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition-all ${
              viewMode === 'responsive' 
                ? 'bg-white text-[#0B2B7A] shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" /> 
            <span>Tampilan Web / Desktop</span>
          </button>
          <button 
            onClick={() => setViewMode('mobile_mockup')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition-all ${
              viewMode === 'mobile_mockup' 
                ? 'bg-white text-[#0B2B7A] shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" /> 
            <span>Simulasi HP (Mobile)</span>
          </button>
        </div>
      </div>

      {/* Main Container Viewport */}
      <div className={`flex-1 ${viewMode === 'mobile_mockup' ? 'flex justify-center items-center py-6 px-4' : 'w-full'}`}>
        
        {/* Kontainer Desktop vs HP */}
        <div className={`w-full transition-all duration-300 ${
          viewMode === 'mobile_mockup' 
            ? 'max-w-[430px] min-h-[890px] bg-[#FAFBFD] rounded-[44px] shadow-2xl border-[8px] border-slate-900 overflow-hidden relative flex flex-col justify-between'
            : 'flex min-h-screen'
        }`}>

          {/* ============================================================== */}
          {/* SIDEBAR KHUSUS DESKTOP (Branding Logo Navy Budi Mulia)          */}
          {/* ============================================================== */}
          {viewMode === 'responsive' && (
            <aside className="hidden lg:flex w-64 flex-col justify-between bg-white border-r border-slate-200/80 p-5 sticky top-10 h-[calc(100vh-40px)]">
              <div>
                {/* Brand Logo SMP Budi Mulia */}
                <div className="flex items-center gap-3 px-2 py-1 mb-8">
                  <div className="w-11 h-11 rounded-2xl bg-[#0B2B7A] flex items-center justify-center text-white shadow-md shadow-blue-900/20 border-2 border-amber-400">
                    <Flame className="w-6 h-6 text-amber-400 fill-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 leading-tight tracking-tight flex items-center gap-1">
                      eBudi<span className="text-[#D31725]">Mulia</span>
                    </h3>
                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">SMP Budi Mulia</p>
                  </div>
                </div>

                {/* Nav Menu Items */}
                <div className="space-y-1">
                  <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Menu Siswa</p>
                  {sideNavItems.map((item) => {
                    const IconComp = item.icon
                    const isActive = activeNav === item.id
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveNav(item.id)}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl font-semibold text-xs transition-all ${
                          isActive 
                            ? 'bg-[#0B2B7A] text-white shadow-md shadow-blue-900/20' 
                            : 'text-slate-600 hover:bg-blue-50/60 hover:text-[#0B2B7A]'
                        }`}
                      >
                        <IconComp className={`w-4 h-4 ${isActive ? 'text-amber-400' : ''}`} />
                        <span>{item.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Bottom Profile Widget in Sidebar */}
              <div className="bg-[#F0F4FC] border border-blue-100 rounded-2xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#0B2B7A] text-amber-300 flex items-center justify-center font-bold text-xs shadow-xs">
                    AJ
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-slate-900 truncate">{student.nama}</p>
                    <p className="text-[10px] text-slate-500 font-medium">{student.kelas}</p>
                  </div>
                </div>
                <button className="text-slate-400 hover:text-[#D31725] transition-colors p-1">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </aside>
          )}

          {/* ============================================================== */}
          {/* MAIN CONTENT AREA                                              */}
          {/* ============================================================== */}
          <div className="flex-1 flex flex-col justify-between overflow-y-auto">
            
            <div className="pb-12">
              
              {/* Header Gradient Royal Navy Budi Mulia (#0B2B7A ke #163B96) */}
              <div className="bg-gradient-to-b from-[#0B2B7A] via-[#10348E] to-[#F1F4FA] px-6 lg:px-10 pt-6 pb-10 text-white relative">
                
                {/* Top Nav Row */}
                <div className="flex items-center justify-between max-w-6xl mx-auto">
                  <div className="flex items-center gap-3.5">
                    <div className="relative">
                      <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-2xl bg-white/20 p-0.5 border border-white/30 shadow-md">
                        <img 
                          src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80" 
                          alt="Student" 
                          className="w-full h-full object-cover rounded-[14px]"
                        />
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-[#0B2B7A] rounded-full"></div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base lg:text-xl font-bold text-white leading-tight">Halo, {student.nama} 👋</h2>
                        <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-extrabold text-[10px]">
                          ⭐ Budi Mulia Pride
                        </span>
                      </div>
                      <p className="text-xs lg:text-sm text-blue-100 font-medium">{student.kelas} • NISN: {student.nisn}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="hidden md:flex items-center bg-white/10 backdrop-blur-md rounded-2xl px-3.5 py-2 border border-white/20 shadow-xs w-64 text-white">
                      <Search className="w-4 h-4 text-blue-200 mr-2" />
                      <input 
                        type="text" 
                        placeholder="Cari jadwal, guru, materi..." 
                        className="bg-transparent text-xs text-white placeholder-blue-200 outline-none w-full"
                      />
                    </div>
                    <button className="md:hidden w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 shadow-xs flex items-center justify-center text-white">
                      <Search className="w-4 h-4" />
                    </button>
                    <div className="relative">
                      <button className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 shadow-xs flex items-center justify-center text-white hover:bg-white/25 transition-all">
                        <Bell className="w-4 h-4" />
                      </button>
                      <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-[#D31725] rounded-full border-2 border-white"></span>
                    </div>
                  </div>
                </div>

                {/* Hero Welcome Card (Card Putih Melengkung dengan Aksen Obor Emas) */}
                <div className="mt-6 max-w-6xl mx-auto bg-white rounded-3xl p-6 lg:p-8 shadow-lg shadow-blue-950/5 border border-slate-100 text-slate-900 relative overflow-hidden">
                  
                  {/* Pita Strip Merah Budi Mulia di Pojok Kiri */}
                  <div className="absolute top-0 left-0 bottom-0 w-2.5 bg-[#D31725]"></div>

                  <div className="max-w-[70%] sm:max-w-[62%] relative z-10 pl-2">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-50 text-[#0B2B7A] text-[11px] font-bold tracking-wide uppercase border border-blue-100">
                        <Flame className="w-3.5 h-3.5 text-[#D31725] fill-[#D31725]" /> Semester Ganjil
                      </span>
                      <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                        <CheckCircle2 className="w-3 h-3" /> {student.statusPresensi}
                      </span>
                    </div>

                    <h3 className="text-base sm:text-2xl font-extrabold text-[#0B2B7A] leading-snug">
                      Semangat Berprestasi di SMP Budi Mulia!
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1.5 leading-relaxed">
                      Jaga kedisiplinan dan integritas. Cek jadwal pelajaran kelas 8-A hari ini agar selalu siap belajar.
                    </p>
                    
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button className="px-5 py-2.5 bg-[#0B2B7A] hover:bg-[#08205C] text-white text-xs sm:text-sm font-bold rounded-2xl shadow-md shadow-blue-900/20 hover:shadow-lg transition-all active:scale-95 flex items-center gap-2">
                        <span>Lihat Jadwal Hari Ini</span>
                        <ChevronRight className="w-4 h-4 text-amber-400" />
                      </button>
                      <button className="px-4 py-2.5 bg-[#FFF8E6] text-amber-900 border border-amber-200 text-xs sm:text-sm font-bold rounded-2xl hover:bg-amber-100 transition-colors flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-amber-600" />
                        <span>Katalog Poin & Disiplin</span>
                      </button>
                    </div>
                  </div>

                  {/* 3D Illustration / Obor Element Budi Mulia */}
                  <div className="absolute right-4 sm:right-8 -bottom-3 sm:-bottom-4 w-32 h-32 sm:w-44 sm:h-44 pointer-events-none select-none">
                    <div className="w-full h-full bg-gradient-to-tr from-blue-50 to-amber-50 rounded-full flex flex-col items-center justify-center border border-amber-200 shadow-inner">
                      <Flame className="w-14 h-14 sm:w-20 sm:h-20 text-[#D31725] fill-[#D31725] drop-shadow-md animate-bounce" />
                      <span className="text-[10px] sm:text-xs font-black text-[#0B2B7A] tracking-widest mt-1">BUDI MULIA</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Multi-Column Content Area */}
              <div className="px-6 lg:px-10 max-w-6xl mx-auto -mt-4 space-y-6">
                
                {/* Baris Quick Access */}
                <div>
                  <div className="flex items-center justify-between mb-3.5">
                    <h4 className="text-xs sm:text-sm font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2 h-4 bg-[#D31725] rounded-full"></span>
                      Layanan Cepat Siswa
                    </h4>
                    <button className="text-xs font-bold text-[#0B2B7A] hover:underline">Semua Modul →</button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                    {quickAccess.map((item, idx) => {
                      const IconComponent = item.icon
                      return (
                        <div 
                          key={idx}
                          className={`bg-white rounded-3xl p-4 flex flex-col items-center justify-center shadow-xs border ${item.border} hover:shadow-md hover:border-[#0B2B7A] transition-all cursor-pointer group active:scale-95`}
                        >
                          <div className={`w-12 h-12 rounded-2xl ${item.bg} flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform shadow-xs`}>
                            <IconComponent className="w-6 h-6" />
                          </div>
                          <span className="text-xs sm:text-sm font-bold text-slate-800 text-center leading-tight">{item.label}</span>
                          <span className="text-[10px] text-slate-400 text-center mt-1 font-medium">{item.sub}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 2 Kolom di Web: Kiri Progress Akademik & Poin, Kanan Jadwal */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  {/* Kolom 1: Academic & Point Overview (Warna Navy & Gold) */}
                  <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-200/80 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h4 className="text-sm sm:text-base font-extrabold text-[#0B2B7A]">Apresiasi Poin & Kehadiran</h4>
                          <p className="text-xs text-slate-400">Semester Ganjil 2026/2027</p>
                        </div>
                        <span className="bg-blue-50 border border-blue-200 px-3 py-1 rounded-xl text-xs font-bold text-[#0B2B7A]">
                          Aktif ▾
                        </span>
                      </div>

                      {/* Bar Kehadiran (Biru Navy) */}
                      <div className="space-y-2 mt-4">
                        <div className="flex justify-between items-center text-xs sm:text-sm font-bold">
                          <span className="text-slate-700 flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Kehadiran Siswa
                          </span>
                          <span className="text-[#0B2B7A]">{student.kehadiranPersen}%</span>
                        </div>
                        <div className="w-full h-4 sm:h-5 bg-slate-100 rounded-full overflow-hidden p-0.5">
                          <div 
                            className="h-full bg-gradient-to-r from-blue-600 to-[#0B2B7A] rounded-full transition-all duration-700"
                            style={{ width: `${student.kehadiranPersen}%` }}
                          ></div>
                        </div>
                        <p className="text-[11px] text-slate-400">Total 72 hari aktif sekolah • 0 Alpha</p>
                      </div>

                      {/* Bar Poin Positif (Emas Kuning Budi Mulia #F6C800) */}
                      <div className="space-y-2 mt-5">
                        <div className="flex justify-between items-center text-xs sm:text-sm font-bold">
                          <span className="text-slate-700 flex items-center gap-1.5">
                            <Star className="w-4 h-4 text-amber-500 fill-amber-400" /> Poin Apresiasi Disiplin
                          </span>
                          <span className="text-amber-700">{student.poinPositif}/100 Poin</span>
                        </div>
                        <div className="w-full h-4 sm:h-5 bg-amber-50 rounded-full overflow-hidden p-0.5 border border-amber-200">
                          <div 
                            className="h-full bg-gradient-to-r from-amber-400 to-[#F6C800] rounded-full transition-all duration-700"
                            style={{ width: `${(student.poinPositif / student.poinMax) * 100}%` }}
                          ></div>
                        </div>
                        <p className="text-[11px] text-amber-800 font-semibold">Peringkat 3 kedisiplinan di kelas 8-A 🏆</p>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs text-slate-500">Punya piagam kejuaraan baru?</span>
                      <button className="text-xs font-bold text-[#D31725] hover:underline flex items-center gap-1">
                        + Ajukan Poin Prestasi
                      </button>
                    </div>
                  </div>

                  {/* Kolom 2: Today's Schedule List */}
                  <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-200/80">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="text-sm sm:text-base font-extrabold text-[#0B2B7A]">Jadwal Pelajaran Hari Ini</h4>
                        <p className="text-xs text-slate-400">Senin, 23 November 2026</p>
                      </div>
                      <button className="text-xs font-bold text-[#0B2B7A] hover:underline">
                        Jadwal Lengkap
                      </button>
                    </div>

                    <div className="space-y-3">
                      {jadwalHariIni.map((jadwal, idx) => (
                        <div 
                          key={idx}
                          className="bg-[#F8FAFD] rounded-2xl p-4 flex items-center justify-between border border-blue-50 hover:border-blue-200 transition-colors"
                        >
                          <div className="flex items-center gap-3.5">
                            <div className={`w-11 h-11 rounded-2xl ${jadwal.iconBg} flex items-center justify-center shadow-xs`}>
                              <BookOpen className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h5 className="text-xs sm:text-sm font-bold text-slate-800 leading-tight">{jadwal.mapel}</h5>
                                <span className="text-[11px] text-slate-400 font-medium">• {jadwal.ruang}</span>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">{jadwal.guru}</p>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-xs font-bold text-slate-700 font-mono block">{jadwal.jam}</span>
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold mt-1.5 ${
                              jadwal.status === 'Sedang Berlangsung' ? 'bg-red-50 text-[#D31725] border border-red-200' :
                              jadwal.status === 'Selesai' ? 'bg-blue-50 text-[#0B2B7A] border border-blue-200' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {jadwal.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

              </div>

            </div>

            {/* Bottom Nav Bar (Hanya Tampil Jika di Mode HP / Mobile) */}
            {viewMode === 'mobile_mockup' && (
              <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-100 px-6 py-3 flex items-center justify-between z-40">
                <button 
                  onClick={() => setActiveNav('home')}
                  className={`flex flex-col items-center gap-1 transition-colors ${activeNav === 'home' ? 'text-[#0B2B7A]' : 'text-slate-400'}`}
                >
                  <div className={`p-1 rounded-xl ${activeNav === 'home' ? 'bg-blue-50 text-[#0B2B7A]' : ''}`}>
                    <Home className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold">Home</span>
                </button>

                <button 
                  onClick={() => setActiveNav('jadwal')}
                  className={`flex flex-col items-center gap-1 transition-colors ${activeNav === 'jadwal' ? 'text-[#0B2B7A]' : 'text-slate-400'}`}
                >
                  <div className="p-1">
                    <CalendarDays className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-medium">Jadwal</span>
                </button>

                <button 
                  onClick={() => setActiveNav('cbt')}
                  className={`flex flex-col items-center gap-1 transition-colors ${activeNav === 'cbt' ? 'text-[#0B2B7A]' : 'text-slate-400'}`}
                >
                  <div className="p-1">
                    <Award className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-medium">Ujian CBT</span>
                </button>

                <button 
                  onClick={() => setActiveNav('profile')}
                  className={`flex flex-col items-center gap-1 transition-colors ${activeNav === 'profile' ? 'text-[#0B2B7A]' : 'text-slate-400'}`}
                >
                  <div className="p-1">
                    <User className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-medium">Profil</span>
                </button>
              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  )
}
