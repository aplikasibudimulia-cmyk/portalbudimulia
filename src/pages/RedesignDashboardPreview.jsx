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
  ArrowUpRight
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
      status: "Hadir Tepat Waktu",
      jam: "06.42 WIB",
      metode: "QR Scanner Gerbang",
      isHadir: true
    },
    kehadiran: {
      persen: 98.6,
      hadir: 71,
      sakit: 1,
      izin: 0,
      alpha: 0
    },
    poin: {
      positif: 85,
      pelanggaran: 0,
      peringkatKelas: 3,
      totalSiswaKelas: 32
    }
  }

  const mapelBerlangsung = {
    mapel: "Bahasa Indonesia",
    jam: "08.20 - 09.40 WIB",
    guru: "Maria Fransiska, M.Pd.",
    ruang: "Ruang Kelas 8-A",
    materi: "Menulis Teks Eksplanasi Fenomena Sosial",
    sisaWaktu: "35 menit tersisa"
  }

  const jadwalHariIni = [
    { jam: "07.00 - 08.20", mapel: "Matematika", guru: "Anselmus M. Gestawan, S.Pd.", ruang: "R. 8-A", status: "selesai" },
    { jam: "08.20 - 09.40", mapel: "Bahasa Indonesia", guru: "Maria Fransiska, M.Pd.", ruang: "R. 8-A", status: "aktif" },
    { jam: "10.00 - 11.20", mapel: "Ilmu Pengetahuan Alam", guru: "Budi Santoso, M.Si.", ruang: "Lab IPA", status: "akan_datang" },
    { jam: "11.20 - 12.40", mapel: "Pendidikan Pancasila", guru: "Dra. Sri Wahyuni", ruang: "R. 8-A", status: "akan_datang" },
  ]

  const modulLayanan = [
    { id: "presensi", label: "Presensi Digital", sub: "Riwayat & Izin", icon: QrCode },
    { id: "jadwal", label: "Jadwal Pelajaran", sub: "Mingguan", icon: CalendarDays },
    { id: "poin", label: "Poin & Kedisiplinan", sub: "Buku Saku", icon: Shield },
    { id: "cbt", label: "Ujian CBT Online", sub: "Bank Soal", icon: Award },
    { id: "nilai", label: "Nilai & Rapor TP", sub: "Kurikulum Merdeka", icon: FileText },
    { id: "bk", label: "Bimbingan Konseling", sub: "Konsultasi BK", icon: Layers },
  ]

  const riwayatPoinTerbaru = [
    { tanggal: "20 Nov 2026", kategori: "Prestasi", deskripsi: "Juara 2 Olimpiade Matematika Tingkat Kota", poin: "+25" },
    { tanggal: "17 Nov 2026", kategori: "Organisasi", deskripsi: "Petugas Upacara Bendera Hari Senin", poin: "+5" },
    { tanggal: "12 Nov 2026", kategori: "Kedisiplinan", deskripsi: "Piket Kebersihan Kelas Teladan", poin: "+5" },
  ]

  const sideNavItems = [
    { id: 'home', label: 'Beranda', icon: Home },
    { id: 'presensi', label: 'Presensi Siswa', icon: QrCode },
    { id: 'jadwal', label: 'Jadwal Pelajaran', icon: CalendarDays },
    { id: 'poin', label: 'Poin & Disiplin', icon: Shield },
    { id: 'cbt', label: 'Ujian CBT', icon: Award },
    { id: 'nilai', label: 'Rapor & Capaian TP', icon: FileText },
    { id: 'bk', label: 'Konseling BK', icon: Layers },
  ]

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans antialiased text-slate-800 selection:bg-blue-100 flex flex-col">
      
      {/* Top Switcher (Controller View) */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between text-xs sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#0B2B7A]"></div>
          <span className="font-semibold text-slate-900">Portal Siswa SMP Budi Mulia</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500 text-[11px]">Sistem Informasi Akademik Terintegrasi (Enterprise Grade)</span>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          <button 
            onClick={() => setViewMode('responsive')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
              viewMode === 'responsive' 
                ? 'bg-white text-slate-900 shadow-xs font-semibold' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" /> 
            <span>Mode Layar Desktop</span>
          </button>
          <button 
            onClick={() => setViewMode('mobile_mockup')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
              viewMode === 'mobile_mockup' 
                ? 'bg-white text-slate-900 shadow-xs font-semibold' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" /> 
            <span>Mode Layar Smartphone</span>
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      <div className={`flex-1 ${viewMode === 'mobile_mockup' ? 'flex justify-center items-center py-6 px-4' : 'w-full'}`}>
        
        <div className={`w-full bg-white transition-all duration-200 ${
          viewMode === 'mobile_mockup' 
            ? 'max-w-[420px] min-h-[860px] rounded-3xl shadow-xl border border-slate-300 overflow-hidden relative flex flex-col justify-between'
            : 'flex min-h-[calc(100vh-41px)]'
        }`}>

          {/* ============================================================== */}
          {/* SIDEBAR DESKTOP (Rapi, Formal, Bersih, Sesuai Standar SaaS)     */}
          {/* ============================================================== */}
          {viewMode === 'responsive' && (
            <aside className="hidden lg:flex w-64 flex-col justify-between border-r border-slate-200 bg-[#FCFDFF] p-4 sticky top-10 h-[calc(100vh-41px)]">
              <div>
                {/* Brand Logo Resmi Budi Mulia */}
                <div className="flex items-center gap-3 px-2 py-2 mb-6 border-b border-slate-100 pb-4">
                  <div className="w-9 h-9 rounded-lg bg-[#0B2B7A] flex items-center justify-center text-white font-bold text-sm tracking-wider shadow-xs">
                    BM
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 leading-tight">SMP Budi Mulia</h3>
                    <p className="text-[11px] text-slate-500 font-medium">Portal Akademik Siswa</p>
                  </div>
                </div>

                {/* Navigasi Utama */}
                <nav className="space-y-0.5">
                  <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Navigasi Utama</p>
                  {sideNavItems.map((item) => {
                    const IconComp = item.icon
                    const isActive = activeNav === item.id
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveNav(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                          isActive 
                            ? 'bg-[#0B2B7A] text-white font-semibold' 
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        <IconComp className="w-4 h-4" />
                        <span>{item.label}</span>
                      </button>
                    )
                  })}
                </nav>
              </div>

              {/* Status Sesi Pengguna di Sidebar */}
              <div className="border border-slate-200 rounded-xl p-3 bg-white">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs">
                    AJ
                  </div>
                  <div className="overflow-hidden flex-1">
                    <p className="text-xs font-semibold text-slate-900 truncate">{student.nama}</p>
                    <p className="text-[10px] text-slate-500">NISN: {student.nisn}</p>
                  </div>
                  <button title="Keluar" className="text-slate-400 hover:text-red-600 transition-colors p-1">
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </aside>
          )}

          {/* ============================================================== */}
          {/* CONTENT WORKSPACE (Tegas, Berbasis Data, Bebas Basa-Basi)     */}
          {/* ============================================================== */}
          <div className="flex-1 flex flex-col justify-between overflow-y-auto bg-[#F8FAFC]">
            
            <div className="pb-16 lg:pb-10">
              
              {/* Header Bar */}
              <header className="bg-white border-b border-slate-200 px-6 lg:px-8 py-3.5 sticky top-0 z-30 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-sm lg:text-base font-bold text-slate-900">Dashboard Siswa</h1>
                    <span className="text-slate-300">/</span>
                    <span className="text-xs text-slate-500 font-medium">Kelas {student.kelas}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">Tahun Ajaran {student.semester} • Wali Kelas: {student.waliKelas}</p>
                </div>

                <div className="flex items-center gap-3">
                  {/* Status Presensi Hari Ini (Langsung Terbaca di Header) */}
                  <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>Presensi: <strong>{student.presensiHariIni.jam}</strong> ({student.presensiHariIni.status})</span>
                  </div>

                  <button className="relative w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50">
                    <Bell className="w-4 h-4" />
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#D31725] rounded-full"></span>
                  </button>
                </div>
              </header>

              {/* Main Body Layout */}
              <div className="px-6 lg:px-8 py-6 space-y-6 max-w-7xl mx-auto">
                
                {/* 1. Baris Metrik Indikator Utama (KPI Cards) */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  
                  {/* Card 1: Presensi Hari Ini */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                    <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
                      <span>Kehadiran Hari Ini</span>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="text-base lg:text-lg font-bold text-slate-900 mt-1">
                      {student.presensiHariIni.status}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">Tercatat pukul {student.presensiHariIni.jam}</p>
                  </div>

                  {/* Card 2: Tingkat Kehadiran Kumulatif */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                    <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
                      <span>Tingkat Kehadiran</span>
                      <Calendar className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="text-base lg:text-lg font-bold text-slate-900 mt-1">
                      {student.kehadiran.persen}%
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{student.kehadiran.hadir} Hadir • {student.kehadiran.alpha} Alpha</p>
                  </div>

                  {/* Card 3: Poin Positif */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                    <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
                      <span>Poin Prestasi</span>
                      <Sparkles className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="text-base lg:text-lg font-bold text-[#0B2B7A] mt-1">
                      +{student.poin.positif} Poin
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">Peringkat {student.poin.peringkatKelas} dari {student.poin.totalSiswaKelas} siswa</p>
                  </div>

                  {/* Card 4: Catatan Pelanggaran */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                    <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
                      <span>Poin Pelanggaran</span>
                      <Shield className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="text-base lg:text-lg font-bold text-emerald-600 mt-1">
                      0 Poin
                    </div>
                    <p className="text-[11px] text-emerald-600 font-medium mt-0.5">Status Disiplin Bersih</p>
                  </div>

                </div>

                {/* 2. Banner Informasi Sesi Belajar yang Sedang Berlangsung */}
                <div className="bg-white border-l-4 border-l-[#0B2B7A] border-y border-r border-slate-200 rounded-r-xl p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 text-[#0B2B7A] flex items-center justify-center shrink-0 mt-0.5">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-[#0B2B7A] px-2 py-0.5 rounded">
                          Sesi Belajar Aktif Sekarang
                        </span>
                        <span className="text-xs text-slate-400 font-mono">• {mapelBerlangsung.jam}</span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 mt-1">
                        {mapelBerlangsung.mapel} — {mapelBerlangsung.ruang}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Guru Pengajar: <span className="font-medium text-slate-700">{mapelBerlangsung.guru}</span> • Topik: {mapelBerlangsung.materi}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start md:self-center shrink-0">
                    <span className="text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
                      {mapelBerlangsung.sisaWaktu}
                    </span>
                  </div>
                </div>

                {/* 3. Grid Dua Kolom: Jadwal Hari Ini vs Riwayat Poin & Menu */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Kolom Kiri (2 Span): Tabel Jadwal Pelajaran Hari Ini */}
                  <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                      <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-[#FAFBFD]">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Jadwal Pelajaran Hari Ini</h4>
                          <p className="text-[11px] text-slate-400">Senin, 23 November 2026</p>
                        </div>
                        <button className="text-xs font-semibold text-[#0B2B7A] hover:underline flex items-center gap-1">
                          Lihat Jadwal Lengkap <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="divide-y divide-slate-100">
                        {jadwalHariIni.map((item, idx) => (
                          <div 
                            key={idx} 
                            className={`p-4 flex items-center justify-between text-xs transition-colors ${
                              item.status === 'aktif' ? 'bg-blue-50/40 font-medium' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <span className="font-mono text-slate-500 w-24 shrink-0">{item.jam}</span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900">{item.mapel}</span>
                                  <span className="text-[10px] text-slate-400 font-normal">({item.ruang})</span>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-0.5">{item.guru}</p>
                              </div>
                            </div>

                            <div>
                              {item.status === 'selesai' && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                                  Selesai
                                </span>
                              )}
                              {item.status === 'aktif' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-[#0B2B7A] text-white">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                  Berlangsung
                                </span>
                              )}
                              {item.status === 'akan_datang' && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-medium border border-slate-200 text-slate-500 bg-white">
                                  Akan Datang
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Modul Layanan Cepat (Compact Grid) */}
                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">Layanan Mandiri Siswa</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {modulLayanan.map((menu) => {
                          const IconComponent = menu.icon
                          return (
                            <div 
                              key={menu.id}
                              className="p-3 rounded-lg border border-slate-200 hover:border-[#0B2B7A] hover:bg-slate-50/60 transition-all cursor-pointer group flex items-start gap-3"
                            >
                              <div className="p-2 rounded-md bg-slate-100 group-hover:bg-[#0B2B7A] group-hover:text-white transition-colors text-slate-600 shrink-0">
                                <IconComponent className="w-4 h-4" />
                              </div>
                              <div className="overflow-hidden">
                                <h5 className="text-xs font-semibold text-slate-800 leading-tight group-hover:text-[#0B2B7A] transition-colors">{menu.label}</h5>
                                <p className="text-[10px] text-slate-400 mt-0.5 truncate">{menu.sub}</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Kolom Kanan (1 Span): Riwayat Poin & Pengumuman */}
                  <div className="space-y-4">
                    
                    {/* Riwayat Poin Disiplin */}
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-[#FAFBFD]">
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Riwayat Poin Terbaru</h4>
                        <button className="text-[11px] font-semibold text-[#0B2B7A] hover:underline flex items-center gap-0.5">
                          Buku Saku <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="p-4 space-y-3">
                        {riwayatPoinTerbaru.map((item, idx) => (
                          <div key={idx} className="pb-3 border-b border-slate-100 last:border-0 last:pb-0 flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                <span className="font-medium text-slate-600">{item.kategori}</span>
                                <span>•</span>
                                <span>{item.tanggal}</span>
                              </div>
                              <p className="text-xs font-medium text-slate-800 mt-0.5 leading-snug">{item.deskripsi}</p>
                            </div>
                            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded shrink-0">
                              {item.poin}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-center">
                        <button className="text-xs font-semibold text-[#0B2B7A] hover:underline">
                          + Ajukan Bukti Prestasi / Poin
                        </button>
                      </div>
                    </div>

                    {/* Informasi Wali Kelas & Kontak Darurat */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">Informasi Kelas</h4>
                      <div className="text-xs space-y-1.5 text-slate-600">
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-400">Wali Kelas</span>
                          <span className="font-semibold text-slate-800">{student.waliKelas}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100">
                          <span className="text-slate-400">Ruang Belajar</span>
                          <span className="font-semibold text-slate-800">Lantai 2 — Gedung SMP</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-slate-400">Status Akun Siswa</span>
                          <span className="font-semibold text-emerald-600">Terverifikasi Aktif</span>
                        </div>
                      </div>
                    </div>

                  </div>

                </div>

              </div>

            </div>

            {/* Bottom Nav Mobile (Bersih, Rapi, Monokromatik Navy) */}
            {viewMode === 'mobile_mockup' && (
              <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-2.5 flex items-center justify-between z-40">
                <button 
                  onClick={() => setActiveNav('home')}
                  className={`flex flex-col items-center gap-1 ${activeNav === 'home' ? 'text-[#0B2B7A] font-bold' : 'text-slate-400'}`}
                >
                  <Home className="w-5 h-5" />
                  <span className="text-[10px]">Beranda</span>
                </button>

                <button 
                  onClick={() => setActiveNav('jadwal')}
                  className={`flex flex-col items-center gap-1 ${activeNav === 'jadwal' ? 'text-[#0B2B7A] font-bold' : 'text-slate-400'}`}
                >
                  <CalendarDays className="w-5 h-5" />
                  <span className="text-[10px]">Jadwal</span>
                </button>

                <button 
                  onClick={() => setActiveNav('cbt')}
                  className={`flex flex-col items-center gap-1 ${activeNav === 'cbt' ? 'text-[#0B2B7A] font-bold' : 'text-slate-400'}`}
                >
                  <Award className="w-5 h-5" />
                  <span className="text-[10px]">Ujian</span>
                </button>

                <button 
                  onClick={() => setActiveNav('nilai')}
                  className={`flex flex-col items-center gap-1 ${activeNav === 'nilai' ? 'text-[#0B2B7A] font-bold' : 'text-slate-400'}`}
                >
                  <FileText className="w-5 h-5" />
                  <span className="text-[10px]">Nilai</span>
                </button>

                <button 
                  onClick={() => setActiveNav('home')}
                  className="flex flex-col items-center gap-1 text-slate-400"
                >
                  <User className="w-5 h-5" />
                  <span className="text-[10px]">Profil</span>
                </button>
              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  )
}
