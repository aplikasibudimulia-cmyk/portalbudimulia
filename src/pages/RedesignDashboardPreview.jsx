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
  ChevronRight,
  QrCode,
  Laptop,
  Smartphone,
  Layers,
  LogOut,
  AlertCircle,
  FileText,
  Shield,
  ArrowUpRight,
  MoreVertical,
  Activity
} from 'lucide-react'

export default function RedesignDashboardPreview() {
  const [viewMode, setViewMode] = useState('responsive') // 'responsive' | 'mobile_mockup'
  const [activeNav, setActiveNav] = useState('home')

  // Data Akademik Nyata Siswa
  const student = {
    nama: "Axel Jonathan",
    nisn: "0089218291",
    kelas: "8-A",
    waliKelas: "Anselmus Mediari Gestawan, S.Pd.",
    semester: "Ganjil 2026/2027",
    presensiHariIni: {
      status: "Hadir",
      detail: "Tepat Waktu (06.42 WIB)",
      metode: "Gerbang Utama",
      kodeStatus: "H"
    },
    kehadiran: {
      persentase: "98.6%",
      hadir: 71,
      izin: 1,
      sakit: 0,
      alpha: 0,
      totalHari: 72
    },
    poin: {
      positif: 85,
      pelanggaran: 0,
      peringkat: 3,
      totalSiswa: 32
    }
  }

  const mapelAktif = {
    nama: "Bahasa Indonesia",
    jam: "08.20 - 09.40",
    guru: "Maria Fransiska, M.Pd.",
    ruangan: "R. 8-A",
    kd: "TP 3.4 — Teks Eksplanasi",
    sisaMenit: "35m tersisa"
  }

  const jadwalHariIni = [
    { jam: "07.00 - 08.20", mapel: "Matematika", guru: "Anselmus M. Gestawan, S.Pd.", ruang: "R. 8-A", status: "Selesai" },
    { jam: "08.20 - 09.40", mapel: "Bahasa Indonesia", guru: "Maria Fransiska, M.Pd.", ruang: "R. 8-A", status: "Sedang Berlangsung" },
    { jam: "10.00 - 11.20", mapel: "Ilmu Pengetahuan Alam", guru: "Budi Santoso, M.Si.", ruang: "Lab IPA", status: "Akan Datang" },
    { jam: "11.20 - 12.40", mapel: "Pendidikan Pancasila", guru: "Dra. Sri Wahyuni", ruang: "R. 8-A", status: "Akan Datang" },
  ]

  const modulLayanan = [
    { id: "presensi", label: "Presensi Digital", desc: "Riwayat & Pengajuan Izin", icon: QrCode },
    { id: "jadwal", label: "Jadwal Pelajaran", desc: "Kalender Akademik", icon: CalendarDays },
    { id: "poin", label: "Buku Saku Poin", desc: "Catatan Prestasi & Disiplin", icon: Shield },
    { id: "cbt", label: "Ujian CBT Online", desc: "Sesi Ujian Aktif & Riwayat", icon: Award },
    { id: "nilai", label: "Rapor & Capaian TP", desc: "Penilaian Kurikulum Merdeka", icon: FileText },
    { id: "bk", label: "Layanan BK", desc: "Jadwal Konsultasi Guru BK", icon: Layers },
  ]

  const riwayatPoin = [
    { tgl: "20/11/2026", ket: "Juara 2 Olimpiade Matematika Kota", kat: "Prestasi", poin: "+25" },
    { tgl: "17/11/2026", ket: "Petugas Pengibar Bendera Upacara", kat: "Organisasi", poin: "+5" },
    { tgl: "12/11/2026", ket: "Piket Kebersihan Kelas Teladan", kat: "Disiplin", poin: "+5" },
  ]

  const sideNavItems = [
    { id: 'home', label: 'Ringkasan Akademik', icon: Home },
    { id: 'presensi', label: 'Presensi Siswa', icon: QrCode },
    { id: 'jadwal', label: 'Jadwal Kelas', icon: CalendarDays },
    { id: 'poin', label: 'Buku Saku & Poin', icon: Shield },
    { id: 'cbt', label: 'Ujian Komputer (CBT)', icon: Award },
    { id: 'nilai', label: 'Transkrip Nilai & TP', icon: FileText },
    { id: 'bk', label: 'Bimbingan Konseling', icon: Layers },
  ]

  return (
    <div className="min-h-screen bg-[#F4F6F9] font-sans antialiased text-slate-800 flex flex-col">
      
      {/* Top Controller Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between text-xs sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#0B2B7A]">SIAKAD SMP Budi Mulia</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500 font-medium">Enterprise Portal Layout</span>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded border border-slate-200">
          <button 
            onClick={() => setViewMode('responsive')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all ${
              viewMode === 'responsive' 
                ? 'bg-white text-slate-900 shadow-2xs border border-slate-200' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" /> 
            <span>Desktop Workspace</span>
          </button>
          <button 
            onClick={() => setViewMode('mobile_mockup')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all ${
              viewMode === 'mobile_mockup' 
                ? 'bg-white text-slate-900 shadow-2xs border border-slate-200' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" /> 
            <span>Mobile Device</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className={`flex-1 ${viewMode === 'mobile_mockup' ? 'flex justify-center items-center py-6 px-4' : 'w-full'}`}>
        
        <div className={`w-full bg-white transition-all duration-200 ${
          viewMode === 'mobile_mockup' 
            ? 'max-w-[420px] min-h-[850px] rounded-2xl shadow-xl border border-slate-300 overflow-hidden relative flex flex-col justify-between'
            : 'flex min-h-[calc(100vh-41px)]'
        }`}>

          {/* ============================================================== */}
          {/* SIDEBAR DESKTOP (Struktur Tegas, Kompak, Standar Software)      */}
          {/* ============================================================== */}
          {viewMode === 'responsive' && (
            <aside className="hidden lg:flex w-60 flex-col justify-between border-r border-slate-200 bg-[#FAFAFA] p-3.5 sticky top-10 h-[calc(100vh-41px)] shrink-0">
              <div>
                {/* School Header */}
                <div className="flex items-center gap-2.5 px-2 py-2 mb-4 border-b border-slate-200 pb-3">
                  <div className="w-8 h-8 rounded bg-[#0B2B7A] flex items-center justify-center text-white font-extrabold text-xs tracking-wider">
                    BM
                  </div>
                  <div className="overflow-hidden">
                    <h3 className="text-xs font-bold text-slate-900 leading-tight">SMP BUDI MULIA</h3>
                    <p className="text-[10px] text-slate-500 font-mono">PORTAL AKADEMIK</p>
                  </div>
                </div>

                {/* Nav Items */}
                <nav className="space-y-0.5">
                  <span className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Menu Siswa</span>
                  {sideNavItems.map((item) => {
                    const IconComp = item.icon
                    const isActive = activeNav === item.id
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveNav(item.id)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-xs font-medium transition-colors ${
                          isActive 
                            ? 'bg-[#0B2B7A] text-white font-semibold' 
                            : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
                        }`}
                      >
                        <IconComp className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    )
                  })}
                </nav>
              </div>

              {/* User Session Footer */}
              <div className="border border-slate-200 rounded p-2.5 bg-white">
                <div className="flex items-center justify-between">
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-slate-900 truncate">{student.nama}</p>
                    <p className="text-[10px] text-slate-500 font-mono">NISN: {student.nisn}</p>
                  </div>
                  <button title="Keluar" className="text-slate-400 hover:text-red-600 p-1">
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </aside>
          )}

          {/* ============================================================== */}
          {/* MAIN WORKSPACE (Card Profesional Presisi: 6-8px Border Radius) */}
          {/* ============================================================== */}
          <div className="flex-1 flex flex-col justify-between overflow-y-auto bg-[#F4F6F9]">
            
            <div className="pb-16 lg:pb-8">
              
              {/* Workspace Header Toolbar */}
              <header className="bg-white border-b border-slate-200 px-6 py-3 sticky top-0 z-30 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">Dashboard Siswa</span>
                    <span className="text-slate-300">•</span>
                    <span className="text-xs text-slate-600 font-medium">Kelas {student.kelas}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Semester {student.semester} — Wali Kelas: {student.waliKelas}
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                    <span className="font-semibold">Hadir Hari Ini: {student.presensiHariIni.detail}</span>
                  </div>

                  <button className="w-8 h-8 rounded border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50">
                    <Bell className="w-4 h-4" />
                  </button>
                </div>
              </header>

              {/* Main Content Body */}
              <div className="px-6 py-5 space-y-4 max-w-7xl mx-auto">
                
                {/* 1. ROW KPI CARD METRIC (Clean Enterprise Box) */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                  
                  {/* Card 1: Presensi Status */}
                  <div className="bg-white border border-slate-200 rounded p-4 shadow-2xs">
                    <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
                      <span>Status Presensi</span>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="mt-2 text-xl font-bold text-slate-900">
                      {student.presensiHariIni.status}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-1 font-mono">
                      <span>{student.presensiHariIni.detail}</span>
                    </div>
                  </div>

                  {/* Card 2: Kehadiran Kumulatif */}
                  <div className="bg-white border border-slate-200 rounded p-4 shadow-2xs">
                    <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
                      <span>Persentase Kehadiran</span>
                      <Calendar className="w-4 h-4 text-[#0B2B7A]" />
                    </div>
                    <div className="mt-2 text-xl font-bold text-slate-900">
                      {student.kehadiran.persentase}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-1">
                      <span>{student.kehadiran.hadir} Hadir</span>
                      <span>•</span>
                      <span>{student.kehadiran.izin} Izin</span>
                      <span>•</span>
                      <span className="text-emerald-600 font-semibold">{student.kehadiran.alpha} Alpha</span>
                    </div>
                  </div>

                  {/* Card 3: Poin Disiplin & Prestasi */}
                  <div className="bg-white border border-slate-200 rounded p-4 shadow-2xs">
                    <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
                      <span>Poin Prestasi</span>
                      <Sparkles className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="mt-2 text-xl font-bold text-[#0B2B7A]">
                      +{student.poin.positif}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      Peringkat <strong className="text-slate-800">{student.poin.peringkat}</strong> dari {student.poin.totalSiswa} siswa kelas
                    </div>
                  </div>

                  {/* Card 4: Pelanggaran */}
                  <div className="bg-white border border-slate-200 rounded p-4 shadow-2xs">
                    <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
                      <span>Poin Pelanggaran</span>
                      <Shield className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="mt-2 text-xl font-bold text-slate-900">
                      {student.poin.pelanggaran}
                    </div>
                    <div className="mt-1 text-[11px] text-emerald-600 font-medium">
                      Buku Saku Bersih
                    </div>
                  </div>

                </div>

                {/* 2. LIVE ACTIVE CLASS SESSION (Banner Flat Bergaris Tajam) */}
                <div className="bg-white border border-slate-200 rounded shadow-2xs overflow-hidden">
                  <div className="bg-[#FAFBFD] px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Sesi Pembelajaran Berlangsung</span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      {mapelAktif.sisaMenit}
                    </span>
                  </div>

                  <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900">{mapelAktif.nama}</h3>
                        <span className="text-xs text-slate-400 font-mono">({mapelAktif.ruangan})</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        Guru: <strong className="text-slate-800">{mapelAktif.guru}</strong> • Jam: <span className="font-mono">{mapelAktif.jam} WIB</span>
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Materi: {mapelAktif.kd}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-center">
                      <button className="px-3 py-1.5 bg-[#0B2B7A] text-white text-xs font-semibold rounded hover:bg-[#08205C] transition-colors">
                        Buka Materi & CBT
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3. TWO-COLUMN SPLIT: JADWAL & MODUL */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  
                  {/* Left Column (2 Span): Tabel Jadwal Harian Resmi */}
                  <div className="lg:col-span-2 space-y-4">
                    
                    <div className="bg-white border border-slate-200 rounded shadow-2xs overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-slate-200 bg-[#FAFBFD] flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Jadwal Mata Pelajaran Hari Ini</span>
                        <span className="text-[11px] text-slate-500 font-medium">Senin, 23 Nov 2026</span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-[#F8FAFC] border-b border-slate-200 text-slate-500 uppercase text-[10px] font-semibold">
                            <tr>
                              <th className="px-4 py-2.5">Waktu</th>
                              <th className="px-4 py-2.5">Mata Pelajaran</th>
                              <th className="px-4 py-2.5">Guru Pengampu</th>
                              <th className="px-4 py-2.5">Ruang</th>
                              <th className="px-4 py-2.5 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {jadwalHariIni.map((row, idx) => (
                              <tr key={idx} className={row.status === 'Sedang Berlangsung' ? 'bg-blue-50/50 font-medium' : 'hover:bg-slate-50/70'}>
                                <td className="px-4 py-3 font-mono text-slate-600">{row.jam}</td>
                                <td className="px-4 py-3 font-bold text-slate-900">{row.mapel}</td>
                                <td className="px-4 py-3 text-slate-600">{row.guru}</td>
                                <td className="px-4 py-3 text-slate-500 font-mono">{row.ruang}</td>
                                <td className="px-4 py-3 text-right">
                                  {row.status === 'Selesai' && (
                                    <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 border border-slate-200">
                                      Selesai
                                    </span>
                                  )}
                                  {row.status === 'Sedang Berlangsung' && (
                                    <span className="px-2 py-0.5 rounded text-[10px] bg-[#0B2B7A] text-white font-bold">
                                      Berlangsung
                                    </span>
                                  )}
                                  {row.status === 'Akan Datang' && (
                                    <span className="px-2 py-0.5 rounded text-[10px] text-slate-400 border border-slate-200">
                                      Akan Datang
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Layanan Terintegrasi Siswa */}
                    <div className="bg-white border border-slate-200 rounded p-4 shadow-2xs">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Modul Layanan Mandiri</span>
                        <span className="text-[11px] text-slate-400">Portal Siswa</span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {modulLayanan.map((m) => {
                          const IconC = m.icon
                          return (
                            <div 
                              key={m.id}
                              className="p-3 border border-slate-200 rounded hover:border-[#0B2B7A] hover:bg-slate-50 transition-all cursor-pointer group flex flex-col justify-between"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="p-1.5 rounded bg-slate-100 text-[#0B2B7A] group-hover:bg-[#0B2B7A] group-hover:text-white transition-colors">
                                  <IconC className="w-4 h-4" />
                                </div>
                                <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-[#0B2B7A]" />
                              </div>
                              <div>
                                <h5 className="text-xs font-bold text-slate-900 leading-tight group-hover:text-[#0B2B7A]">{m.label}</h5>
                                <p className="text-[10px] text-slate-400 mt-0.5">{m.desc}</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                  </div>

                  {/* Right Column (1 Span): Poin Log & Info */}
                  <div className="space-y-4">
                    
                    {/* Riwayat Poin Disiplin & Prestasi */}
                    <div className="bg-white border border-slate-200 rounded shadow-2xs overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-slate-200 bg-[#FAFBFD] flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Catatan Poin Terakhir</span>
                        <button className="text-[11px] font-bold text-[#0B2B7A] hover:underline">
                          Lihat Buku Saku →
                        </button>
                      </div>

                      <div className="p-3.5 divide-y divide-slate-100">
                        {riwayatPoin.map((item, idx) => (
                          <div key={idx} className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3 text-xs">
                            <div>
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                                <span>{item.tgl}</span>
                                <span>•</span>
                                <span className="font-semibold text-slate-600">{item.kat}</span>
                              </div>
                              <p className="font-medium text-slate-800 mt-0.5 leading-snug">{item.ket}</p>
                            </div>
                            <span className="font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[11px] shrink-0">
                              {item.poin}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="p-3 bg-slate-50 border-t border-slate-200 text-center">
                        <button className="w-full py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-xs font-semibold text-slate-700 rounded transition-colors">
                          + Ajukan Bukti Prestasi
                        </button>
                      </div>
                    </div>

                    {/* Informasi Akademik */}
                    <div className="bg-white border border-slate-200 rounded p-4 shadow-2xs">
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block pb-2 border-b border-slate-100 mb-2">
                        Data Administrasi
                      </span>
                      <dl className="text-xs space-y-1.5">
                        <div className="flex justify-between py-1 border-b border-slate-50">
                          <dt className="text-slate-400">Tahun Ajaran</dt>
                          <dd className="font-semibold text-slate-800">2026/2027 Ganjil</dd>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-50">
                          <dt className="text-slate-400">Wali Kelas</dt>
                          <dd className="font-semibold text-slate-800">{student.waliKelas}</dd>
                        </div>
                        <div className="flex justify-between py-1">
                          <dt className="text-slate-400">Total Kredit Poin</dt>
                          <dd className="font-mono font-bold text-[#0B2B7A]">85 Poin</dd>
                        </div>
                      </dl>
                    </div>

                  </div>

                </div>

              </div>

            </div>

            {/* Bottom Nav Mobile */}
            {viewMode === 'mobile_mockup' && (
              <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-2 flex items-center justify-between z-40">
                <button 
                  onClick={() => setActiveNav('home')}
                  className={`flex flex-col items-center gap-1 ${activeNav === 'home' ? 'text-[#0B2B7A] font-bold' : 'text-slate-400'}`}
                >
                  <Home className="w-4 h-4" />
                  <span className="text-[10px]">Ringkasan</span>
                </button>

                <button 
                  onClick={() => setActiveNav('jadwal')}
                  className={`flex flex-col items-center gap-1 ${activeNav === 'jadwal' ? 'text-[#0B2B7A] font-bold' : 'text-slate-400'}`}
                >
                  <CalendarDays className="w-4 h-4" />
                  <span className="text-[10px]">Jadwal</span>
                </button>

                <button 
                  onClick={() => setActiveNav('cbt')}
                  className={`flex flex-col items-center gap-1 ${activeNav === 'cbt' ? 'text-[#0B2B7A] font-bold' : 'text-slate-400'}`}
                >
                  <Award className="w-4 h-4" />
                  <span className="text-[10px]">CBT</span>
                </button>

                <button 
                  onClick={() => setActiveNav('nilai')}
                  className={`flex flex-col items-center gap-1 ${activeNav === 'nilai' ? 'text-[#0B2B7A] font-bold' : 'text-slate-400'}`}
                >
                  <FileText className="w-4 h-4" />
                  <span className="text-[10px]">Rapor</span>
                </button>
              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  )
}
