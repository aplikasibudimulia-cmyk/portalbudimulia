import React, { useState, useEffect, useMemo } from 'react'
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
  RefreshCw,
  AlertCircle
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
  const [loading, setLoading] = useState(true)

  // 1. DATA SESI SISWA AKTIF RIIL DARI LOCALSTORAGE
  const [student, setStudent] = useState(() => {
    try {
      const raw = localStorage.getItem('siswa_session')
      if (raw) return JSON.parse(raw)
    } catch (e) {}
    return null
  })

  // 2. DATA REALTIME DARI DATABASE SUPABASE
  const [realPoin, setRealPoin] = useState({ positif: 0, pelanggaran: 0 })
  const [realPresensi, setRealPresensi] = useState({ 
    status: "Belum Presensi", 
    jam: "-", 
    hadirPersen: 100, 
    totalHadir: 0,
    isHadir: false 
  })
  const [realJadwalHariIni, setRealJadwalHariIni] = useState([])
  const [realFoto, setRealFoto] = useState(null)
  const [allStudents, setAllStudents] = useState([])

  // Fungsi Menarik 100% Data Riil Siswa dari Database
  useEffect(() => {
    async function fetchFullRealtimeData() {
      setLoading(true)
      try {
        // Jika belum login sebagai siswa, tarik daftar siswa asli dari DB untuk simulasi pemilih siswa
        let currentNisn = student?.nisn
        let currentStudent = student

        if (!currentNisn) {
          const { data: siswaList } = await supabase
            .from('siswa_permanent')
            .select('nisn, nama_lengkap, kelas')
            .order('nama_lengkap', { ascending: true })
            .limit(10)

          if (siswaList && siswaList.length > 0) {
            setAllStudents(siswaList)
            currentStudent = {
              nisn: siswaList[0].nisn,
              nama: siswaList[0].nama_lengkap,
              kelas: siswaList[0].kelas || "8-A",
              tahun_ajaran: "2026/2027 Ganjil"
            }
            setStudent(currentStudent)
            currentNisn = currentStudent.nisn
          }
        }

        if (!currentNisn) {
          setLoading(false)
          return
        }

        // Tentukan Hari Ini (Senin, Selasa, dll)
        const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
        const todayName = days[new Date().getDay()] || 'Senin'
        const todayDateStr = new Date().toISOString().split('T')[0]

        // Jalankan Query Paralel ke Database Supabase Riil
        const [resPoin, resPresensiToday, resPresensiAll, resFoto, resJadwal] = await Promise.all([
          // A. Poin Siswa Riil
          supabase.from('student_points').select('*').eq('nisn', currentNisn).maybeSingle(),
          // B. Presensi Hari Ini Riil
          supabase.from('presensi_siswa').select('*').eq('nisn', currentNisn).eq('tanggal', todayDateStr).maybeSingle(),
          // C. Akumulasi Seluruh Presensi Riil Semester Ini
          supabase.from('presensi_siswa').select('status').eq('nisn', currentNisn),
          // D. Foto Profil Asli di Cloudinary/Supabase
          supabase.from('foto').select('cloudinary_url').eq('nisn', currentNisn).order('created_at', { ascending: false }).limit(1).maybeSingle(),
          // E. Jadwal Pelajaran Kelas Siswa Riil
          supabase.from('jadwal_pelajaran')
            .select(`
              id, hari, jam_mulai, jam_selesai, ruang,
              mapel:mapel_id(nama_mapel),
              guru:guru_id(nama_guru)
            `)
            .eq('kelas', currentStudent?.kelas || '8-A')
            .eq('hari', todayName === 'Minggu' || todayName === 'Sabtu' ? 'Senin' : todayName)
            .order('jam_mulai', { ascending: true })
        ])

        // Parse Poin Riil
        if (resPoin?.data) {
          setRealPoin({
            positif: resPoin.data.total_positif || 0,
            pelanggaran: resPoin.data.total_pelanggaran || 0
          })
        }

        // Parse Presensi Hari Ini Riil
        if (resPresensiToday?.data) {
          setRealPresensi(prev => ({
            ...prev,
            status: resPresensiToday.data.status || 'Hadir',
            jam: resPresensiToday.data.jam_masuk || resPresensiToday.data.created_at ? new Date(resPresensiToday.data.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '06.45 WIB',
            isHadir: true
          }))
        } else {
          setRealPresensi(prev => ({
            ...prev,
            status: "Belum Presensi Hari Ini",
            jam: "-",
            isHadir: false
          }))
        }

        // Parse Persentase Kehadiran Kumulatif
        if (resPresensiAll?.data && resPresensiAll.data.length > 0) {
          const total = resPresensiAll.data.length
          const hadir = resPresensiAll.data.filter(p => p.status === 'Hadir' || p.status === 'hadir').length
          const persen = Math.round((hadir / total) * 100)
          setRealPresensi(prev => ({ ...prev, hadirPersen: persen, totalHadir: hadir }))
        }

        // Parse Foto Profil Riil
        if (resFoto?.data?.cloudinary_url) {
          setRealFoto(resFoto.data.cloudinary_url)
        }

        // Parse Jadwal Riil
        if (resJadwal?.data && resJadwal.data.length > 0) {
          const parsed = resJadwal.data.map(item => ({
            jam: `${item.jam_mulai?.substring(0, 5) || '07.00'} - ${item.jam_selesai?.substring(0, 5) || '08.20'}`,
            mapel: item.mapel?.nama_mapel || "Pelajaran",
            guru: item.guru?.nama_guru || "Guru Pengampu",
            ruang: item.ruang || `R. ${currentStudent?.kelas || '8-A'}`
          }))
          setRealJadwalHariIni(parsed)
        }

      } catch (err) {
        console.error("Error loading real dashboard data:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchFullRealtimeData()
  }, [student?.nisn])

  // Mapel Aktif Saat Ini dari Jadwal Riil (atau item pertama jadwal riil)
  const mapelAktif = realJadwalHariIni[0] || {
    mapel: "Belum Ada Jadwal Aktif",
    jam: "-",
    guru: student?.waliKelas || "Wali Kelas",
    ruang: `R. ${student?.kelas || "8-A"}`
  }

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

  const panggilanNama = student?.nama?.split(' ')[0] || "Siswa"

  return (
    <div className="min-h-screen bg-[#F0F3F8] font-sans antialiased text-slate-800 flex flex-col">
      
      {/* Top Controller Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between text-xs sticky top-0 z-50 gap-2">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="font-extrabold text-[#0B2B7A] tracking-wider text-sm">eBudiMulia</span>
          <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded border border-emerald-200">
            ● 100% LIVE REALTIME DATABASE
          </span>
        </div>

        {/* Switcher Akun Siswa Riil jika sedang mengetes akun lain */}
        {allStudents.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-[11px]">Akun Riil:</span>
            <select 
              value={student?.nisn} 
              onChange={(e) => {
                const found = allStudents.find(s => s.nisn === e.target.value)
                if (found) {
                  setStudent({
                    nisn: found.nisn,
                    nama: found.nama_lengkap,
                    kelas: found.kelas || "8-A",
                    tahun_ajaran: "2026/2027 Ganjil"
                  })
                }
              }}
              className="text-xs bg-slate-100 border border-slate-300 rounded px-2 py-1 font-bold text-[#0B2B7A]"
            >
              {allStudents.map(s => (
                <option key={s.nisn} value={s.nisn}>
                  {s.nama_lengkap} ({s.kelas})
                </option>
              ))}
            </select>
          </div>
        )}

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
            <span>HP</span>
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
            <span>PC</span>
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
              
              {/* TOP HEADER: Logo Asli eBudiMulia & Poin Riil dari Supabase */}
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
                    <span>{realPoin.positif} Poin</span>
                  </button>
                  <button className="w-8 h-8 rounded-full border border-slate-200 bg-white shadow-2xs flex items-center justify-center text-slate-600 hover:bg-slate-50">
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* JIKA MEMILIH SUB-MENU: TAMPILKAN KOMPONEN ASLI PRODUKSI DENGAN DATA RIIL */}
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
                /* HALAMAN UTAMA BERANDA SISWA (100% REALTIME DARI SUPABASE) */
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

                  {/* KARTU IDENTITAS SISWA DENGAN FOTO ASLI CLOUDINARY & NISN ASLI */}
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

                    <div className="relative rounded-3xl p-4 sm:p-5 text-white shadow-xl overflow-hidden bg-gradient-to-br from-[#0B2B7A] via-[#103896] to-[#071E54] border border-blue-900">
                      
                      {/* Pola Latar */}
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

                      {/* Body Kartu: FOTO ASLI DATABASE + DATA RIIL */}
                      <div className="pt-3.5 flex items-center gap-3.5 relative z-10">
                        <div className="relative shrink-0">
                          {realFoto ? (
                            <img 
                              src={realFoto}
                              alt={student?.nama}
                              className="w-14 h-14 rounded-2xl object-cover border-2 border-amber-400 shadow-md"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-2xl bg-amber-400/20 border-2 border-amber-400 flex items-center justify-center font-black text-amber-300 text-lg shadow-md">
                              {panggilanNama.substring(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-[#0B2B7A] rounded-full"></div>
                        </div>

                        <div className="overflow-hidden flex-1">
                          <h3 className="text-base font-black text-white truncate leading-tight">
                            {student?.nama}
                          </h3>
                          <p className="text-xs font-semibold text-amber-300 mt-0.5">
                            Kelas {student?.kelas || "8-A"} • Ruang Belajar
                          </p>
                          <p className="text-[11px] text-blue-200 font-mono mt-0.5">
                            NISN: <span className="text-white font-bold tracking-wide">{student?.nisn}</span>
                          </p>
                        </div>
                      </div>

                      {/* Footer Kartu: DATA POIN & KEHADIRAN 100% RIIL SUPABASE */}
                      <div className="mt-3.5 pt-3 border-t border-white/15 flex items-center justify-between relative z-10 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          <span className="text-blue-100 text-[11px]">Kredit Poin Riil:</span>
                          <span className="font-black font-mono text-amber-400">+{realPoin.positif}</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-blue-100 text-[11px]">Kehadiran:</span>
                          <span className="font-black text-emerald-400 font-mono">{realPresensi.hadirPersen}%</span>
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* KONTEN REALTIME BERDASARKAN TAB */}
                  {activeTab === 'hari_ini' && (
                    <div className="space-y-4">
                      {/* FITUR PILIHAN GRID */}
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

                      {/* BANNER STATUS PRESENSI HARI INI RIIL DARI SUPABASE */}
                      <div className="bg-[#FFFDF0] rounded-3xl p-4 shadow-xs border border-amber-200">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                            realPresensi.isHadir ? 'bg-emerald-600 text-white' : 'bg-[#D31725] text-white'
                          }`}>
                            {realPresensi.status}
                          </span>
                          <span className="text-xs text-slate-500 font-mono font-bold">
                            {realPresensi.jam !== '-' ? `Pukul ${realPresensi.jam}` : 'Hari Ini'}
                          </span>
                        </div>
                        <h3 className="text-sm font-black text-slate-900">
                          {mapelAktif.mapel}
                        </h3>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Guru: {mapelAktif.guru} • {mapelAktif.ruang}
                        </p>
                        <div className="mt-3 flex items-center justify-between pt-2 border-t border-amber-200/60">
                          <span className="text-[11px] text-slate-500">Jam: {mapelAktif.jam}</span>
                          <button 
                            onClick={() => setActiveMenu('JADWAL')}
                            className="text-xs font-bold text-[#0B2B7A] hover:underline"
                          >
                            Jadwal Lengkap →
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'akademik' && (
                    <div className="space-y-3 bg-white p-4 rounded-3xl border border-slate-200 shadow-2xs">
                      <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2">
                        Jadwal Kelas {student?.kelas || "8-A"} Hari Ini
                      </h4>
                      {realJadwalHariIni.length > 0 ? (
                        <div className="divide-y divide-slate-100">
                          {realJadwalHariIni.map((j, idx) => (
                            <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                              <div>
                                <p className="font-bold text-slate-900">{j.mapel}</p>
                                <p className="text-[11px] text-slate-500">{j.guru} • {j.ruang}</p>
                              </div>
                              <span className="font-mono text-slate-500 font-bold block">{j.jam}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 py-4 text-center">Tidak ada jadwal pelajaran hari ini.</p>
                      )}
                      <button 
                        onClick={() => setActiveMenu('NILAI')}
                        className="w-full py-2 bg-[#0B2B7A] text-white font-bold text-xs rounded-xl hover:bg-[#08205C] transition-colors mt-2"
                      >
                        Buka Transkrip Nilai Rapor TP Asli
                      </button>
                    </div>
                  )}

                  {activeTab === 'kesiswaan' && (
                    <div className="space-y-3 bg-white p-4 rounded-3xl border border-slate-200 shadow-2xs">
                      <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2">
                        Buku Saku Poin Siswa (Realtime)
                      </h4>
                      <div className="flex items-center justify-between p-3 bg-blue-50 rounded-2xl border border-blue-100 text-xs">
                        <div>
                          <p className="text-[10px] text-blue-600 font-bold uppercase">Poin Prestasi</p>
                          <p className="text-lg font-black text-[#0B2B7A]">+{realPoin.positif} Poin</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-emerald-700 font-bold uppercase">Pelanggaran</p>
                          <p className="text-lg font-black text-emerald-700">{realPoin.pelanggaran} Poin</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setActiveMenu('POIN')}
                        className="w-full py-2 bg-[#F6C800] text-slate-950 font-black text-xs rounded-xl hover:bg-amber-400 transition-colors mt-2"
                      >
                        Buka Buku Saku Lengkap & Ajukan Poin
                      </button>
                    </div>
                  )}

                </div>
              )}

            </div>

            {/* FLOATING BOTTOM NAV BAR */}
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
