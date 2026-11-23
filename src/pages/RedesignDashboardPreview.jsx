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
  ArrowLeft,
  ChevronLeft
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
  const [viewMode, setViewMode] = useState('mobile_mockup') // 'mobile_mockup' | 'responsive'
  const [activeMenu, setActiveMenu] = useState(null) // null = Beranda, atau 'PRESENSI', 'POIN', 'JADWAL', 'CBT', 'NILAI', 'BK', 'PROFIL'

  // Ambil Data Siswa yang Sedang Login di Browser atau Fallback Siswa Realistis
  const [student, setStudent] = useState(() => {
    try {
      const raw = localStorage.getItem('siswa_session')
      if (raw) return JSON.parse(raw)
    } catch (e) {}
    return {
      nama: "Axel Jonathan",
      nisn: "0089218291",
      kelas: "8-A",
      tahun_ajaran: "2026/2027 Ganjil",
      tahun_ajaran_id: "ta-2026-ganjil"
    }
  })

  // Data Statistik Riil dari Supabase
  const [stats, setStats] = useState({
    kehadiranPersen: 98,
    presensiHariIni: "Sudah Hadir (06.42 WIB)",
    poinPositif: 85,
    poinPelanggaran: 0
  })

  // Load Poin Riil dari Database jika ada NISN
  useEffect(() => {
    async function loadRealStats() {
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
    loadRealStats()
  }, [student?.nisn])

  const menuLayanan = [
    { id: "PRESENSI", label: "Presensi Digital", desc: "Scan QR & Riwayat", icon: QrCode, bg: "bg-blue-50 text-[#0B2B7A] border-blue-100" },
    { id: "JADWAL", label: "Jadwal Pelajaran", desc: "Jadwal Kelas " + (student?.kelas || "8-A"), icon: CalendarDays, bg: "bg-indigo-50 text-indigo-700 border-indigo-100" },
    { id: "POIN", label: "Buku Saku Poin", desc: "Apresiasi & Disiplin", icon: Shield, bg: "bg-amber-50 text-amber-800 border-amber-100" },
    { id: "CBT", label: "Ujian CBT Online", desc: "Bank Soal & Penilaian", icon: Award, bg: "bg-rose-50 text-rose-700 border-rose-100" },
    { id: "NILAI", label: "Rapor & Nilai TP", desc: "Kurikulum Merdeka", icon: FileText, bg: "bg-emerald-50 text-emerald-800 border-emerald-100" },
    { id: "BK", label: "Konseling BK", desc: "Bimbingan Siswa", icon: Layers, bg: "bg-slate-50 text-slate-700 border-slate-200" },
  ]

  const jadwalHariIni = [
    { jam: "07.00 - 08.20", mapel: "Matematika", guru: "Anselmus M. Gestawan, S.Pd.", ruang: "R. " + (student?.kelas || "8-A"), status: "Selesai" },
    { jam: "08.20 - 09.40", mapel: "Bahasa Indonesia", guru: "Maria Fransiska, M.Pd.", ruang: "R. " + (student?.kelas || "8-A"), status: "Berlangsung" },
    { jam: "10.00 - 11.20", mapel: "Ilmu Pengetahuan Alam", guru: "Budi Santoso, M.Si.", ruang: "Lab IPA", status: "Akan Datang" },
  ]

  return (
    <div className="min-h-screen bg-[#EEF2F6] font-sans antialiased text-slate-800 flex flex-col">
      
      {/* Top Test Controller */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between text-xs sticky top-0 z-50 shadow-2xs">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#0B2B7A]"></div>
          <span className="font-bold text-[#0B2B7A]">eBudimulia v2 Interactive Test</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500 font-medium">
            Siswa: <strong>{student?.nama}</strong> ({student?.kelas || "8-A"})
          </span>
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
            <span>HP (Mobile)</span>
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
            <span>Web Desktop</span>
          </button>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div className={`flex-1 ${viewMode === 'mobile_mockup' ? 'flex justify-center items-center py-6 px-3' : 'w-full'}`}>
        
        <div className={`w-full bg-[#F8FAFC] transition-all duration-200 ${
          viewMode === 'mobile_mockup' 
            ? 'max-w-[430px] h-[860px] rounded-3xl shadow-2xl border-4 border-slate-800 overflow-hidden relative flex flex-col justify-between'
            : 'flex min-h-[calc(100vh-41px)]'
        }`}>

          {/* ============================================================== */}
          {/* SIDEBAR DESKTOP                                                 */}
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
                    <p className="text-[10px] text-slate-400 font-mono">PORTAL SISWA</p>
                  </div>
                </div>

                <nav className="space-y-1">
                  <span className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Navigasi Langsung</span>
                  {[
                    { id: null, label: 'Beranda Ringkasan', icon: Home },
                    { id: 'PRESENSI', label: 'Presensi Digital', icon: QrCode },
                    { id: 'JADWAL', label: 'Jadwal Pelajaran', icon: CalendarDays },
                    { id: 'POIN', label: 'Buku Saku Poin', icon: Shield },
                    { id: 'CBT', label: 'Ujian CBT Online', icon: Award },
                    { id: 'NILAI', label: 'Rapor & Capaian TP', icon: FileText },
                    { id: 'BK', label: 'Bimbingan Konseling', icon: Layers },
                  ].map((m) => {
                    const IconC = m.icon
                    const isActive = activeMenu === m.id
                    return (
                      <button
                        key={String(m.id)}
                        onClick={() => setActiveMenu(m.id)}
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
                <p className="text-xs font-bold text-slate-900 truncate">{student?.nama}</p>
                <p className="text-[10px] text-slate-500 font-mono">NISN: {student?.nisn}</p>
              </div>
            </aside>
          )}

          {/* ============================================================== */}
          {/* BODY UTAMA: BISA GANTI KE KOMPONEN ASLI SAAT KLIK MENU         */}
          {/* ============================================================== */}
          <div className="flex-1 flex flex-col justify-between overflow-y-auto bg-[#F4F6F9]">
            
            <div className="pb-20 lg:pb-8">
              
              {/* Top Bar Header */}
              <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-30 flex items-center justify-between">
                {activeMenu ? (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setActiveMenu(null)}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center gap-1 text-xs font-semibold"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Kembali ke Beranda</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#0B2B7A] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                      {student?.nama?.substring(0, 2)?.toUpperCase() || "AJ"}
                    </div>
                    <div className="overflow-hidden">
                      <h2 className="text-xs font-bold text-slate-900 truncate leading-tight">{student?.nama}</h2>
                      <p className="text-[10px] text-slate-500 font-medium">Kelas {student?.kelas || "8-A"} • NISN: {student?.nisn}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-1.5">
                  <button className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50">
                    <Bell className="w-4 h-4" />
                  </button>
                </div>
              </header>

              {/* JIKA MEMILIH SUB-MENU: RENDER KOMPONEN FITUR ASLI PRODUKSI */}
              {activeMenu === 'PRESENSI' && (
                <div className="p-4 bg-white m-3 rounded-2xl border border-slate-200 shadow-sm">
                  <SiswaPresensiSection studentData={student} />
                </div>
              )}

              {activeMenu === 'POIN' && (
                <div className="p-4 bg-white m-3 rounded-2xl border border-slate-200 shadow-sm">
                  <SiswaPoinSection studentData={student} onNavigateToAjukan={() => {}} />
                </div>
              )}

              {activeMenu === 'JADWAL' && (
                <div className="p-4 bg-white m-3 rounded-2xl border border-slate-200 shadow-sm">
                  <SiswaJadwalSection studentData={student} />
                </div>
              )}

              {activeMenu === 'CBT' && (
                <div className="p-4 bg-white m-3 rounded-2xl border border-slate-200 shadow-sm">
                  <SiswaCbtPortalSection student={student} />
                </div>
              )}

              {activeMenu === 'NILAI' && (
                <div className="p-4 bg-white m-3 rounded-2xl border border-slate-200 shadow-sm">
                  <SiswaNilaiSection studentData={student} />
                </div>
              )}

              {activeMenu === 'BK' && (
                <div className="p-4 bg-white m-3 rounded-2xl border border-slate-200 shadow-sm">
                  <SiswaBKKonsultasiSection studentData={student} />
                </div>
              )}

              {activeMenu === 'PROFIL' && (
                <div className="p-4 bg-white m-3 rounded-2xl border border-slate-200 shadow-sm">
                  <SiswaProfilSection studentData={student} menuTypes={[]} onOpenEditBiodata={() => {}} />
                </div>
              )}

              {/* JIKA BERADA DI BERANDA (activeMenu === null) */}
              {!activeMenu && (
                <div className="p-4 space-y-3.5 max-w-5xl mx-auto">
                  
                  {/* 1. Presensi Card Hari Ini (Bisa Diklik Langsung Buka Presensi Asli) */}
                  <div 
                    onClick={() => setActiveMenu('PRESENSI')}
                    className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:border-[#0B2B7A] transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Presensi Hari Ini
                      </span>
                      <span className="text-[11px] font-semibold text-[#0B2B7A] group-hover:underline flex items-center gap-0.5">
                        Buka Presensi <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>

                    <div className="pt-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-bold text-slate-900 leading-tight">
                          {stats.presensiHariIni}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">Ketuk untuk scan QR Masuk / Pulang</p>
                      </div>
                      <span className="text-xs font-bold text-[#0B2B7A] bg-blue-50 border border-blue-200 px-2 py-1 rounded">
                        {stats.kehadiranPersen}% Hadir
                      </span>
                    </div>
                  </div>

                  {/* 2. Dua Kartu Poin (Bisa Diklik Langsung Buka Poin Asli) */}
                  <div className="grid grid-cols-2 gap-3">
                    <div 
                      onClick={() => setActiveMenu('POIN')}
                      className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs hover:border-[#0B2B7A] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                        <span>Poin Prestasi</span>
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      </div>
                      <div className="text-lg font-bold text-[#0B2B7A] mt-1.5">
                        +{stats.poinPositif}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">Ketuk untuk detail buku saku →</p>
                    </div>

                    <div 
                      onClick={() => setActiveMenu('POIN')}
                      className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs hover:border-emerald-500 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                        <span>Pelanggaran</span>
                        <Shield className="w-3.5 h-3.5 text-emerald-600" />
                      </div>
                      <div className="text-lg font-bold text-emerald-600 mt-1.5">
                        {stats.poinPelanggaran} Poin
                      </div>
                      <p className="text-[10px] text-emerald-700 font-medium mt-0.5">Catatan Disiplin Bersih</p>
                    </div>
                  </div>

                  {/* 3. Grid Menu Layanan Siswa (Semua Tombol Aktif & Terhubung ke Fitur Asli) */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-3">
                      Layanan Akademik & Kesiswaan (Fitur Nyata)
                    </span>

                    <div className="grid grid-cols-2 gap-2.5">
                      {menuLayanan.map((m) => {
                        const IconComp = m.icon
                        return (
                          <div 
                            key={m.id}
                            onClick={() => setActiveMenu(m.id)}
                            className="p-3 rounded-lg border border-slate-200 hover:border-[#0B2B7A] hover:bg-slate-50 transition-all cursor-pointer flex flex-col justify-between group active:scale-[0.98]"
                          >
                            <div className={`w-8 h-8 rounded-lg ${m.bg} flex items-center justify-center mb-2 border shrink-0 group-hover:scale-105 transition-transform`}>
                              <IconComp className="w-4 h-4" />
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

                  {/* 4. Jadwal Pelajaran Hari Ini (Bisa Diklik Langsung Buka Jadwal Asli) */}
                  <div 
                    onClick={() => setActiveMenu('JADWAL')}
                    className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs cursor-pointer hover:border-[#0B2B7A] transition-colors"
                  >
                    <div className="px-4 py-2.5 bg-[#FAFBFD] border-b border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Jadwal Kelas Hari Ini</span>
                      <span className="text-[11px] font-bold text-[#0B2B7A]">Buka Jadwal Lengkap →</span>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {jadwalHariIni.map((item, idx) => (
                        <div key={idx} className="p-3.5 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-slate-100 text-[#0B2B7A]">
                              <BookOpen className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="font-bold text-slate-900">{item.mapel}</h4>
                              <p className="text-[11px] text-slate-500 mt-0.5">{item.guru} • {item.ruang}</p>
                              <span className="text-[10px] font-mono text-slate-400">{item.jam}</span>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            item.status === 'Berlangsung' ? 'bg-[#0B2B7A] text-white' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {item.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )}

            </div>

            {/* Bottom Nav Bar (Menu Bawah Interaktif) */}
            <nav className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-2 flex items-center justify-around z-40">
              <button 
                onClick={() => setActiveMenu(null)}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg ${
                  activeMenu === null ? 'text-[#0B2B7A] font-bold' : 'text-slate-400'
                }`}
              >
                <Home className="w-4 h-4" />
                <span className="text-[10px]">Beranda</span>
              </button>

              <button 
                onClick={() => setActiveMenu('JADWAL')}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg ${
                  activeMenu === 'JADWAL' ? 'text-[#0B2B7A] font-bold' : 'text-slate-400'
                }`}
              >
                <CalendarDays className="w-4 h-4" />
                <span className="text-[10px]">Jadwal</span>
              </button>

              <button 
                onClick={() => setActiveMenu('CBT')}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg ${
                  activeMenu === 'CBT' ? 'text-[#0B2B7A] font-bold' : 'text-slate-400'
                }`}
              >
                <Award className="w-4 h-4" />
                <span className="text-[10px]">Ujian CBT</span>
              </button>

              <button 
                onClick={() => setActiveMenu('NILAI')}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg ${
                  activeMenu === 'NILAI' ? 'text-[#0B2B7A] font-bold' : 'text-slate-400'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span className="text-[10px]">Rapor</span>
              </button>

              <button 
                onClick={() => setActiveMenu('PROFIL')}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg ${
                  activeMenu === 'PROFIL' ? 'text-[#0B2B7A] font-bold' : 'text-slate-400'
                }`}
              >
                <User className="w-4 h-4" />
                <span className="text-[10px]">Profil</span>
              </button>
            </nav>

          </div>

        </div>

      </div>

    </div>
  )
}
