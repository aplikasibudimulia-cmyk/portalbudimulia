import React, { useState } from 'react'
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
  MapPin
} from 'lucide-react'

export default function RedesignDashboardPreview() {
  const [viewMode, setViewMode] = useState('mobile_mockup') // default ke mobile agar Pak Ansel langsung lihat versi rapinya
  const [activeNav, setActiveNav] = useState('home')

  const student = {
    nama: "Axel Jonathan",
    nisn: "0089218291",
    kelas: "8-A",
    waliKelas: "Anselmus Mediari Gestawan, S.Pd.",
    semester: "Ganjil 2026/2027",
    presensi: {
      status: "Hadir Tepat Waktu",
      jam: "06.42 WIB",
      tanggal: "Senin, 23 Nov 2026",
      isHadir: true
    },
    kehadiranPersen: 98,
    poinPositif: 85,
    poinPelanggaran: 0
  }

  const mapelAktif = {
    nama: "Bahasa Indonesia",
    jam: "08.20 - 09.40 WIB",
    guru: "Maria Fransiska, M.Pd.",
    ruang: "Kelas 8-A",
    topik: "Teks Eksplanasi Fenomena Sosial",
    status: "Sedang Berlangsung"
  }

  const jadwalHariIni = [
    { jam: "07.00 - 08.20", mapel: "Matematika", guru: "Anselmus M. Gestawan, S.Pd.", ruang: "R. 8-A", status: "Selesai" },
    { jam: "08.20 - 09.40", mapel: "Bahasa Indonesia", guru: "Maria Fransiska, M.Pd.", ruang: "R. 8-A", status: "Berlangsung" },
    { jam: "10.00 - 11.20", mapel: "Ilmu Pengetahuan Alam", guru: "Budi Santoso, M.Si.", ruang: "Lab IPA", status: "Akan Datang" },
    { jam: "11.20 - 12.40", mapel: "Pendidikan Pancasila", guru: "Dra. Sri Wahyuni", ruang: "R. 8-A", status: "Akan Datang" },
  ]

  const menuLayanan = [
    { id: "presensi", label: "Presensi QR", desc: "Scan Masuk/Pulang", icon: QrCode, bg: "bg-blue-50 text-[#0B2B7A] border-blue-100" },
    { id: "jadwal", label: "Jadwal Pelajaran", desc: "Senin s/d Jumat", icon: CalendarDays, bg: "bg-indigo-50 text-indigo-700 border-indigo-100" },
    { id: "poin", label: "Buku Saku Poin", desc: "Prestasi & Disiplin", icon: Shield, bg: "bg-amber-50 text-amber-800 border-amber-100" },
    { id: "cbt", label: "Ujian CBT Online", desc: "Bank Soal Ujian", icon: Award, bg: "bg-rose-50 text-rose-700 border-rose-100" },
    { id: "nilai", label: "Rapor & Capaian", desc: "Nilai Semester", icon: FileText, bg: "bg-emerald-50 text-emerald-800 border-emerald-100" },
    { id: "bk", label: "Konseling BK", desc: "Konsultasi Guru BK", icon: Layers, bg: "bg-slate-50 text-slate-700 border-slate-200" },
  ]

  const riwayatPoin = [
    { tgl: "20 Nov 2026", judul: "Juara 2 Olimpiade Matematika", kat: "Prestasi", poin: "+25" },
    { tgl: "17 Nov 2026", judul: "Petugas Pengibar Bendera Upacara", kat: "Organisasi", poin: "+5" },
    { tgl: "12 Nov 2026", judul: "Piket Kelas Bersih & Rapi", kat: "Kedisiplinan", poin: "+5" },
  ]

  return (
    <div className="min-h-screen bg-[#EEF2F6] font-sans antialiased text-slate-800 flex flex-col">
      
      {/* Top Controller Switcher (Untuk Bapak uji coba Desktop vs HP) */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between text-xs sticky top-0 z-50 shadow-2xs">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#0B2B7A]"></div>
          <span className="font-bold text-[#0B2B7A]">SIAKAD Budi Mulia</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500 font-medium">Responsive Layout</span>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded border border-slate-200">
          <button 
            onClick={() => setViewMode('mobile_mockup')}
            className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-semibold transition-all ${
              viewMode === 'mobile_mockup' 
                ? 'bg-[#0B2B7A] text-white shadow-2xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" /> 
            <span>Tampilan HP (Mobile)</span>
          </button>
          <button 
            onClick={() => setViewMode('responsive')}
            className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-semibold transition-all ${
              viewMode === 'responsive' 
                ? 'bg-[#0B2B7A] text-white shadow-2xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" /> 
            <span>Tampilan Web PC</span>
          </button>
        </div>
      </div>

      {/* Viewport Wrapper */}
      <div className={`flex-1 ${viewMode === 'mobile_mockup' ? 'flex justify-center items-center py-6 px-3' : 'w-full'}`}>
        
        {/* Frame Kontainer */}
        <div className={`w-full bg-[#F4F6F9] transition-all duration-200 ${
          viewMode === 'mobile_mockup' 
            ? 'max-w-[412px] h-[840px] rounded-3xl shadow-2xl border-4 border-slate-800 overflow-hidden relative flex flex-col justify-between'
            : 'flex min-h-[calc(100vh-41px)]'
        }`}>

          {/* ============================================================== */}
          {/* SIDEBAR DESKTOP (HANYA MUNCUL DI DESKTOP WORKSPACE)            */}
          {/* ============================================================== */}
          {viewMode === 'responsive' && (
            <aside className="hidden lg:flex w-64 flex-col justify-between border-r border-slate-200 bg-white p-4 sticky top-10 h-[calc(100vh-41px)] shrink-0">
              <div>
                <div className="flex items-center gap-3 px-2 py-2 mb-6 border-b border-slate-100 pb-4">
                  <div className="w-9 h-9 rounded-lg bg-[#0B2B7A] flex items-center justify-center text-white font-extrabold text-xs">
                    BM
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 leading-tight">SMP BUDI MULIA</h3>
                    <p className="text-[10px] text-slate-400 font-mono">PORTAL AKADEMIK</p>
                  </div>
                </div>

                <nav className="space-y-1">
                  <span className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Navigasi Utama</span>
                  {[
                    { id: 'home', label: 'Ringkasan Beranda', icon: Home },
                    { id: 'presensi', label: 'Presensi Digital', icon: QrCode },
                    { id: 'jadwal', label: 'Jadwal Pelajaran', icon: CalendarDays },
                    { id: 'poin', label: 'Buku Saku Poin', icon: Shield },
                    { id: 'cbt', label: 'Ujian Komputer (CBT)', icon: Award },
                    { id: 'nilai', label: 'Rapor & Capaian TP', icon: FileText },
                    { id: 'bk', label: 'Bimbingan Konseling', icon: Layers },
                  ].map((m) => {
                    const IconC = m.icon
                    const isActive = activeNav === m.id
                    return (
                      <button
                        key={m.id}
                        onClick={() => setActiveNav(m.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                          isActive ? 'bg-[#0B2B7A] text-white' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <IconC className="w-4 h-4" />
                        <span>{m.label}</span>
                      </button>
                    )
                  })}
                </nav>
              </div>

              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                <p className="text-xs font-bold text-slate-900 truncate">{student.nama}</p>
                <p className="text-[10px] text-slate-500 font-mono">NISN: {student.nisn}</p>
              </div>
            </aside>
          )}

          {/* ============================================================== */}
          {/* BODY UTAMA (100% NATIVE MOBILE PADA HP, LEBAR LEGA PADA PC)   */}
          {/* ============================================================== */}
          <div className="flex-1 flex flex-col justify-between overflow-y-auto bg-[#F4F6F9]">
            
            <div className="pb-20 lg:pb-8">
              
              {/* Top Header Mobile / Web */}
              <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#0B2B7A] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                    AJ
                  </div>
                  <div className="overflow-hidden">
                    <h2 className="text-xs font-bold text-slate-900 truncate leading-tight">{student.nama}</h2>
                    <p className="text-[10px] text-slate-500 font-medium">Kelas {student.kelas} • NISN: {student.nisn}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50">
                    <Bell className="w-4 h-4" />
                  </button>
                </div>
              </header>

              {/* Main Content Area */}
              <div className="p-4 space-y-3.5 max-w-5xl mx-auto">
                
                {/* 1. KARTU PRESENSI HARI INI (Fokus Utama Siswa Setiap Hari) */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Status Kehadiran Hari Ini</span>
                    <span className="text-[11px] font-medium text-slate-400">{student.presensi.tanggal}</span>
                  </div>

                  <div className="pt-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900 leading-tight">
                          {student.presensi.status}
                        </div>
                        <p className="text-[11px] text-emerald-700 font-medium mt-0.5">
                          Tercatat pukul {student.presensi.jam}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold text-[#0B2B7A] bg-blue-50 border border-blue-200 px-2 py-1 rounded">
                        {student.kehadiranPersen}% Total
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. DUA KARTU RINGKASAN: POIN PRESTASI & DISIPLIN (BERDAMPINGAN 2 KOLOM PAS DI HP) */}
                <div className="grid grid-cols-2 gap-3">
                  
                  {/* Poin Prestasi */}
                  <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
                    <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                      <span>Poin Prestasi</span>
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    </div>
                    <div className="text-lg font-bold text-[#0B2B7A] mt-1.5">
                      +{student.poinPositif}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5 truncate">Peringkat 3 di Kelas 8-A</p>
                  </div>

                  {/* Poin Pelanggaran */}
                  <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
                    <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                      <span>Pelanggaran</span>
                      <Shield className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                    <div className="text-lg font-bold text-emerald-600 mt-1.5">
                      {student.poinPelanggaran} Poin
                    </div>
                    <p className="text-[10px] text-emerald-700 font-medium mt-0.5 truncate">Buku Saku Bersih</p>
                  </div>

                </div>

                {/* 3. SESI PEMBELAJARAN YANG SEDANG BERLANGSUNG (LIVE CLASS) */}
                <div className="bg-white border-l-4 border-l-[#0B2B7A] border-y border-r border-slate-200 rounded-r-xl p-3.5 shadow-2xs">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span className="text-[10px] font-bold text-[#0B2B7A] uppercase tracking-wider">Jam Pelajaran Aktif</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {mapelAktif.jam}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 mt-1">
                    {mapelAktif.nama}
                  </h3>
                  <div className="text-[11px] text-slate-600 mt-0.5 flex items-center gap-2">
                    <span>Guru: <strong>{mapelAktif.guru}</strong></span>
                    <span>•</span>
                    <span className="text-slate-400 font-mono">{mapelAktif.ruang}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 bg-slate-50 p-1.5 rounded border border-slate-100">
                    Materi: {mapelAktif.topik}
                  </p>
                </div>

                {/* 4. JADWAL MATA PELAJARAN HARI INI (LIST CARD KHUSUS MOBILE, BUKAN TABEL GEPENG) */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <div className="px-4 py-2.5 bg-[#FAFBFD] border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Jadwal Kelas 8-A Hari Ini</span>
                    <button className="text-[11px] font-bold text-[#0B2B7A] hover:underline">
                      Jadwal Mingguan →
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {jadwalHariIni.map((item, idx) => (
                      <div 
                        key={idx} 
                        className={`p-3.5 flex items-center justify-between text-xs ${
                          item.status === 'Berlangsung' ? 'bg-blue-50/50' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg shrink-0 ${
                            item.status === 'Berlangsung' 
                              ? 'bg-[#0B2B7A] text-white' 
                              : item.status === 'Selesai'
                              ? 'bg-slate-100 text-slate-500'
                              : 'bg-slate-100 text-[#0B2B7A]'
                          }`}>
                            <BookOpen className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-slate-900">{item.mapel}</h4>
                              <span className="text-[10px] text-slate-400 font-mono">({item.ruang})</span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">{item.guru}</p>
                            <span className="text-[10px] font-mono text-slate-400 mt-0.5 block">{item.jam}</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          {item.status === 'Selesai' && (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-500 font-medium">
                              Selesai
                            </span>
                          )}
                          {item.status === 'Berlangsung' && (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-[#0B2B7A] text-white font-bold">
                              Berlangsung
                            </span>
                          )}
                          {item.status === 'Akan Datang' && (
                            <span className="px-2 py-0.5 rounded text-[10px] text-slate-400 border border-slate-200 font-medium">
                              Nanti
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 5. MENU LAYANAN SISWA (GRID 2 KOLOM PAS DENGAN JARI DI HP) */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-3">
                    Menu Layanan Mandiri
                  </span>

                  <div className="grid grid-cols-2 gap-2.5">
                    {menuLayanan.map((m) => {
                      const IconComp = m.icon
                      return (
                        <div 
                          key={m.id}
                          className="p-3 rounded-lg border border-slate-200 hover:border-[#0B2B7A] hover:bg-slate-50 transition-colors cursor-pointer flex flex-col justify-between"
                        >
                          <div className={`w-8 h-8 rounded-lg ${m.bg} flex items-center justify-center mb-2 border shrink-0`}>
                            <IconComp className="w-4 h-4" />
                          </div>
                          <div>
                            <h5 className="text-xs font-bold text-slate-900 leading-tight">{m.label}</h5>
                            <p className="text-[10px] text-slate-400 mt-0.5">{m.desc}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 6. RIWAYAT CATATAN POIN TERBARU */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <div className="px-4 py-2.5 bg-[#FAFBFD] border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Aktivitas Poin Terkini</span>
                    <button className="text-[11px] font-bold text-[#0B2B7A] hover:underline">
                      Buku Saku →
                    </button>
                  </div>

                  <div className="p-3.5 divide-y divide-slate-100">
                    {riwayatPoin.map((p, idx) => (
                      <div key={idx} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                            <span>{p.tgl}</span>
                            <span>•</span>
                            <span className="font-semibold text-slate-600">{p.kat}</span>
                          </div>
                          <p className="font-semibold text-slate-800 mt-0.5 leading-snug">{p.judul}</p>
                        </div>
                        <span className="font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px] shrink-0">
                          {p.poin}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="p-3 bg-slate-50 border-t border-slate-200 text-center">
                    <button className="w-full py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-xs font-semibold text-slate-700 rounded transition-colors">
                      + Ajukan Bukti Prestasi Siswa
                    </button>
                  </div>
                </div>

              </div>

            </div>

            {/* Bottom Navigation Bar HP (Native Mobile Standard) */}
            <nav className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-2 flex items-center justify-around z-40">
              <button 
                onClick={() => setActiveNav('home')}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg ${
                  activeNav === 'home' ? 'text-[#0B2B7A] font-bold' : 'text-slate-400'
                }`}
              >
                <Home className="w-4 h-4" />
                <span className="text-[10px]">Beranda</span>
              </button>

              <button 
                onClick={() => setActiveNav('jadwal')}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg ${
                  activeNav === 'jadwal' ? 'text-[#0B2B7A] font-bold' : 'text-slate-400'
                }`}
              >
                <CalendarDays className="w-4 h-4" />
                <span className="text-[10px]">Jadwal</span>
              </button>

              <button 
                onClick={() => setActiveNav('cbt')}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg ${
                  activeNav === 'cbt' ? 'text-[#0B2B7A] font-bold' : 'text-slate-400'
                }`}
              >
                <Award className="w-4 h-4" />
                <span className="text-[10px]">Ujian CBT</span>
              </button>

              <button 
                onClick={() => setActiveNav('nilai')}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg ${
                  activeNav === 'nilai' ? 'text-[#0B2B7A] font-bold' : 'text-slate-400'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span className="text-[10px]">Rapor</span>
              </button>
            </nav>

          </div>

        </div>

      </div>

    </div>
  )
}
