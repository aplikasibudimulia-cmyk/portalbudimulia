import React, { useState } from 'react'
import { 
  GraduationCap, 
  CalendarCheck, 
  Sparkles, 
  Award, 
  BookOpen, 
  FileText, 
  Clock, 
  ChevronRight,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowUpRight
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'

export default function RedesignDashboardPreview() {
  const [activeTab, setActiveTab] = useState('ringkasan')

  // Data Dummy Realistis untuk Preview Siswa
  const student = {
    nama: "Axel Jonathan",
    nisn: "0089218291",
    kelas: "8-A",
    waliKelas: "Anselmus Mediari Gestawan, S.Pd.",
    poinPositif: 85,
    poinPelanggaran: 0,
    kehadiranPersen: 98,
    statusPresensiHariIni: "Hadir (06.42 WIB)"
  }

  const jadwalHariIni = [
    { jam: "07.00 - 08.20", mapel: "Matematika", guru: "Pak Anselmus", ruang: "R. 8A", status: "Selesai" },
    { jam: "08.20 - 09.40", mapel: "Bahasa Indonesia", guru: "Ibu Maria", ruang: "R. 8A", status: "Sedang Berlangsung" },
    { jam: "10.00 - 11.20", mapel: "Ilmu Pengetahuan Alam", guru: "Pak Budi", ruang: "Lab IPA", status: "Akan Datang" },
  ]

  const riwayatPoin = [
    { tanggal: "22 Nov 2026", judul: "Juara 2 Lomba Matematika Nasional", jenis: "Prestasi Akademik", poin: "+25", tipe: "positif" },
    { tanggal: "18 Nov 2026", judul: "Piket Kelas Bersih & Rapi", jenis: "Kedisiplinan", poin: "+5", tipe: "positif" },
    { tanggal: "14 Nov 2026", judul: "Pengurus Inti OSIS - Rapat Evaluasi", jenis: "Organisasi", poin: "+10", tipe: "positif" }
  ]

  return (
    <div className="min-h-screen bg-slate-50/60 font-sans text-slate-900 antialiased">
      {/* Top Banner Notice */}
      <div className="border-b border-blue-100 bg-blue-50/60 px-4 py-2 text-center text-xs text-blue-700 font-medium">
        ✨ <strong>Preview Desain Baru (Modern Clean / shadcn UI)</strong> — Tersimpan aman di branch <code className="bg-blue-100/80 px-1.5 py-0.5 rounded text-blue-800 font-mono">redesign-v2</code> (Tidak mempengaruhi web utama).
      </div>

      {/* Main Header / Navbar */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 h-16">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white font-bold shadow-sm">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-slate-900">eBudimulia</span>
                <Badge variant="outline" className="text-[10px] font-semibold text-blue-600 border-blue-200 bg-blue-50/40">
                  v2.0 Clean
                </Badge>
              </div>
              <p className="text-[11px] text-slate-500">SMP Budi Mulia Jakarta</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end text-right">
              <span className="text-xs font-semibold text-slate-800">{student.nama}</span>
              <span className="text-[11px] text-slate-500">Kelas {student.kelas} • NISN: {student.nisn}</span>
            </div>
            <div className="h-9 w-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-600 text-xs">
              AJ
            </div>
          </div>
        </div>
      </header>

      {/* Body Content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        
        {/* Welcome Section & Quick Action */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Selamat Pagi, {student.nama} 👋</h1>
              <Badge variant="success" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> {student.statusPresensiHariIni}
              </Badge>
            </div>
            <p className="text-xs text-slate-500">
              Wali Kelas: <span className="font-medium text-slate-700">{student.waliKelas}</span> • Semester Ganjil 2026/2027
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Calendar className="h-3.5 w-3.5 text-slate-500" /> Presensi Digital
            </Button>
            <Button variant="primary" size="sm" className="gap-1.5 text-xs">
              <Sparkles className="h-3.5 w-3.5" /> Ajukan Poin Positif
            </Button>
          </div>
        </div>

        {/* 4 Stat Metric Cards (Clean & Compact) */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {/* Card 1: Poin Positif */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-slate-500">Poin Positif</CardTitle>
              <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600">
                <TrendingUp className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight text-emerald-600">+{student.poinPositif}</div>
              <p className="mt-1 text-[11px] text-slate-500 flex items-center gap-1">
                <span className="font-medium text-emerald-600">Peringkat 3</span> di Kelas {student.kelas}
              </p>
            </CardContent>
          </Card>

          {/* Card 2: Poin Pelanggaran */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-slate-500">Poin Pelanggaran</CardTitle>
              <div className="rounded-lg bg-slate-100 p-1.5 text-slate-600">
                <ShieldCheck className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight text-slate-900">{student.poinPelanggaran}</div>
              <p className="mt-1 text-[11px] text-emerald-600 font-medium">
                Catatan Bersih (Disiplin Tinggi)
              </p>
            </CardContent>
          </Card>

          {/* Card 3: Kehadiran */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-slate-500">Tingkat Kehadiran</CardTitle>
              <div className="rounded-lg bg-blue-50 p-1.5 text-blue-600">
                <CalendarCheck className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight text-blue-600">{student.kehadiranPersen}%</div>
              <p className="mt-1 text-[11px] text-slate-500">
                Tidak ada alpha semester ini
              </p>
            </CardContent>
          </Card>

          {/* Card 4: CBT / Penilaian */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-slate-500">Ujian CBT Aktif</CardTitle>
              <div className="rounded-lg bg-amber-50 p-1.5 text-amber-600">
                <Award className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight text-slate-900">0 Sesi</div>
              <p className="mt-1 text-[11px] text-slate-400">
                Semua ujian selesai dikerjakan
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 2 Column Main Section */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          
          {/* Kolom Kiri (2 Span): Jadwal Pelajaran Hari Ini */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold">Jadwal Pelajaran Hari Ini</CardTitle>
                  <CardDescription>Senin, 23 November 2026</CardDescription>
                </div>
                <Button variant="ghost" size="sm" className="text-xs text-blue-600 gap-1">
                  Lihat Mingguan <ChevronRight className="h-3 w-3" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {jadwalHariIni.map((item, idx) => (
                  <div 
                    key={idx}
                    className={`flex items-center justify-between p-3.5 rounded-xl border transition-colors ${
                      item.status === 'Sedang Berlangsung' 
                        ? 'border-blue-200 bg-blue-50/30' 
                        : 'border-slate-100 hover:border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        item.status === 'Sedang Berlangsung' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        <BookOpen className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-semibold text-slate-800">{item.mapel}</h4>
                          <span className="text-[10px] text-slate-400">• {item.ruang}</span>
                        </div>
                        <p className="text-[11px] text-slate-500">{item.guru}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">{item.jam}</span>
                      <Badge 
                        variant={
                          item.status === 'Sedang Berlangsung' ? 'info' :
                          item.status === 'Selesai' ? 'secondary' : 'outline'
                        }
                      >
                        {item.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Quick Access Menu Tiles */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Menu Layanan Siswa</CardTitle>
                <CardDescription>Akses cepat modul akademik dan kesiswaan</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Riwayat Poin", icon: Sparkles, color: "text-amber-600", bg: "bg-amber-50" },
                    { label: "CBT Ujian Online", icon: Award, color: "text-blue-600", bg: "bg-blue-50" },
                    { label: "Rapor & Nilai", icon: FileText, color: "text-emerald-600", bg: "bg-emerald-50" },
                    { label: "Konseling BK", icon: Layers, color: "text-purple-600", bg: "bg-purple-50" },
                  ].map((menu, i) => {
                    const Icon = menu.icon
                    return (
                      <div 
                        key={i} 
                        className="group flex flex-col items-center justify-center p-4 rounded-xl border border-slate-100 hover:border-slate-300 hover:shadow-sm bg-white cursor-pointer transition-all"
                      >
                        <div className={`p-2.5 rounded-xl ${menu.bg} ${menu.color} mb-2 group-hover:scale-105 transition-transform`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <span className="text-xs font-medium text-slate-700 text-center">{menu.label}</span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Kolom Kanan (1 Span): Aktivitas Poin Terbaru */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold">Catatan Poin Terkini</CardTitle>
                  <CardDescription>Riwayat apresiasi semester ini</CardDescription>
                </div>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-blue-600">
                  Semua <ArrowUpRight className="h-3 w-3 ml-0.5" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {riwayatPoin.map((item, idx) => (
                  <div key={idx} className="flex items-start justify-between pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-slate-800 leading-snug">{item.judul}</p>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                        <span>{item.tanggal}</span>
                        <span>•</span>
                        <span>{item.jenis}</span>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                      {item.poin}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

        </div>

      </main>
    </div>
  )
}
