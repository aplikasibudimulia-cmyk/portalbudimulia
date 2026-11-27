// Definisi Menu & Kategori Hierarkis untuk Redesign Admin V55
// Memetakan seluruh 39 menu operasional eBudimulia ke dalam 8 Pilar Kerja Utama

export const ADMIN_CATEGORIES = [
  {
    id: 'overview',
    label: 'Beranda',
    icon: 'dashboard',
    badge: null,
    items: [
      { id: 'dashboard', label: 'Beranda Utama', icon: 'dashboard', desc: 'Ringkasan operasional & statistik real-time' },
      { id: 'dashboard_eksekutif', label: 'Dashboard Eksekutif', icon: 'chart', desc: 'Metrik performa & analitik pimpinan' }
    ]
  },
  {
    id: 'users',
    label: 'Pengguna',
    icon: 'users',
    badge: null,
    items: [
      { id: 'manajemen_akun', label: 'Manajemen Akun', icon: 'users', desc: 'Akun Siswa, Guru, Orang Tua & Reset Sandi' },
      { id: 'kartu_pelajar', label: 'Kartu Pelajar', icon: 'id-card', desc: 'Cetak barcode & identitas siswa' },
      { id: 'kartu_ujian', label: 'Kartu Ujian', icon: 'ticket', desc: 'Cetak kartu peserta & barcode ujian' },
      { id: 'log_aktivitas', label: 'Log Aktivitas', icon: 'activity', desc: 'Audit jejak login & perubahan sistem' }
    ]
  },
  {
    id: 'presensi',
    label: 'Kehadiran',
    icon: 'clock',
    badge: null,
    items: [
      { id: 'presensi_qr', label: 'Presensi QR', icon: 'qr-code', desc: 'Pemindai kehadiran scanner & TV' },
      { id: 'laporan_keterlambatan', label: 'Keterlambatan', icon: 'alert', desc: 'Laporan siswa terlambat harian' },
      { id: 'denah_kehadiran', label: 'Denah Kehadiran', icon: 'map', desc: 'Matriks kehadiran posisi kelas' },
      { id: 'jadwal_pelajaran', label: 'Jadwal Pelajaran', icon: 'calendar', desc: 'Plotting jadwal mengajar guru & kelas' }
    ]
  },
  {
    id: 'akademik',
    label: 'Akademik & CBT',
    icon: 'graduation',
    badge: null,
    items: [
      { id: 'cbt_config', label: 'Pengaturan CBT', icon: 'shield-check', desc: 'Saklar ujian, whitelist penguji & proteksi' },
      { id: 'cbt_bank_soal', label: 'Bank Soal CBT', icon: 'book', desc: 'Manajemen bank soal ujian online' },
      { id: 'cbt_sesi', label: 'Jadwal & Sesi Ujian', icon: 'calendar-check', desc: 'Sesi ruang ujian & monitoring pengawas' },
      { id: 'leger_nilai', label: 'Leger Nilai', icon: 'table', desc: 'Rekap leger kurikulum sekolah', badge: 'Live' },
      { id: 'rapor_siswa', label: 'Rapor Siswa', icon: 'file-text', desc: 'Pencetakan rapor kurikulum & format dinas', badge: 'Cetak' },
      { id: 'ekskul_nilai', label: 'Nilai Ekstrakurikuler', icon: 'star', desc: 'Pramuka & ekskul pengembangan diri', badge: 'Ekskul' }
    ]
  },
  {
    id: 'kesiswaan',
    label: 'Kesiswaan & Poin',
    icon: 'award',
    badge: null,
    items: [
      { id: 'pengajuan_poin', label: 'Pengajuan Poin', icon: 'check-circle', desc: 'Verifikasi klaim poin guru & siswa', isPendingPengajuan: true },
      { id: 'catat_poin', label: 'Catat Poin', icon: 'edit', desc: 'Input poin pelanggaran & kebaikan' },
      { id: 'rekap_poin', label: 'Rekap & Analitik Poin', icon: 'pie-chart', desc: 'Grafik & tren kedisiplinan kesiswaan' },
      { id: 'katalog_poin', label: 'Katalog Poin', icon: 'list', desc: 'Daftar butir pasal & bobot poin' },
      { id: 'tahap_pembinaan', label: 'Tahap Pembinaan', icon: 'user-check', desc: 'Skema pembinaan & surat panggilan' },
      { id: 'tata_tertib', label: 'Tata Tertib', icon: 'shield', desc: 'Buku panduan tata tertib sekolah' },
      { id: 'konsultasi_bk', label: 'Jadwal BK', icon: 'message-circle', desc: 'Bimbingan konseling siswa' },
      { id: 'prestasi_siswa', label: 'Prestasi & Lomba', icon: 'trophy', desc: 'Rekap kejuaraan akademik & non-akademik' },
      { id: 'pendamping_lomba', label: 'Pendamping Lomba', icon: 'users', desc: 'Penugasan guru pendamping lomba' },
      { id: 'pengaturan_poin', label: 'Pengaturan Poin', icon: 'sliders', desc: 'Parameter sistem poin & batas SP' }
    ]
  },
  {
    id: 'keuangan',
    label: 'Keuangan',
    icon: 'wallet',
    badge: null,
    items: [
      { id: 'tabungan_siswa', label: 'Tabungan Siswa', icon: 'wallet', desc: 'Buku rekening & mutasi tabungan pelajar' },
      { id: 'tagihan_spp', label: 'Tagihan & SPP', icon: 'credit-card', desc: 'Pencatatan pembayaran SPP bulanan' }
    ]
  },
  {
    id: 'dokumen',
    label: 'Informasi & Surat',
    icon: 'folder',
    badge: null,
    items: [
      { id: 'surat_sebaran', label: 'Surat Sebaran', icon: 'mail', desc: 'Generator surat massal CKG & undangan' },
      { id: 'berita_sekolah', label: 'Berita Sekolah', icon: 'newspaper', desc: 'Publikasi artikel & warta sekolah' },
      { id: 'notifikasi', label: 'Notifikasi Siswa', icon: 'bell', desc: 'Broadcast push notifikasi ke aplikasi HP' },
      { id: 'kelola_pengumuman', label: 'Kelola Pengumuman', icon: 'volume-2', desc: 'Banner pengumuman beranda' },
      { id: 'kumpulan_dokumen', label: 'Kumpulan Dokumen', icon: 'archive', desc: 'Arsip berkas & formulir umum' },
      { id: 'dokumen_guru', label: 'Dokumen Guru', icon: 'file-check', desc: 'Perangkat pembelajaran & RPP guru' },
      { id: 'program_sekolah', label: 'Program Sekolah', icon: 'calendar', desc: 'Kalender program kerja tahunan' },
      { id: 'pengumuman_resmi_kepsek', label: 'Pengumuman Resmi', icon: 'file-badge', desc: 'Surat edaran kepala sekolah' },
      { id: 'line_config', label: 'Notifikasi LINE', icon: 'message-square', desc: 'Integrasi LINE Notify / Bot' }
    ]
  },
  {
    id: 'settings',
    label: 'Pengaturan',
    icon: 'settings',
    badge: null,
    items: [
      { id: 'konfigurasi', label: 'Pengaturan Sistem', icon: 'sliders', desc: 'Tahun ajaran, semester & saklar fitur' },
      { id: 'manajemen_role', label: 'Manajemen Role', icon: 'shield', desc: 'Konfigurasi hak akses guru & staf' }
    ]
  }
]

// Cari kategori ID dari menu ID
export function getAdminCategories() {
  return Array.isArray(ADMIN_CATEGORIES) ? ADMIN_CATEGORIES : []
}

export function getCategoryByMenuId(menuId) {
  if (!menuId || menuId === 'dashboard') return 'overview'
  const cats = getAdminCategories()
  for (const cat of cats) {
    if ((cat?.items || []).some(item => item.id === menuId)) {
      return cat.id
    }
  }
  return 'dokumen' // fallback untuk dynamic menuTypes
}

export default ADMIN_CATEGORIES

