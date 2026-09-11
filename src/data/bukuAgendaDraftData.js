// Data Master Draf Buku Agenda SMP Budi Mulia (100% Persis Nomor Urut & Butir PDF Resmi Hal 15 - 19)

export const DEFAULT_BUKU_AGENDA_DRAFT = [
  // ============================================================
  // I. KEHADIRAN (Hal. 15)
  // ============================================================
  {
    id: 'draft-kh-1a',
    tipe: 'negative',
    kategori: 'I. KEHADIRAN',
    sub_kategori: '1. Terlambat datang ke sekolah',
    kode: 'I.1.a',
    display_no: '1.a',
    jenis: 'Terlambat datang ke sekolah < 5 menit',
    keterangan: 'Petugas piket akan mencatat nama siswa tersebut dan memperbolehkan dia masuk',
    poin: -2
  },
  {
    id: 'draft-kh-1b',
    tipe: 'negative',
    kategori: 'I. KEHADIRAN',
    sub_kategori: '1. Terlambat datang ke sekolah',
    kode: 'I.1.b',
    display_no: '1.b',
    jenis: 'Terlambat datang ke sekolah > 5 menit',
    keterangan: 'Petugas piket akan mencatat nama siswa tersebut dan memberikan tugas selama satu jam pelajaran',
    poin: -4
  },
  {
    id: 'draft-kh-1c',
    tipe: 'negative',
    kategori: 'I. KEHADIRAN',
    sub_kategori: '1. Terlambat datang ke sekolah',
    kode: 'I.1.c',
    display_no: '1.c',
    jenis: 'Terlambat datang ke sekolah > 5 menit lebih dari 2x',
    keterangan: 'Petugas piket akan memberikan tugas dan berkoordinasi dengan wali kelas untuk menghubungi orang tua',
    poin: -5
  },
  {
    id: 'draft-kh-2a',
    tipe: 'negative',
    kategori: 'I. KEHADIRAN',
    sub_kategori: '2. Tidak hadir sekolah',
    kode: 'I.2.a',
    display_no: '2.a',
    jenis: 'Tidak hadir sekolah tanpa izin (tanpa keterangan)',
    keterangan: 'Wali kelas akan berkoordinasi untuk konfirmasi ke orang tua',
    poin: -5
  },
  {
    id: 'draft-kh-2b',
    tipe: 'negative',
    kategori: 'I. KEHADIRAN',
    sub_kategori: '2. Tidak hadir sekolah',
    kode: 'I.2.b',
    display_no: '2.b',
    jenis: 'Tidak hadir sekolah 3 hari berturut-turut tanpa keterangan',
    keterangan: 'Wali kelas akan berkoordinasi untuk konfirmasi ke orang tua',
    poin: -10
  },
  {
    id: 'draft-kh-2c',
    tipe: 'negative',
    kategori: 'I. KEHADIRAN',
    sub_kategori: '2. Tidak hadir sekolah',
    kode: 'I.2.c',
    display_no: '2.c',
    jenis: 'Tidak hadir pada kegiatan yang diwajibkan oleh sekolah tanpa alasan yang jelas',
    keterangan: 'Wali kelas akan menegur dan memanggil orang tua',
    poin: -5
  },

  // ============================================================
  // II. DALAM WAKTU SEKOLAH (Hal. 15 - 19, Mulai dari No. 1)
  // ============================================================
  {
    id: 'draft-dws-1',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '',
    kode: 'II.1',
    display_no: '1',
    jenis: 'Keluar kelas pada waktu pergantian jam pelajaran atau setelah istirahat kecuali ada tugas dari guru dan atau sedang piket',
    keterangan: 'Ditegur, diperingatkan dilaporkan pada Guru bidang studi yang bersangkutan dan wali kelas',
    poin: -2
  },
  {
    id: 'draft-dws-2',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '',
    kode: 'II.2',
    display_no: '2',
    jenis: 'Berada didalam kelas selama jam istirahat',
    keterangan: 'Ditegur, diperingatkan dilaporkan pada guru bidang studi yang bersangkutan dan wali kelas',
    poin: -2
  },
  {
    id: 'draft-dws-3',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '',
    kode: 'II.3',
    display_no: '3',
    jenis: 'Meninggalkan Pelajaran atau sekolah sebelum habis waktunya tanpa izin',
    keterangan: 'Ditegur, diperingatkan dan dipanggil orang tuanya',
    poin: -3
  },
  {
    id: 'draft-dws-4',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '',
    kode: 'II.4',
    display_no: '4',
    jenis: 'Makan dan minum di kelas pada saat jam pelajaran berlangsung dan pergantian jam pelajaran dan waktu istirahat',
    keterangan: 'Ditegur, diperingatkan dilaporkan pada guru bidang studi yang bersangkutan dan wali kelas',
    poin: -2
  },
  {
    id: 'draft-dws-5',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '',
    kode: 'II.5',
    display_no: '5',
    jenis: 'Membuang sampah tidak pada tempatnya',
    keterangan: 'Ditegur, diperingatkan dilaporkan pada guru bidang studi yang bersangkutan dan wali kelas serta diberi tugas khusus',
    poin: -2
  },
  {
    id: 'draft-dws-6a',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '6. Rambut, kuku, tato, make-up',
    kode: 'II.6.a',
    display_no: '6.a',
    jenis: 'Rambut Panjang atau gondrong atau potongan tidak rapi (tidak sesuai ketentuan)',
    keterangan: 'Ditegur dan diperingatkan',
    poin: -5
  },
  {
    id: 'draft-dws-6b',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '6. Rambut, kuku, tato, make-up',
    kode: 'II.6.b',
    display_no: '6.b',
    jenis: 'Anggota badan di Tato',
    keterangan: 'Ditegur, dipanggil Orang Tua',
    poin: -3
  },
  {
    id: 'draft-dws-6c',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '6. Rambut, kuku, tato, make-up',
    kode: 'II.6.c',
    display_no: '6.c',
    jenis: 'Kuku panjang atau dicat',
    keterangan: 'Langsung dipotong dan dihapus',
    poin: -5
  },
  {
    id: 'draft-dws-7',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '',
    kode: 'II.7',
    display_no: '7',
    jenis: 'Peserta didik putri berambut gundul',
    keterangan: 'Ditegur dan diperingatkan, dipanggil Orang Tua',
    poin: -5
  },
  {
    id: 'draft-dws-8',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '',
    kode: 'II.8',
    display_no: '8',
    jenis: 'Mengendarai sepeda motor ke sekolah termasuk pada saat ekstra kurikuler',
    keterangan: 'Ditegur dan diperingatkan',
    poin: -10
  },
  {
    id: 'draft-dws-9',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '',
    kode: 'II.9',
    display_no: '9',
    jenis: 'Menimbulkan dan atau membuat kegaduhan/ berisik pada saat kegiatan belajar mengajar di berlangsung atau pada saat kegiatan sekolah berlangsung',
    keterangan: 'Ditegur dan diperingatkan, dikeluarkan dari kelas',
    poin: -15
  },
  {
    id: 'draft-dws-10a',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '10. Menyontek',
    kode: 'II.10.a',
    display_no: '10.a',
    jenis: 'Menyontek pada waktu ulangan',
    keterangan: 'Ditegur, diberi nilai Nol (0), dipanggil orang tua',
    poin: -10
  },
  {
    id: 'draft-dws-10b',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '10. Menyontek',
    kode: 'II.10.b',
    display_no: '10.b',
    jenis: 'Memberi/menerima sontekan',
    keterangan: 'Ditegur, diberi nilai Nol (0), dipanggil orang tua',
    poin: -10
  },
  {
    id: 'draft-dws-11a',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '11. Ketertiban Tempat Duduk',
    kode: 'II.11.a',
    display_no: '11.a',
    jenis: 'Pindah tempat duduk yang telah ditentukan',
    keterangan: 'Ditegur oleh guru yang sedang mengajar pada saat itu',
    poin: -3
  },
  {
    id: 'draft-dws-11b',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '11. Ketertiban Tempat Duduk',
    kode: 'II.11.b',
    display_no: '11.b',
    jenis: 'Mondar-mandir di kelas selama kegiatan belajar mengajar atau pada saat pergantian pelajaran',
    keterangan: 'Ditegur oleh Guru yang sedang mengajar pada saat itu',
    poin: -3
  },
  {
    id: 'draft-dws-12a',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '12. Tugas & PR',
    kode: 'II.12.a',
    display_no: '12.a',
    jenis: 'Tidak mengerjakan PR atau mengerjakan PR di sekolah',
    keterangan: 'Ditegur, diberi nilai Nol (0), konfirmasi dengan orang tua',
    poin: -3
  },
  {
    id: 'draft-dws-12b',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '12. Tugas & PR',
    kode: 'II.12.b',
    display_no: '12.b',
    jenis: 'Tidak mengumpulkan tugas sesuai dengan hari dan waktu yang telah ditentukan',
    keterangan: 'Ditegur, diberi nilai Nol (0), konfirmasi dengan orang tua',
    poin: -3
  },
  {
    id: 'draft-dws-13',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '',
    kode: 'II.13',
    display_no: '13',
    jenis: 'Membawa senjata tajam atau alat yang membahayakan orang lain kecuali ada tugas khusus',
    keterangan: 'Barang disita, dipanggil Orang Tua, pada kondisi tertentu diserahkan ke pihak yang berwajib',
    poin: -25
  },
  {
    id: 'draft-dws-14a',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '14. Rokok, Miras, Pornografi & Narkoba',
    kode: 'II.14.a',
    display_no: '14.a',
    jenis: 'Membawa, menyimpan atau mempergunakan: Rokok',
    keterangan: 'Barang disita, pemanggilan Orang Tua, refleksi diri di rumah',
    poin: -20
  },
  {
    id: 'draft-dws-14b',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '14. Rokok, Miras, Pornografi & Narkoba',
    kode: 'II.14.b',
    display_no: '14.b',
    jenis: 'Membawa, menyimpan atau mempergunakan: Minuman beralkohol',
    keterangan: 'Barang disita, pemanggilan Orang Tua, refleksi diri di rumah',
    poin: -20
  },
  {
    id: 'draft-dws-14c',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '14. Rokok, Miras, Pornografi & Narkoba',
    kode: 'II.14.c',
    display_no: '14.c',
    jenis: 'Membawa, menyimpan atau mempergunakan: Buku seks/porno',
    keterangan: 'Barang disita, pemanggilan Orang Tua, refleksi diri di rumah',
    poin: -20
  },
  {
    id: 'draft-dws-14d',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '14. Rokok, Miras, Pornografi & Narkoba',
    kode: 'II.14.d',
    display_no: '14.d',
    jenis: 'Membawa, menyimpan atau mempergunakan: Obat-obat terlarang atau terlibat narkoba',
    keterangan: 'Dikeluarkan dari sekolah',
    poin: -100
  },
  {
    id: 'draft-dws-15',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '',
    kode: 'II.15',
    display_no: '15',
    jenis: 'Membawa barang–barang tanpa rekomendasi guru terkait atau yang tidak berkaitan dengan kegiatan belajar-mengajar',
    keterangan: 'Disita, diperingatkan dan dipanggil orang tua',
    poin: -5
  },
  {
    id: 'draft-dws-16',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '',
    kode: 'II.16',
    display_no: '16',
    jenis: 'Berkumpul disekitar sekolah atau pintu gerbang Budi Mulia setelah pulang sekolah lebih dari 30 menit',
    keterangan: 'Ditegur dan diperingatkan',
    poin: -3
  },
  {
    id: 'draft-dws-17a',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '17. Ketertiban Lingkungan Sekolah',
    kode: 'II.17.a',
    display_no: '17.a',
    jenis: 'Bermain dilokasi TK, SD, SMU selama kegiatan belajar mengajar dan kegiatan sekolah',
    keterangan: 'Ditegur dan diperingatkan',
    poin: -5
  },
  {
    id: 'draft-dws-17b',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '17. Ketertiban Lingkungan Sekolah',
    kode: 'II.17.b',
    display_no: '17.b',
    jenis: 'Merayakan ulang tahun di lingkungan sekolah (TK, SD, SMP, SMA)',
    keterangan: 'Ditegur dan diperingatkan, pemanggilan orang tua',
    poin: -5
  },
  {
    id: 'draft-dws-18',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '',
    kode: 'II.18',
    display_no: '18',
    jenis: 'Judi dan main kartu',
    keterangan: 'Kartu disita, Pemanggilan orang tua dan dikenakan sanksi khusus yang ditentukan oleh dewan guru',
    poin: -50
  },
  {
    id: 'draft-dws-19',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '',
    kode: 'II.19',
    display_no: '19',
    jenis: 'Mencuri',
    keterangan: 'Mengembalikan atau mengganti barang yang dicuri, Surat Peringatan, Pemanggilan orang tua dan refleksi di rumah',
    poin: -100
  },
  {
    id: 'draft-dws-20',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '',
    kode: 'II.20',
    display_no: '20',
    jenis: 'Les privat pada guru SMP Budi Mulia',
    keterangan: 'Dikeluarkan dari sekolah',
    poin: -100
  },
  {
    id: 'draft-dws-21',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '',
    kode: 'II.21',
    display_no: '21',
    jenis: 'Berkelahi baik didalam Maupun diluar sekolah',
    keterangan: 'Kedua-duanya dihukum (yang memukul lebih dahulu mendapat hukuman berat), Surat peringatan, Pemanggilan orang tua dan sanksi khusus dewan guru',
    poin: -50
  },
  {
    id: 'draft-dws-22',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '',
    kode: 'II.22',
    display_no: '22',
    jenis: 'Melakukan perbuatan yang dapat menimbulkan citra jelek sekolah atau merusak nama baik sekolah',
    keterangan: 'Membuat surat pernyataan bermaterai, serta pemanggilan orang tua membuat pernyataan yang diketahui oleh orang tua, wali kelas dan kepala sekolah',
    poin: -10
  },
  {
    id: 'draft-dws-23',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '',
    kode: 'II.23',
    display_no: '23',
    jenis: 'Berpacaran di kompleks sekolah',
    keterangan: 'Ditegur dan diperingatkan, Refleksi diri dirumah, Pemanggilan orang tua, Surat peringatan',
    poin: -15
  },
  {
    id: 'draft-dws-24',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '',
    kode: 'II.24',
    display_no: '24',
    jenis: 'Melakukan penganiayaan terhadap teman, guru dan karyawan',
    keterangan: 'Dikeluarkan dari sekolah',
    poin: -100
  },
  {
    id: 'draft-dws-25',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '',
    kode: 'II.25',
    display_no: '25',
    jenis: 'Melakukan Pemalakan',
    keterangan: 'Ditegur, diperingatkan, pemanggilan orang tua dan surat peringatan',
    poin: -25
  },
  {
    id: 'draft-dws-26',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '',
    kode: 'II.26',
    display_no: '26',
    jenis: 'Mengancam teman, guru dan karyawan',
    keterangan: 'Ditegur dan diperingatkan serta pemanggilan orang tua dan Refleksi di rumah',
    poin: -15
  },
  {
    id: 'draft-dws-27',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '',
    kode: 'II.27',
    display_no: '27',
    jenis: 'Berbicara atau berperilaku atau bersikap tidak sopan',
    keterangan: 'Ditegur dan diperingatkan serta pemanggilan orang tua',
    poin: -5
  },
  {
    id: 'draft-dws-28',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '',
    kode: 'II.28',
    display_no: '28',
    jenis: 'Melakukan pemalsuan misalnya: tanda tangan nilai',
    keterangan: 'Ditegur dan diperingatkan',
    poin: -25
  },
  {
    id: 'draft-dws-29',
    tipe: 'negative',
    kategori: 'II. DALAM WAKTU SEKOLAH',
    sub_kategori: '',
    kode: 'II.29',
    display_no: '29',
    jenis: 'Menjual barang atau makanan di lingkungan sekolah tanpa rekomendasi guru',
    keterangan: 'Ditegur dan diperingatkan serta pemanggilan orang tua',
    poin: -15
  },

  // ============================================================
  // III. PAKAIAN (Hal. 19, Mulai dari No. 1)
  // ============================================================
  {
    id: 'draft-pak-1',
    tipe: 'negative',
    kategori: 'III. PAKAIAN',
    sub_kategori: '',
    kode: 'III.1',
    display_no: '1',
    jenis: 'Tidak memakai atribut sekolah atau kelengkapan seragam sekolah tidak sesuai dengan ketentuan',
    keterangan: 'Petugas piket akan menegur dan siswa diwajibkan untuk membeli ke koperasi',
    poin: -4
  },
  {
    id: 'draft-pak-2',
    tipe: 'negative',
    kategori: 'III. PAKAIAN',
    sub_kategori: '',
    kode: 'III.2',
    display_no: '2',
    jenis: 'Memakai seragam atau atribut atau berpenampilan tidak atau sesuai ketentuan sekolah atau perhiasan berlebihan',
    keterangan: 'Petugas piket akan menegur, menyita serta mewajibkan siswa untuk memperbaiki penampilannya sesuai peraturan yang berlaku',
    poin: -10
  },

  // ============================================================
  // IV. ALAT-ALAT PELAJARAN (Hal. 19, Mulai dari No. 1)
  // ============================================================
  {
    id: 'draft-alat-1',
    tipe: 'negative',
    kategori: 'IV. ALAT-ALAT PELAJARAN',
    sub_kategori: '',
    kode: 'IV.1',
    display_no: '1',
    jenis: 'Tidak membawa buku pelajaran baik buku cetak, catatan dan peralatan praktek',
    keterangan: 'Guru bidang studi akan menegur dan memperingatkan serta memberikan tugas kepada siswa tersebut',
    poin: -10
  },
  {
    id: 'draft-alat-2',
    tipe: 'negative',
    kategori: 'IV. ALAT-ALAT PELAJARAN',
    sub_kategori: '',
    kode: 'IV.2',
    display_no: '2',
    jenis: 'Tidak membawa buku Agenda atau panduan Tata Tertib atau buku pembinaan',
    keterangan: 'Guru bidang studi akan menegur dan melaporkan ke wali kelas',
    poin: -5
  },
  {
    id: 'draft-alat-3',
    tipe: 'negative',
    kategori: 'IV. ALAT-ALAT PELAJARAN',
    sub_kategori: '',
    kode: 'IV.3',
    display_no: '3',
    jenis: 'Meminjam peralatan atau Buku pelajaran temannya Saat kegiatan Belajar Mengajar berlangsung',
    keterangan: 'Guru bidang studi akan menyita barang dan menegur kedua anak tersebut',
    poin: -5
  },
  {
    id: 'draft-alat-4',
    tipe: 'negative',
    kategori: 'IV. ALAT-ALAT PELAJARAN',
    sub_kategori: '',
    kode: 'IV.4',
    display_no: '4',
    jenis: 'Meninggalkan Buku pelajaran / peralatan sejenisnya dilemari sekolah',
    keterangan: 'Guru bidang studi akan menegur dan berkoordinasi ke wali kelas untuk memanggil orang tua',
    poin: -5
  },

  // ============================================================
  // POIN POSITIF: I. PENGHARGAAN KEPENGURUSAN & ORGANISASI
  // ============================================================
  // 1. Kepengurusan OSIS
  {
    id: 'draft-pos-pkep-1',
    tipe: 'positive',
    kategori: 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI',
    sub_kategori: '1. Kepengurusan OSIS',
    kode: 'POS-PKEP-1',
    display_no: '1.a',
    jenis: 'Ketua OSIS (yang bertanggung jawab)',
    keterangan: 'SK Pengurus OSIS dari Sekolah',
    poin: 15
  },
  {
    id: 'draft-pos-pkep-2',
    tipe: 'positive',
    kategori: 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI',
    sub_kategori: '1. Kepengurusan OSIS',
    kode: 'POS-PKEP-2',
    display_no: '1.b',
    jenis: 'Wakil Ketua OSIS',
    keterangan: 'SK Pengurus OSIS dari Sekolah',
    poin: 12
  },
  {
    id: 'draft-pos-pkep-3',
    tipe: 'positive',
    kategori: 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI',
    sub_kategori: '1. Kepengurusan OSIS',
    kode: 'POS-PKEP-3',
    display_no: '1.c',
    jenis: 'Pengurus Inti OSIS (Sekretaris, Bendahara)',
    keterangan: 'SK Pengurus OSIS dari Sekolah',
    poin: 10
  },
  {
    id: 'draft-pos-pkep-4',
    tipe: 'positive',
    kategori: 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI',
    sub_kategori: '1. Kepengurusan OSIS',
    kode: 'POS-PKEP-4',
    display_no: '1.d',
    jenis: 'Koordinator Seksi / Bidang OSIS',
    keterangan: 'SK Pengurus OSIS dari Sekolah',
    poin: 8
  },
  {
    id: 'draft-pos-pkep-5',
    tipe: 'positive',
    kategori: 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI',
    sub_kategori: '1. Kepengurusan OSIS',
    kode: 'POS-PKEP-5',
    display_no: '1.e',
    jenis: 'Anggota Seksi / Pengurus OSIS Lainnya',
    keterangan: 'SK Pengurus OSIS dari Sekolah',
    poin: 6
  },

  // 2. Pramuka & Ekstrakurikuler
  {
    id: 'draft-pos-pkep-6',
    tipe: 'positive',
    kategori: 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI',
    sub_kategori: '2. Pramuka & Ekstrakurikuler',
    kode: 'POS-PKEP-6',
    display_no: '2.a',
    jenis: 'Pramuka Inti (Pasukan Khusus Pramuka)',
    keterangan: 'Penetapan Pembina Pramuka / Sekolah',
    poin: 10
  },
  {
    id: 'draft-pos-pkep-7',
    tipe: 'positive',
    kategori: 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI',
    sub_kategori: '2. Pramuka & Ekstrakurikuler',
    kode: 'POS-PKEP-7',
    display_no: '2.b',
    jenis: 'Dewan Penggalang Pramuka',
    keterangan: 'Penetapan Pembina Pramuka',
    poin: 8
  },
  {
    id: 'draft-pos-pkep-8',
    tipe: 'positive',
    kategori: 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI',
    sub_kategori: '2. Pramuka & Ekstrakurikuler',
    kode: 'POS-PKEP-8',
    display_no: '2.c',
    jenis: 'Penanggung Jawab / Ketua Ekstrakurikuler',
    keterangan: 'Laporan Pembina Ekstrakurikuler',
    poin: 5
  },
  {
    id: 'draft-pos-pkep-9',
    tipe: 'positive',
    kategori: 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI',
    sub_kategori: '2. Pramuka & Ekstrakurikuler',
    kode: 'POS-PKEP-9',
    display_no: '2.d',
    jenis: 'Kapten Tim Olahraga / Tim Sekolah (Basket, Futsal, dll)',
    keterangan: 'Kapten Tim Resmi Sekolah',
    poin: 5
  },
  {
    id: 'draft-pos-pkep-10',
    tipe: 'positive',
    kategori: 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI',
    sub_kategori: '2. Pramuka & Ekstrakurikuler',
    kode: 'POS-PKEP-10',
    display_no: '2.e',
    jenis: 'Panitia Kegiatan / Acara Sekolah (BMLJ, Cup, dll)',
    keterangan: 'Laporan Pembina / Panitia Guru',
    poin: 4
  },

  // 3. Kepengurusan Kelas
  {
    id: 'draft-pos-pkep-11',
    tipe: 'positive',
    kategori: 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI',
    sub_kategori: '3. Kepengurusan Kelas',
    kode: 'POS-PKEP-11',
    display_no: '3.a',
    jenis: 'Ketua Kelas (yang bertanggung jawab)',
    keterangan: 'Ditetapkan Wali Kelas',
    poin: 8
  },
  {
    id: 'draft-pos-pkep-12',
    tipe: 'positive',
    kategori: 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI',
    sub_kategori: '3. Kepengurusan Kelas',
    kode: 'POS-PKEP-12',
    display_no: '3.b',
    jenis: 'Wakil Ketua Kelas',
    keterangan: 'Ditetapkan Wali Kelas',
    poin: 6
  },
  {
    id: 'draft-pos-pkep-13',
    tipe: 'positive',
    kategori: 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI',
    sub_kategori: '3. Kepengurusan Kelas',
    kode: 'POS-PKEP-13',
    display_no: '3.c',
    jenis: 'Sekretaris Kelas',
    keterangan: 'Ditetapkan Wali Kelas',
    poin: 5
  },
  {
    id: 'draft-pos-pkep-14',
    tipe: 'positive',
    kategori: 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI',
    sub_kategori: '3. Kepengurusan Kelas',
    kode: 'POS-PKEP-14',
    display_no: '3.d',
    jenis: 'Bendahara Kelas',
    keterangan: 'Ditetapkan Wali Kelas',
    poin: 5
  },
  {
    id: 'draft-pos-pkep-15',
    tipe: 'positive',
    kategori: 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI',
    sub_kategori: '3. Kepengurusan Kelas',
    kode: 'POS-PKEP-15',
    display_no: '3.e',
    jenis: 'Seksi / Pengurus Kelas Lainnya (Seksi Kebersihan, Keamanan, dll)',
    keterangan: 'Ditetapkan Wali Kelas',
    poin: 3
  },
  // ============================================================
  // POIN POSITIF: II. PENGHARGAAN AKADEMIK
  // ============================================================
  // 1. Nilai & Asesmen Harian
  {
    id: 'draft-pos-pa-1',
    tipe: 'positive',
    kategori: 'II. PENGHARGAAN AKADEMIK',
    sub_kategori: '1. Nilai & Asesmen Harian',
    kode: 'POS-PA-1',
    display_no: '1.a',
    jenis: 'Mendapatkan nilai 100 saat penilaian harian (asesmen)',
    keterangan: 'Bukti nilai asesmen guru',
    poin: 2
  },
  {
    id: 'draft-pos-pa-2',
    tipe: 'positive',
    kategori: 'II. PENGHARGAAN AKADEMIK',
    sub_kategori: '1. Nilai & Asesmen Harian',
    kode: 'POS-PA-2',
    display_no: '1.b',
    jenis: 'Tidak ada nilai di bawah KKTP pada rapor tengah semester / semester',
    keterangan: 'Bukti rapor hasil belajar',
    poin: 10
  },
  {
    id: 'draft-pos-pa-3',
    tipe: 'positive',
    kategori: 'II. PENGHARGAAN AKADEMIK',
    sub_kategori: '1. Nilai & Asesmen Harian',
    kode: 'POS-PA-3',
    display_no: '1.c',
    jenis: 'Menemukan inovasi / teknologi / karya ilmiah yang bermanfaat bagi pendidikan',
    keterangan: 'Karya ilmiah disetujui pihak sekolah',
    poin: 40
  },

  // 2. Peringkat Paralel Angkatan (Rapor Semester) - Rinci 1 s/d 20
  {
    id: 'draft-pos-pa-4',
    tipe: 'positive',
    kategori: 'II. PENGHARGAAN AKADEMIK',
    sub_kategori: '2. Peringkat Paralel Angkatan',
    kode: 'POS-PA-4',
    display_no: '2.a',
    jenis: 'Peringkat 1 Besar 1 Angkatan pada Rapor Semester',
    keterangan: 'Ditetapkan berdasarkan rapor semester resmi',
    poin: 20
  },
  {
    id: 'draft-pos-pa-5',
    tipe: 'positive',
    kategori: 'II. PENGHARGAAN AKADEMIK',
    sub_kategori: '2. Peringkat Paralel Angkatan',
    kode: 'POS-PA-5',
    display_no: '2.b',
    jenis: 'Peringkat 2 Besar 1 Angkatan pada Rapor Semester',
    keterangan: 'Ditetapkan berdasarkan rapor semester resmi',
    poin: 15
  },
  {
    id: 'draft-pos-pa-6',
    tipe: 'positive',
    kategori: 'II. PENGHARGAAN AKADEMIK',
    sub_kategori: '2. Peringkat Paralel Angkatan',
    kode: 'POS-PA-6',
    display_no: '2.c',
    jenis: 'Peringkat 3 Besar 1 Angkatan pada Rapor Semester',
    keterangan: 'Ditetapkan berdasarkan rapor semester resmi',
    poin: 12
  },
  {
    id: 'draft-pos-pa-7',
    tipe: 'positive',
    kategori: 'II. PENGHARGAAN AKADEMIK',
    sub_kategori: '2. Peringkat Paralel Angkatan',
    kode: 'POS-PA-7',
    display_no: '2.d',
    jenis: 'Peringkat 4 Besar 1 Angkatan pada Rapor Semester',
    keterangan: 'Ditetapkan berdasarkan rapor semester resmi',
    poin: 10
  },
  {
    id: 'draft-pos-pa-8',
    tipe: 'positive',
    kategori: 'II. PENGHARGAAN AKADEMIK',
    sub_kategori: '2. Peringkat Paralel Angkatan',
    kode: 'POS-PA-8',
    display_no: '2.e',
    jenis: 'Peringkat 5 Besar 1 Angkatan pada Rapor Semester',
    keterangan: 'Ditetapkan berdasarkan rapor semester resmi',
    poin: 10
  },
  {
    id: 'draft-pos-pa-9',
    tipe: 'positive',
    kategori: 'II. PENGHARGAAN AKADEMIK',
    sub_kategori: '2. Peringkat Paralel Angkatan',
    kode: 'POS-PA-9',
    display_no: '2.f',
    jenis: 'Peringkat 6 Besar 1 Angkatan pada Rapor Semester',
    keterangan: 'Ditetapkan berdasarkan rapor semester resmi',
    poin: 8
  },
  {
    id: 'draft-pos-pa-10',
    tipe: 'positive',
    kategori: 'II. PENGHARGAAN AKADEMIK',
    sub_kategori: '2. Peringkat Paralel Angkatan',
    kode: 'POS-PA-10',
    display_no: '2.g',
    jenis: 'Peringkat 7 Besar 1 Angkatan pada Rapor Semester',
    keterangan: 'Ditetapkan berdasarkan rapor semester resmi',
    poin: 8
  },
  {
    id: 'draft-pos-pa-11',
    tipe: 'positive',
    kategori: 'II. PENGHARGAAN AKADEMIK',
    sub_kategori: '2. Peringkat Paralel Angkatan',
    kode: 'POS-PA-11',
    display_no: '2.h',
    jenis: 'Peringkat 8 Besar 1 Angkatan pada Rapor Semester',
    keterangan: 'Ditetapkan berdasarkan rapor semester resmi',
    poin: 8
  },
  {
    id: 'draft-pos-pa-12',
    tipe: 'positive',
    kategori: 'II. PENGHARGAAN AKADEMIK',
    sub_kategori: '2. Peringkat Paralel Angkatan',
    kode: 'POS-PA-12',
    display_no: '2.i',
    jenis: 'Peringkat 9 Besar 1 Angkatan pada Rapor Semester',
    keterangan: 'Ditetapkan berdasarkan rapor semester resmi',
    poin: 8
  },
  {
    id: 'draft-pos-pa-13',
    tipe: 'positive',
    kategori: 'II. PENGHARGAAN AKADEMIK',
    sub_kategori: '2. Peringkat Paralel Angkatan',
    kode: 'POS-PA-13',
    display_no: '2.j',
    jenis: 'Peringkat 10 Besar 1 Angkatan pada Rapor Semester',
    keterangan: 'Ditetapkan berdasarkan rapor semester resmi',
    poin: 8
  },
  {
    id: 'draft-pos-pa-14',
    tipe: 'positive',
    kategori: 'II. PENGHARGAAN AKADEMIK',
    sub_kategori: '2. Peringkat Paralel Angkatan',
    kode: 'POS-PA-14',
    display_no: '2.k',
    jenis: 'Peringkat 11 Besar 1 Angkatan pada Rapor Semester',
    keterangan: 'Ditetapkan berdasarkan rapor semester resmi',
    poin: 7
  },
  {
    id: 'draft-pos-pa-15',
    tipe: 'positive',
    kategori: 'II. PENGHARGAAN AKADEMIK',
    sub_kategori: '2. Peringkat Paralel Angkatan',
    kode: 'POS-PA-15',
    display_no: '2.l',
    jenis: 'Peringkat 12 Besar 1 Angkatan pada Rapor Semester',
    keterangan: 'Ditetapkan berdasarkan rapor semester resmi',
    poin: 7
  },
  {
    id: 'draft-pos-pa-16',
    tipe: 'positive',
    kategori: 'II. PENGHARGAAN AKADEMIK',
    sub_kategori: '2. Peringkat Paralel Angkatan',
    kode: 'POS-PA-16',
    display_no: '2.m',
    jenis: 'Peringkat 13 Besar 1 Angkatan pada Rapor Semester',
    keterangan: 'Ditetapkan berdasarkan rapor semester resmi',
    poin: 7
  },
  {
    id: 'draft-pos-pa-17',
    tipe: 'positive',
    kategori: 'II. PENGHARGAAN AKADEMIK',
    sub_kategori: '2. Peringkat Paralel Angkatan',
    kode: 'POS-PA-17',
    display_no: '2.n',
    jenis: 'Peringkat 14 Besar 1 Angkatan pada Rapor Semester',
    keterangan: 'Ditetapkan berdasarkan rapor semester resmi',
    poin: 7
  },
  {
    id: 'draft-pos-pa-18',
    tipe: 'positive',
    kategori: 'II. PENGHARGAAN AKADEMIK',
    sub_kategori: '2. Peringkat Paralel Angkatan',
    kode: 'POS-PA-18',
    display_no: '2.o',
    jenis: 'Peringkat 15 Besar 1 Angkatan pada Rapor Semester',
    keterangan: 'Ditetapkan berdasarkan rapor semester resmi',
    poin: 7
  },
  {
    id: 'draft-pos-pa-19',
    tipe: 'positive',
    kategori: 'II. PENGHARGAAN AKADEMIK',
    sub_kategori: '2. Peringkat Paralel Angkatan',
    kode: 'POS-PA-19',
    display_no: '2.p',
    jenis: 'Peringkat 16 Besar 1 Angkatan pada Rapor Semester',
    keterangan: 'Ditetapkan berdasarkan rapor semester resmi',
    poin: 6
  },
  {
    id: 'draft-pos-pa-20',
    tipe: 'positive',
    kategori: 'II. PENGHARGAAN AKADEMIK',
    sub_kategori: '2. Peringkat Paralel Angkatan',
    kode: 'POS-PA-20',
    display_no: '2.q',
    jenis: 'Peringkat 17 Besar 1 Angkatan pada Rapor Semester',
    keterangan: 'Ditetapkan berdasarkan rapor semester resmi',
    poin: 6
  },
  {
    id: 'draft-pos-pa-21',
    tipe: 'positive',
    kategori: 'II. PENGHARGAAN AKADEMIK',
    sub_kategori: '2. Peringkat Paralel Angkatan',
    kode: 'POS-PA-21',
    display_no: '2.r',
    jenis: 'Peringkat 18 Besar 1 Angkatan pada Rapor Semester',
    keterangan: 'Ditetapkan berdasarkan rapor semester resmi',
    poin: 6
  },
  {
    id: 'draft-pos-pa-22',
    tipe: 'positive',
    kategori: 'II. PENGHARGAAN AKADEMIK',
    sub_kategori: '2. Peringkat Paralel Angkatan',
    kode: 'POS-PA-22',
    display_no: '2.s',
    jenis: 'Peringkat 19 Besar 1 Angkatan pada Rapor Semester',
    keterangan: 'Ditetapkan berdasarkan rapor semester resmi',
    poin: 6
  },
  {
    id: 'draft-pos-pa-23',
    tipe: 'positive',
    kategori: 'II. PENGHARGAAN AKADEMIK',
    sub_kategori: '2. Peringkat Paralel Angkatan',
    kode: 'POS-PA-23',
    display_no: '2.t',
    jenis: 'Peringkat 20 Besar 1 Angkatan pada Rapor Semester',
    keterangan: 'Ditetapkan berdasarkan rapor semester resmi',
    poin: 5
  },

  // ============================================================
  // POIN POSITIF: III. PENGHARGAAN PRESTASI & LOMBA
  // ============================================================
  // 1. Lomba Lingkup Sekolah (Antar Kelas / Class Meeting / Porseni)
  {
    id: 'draft-pos-lom-1',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '1. Lomba Lingkup Sekolah & Antar Kelas',
    kode: 'POS-LOM-1',
    display_no: '1.a',
    jenis: 'Mewakili lomba / kegiatan antar kelas (Class Meeting / Porseni)',
    keterangan: 'Laporan Panitia / Wali Kelas',
    poin: 2
  },
  {
    id: 'draft-pos-lom-2',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '1. Lomba Lingkup Sekolah & Antar Kelas',
    kode: 'POS-LOM-2',
    display_no: '1.b',
    jenis: 'Juara 3 Lomba Antar Kelas (Individu / Kelompok)',
    keterangan: 'Piagam / Pengumuman Panitia',
    poin: 3
  },
  {
    id: 'draft-pos-lom-3',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '1. Lomba Lingkup Sekolah & Antar Kelas',
    kode: 'POS-LOM-3',
    display_no: '1.c',
    jenis: 'Juara 2 Lomba Antar Kelas (Individu / Kelompok)',
    keterangan: 'Piagam / Pengumuman Panitia',
    poin: 4
  },
  {
    id: 'draft-pos-lom-4',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '1. Lomba Lingkup Sekolah & Antar Kelas',
    kode: 'POS-LOM-4',
    display_no: '1.d',
    jenis: 'Juara 1 Lomba Antar Kelas (Individu / Kelompok)',
    keterangan: 'Piagam / Pengumuman Panitia',
    poin: 6
  },

  // 2. Lomba Swasta / Yayasan / Undangan / Cup Antar Sekolah (Akumulasi Bertahap)
  {
    id: 'draft-pos-lsw-1',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '2. Lomba Swasta & Cup Antar Sekolah',
    kode: 'POS-LSW-1',
    display_no: '2.a',
    jenis: 'Mewakili lomba antar sekolah / kegiatan swasta (undangan/cup)',
    keterangan: 'Surat Tugas / Sertifikat Peserta',
    poin: 3
  },
  {
    id: 'draft-pos-lsw-2',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '2. Lomba Swasta & Cup Antar Sekolah',
    kode: 'POS-LSW-2',
    display_no: '2.b',
    jenis: 'Juara Harapan / Finalis Lomba Swasta (Individu / Kelompok)',
    keterangan: 'Sertifikat Juara Harapan / Finalis',
    poin: 4
  },
  {
    id: 'draft-pos-lsw-3',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '2. Lomba Swasta & Cup Antar Sekolah',
    kode: 'POS-LSW-3',
    display_no: '2.c',
    jenis: 'Juara 3 Lomba Swasta (Individu / Kelompok)',
    keterangan: 'Sertifikat / Piala Juara 3',
    poin: 6
  },
  {
    id: 'draft-pos-lsw-4',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '2. Lomba Swasta & Cup Antar Sekolah',
    kode: 'POS-LSW-4',
    display_no: '2.d',
    jenis: 'Juara 2 Lomba Swasta (Individu / Kelompok)',
    keterangan: 'Sertifikat / Piala Juara 2',
    poin: 8
  },
  {
    id: 'draft-pos-lsw-5',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '2. Lomba Swasta & Cup Antar Sekolah',
    kode: 'POS-LSW-5',
    display_no: '2.e',
    jenis: 'Juara 1 Lomba Swasta (Individu / Kelompok)',
    keterangan: 'Sertifikat / Piala Juara 1',
    poin: 10
  },
  {
    id: 'draft-pos-lsw-6',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '2. Lomba Swasta & Cup Antar Sekolah',
    kode: 'POS-LSW-6',
    display_no: '2.f',
    jenis: 'Juara Lomba Swasta Tingkat Wilayah / Nasional Terbuka',
    keterangan: 'Sertifikat Juara Lomba Terbuka',
    poin: 15
  },

  // 3. Lomba Resmi Dinas / Pemerintah (OSN / O2SN / FLS2N / Popda / Puspresnas) - Akumulasi Bertahap
  // Tingkat Kecamatan
  {
    id: 'draft-pos-ldin-1',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '3. Lomba Resmi Dinas (Kecamatan / Kota)',
    kode: 'POS-LDIN-1',
    display_no: '3.a',
    jenis: 'Mewakili lomba / kegiatan tingkat Kecamatan (resmi dinas)',
    keterangan: 'Surat Tugas / Sertifikat Peserta Kecamatan',
    poin: 3
  },
  {
    id: 'draft-pos-ldin-2',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '3. Lomba Resmi Dinas (Kecamatan / Kota)',
    kode: 'POS-LDIN-2',
    display_no: '3.b',
    jenis: 'Juara 3 / 2 / 1 Lomba Dinas Tingkat Kecamatan',
    keterangan: 'Sertifikat / Piagam Juara Kecamatan',
    poin: 6
  },
  // Tingkat Kota / Daerah
  {
    id: 'draft-pos-ldin-3',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '3. Lomba Resmi Dinas (Kecamatan / Kota)',
    kode: 'POS-LDIN-3',
    display_no: '3.c',
    jenis: 'Lolos Seleksi & Mewakili lomba tingkat Kota / Daerah (resmi dinas)',
    keterangan: 'Surat Tugas / Sertifikat Peserta Kota',
    poin: 4
  },
  {
    id: 'draft-pos-ldin-4',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '3. Lomba Resmi Dinas (Kecamatan / Kota)',
    kode: 'POS-LDIN-4',
    display_no: '3.d',
    jenis: 'Juara Harapan / Finalis Tingkat Kota / Daerah (resmi dinas)',
    keterangan: 'Sertifikat Juara Harapan Kota',
    poin: 5
  },
  {
    id: 'draft-pos-ldin-5',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '3. Lomba Resmi Dinas (Kecamatan / Kota)',
    kode: 'POS-LDIN-5',
    display_no: '3.e',
    jenis: 'Juara 3 Lomba Dinas Tingkat Kota / Daerah',
    keterangan: 'Sertifikat / Medali Juara 3 Kota',
    poin: 8
  },
  {
    id: 'draft-pos-ldin-6',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '3. Lomba Resmi Dinas (Kecamatan / Kota)',
    kode: 'POS-LDIN-6',
    display_no: '3.f',
    jenis: 'Juara 2 Lomba Dinas Tingkat Kota / Daerah',
    keterangan: 'Sertifikat / Medali Juara 2 Kota',
    poin: 10
  },
  {
    id: 'draft-pos-ldin-7',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '3. Lomba Resmi Dinas (Kecamatan / Kota)',
    kode: 'POS-LDIN-7',
    display_no: '3.g',
    jenis: 'Juara 1 Lomba Dinas Tingkat Kota / Daerah',
    keterangan: 'Sertifikat / Medali Juara 1 Kota',
    poin: 12
  },

  // Tingkat Provinsi & Nasional
  {
    id: 'draft-pos-ldin-8',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '4. Lomba Resmi Dinas (Provinsi / Nasional)',
    kode: 'POS-LDIN-8',
    display_no: '4.a',
    jenis: 'Lolos Seleksi & Mewakili kontingen tingkat Provinsi (resmi dinas)',
    keterangan: 'Surat Tugas Kontingen / Sertifikat Peserta Provinsi',
    poin: 6
  },
  {
    id: 'draft-pos-ldin-9',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '4. Lomba Resmi Dinas (Provinsi / Nasional)',
    kode: 'POS-LDIN-9',
    display_no: '4.b',
    jenis: 'Juara Harapan / Finalis Tingkat Provinsi (resmi dinas)',
    keterangan: 'Sertifikat Juara Harapan Provinsi',
    poin: 8
  },
  {
    id: 'draft-pos-ldin-10',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '4. Lomba Resmi Dinas (Provinsi / Nasional)',
    kode: 'POS-LDIN-10',
    display_no: '4.c',
    jenis: 'Juara 3 Lomba Dinas Tingkat Provinsi',
    keterangan: 'Sertifikat / Medali Juara 3 Provinsi',
    poin: 12
  },
  {
    id: 'draft-pos-ldin-11',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '4. Lomba Resmi Dinas (Provinsi / Nasional)',
    kode: 'POS-LDIN-11',
    display_no: '4.d',
    jenis: 'Juara 2 Lomba Dinas Tingkat Provinsi',
    keterangan: 'Sertifikat / Medali Juara 2 Provinsi',
    poin: 15
  },
  {
    id: 'draft-pos-ldin-12',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '4. Lomba Resmi Dinas (Provinsi / Nasional)',
    kode: 'POS-LDIN-12',
    display_no: '4.e',
    jenis: 'Juara 1 Lomba Dinas Tingkat Provinsi',
    keterangan: 'Sertifikat / Medali Juara 1 Provinsi',
    poin: 18
  },
  {
    id: 'draft-pos-ldin-13',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '4. Lomba Resmi Dinas (Provinsi / Nasional)',
    kode: 'POS-LDIN-13',
    display_no: '4.f',
    jenis: 'Lolos Seleksi & Mewakili kontingen tingkat Nasional / Internasional',
    keterangan: 'Surat Tugas Kontingen Nasional / Sertifikat Finalis',
    poin: 10
  },
  {
    id: 'draft-pos-ldin-14',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '4. Lomba Resmi Dinas (Provinsi / Nasional)',
    kode: 'POS-LDIN-14',
    display_no: '4.g',
    jenis: 'Juara Harapan / Finalis Tingkat Nasional / Internasional',
    keterangan: 'Sertifikat Juara Harapan Nasional',
    poin: 12
  },
  {
    id: 'draft-pos-ldin-15',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '4. Lomba Resmi Dinas (Provinsi / Nasional)',
    kode: 'POS-LDIN-15',
    display_no: '4.h',
    jenis: 'Juara 3 Tingkat Nasional / Internasional (Medali Perunggu)',
    keterangan: 'Sertifikat / Medali Perunggu Nasional',
    poin: 18
  },
  {
    id: 'draft-pos-ldin-16',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '4. Lomba Resmi Dinas (Provinsi / Nasional)',
    kode: 'POS-LDIN-16',
    display_no: '4.i',
    jenis: 'Juara 2 Tingkat Nasional / Internasional (Medali Perak)',
    keterangan: 'Sertifikat / Medali Perak Nasional',
    poin: 22
  },
  {
    id: 'draft-pos-ldin-17',
    tipe: 'positive',
    kategori: 'III. PENGHARGAAN PRESTASI & LOMBA',
    sub_kategori: '4. Lomba Resmi Dinas (Provinsi / Nasional)',
    kode: 'POS-LDIN-17',
    display_no: '4.j',
    jenis: 'Juara 1 Tingkat Nasional / Internasional (Medali Emas)',
    keterangan: 'Sertifikat / Medali Emas Nasional',
    poin: 25
  },

  // ============================================================
  // POIN POSITIF: IV. PETUGAS UPACARA & PELAYANAN
  // ============================================================
  // 1. Petugas Upacara Bendera & Senam
  {
    id: 'draft-pos-pup-1',
    tipe: 'positive',
    kategori: 'IV. PETUGAS UPACARA & PELAYANAN',
    sub_kategori: '1. Petugas Upacara Bendera & Acara',
    kode: 'POS-PUP-1',
    display_no: '1.a',
    jenis: 'Pengibar Bendera (Paskibra Upacara Bendera)',
    keterangan: 'Penetapan Pembina Upacara',
    poin: 5
  },
  {
    id: 'draft-pos-pup-2',
    tipe: 'positive',
    kategori: 'IV. PETUGAS UPACARA & PELAYANAN',
    sub_kategori: '1. Petugas Upacara Bendera & Acara',
    kode: 'POS-PUP-2',
    display_no: '1.b',
    jenis: 'Petugas Upacara Lainnya (Pemimpin, UUD, Janji Siswa, Doa)',
    keterangan: 'Penetapan Pembina Upacara',
    poin: 4
  },
  {
    id: 'draft-pos-pup-3',
    tipe: 'positive',
    kategori: 'IV. PETUGAS UPACARA & PELAYANAN',
    sub_kategori: '1. Petugas Upacara Bendera & Acara',
    kode: 'POS-PUP-3',
    display_no: '1.c',
    jenis: 'Paduan Suara saat Upacara Bendera / Misa Sekolah',
    keterangan: 'Laporan Pembina Paduan Suara',
    poin: 4
  },
  {
    id: 'draft-pos-pup-4',
    tipe: 'positive',
    kategori: 'IV. PETUGAS UPACARA & PELAYANAN',
    sub_kategori: '1. Petugas Upacara Bendera & Acara',
    kode: 'POS-PUP-4',
    display_no: '1.d',
    jenis: 'Petugas PMR / Tim Medis saat Upacara Bendera',
    keterangan: 'Laporan Pembina PMR',
    poin: 2
  },
  {
    id: 'draft-pos-pup-5',
    tipe: 'positive',
    kategori: 'IV. PETUGAS UPACARA & PELAYANAN',
    sub_kategori: '1. Petugas Upacara Bendera & Acara',
    kode: 'POS-PUP-5',
    display_no: '1.e',
    jenis: 'Pemimpin Senam Pagi Sekolah',
    keterangan: 'Laporan Guru Olahraga / Pembina',
    poin: 2
  },

  // 2. Pelayanan Ibadat & Keagamaan
  {
    id: 'draft-pos-pib-1',
    tipe: 'positive',
    kategori: 'IV. PETUGAS UPACARA & PELAYANAN',
    sub_kategori: '2. Pelayanan Ibadat & Keagamaan',
    kode: 'POS-PIB-1',
    display_no: '2.a',
    jenis: 'Menjadi Misdinar di Gereja / di Sekolah',
    keterangan: 'Surat Keterangan / Laporan Gereja/Sekolah',
    poin: 4
  },
  {
    id: 'draft-pos-pib-2',
    tipe: 'positive',
    kategori: 'IV. PETUGAS UPACARA & PELAYANAN',
    sub_kategori: '2. Pelayanan Ibadat & Keagamaan',
    kode: 'POS-PIB-2',
    display_no: '2.b',
    jenis: 'Menjadi Putri Sakristi / Lektor / Pemazmur di Gereja',
    keterangan: 'Surat Keterangan / Laporan Gereja',
    poin: 3
  },
  {
    id: 'draft-pos-pib-3',
    tipe: 'positive',
    kategori: 'IV. PETUGAS UPACARA & PELAYANAN',
    sub_kategori: '2. Pelayanan Ibadat & Keagamaan',
    kode: 'POS-PIB-3',
    display_no: '2.c',
    jenis: 'Menjadi Petugas saat Ibadat / Doa Bersama di Sekolah',
    keterangan: 'Laporan Guru Agama / Wali Kelas',
    poin: 2
  },

  // ============================================================
  // POIN POSITIF: V. KETERTIBAN & KETELADANAN
  // ============================================================
  // 1. Kedisiplinan & Kehadiran Teladan
  {
    id: 'draft-pos-pket-1',
    tipe: 'positive',
    kategori: 'V. KETERTIBAN & KETELADANAN',
    sub_kategori: '1. Kedisiplinan & Kehadiran Teladan',
    kode: 'POS-PKET-1',
    display_no: '1.a',
    jenis: 'Tidak pernah terlambat dalam 1 bulan penuh',
    keterangan: 'Rekap Presensi Harian Sekolah',
    poin: 4
  },
  {
    id: 'draft-pos-pket-2',
    tipe: 'positive',
    kategori: 'V. KETERTIBAN & KETELADANAN',
    sub_kategori: '1. Kedisiplinan & Kehadiran Teladan',
    kode: 'POS-PKET-2',
    display_no: '1.b',
    jenis: 'Kehadiran sempurna (tanpa absen / alpha) selama 1 semester',
    keterangan: 'Rekap Presensi Rapor Semester',
    poin: 15
  },
  {
    id: 'draft-pos-pket-3',
    tipe: 'positive',
    kategori: 'V. KETERTIBAN & KETELADANAN',
    sub_kategori: '1. Kedisiplinan & Kehadiran Teladan',
    kode: 'POS-PKET-3',
    display_no: '1.c',
    jenis: 'Kelas terbersih / piket kelas terbaik',
    keterangan: 'Penilaian Tim Kebersihan Sekolah / Wali Kelas',
    poin: 5
  },

  // 2. Kejujuran & Budi Pekerti
  {
    id: 'draft-pos-pket-4',
    tipe: 'positive',
    kategori: 'V. KETERTIBAN & KETELADANAN',
    sub_kategori: '2. Kejujuran & Budi Pekerti',
    kode: 'POS-PKET-4',
    display_no: '2.a',
    jenis: 'Menemukan & mengembalikan barang berharga / uang di lingkungan sekolah',
    keterangan: 'Laporan Guru Piket / Kesiswaan',
    poin: 10
  },
  {
    id: 'draft-pos-pket-5',
    tipe: 'positive',
    kategori: 'V. KETERTIBAN & KETELADANAN',
    sub_kategori: '2. Kejujuran & Budi Pekerti',
    kode: 'POS-PKET-5',
    display_no: '2.b',
    jenis: 'Melaporkan terjadinya pelanggaran oleh murid lain (Integritas)',
    keterangan: 'Laporan Terverifikasi Guru / BK',
    poin: 6
  },
  {
    id: 'draft-pos-pket-6',
    tipe: 'positive',
    kategori: 'V. KETERTIBAN & KETELADANAN',
    sub_kategori: '2. Kejujuran & Budi Pekerti',
    kode: 'POS-PKET-6',
    display_no: '2.c',
    jenis: 'Menolong warga sekolah / tindakan teladan sopan santun',
    keterangan: 'Rekomendasi Guru / Wali Kelas',
    poin: 5
  }
]
