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
  QrCode
} from 'lucide-react'

export default function RedesignDashboardPreview() {
  const [activeBottomNav, setActiveBottomNav] = useState('home')

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
    { label: "Presensi", sub: "Scan QR", icon: QrCode, bg: "bg-blue-50 text-blue-600", dot: "bg-blue-500" },
    { label: "Jadwal", sub: "Mapel Hari Ini", icon: Calendar, bg: "bg-purple-50 text-purple-600", dot: "bg-purple-500" },
    { label: "Poin Siswa", sub: "85 Poin", icon: Sparkles, bg: "bg-amber-50 text-amber-600", dot: "bg-amber-500" },
    { label: "CBT Ujian", sub: "Bank Soal", icon: Award, bg: "bg-rose-50 text-rose-600", dot: "bg-rose-500" },
  ]

  const jadwalHariIni = [
    { jam: "07.00 - 08.20", mapel: "Matematika", guru: "Pak Anselmus M. G., S.Pd.", status: "Selesai", iconBg: "bg-purple-100 text-purple-600" },
    { jam: "08.20 - 09.40", mapel: "Bahasa Indonesia", guru: "Ibu Maria S., M.Pd.", status: "Sedang Berlangsung", iconBg: "bg-blue-100 text-blue-600" },
    { jam: "10.00 - 11.20", mapel: "Ilmu Pengetahuan Alam", guru: "Pak Budi Santoso, S.Si.", status: "Akan Datang", iconBg: "bg-emerald-100 text-emerald-600" },
  ]

  return (
    <div className="min-h-screen bg-[#F4F3F8] flex justify-center items-center py-0 sm:py-8 font-sans antialiased selection:bg-purple-200">
      
      {/* Phone Mockup Wrapper Container (Di Desktop tampil frame iPhone manis, di HP mobile langsung 100% full) */}
      <div className="w-full max-w-[430px] min-h-screen sm:min-h-[890px] bg-[#FAF9FD] sm:rounded-[44px] shadow-2xl overflow-hidden relative border-0 sm:border-[8px] sm:border-slate-800 flex flex-col justify-between">
        
        {/* Dynamic Island / Top Speaker Bar (Mockup iPhone) */}
        <div className="hidden sm:flex justify-between items-center px-7 pt-3 pb-1 text-slate-800 text-xs font-semibold z-50">
          <span>9:41</span>
          <div className="w-24 h-5 bg-black rounded-full flex items-center justify-center">
            <div className="w-2.5 h-2.5 bg-slate-900 rounded-full ml-auto mr-2"></div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span>5G</span>
            <div className="w-5 h-2.5 border border-slate-800 rounded-sm p-0.5">
              <div className="w-full h-full bg-slate-800 rounded-2xs"></div>
            </div>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto pb-24">
          
          {/* Header Gradient Lilac Cantik */}
          <div className="bg-gradient-to-b from-[#E7DBFF] via-[#EFE6FF] to-[#FAF9FD] px-6 pt-5 pb-6">
            
            {/* Top Navigation Row (Profile, Name, Search, Bell) */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 p-0.5 shadow-md shadow-purple-200">
                    <img 
                      src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80" 
                      alt="Student" 
                      className="w-full h-full object-cover rounded-[14px]"
                    />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full"></div>
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 leading-tight">Halo, {student.nama} 👋</h2>
                  <p className="text-xs text-slate-600 font-medium">{student.kelas}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button className="w-9 h-9 rounded-full bg-white/90 shadow-sm flex items-center justify-center text-slate-700 hover:bg-white transition-all">
                  <Search className="w-4 h-4" />
                </button>
                <div className="relative">
                  <button className="w-9 h-9 rounded-full bg-white/90 shadow-sm flex items-center justify-center text-slate-700 hover:bg-white transition-all">
                    <Bell className="w-4 h-4" />
                  </button>
                  <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full"></span>
                </div>
              </div>
            </div>

            {/* Hero Welcome Card (Card Putih Lembut) */}
            <div className="mt-5 bg-white/90 backdrop-blur-md rounded-3xl p-5 shadow-sm border border-white/60 relative overflow-hidden">
              <div className="max-w-[62%] relative z-10">
                <span className="inline-block px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold tracking-wide uppercase mb-1.5">
                  Semester Ganjil
                </span>
                <h3 className="text-sm font-bold text-slate-900 leading-snug">
                  Siap Belajar Hari Ini?
                </h3>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Presensi pagi kamu sudah tercatat. Jangan lupa cek jadwal kelas 8-A.
                </p>
                <button className="mt-3.5 px-4 py-2 bg-gradient-to-r from-[#8E6CEF] to-[#7852E8] text-white text-xs font-semibold rounded-2xl shadow-md shadow-purple-200 hover:shadow-lg transition-all active:scale-95">
                  Lihat Jadwal
                </button>
              </div>

              {/* 3D Illustration Floating Element */}
              <div className="absolute right-2 -bottom-2 w-32 h-32 pointer-events-none select-none">
                <img 
                  src="https://illustrations.popertee.com/3d-education.png" 
                  onError={(e) => {
                    // Fallback visual jika link gambar butuh fallback lokal
                    e.currentTarget.style.display = 'none';
                  }}
                  alt="Illustration" 
                  className="w-full h-full object-contain"
                />
                {/* Fallback Icon jika gambar ilustrasi loading */}
                <div className="w-24 h-24 bg-gradient-to-tr from-purple-200 to-indigo-100 rounded-full flex items-center justify-center absolute right-3 bottom-4 text-purple-600 shadow-inner">
                  <GraduationCap className="w-12 h-12" />
                </div>
              </div>
            </div>

          </div>

          {/* Quick Access Section */}
          <div className="px-6 mt-1">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Akses Cepat</h4>
              <button className="text-[11px] font-semibold text-purple-600 hover:text-purple-700">Lihat Semua</button>
            </div>

            <div className="grid grid-cols-4 gap-2.5">
              {quickAccess.map((item, idx) => {
                const IconComponent = item.icon
                return (
                  <div 
                    key={idx}
                    className="bg-white rounded-2xl p-2.5 flex flex-col items-center justify-center shadow-sm border border-slate-100 hover:shadow-md transition-all cursor-pointer group active:scale-95"
                  >
                    <div className={`w-11 h-11 rounded-2xl ${item.bg} flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform`}>
                      <IconComponent className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-bold text-slate-800 text-center leading-tight">{item.label}</span>
                    <span className="text-[9px] text-slate-400 text-center mt-0.5">{item.sub}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Academic Overview (Pill Progress Bars Estetik) */}
          <div className="px-6 mt-5">
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Performa Akademik & Poin</h4>
                  <p className="text-[11px] text-slate-400">Pantau progres semester ini</p>
                </div>
                <div className="bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-xl text-[10px] font-bold text-slate-600 flex items-center gap-1">
                  Bulan Ini ▾
                </div>
              </div>

              {/* Progress 1: Kehadiran */}
              <div className="mt-4">
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" /> Kehadiran Siswa
                  </span>
                  <span className="font-bold text-blue-600 text-[11px]">{student.kehadiranPersen}%</span>
                </div>
                <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden p-0.5">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-400 to-indigo-500 rounded-full transition-all duration-700"
                    style={{ width: `${student.kehadiranPersen}%` }}
                  ></div>
                </div>
              </div>

              {/* Progress 2: Poin Positif */}
              <div className="mt-3.5">
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-500" /> Poin Apresiasi Disiplin
                  </span>
                  <span className="font-bold text-purple-600 text-[11px]">{student.poinPositif}/100 Poin</span>
                </div>
                <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden p-0.5">
                  <div 
                    className="h-full bg-gradient-to-r from-purple-400 to-[#8E6CEF] rounded-full transition-all duration-700"
                    style={{ width: `${(student.poinPositif / student.poinMax) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Today's Schedule Section */}
          <div className="px-6 mt-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Jadwal Hari Ini</h4>
              <button className="text-[11px] font-semibold text-purple-600 hover:text-purple-700">Lihat Semua</button>
            </div>

            <div className="space-y-2.5">
              {jadwalHariIni.map((jadwal, idx) => (
                <div 
                  key={idx}
                  className="bg-white rounded-2xl p-3.5 flex items-center justify-between shadow-sm border border-slate-100 hover:border-purple-200 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-2xl ${jadwal.iconBg} flex items-center justify-center`}>
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-slate-800 leading-tight">{jadwal.mapel}</h5>
                      <p className="text-[10px] text-slate-400 mt-0.5">{jadwal.guru}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-600 font-mono block">{jadwal.jam}</span>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-semibold mt-1 ${
                      jadwal.status === 'Sedang Berlangsung' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                      jadwal.status === 'Selesai' ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'
                    }`}>
                      {jadwal.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Floating Bottom Navigation Bar (Persis Seperti di Gambar) */}
        <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-100 px-6 py-3 flex items-center justify-between z-40">
          <button 
            onClick={() => setActiveBottomNav('home')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeBottomNav === 'home' ? 'text-purple-600' : 'text-slate-400'}`}
          >
            <div className={`p-1 rounded-xl ${activeBottomNav === 'home' ? 'bg-purple-100' : ''}`}>
              <Home className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold">Home</span>
          </button>

          <button 
            onClick={() => setActiveBottomNav('message')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeBottomNav === 'message' ? 'text-purple-600' : 'text-slate-400'}`}
          >
            <div className="p-1">
              <MessageSquare className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-medium">Pesan</span>
          </button>

          <button 
            onClick={() => setActiveBottomNav('calendar')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeBottomNav === 'calendar' ? 'text-purple-600' : 'text-slate-400'}`}
          >
            <div className="p-1">
              <CalendarDays className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-medium">Kalender</span>
          </button>

          <button 
            onClick={() => setActiveBottomNav('academic')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeBottomNav === 'academic' ? 'text-purple-600' : 'text-slate-400'}`}
          >
            <div className="p-1">
              <GraduationCap className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-medium">Akademik</span>
          </button>

          <button 
            onClick={() => setActiveBottomNav('profile')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeBottomNav === 'profile' ? 'text-purple-600' : 'text-slate-400'}`}
          >
            <div className="p-1">
              <User className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-medium">Profil</span>
          </button>
        </div>

      </div>

    </div>
  )
}
