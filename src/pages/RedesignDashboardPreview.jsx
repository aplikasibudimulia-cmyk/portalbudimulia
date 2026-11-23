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
  ChevronDown
} from 'lucide-react'

export default function RedesignDashboardPreview() {
  const [viewMode, setViewMode] = useState('responsive') // 'responsive', 'mobile_mockup'
  const [activeNav, setActiveNav] = useState('home')

  // Data Realistis Siswa
  const student = {
    nama: "Axel Jonathan",
    kelas: "Kelas 8 • Ruang 8-A",
    nisn: "0089218291",
    kehadiranPersen: 95,
    poinPositif: 85,
    poinMax: 100,
    statusPresensi: "Sudah Hadir (06.42 WIB)"
  }

  const quickAccess = [
    { label: "Presensi", sub: "Scan QR Masuk", icon: QrCode, bg: "bg-blue-50 text-blue-600" },
    { label: "Jadwal", sub: "Mapel Hari Ini", icon: Calendar, bg: "bg-purple-50 text-purple-600" },
    { label: "Poin Siswa", sub: "85 Poin Prestasi", icon: Sparkles, bg: "bg-amber-50 text-amber-600" },
    { label: "CBT Ujian", sub: "Bank Soal Online", icon: Award, bg: "bg-rose-50 text-rose-600" },
  ]

  const jadwalHariIni = [
    { jam: "07.00 - 08.20", mapel: "Matematika", guru: "Pak Anselmus M. G., S.Pd.", ruang: "R. 8-A", status: "Selesai", iconBg: "bg-purple-100 text-purple-600" },
    { jam: "08.20 - 09.40", mapel: "Bahasa Indonesia", guru: "Ibu Maria S., M.Pd.", ruang: "R. 8-A", status: "Sedang Berlangsung", iconBg: "bg-blue-100 text-blue-600" },
    { jam: "10.00 - 11.20", mapel: "Ilmu Pengetahuan Alam", guru: "Pak Budi Santoso, S.Si.", ruang: "Lab IPA", status: "Akan Datang", iconBg: "bg-emerald-100 text-emerald-600" },
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
    <div className="min-h-screen bg-[#F6F5FA] font-sans antialiased text-slate-900 selection:bg-purple-200 flex flex-col">
      
      {/* Top Controller Bar (Bisa Switch Mode HP vs Mode Web Desktop) */}
      <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between text-xs sticky top-0 z-50 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-600 animate-pulse"></span>
          <span className="font-bold text-slate-800">Preview Desain v2</span>
          <span className="hidden sm:inline text-slate-400">|</span>
          <span className="hidden sm:inline text-slate-500 text-[11px]">Tema Soft Pastel Lilac eBudimulia</span>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          <button 
            onClick={() => setViewMode('responsive')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition-all ${
              viewMode === 'responsive' 
                ? 'bg-white text-purple-700 shadow-xs' 
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
                ? 'bg-white text-purple-700 shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" /> 
            <span>Simulasi HP (Mobile Frame)</span>
          </button>
        </div>
      </div>

      {/* Main Container Viewport */}
      <div className={`flex-1 ${viewMode === 'mobile_mockup' ? 'flex justify-center items-center py-6 px-4' : 'w-full'}`}>
        
        {/* Kontainer Desktop vs HP */}
        <div className={`w-full transition-all duration-300 ${
          viewMode === 'mobile_mockup' 
            ? 'max-w-[430px] min-h-[880px] bg-[#FAF9FD] rounded-[44px] shadow-2xl border-[8px] border-slate-800 overflow-hidden relative flex flex-col justify-between'
            : 'flex min-h-screen'
        }`}>

          {/* ============================================================== */}
          {/* SIDEBAR KHUSUS DESKTOP (Hanya tampil di mode Web/Desktop)     */}
          {/* ============================================================== */}
          {viewMode === 'responsive' && (
            <aside className="hidden lg:flex w-64 flex-col justify-between bg-white border-r border-slate-100 p-5 sticky top-12 h-[calc(100vh-48px)]">
              <div>
                {/* Brand Logo */}
                <div className="flex items-center gap-3 px-2 py-1 mb-8">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-purple-200">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 leading-tight">eBudimulia</h3>
                    <p className="text-[10px] text-slate-400 font-medium">SMP Budi Mulia Jakarta</p>
                  </div>
                </div>

                {/* Nav Menu Items */}
                <div className="space-y-1">
                  <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Menu Utama</p>
                  {sideNavItems.map((item) => {
                    const IconComp = item.icon
                    const isActive = activeNav === item.id
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveNav(item.id)}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl font-semibold text-xs transition-all ${
                          isActive 
                            ? 'bg-[#8E6CEF] text-white shadow-md shadow-purple-200' 
                            : 'text-slate-600 hover:bg-purple-50/60 hover:text-purple-700'
                        }`}
                      >
                        <IconComp className="w-4 h-4" />
                        <span>{item.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Bottom Profile Widget in Sidebar */}
              <div className="bg-[#FAF9FD] border border-purple-100/60 rounded-2xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-purple-200 flex items-center justify-center font-bold text-purple-700 text-xs">
                    AJ
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-slate-900 truncate">{student.nama}</p>
                    <p className="text-[10px] text-slate-500">{student.kelas}</p>
                  </div>
                </div>
                <button className="text-slate-400 hover:text-rose-600 transition-colors">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </aside>
          )}

          {/* ============================================================== */}
          {/* MAIN CONTENT AREA (Bisa responsif lebar di Web, pas di HP)     */}
          {/* ============================================================== */}
          <div className="flex-1 flex flex-col justify-between overflow-y-auto">
            
            <div className="pb-12">
              {/* Header Gradient Lilac Cantik */}
              <div className="bg-gradient-to-b from-[#E7DBFF] via-[#EFE6FF] to-[#F6F5FA] px-6 lg:px-10 pt-6 pb-8">
                
                {/* Top Nav Row */}
                <div className="flex items-center justify-between max-w-6xl mx-auto">
                  <div className="flex items-center gap-3.5">
                    <div className="relative">
                      <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 p-0.5 shadow-md shadow-purple-200">
                        <img 
                          src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80" 
                          alt="Student" 
                          className="w-full h-full object-cover rounded-[14px]"
                        />
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full"></div>
                    </div>
                    <div>
                      <h2 className="text-base lg:text-xl font-bold text-slate-900 leading-tight">Halo, {student.nama} 👋</h2>
                      <p className="text-xs lg:text-sm text-slate-600 font-medium">{student.kelas}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="hidden md:flex items-center bg-white/90 backdrop-blur-md rounded-2xl px-3 py-2 border border-white/60 shadow-xs w-64">
                      <Search className="w-4 h-4 text-slate-400 mr-2" />
                      <input 
                        type="text" 
                        placeholder="Cari materi, jadwal, guru..." 
                        className="bg-transparent text-xs text-slate-800 placeholder-slate-400 outline-none w-full"
                      />
                    </div>
                    <button className="md:hidden w-10 h-10 rounded-2xl bg-white/90 shadow-xs flex items-center justify-center text-slate-700">
                      <Search className="w-4 h-4" />
                    </button>
                    <div className="relative">
                      <button className="w-10 h-10 rounded-2xl bg-white/90 shadow-xs flex items-center justify-center text-slate-700 hover:bg-white transition-all">
                        <Bell className="w-4 h-4" />
                      </button>
                      <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-rose-500 rounded-full border border-white"></span>
                    </div>
                  </div>
                </div>

                {/* Hero Welcome Card */}
                <div className="mt-6 max-w-6xl mx-auto bg-white/95 backdrop-blur-md rounded-3xl p-6 lg:p-8 shadow-sm border border-white/80 relative overflow-hidden">
                  <div className="max-w-[70%] sm:max-w-[60%] relative z-10">
                    <span className="inline-block px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-[11px] font-bold tracking-wide uppercase mb-2">
                      Semester Ganjil 2026/2027
                    </span>
                    <h3 className="text-base sm:text-2xl font-bold text-slate-900 leading-snug">
                      Siap Belajar Hari Ini?
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1.5 leading-relaxed">
                      Presensi pagi kamu sudah tercatat (<span className="text-emerald-600 font-semibold">{student.statusPresensi}</span>). Jangan lupa cek jadwal kelas 8-A.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button className="px-5 py-2.5 bg-gradient-to-r from-[#8E6CEF] to-[#7852E8] text-white text-xs sm:text-sm font-semibold rounded-2xl shadow-md shadow-purple-200 hover:shadow-lg transition-all active:scale-95">
                        Lihat Jadwal Hari Ini
                      </button>
                      <button className="px-4 py-2.5 bg-purple-50 text-purple-700 text-xs sm:text-sm font-semibold rounded-2xl hover:bg-purple-100 transition-colors">
                        Scan Presensi Siswa
                      </button>
                    </div>
                  </div>

                  {/* 3D Illustration Floating Element */}
                  <div className="absolute right-3 sm:right-8 -bottom-3 sm:-bottom-4 w-32 h-32 sm:w-48 sm:h-48 pointer-events-none select-none">
                    <div className="w-full h-full bg-gradient-to-tr from-purple-200/60 to-indigo-100/60 rounded-full flex items-center justify-center text-purple-600 shadow-inner">
                      <GraduationCap className="w-16 h-16 sm:w-24 sm:h-24 text-purple-500" />
                    </div>
                  </div>
                </div>

              </div>

              {/* Desktop Multi-Column Grid (Responsif 2 Kolom Lebar di Web) */}
              <div className="px-6 lg:px-10 max-w-6xl mx-auto -mt-2 space-y-6">
                
                {/* Baris Quick Access */}
                <div>
                  <div className="flex items-center justify-between mb-3.5">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-wider">Akses Cepat Layanan</h4>
                    <button className="text-xs font-semibold text-purple-600 hover:text-purple-700">Lihat Semua Modul</button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                    {quickAccess.map((item, idx) => {
                      const IconComponent = item.icon
                      return (
                        <div 
                          key={idx}
                          className="bg-white rounded-3xl p-4 flex flex-col items-center justify-center shadow-xs border border-slate-100 hover:shadow-md hover:border-purple-200 transition-all cursor-pointer group active:scale-95"
                        >
                          <div className={`w-12 h-12 rounded-2xl ${item.bg} flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform`}>
                            <IconComponent className="w-6 h-6" />
                          </div>
                          <span className="text-xs sm:text-sm font-bold text-slate-800 text-center leading-tight">{item.label}</span>
                          <span className="text-[10px] text-slate-400 text-center mt-1">{item.sub}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 2 Kolom di Web: Kiri Progress Akademik, Kanan Jadwal */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  {/* Kolom 1: Academic & Point Overview */}
                  <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h4 className="text-sm sm:text-base font-bold text-slate-900">Performa Akademik & Poin</h4>
                          <p className="text-xs text-slate-400">Statistik semester ganjil</p>
                        </div>
                        <span className="bg-slate-50 border border-slate-200/80 px-3 py-1 rounded-xl text-xs font-bold text-slate-600">
                          Semester 1 ▾
                        </span>
                      </div>

                      {/* Bar Kehadiran */}
                      <div className="space-y-2 mt-4">
                        <div className="flex justify-between items-center text-xs sm:text-sm font-semibold">
                          <span className="text-slate-700 flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-blue-500" /> Kehadiran Siswa
                          </span>
                          <span className="text-blue-600 font-bold">{student.kehadiranPersen}%</span>
                        </div>
                        <div className="w-full h-4 sm:h-5 bg-slate-100 rounded-full overflow-hidden p-0.5">
                          <div 
                            className="h-full bg-gradient-to-r from-blue-400 to-indigo-500 rounded-full transition-all duration-700"
                            style={{ width: `${student.kehadiranPersen}%` }}
                          ></div>
                        </div>
                        <p className="text-[11px] text-slate-400">Total 72 hari aktif • 0 Alpha</p>
                      </div>

                      {/* Bar Poin Positif */}
                      <div className="space-y-2 mt-5">
                        <div className="flex justify-between items-center text-xs sm:text-sm font-semibold">
                          <span className="text-slate-700 flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 text-purple-500" /> Poin Apresiasi Disiplin
                          </span>
                          <span className="text-purple-600 font-bold">{student.poinPositif}/100 Poin</span>
                        </div>
                        <div className="w-full h-4 sm:h-5 bg-slate-100 rounded-full overflow-hidden p-0.5">
                          <div 
                            className="h-full bg-gradient-to-r from-purple-400 to-[#8E6CEF] rounded-full transition-all duration-700"
                            style={{ width: `${(student.poinPositif / student.poinMax) * 100}%` }}
                          ></div>
                        </div>
                        <p className="text-[11px] text-slate-400">Peringkat 3 kedisiplinan di kelas 8-A</p>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs text-slate-500">Punya piagam lomba baru?</span>
                      <button className="text-xs font-bold text-purple-600 hover:text-purple-700">
                        + Ajukan Poin Prestasi
                      </button>
                    </div>
                  </div>

                  {/* Kolom 2: Today's Schedule List */}
                  <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="text-sm sm:text-base font-bold text-slate-900">Jadwal Pelajaran Hari Ini</h4>
                        <p className="text-xs text-slate-400">Senin, 23 November 2026</p>
                      </div>
                      <button className="text-xs font-semibold text-purple-600 hover:text-purple-700">
                        Jadwal Lengkap
                      </button>
                    </div>

                    <div className="space-y-3">
                      {jadwalHariIni.map((jadwal, idx) => (
                        <div 
                          key={idx}
                          className="bg-[#FAF9FD] rounded-2xl p-4 flex items-center justify-between border border-purple-50 hover:border-purple-200 transition-colors"
                        >
                          <div className="flex items-center gap-3.5">
                            <div className={`w-11 h-11 rounded-2xl ${jadwal.iconBg} flex items-center justify-center`}>
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
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold mt-1.5 ${
                              jadwal.status === 'Sedang Berlangsung' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                              jadwal.status === 'Selesai' ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700'
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
                  className={`flex flex-col items-center gap-1 transition-colors ${activeNav === 'home' ? 'text-purple-600' : 'text-slate-400'}`}
                >
                  <div className={`p-1 rounded-xl ${activeNav === 'home' ? 'bg-purple-100' : ''}`}>
                    <Home className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold">Home</span>
                </button>

                <button 
                  onClick={() => setActiveNav('jadwal')}
                  className={`flex flex-col items-center gap-1 transition-colors ${activeNav === 'jadwal' ? 'text-purple-600' : 'text-slate-400'}`}
                >
                  <div className="p-1">
                    <CalendarDays className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-medium">Jadwal</span>
                </button>

                <button 
                  onClick={() => setActiveNav('cbt')}
                  className={`flex flex-col items-center gap-1 transition-colors ${activeNav === 'cbt' ? 'text-purple-600' : 'text-slate-400'}`}
                >
                  <div className="p-1">
                    <Award className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-medium">Ujian CBT</span>
                </button>

                <button 
                  onClick={() => setActiveNav('profile')}
                  className={`flex flex-col items-center gap-1 transition-colors ${activeNav === 'profile' ? 'text-purple-600' : 'text-slate-400'}`}
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
