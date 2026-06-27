-- ============================================================
-- SEED DATA: Sistem Poin Siswa
-- Jalankan di Supabase SQL Editor SETELAH migration schema
-- ============================================================

-- ============================================================
-- 1. TAHAP PEMBINAAN
-- ============================================================
INSERT INTO guidance_stages (nama_tahap, batas_poin, tindakan, penanggung_jawab, urutan) VALUES
  ('Panggilan I',   75, 'Pemanggilan Orang Tua',                                        'Wali Kelas',                          1),
  ('Panggilan II',  50, 'Pemanggilan Orang Tua',                                        'Wakasek Kesiswaan & BK',              2),
  ('Panggilan III', 25, 'Pemanggilan Orang Tua + Refleksi Diri di Rumah',               'Wakasek Kesiswaan & BK',              3),
  ('Panggilan IV',  0,  'Dikembalikan kepada Orang Tua / Dikeluarkan dari Sekolah',     'Kepala Sekolah & Wakasek Kesiswaan',  4)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. KATALOG POIN NEGATIF
-- ============================================================
INSERT INTO point_catalog (tipe, kategori, kode, jenis, keterangan, poin) VALUES
  -- I. KEHADIRAN
  ('negative','I. KEHADIRAN','1.a','Terlambat datang ke sekolah ≤ 5 menit',     'Petugas piket mencatat nama dan diperbolehkan masuk',                                -2),
  ('negative','I. KEHADIRAN','1.b','Terlambat datang ke sekolah > 5 menit',     'Petugas piket mencatat nama dan memberikan tugas 1 jam pelajaran',                   -4),
  ('negative','I. KEHADIRAN','1.c','Terlambat > 5 menit lebih dari 2 kali',     'Petugas piket memberi tugas, lapor wali kelas & orang tua',                          -5),
  ('negative','I. KEHADIRAN','2.a','Tidak hadir tanpa keterangan (alpha)',       'Wali kelas konfirmasi ke orang tua',                                                 -5),
  ('negative','I. KEHADIRAN','2.b','Tidak hadir lebih dari 3 hari berturut-turut','Wali kelas & BK konfirmasi ke orang tua',                                           -10),
  ('negative','I. KEHADIRAN','3.a','Meninggalkan sekolah tanpa izin (bolos)',    'Dicatat dan lapor orang tua',                                                        -10),
  ('negative','I. KEHADIRAN','3.b','Meninggalkan kelas tanpa izin guru',         'Dicatat oleh guru & dilaporkan ke wali kelas',                                       -5),

  -- II. DALAM WAKTU SEKOLAH
  ('negative','II. DALAM WAKTU SEKOLAH','4',  'Tidak mengerjakan PR / tugas',              'Ditegur guru, harus menyelesaikan tugas',                                  -5),
  ('negative','II. DALAM WAKTU SEKOLAH','5',  'Tidak membawa buku pelajaran',              'Ditegur guru',                                                             -3),
  ('negative','II. DALAM WAKTU SEKOLAH','6',  'Menyontek saat ulangan / ujian',            'Kertas diambil, nilai 0, lapor wali kelas',                                -15),
  ('negative','II. DALAM WAKTU SEKOLAH','7',  'Tidak mengikuti upacara bendera',           'Dicatat dan harus ikut upacara susulan',                                   -5),
  ('negative','II. DALAM WAKTU SEKOLAH','8',  'Makan/minum di dalam kelas saat KBM',       'Ditegur guru',                                                             -3),
  ('negative','II. DALAM WAKTU SEKOLAH','9',  'Membuat kegaduhan saat KBM',               'Dikeluarkan dari kelas',                                                   -15),
  ('negative','II. DALAM WAKTU SEKOLAH','10', 'Menggunakan HP saat KBM',                  'HP disita sementara, lapor wali kelas',                                    -10),
  ('negative','II. DALAM WAKTU SEKOLAH','11', 'Berkelahi / tawuran di lingkungan sekolah','Skorsing, lapor orang tua',                                                -30),
  ('negative','II. DALAM WAKTU SEKOLAH','12', 'Bullying verbal / fisik',                  'Skorsing, wajib konseling BK',                                             -25),
  ('negative','II. DALAM WAKTU SEKOLAH','13', 'Merusak/mencoret fasilitas sekolah',       'Wajib mengganti, lapor orang tua',                                         -20),
  ('negative','II. DALAM WAKTU SEKOLAH','14a','Membawa rokok / merokok di sekolah',       'Lapor orang tua, skorsing',                                                -30),
  ('negative','II. DALAM WAKTU SEKOLAH','14b','Membawa narkoba / minuman keras',          'Dikeluarkan dari sekolah',                                                 -100),
  ('negative','II. DALAM WAKTU SEKOLAH','15', 'Berjudi di lingkungan sekolah',            'Skorsing, lapor orang tua',                                                -25),
  ('negative','II. DALAM WAKTU SEKOLAH','16', 'Membawa senjata tajam / berbahaya',        'Dikeluarkan dari sekolah',                                                 -100),
  ('negative','II. DALAM WAKTU SEKOLAH','17', 'Mengancam / intimidasi warga sekolah',     'Skorsing, lapor orang tua, proses hukum',                                  -40),
  ('negative','II. DALAM WAKTU SEKOLAH','18', 'Mengakses konten negatif di sekolah',      'HP disita, lapor orang tua',                                               -15),

  -- III. PAKAIAN & PENAMPILAN
  ('negative','III. PAKAIAN & PENAMPILAN','19',  'Seragam tidak sesuai ketentuan (atribut tidak lengkap)','Wajib beli/pinjam ke koperasi',                            -4),
  ('negative','III. PAKAIAN & PENAMPILAN','20',  'Seragam tidak rapi / kotor',            'Ditegur, diperintahkan merapikan',                                         -3),
  ('negative','III. PAKAIAN & PENAMPILAN','21',  'Tidak memakai ikat pinggang hitam',     'Ditegur',                                                                  -3),
  ('negative','III. PAKAIAN & PENAMPILAN','22',  'Tidak memakai kaos kaki putih',         'Ditegur',                                                                  -3),
  ('negative','III. PAKAIAN & PENAMPILAN','23',  'Sepatu tidak hitam polos',              'Ditegur',                                                                  -3),
  ('negative','III. PAKAIAN & PENAMPILAN','24',  'Rambut panjang / tidak rapi (putra)',   'Diperintahkan potong rambut',                                              -5),
  ('negative','III. PAKAIAN & PENAMPILAN','25',  'Memakai aksesori berlebihan',           'Aksesori disita sementara',                                                -5),
  ('negative','III. PAKAIAN & PENAMPILAN','26',  'Mengecat rambut / makeup berlebihan',   'Diminta bersihkan',                                                        -10),

  -- IV. ALAT PELAJARAN & KEBERSIHAN
  ('negative','IV. ALAT PELAJARAN & KEBERSIHAN','27','Tidak membawa alat tulis lengkap',   'Ditegur',                                                                 -2),
  ('negative','IV. ALAT PELAJARAN & KEBERSIHAN','28','Membuang sampah sembarangan',        'Diperintahkan memungut dan membuang ke tempat sampah',                    -5),
  ('negative','IV. ALAT PELAJARAN & KEBERSIHAN','29','Tidak melaksanakan piket kelas',     'Diperintahkan melaksanakan piket susulan',                                -5),
  ('negative','IV. ALAT PELAJARAN & KEBERSIHAN','30','Mengganggu kebersihan lingkungan',   'Ditegur dan diperintahkan membersihkan',                                  -5)
ON CONFLICT (kode) DO NOTHING;

-- ============================================================
-- 3. KATALOG POIN POSITIF
-- ============================================================
INSERT INTO point_catalog (tipe, kategori, kode, jenis, keterangan, poin) VALUES
  ('positive','Prestasi Akademik','PA-1','Juara kelas / rangking terbaik',              'Penghargaan dari sekolah',                                        10),
  ('positive','Prestasi Akademik','PA-2','Juara lomba akademik tingkat sekolah',        'Piagam penghargaan dari sekolah',                                 15),
  ('positive','Prestasi Akademik','PA-3','Juara lomba akademik tingkat kota/provinsi',  'Piagam penghargaan dari sekolah',                                 25),
  ('positive','Prestasi Akademik','PA-4','Juara lomba akademik tingkat nasional',       'Piagam penghargaan dari sekolah',                                 50),
  ('positive','Kehadiran','KH-1','Tidak pernah terlambat selama 1 bulan penuh',         '',                                                                5),
  ('positive','Kehadiran','KH-2','Tidak pernah absen selama 1 semester',                '',                                                                15),
  ('positive','Sikap & Perilaku','SP-1','Menolong warga sekolah',                       '',                                                                5),
  ('positive','Sikap & Perilaku','SP-2','Melaporkan pelanggaran dengan jujur',          '',                                                                5),
  ('positive','Sikap & Perilaku','SP-3','Menjadi teladan sopan santun',                 'Direkomendasikan guru / wali kelas',                              10),
  ('positive','Organisasi & Ekskul','OR-1','Aktif di OSIS / Ekskul',                   '',                                                                10),
  ('positive','Organisasi & Ekskul','OR-2','Menjabat pengurus OSIS',                   '',                                                                15),
  ('positive','Kebersihan','KB-1','Kelas terbersih / piket terbaik',                    'Ditetapkan oleh wali kelas',                                      5),
  ('positive','Prestasi Non-Akademik','PN-1','Juara lomba seni / olahraga tingkat sekolah', 'Piagam penghargaan',                                         15),
  ('positive','Prestasi Non-Akademik','PN-2','Juara lomba seni / olahraga tingkat kota/provinsi','Piagam penghargaan',                                     25),
  ('positive','Prestasi Non-Akademik','PN-3','Juara lomba seni / olahraga tingkat nasional','Piagam penghargaan',                                          50)
ON CONFLICT (kode) DO NOTHING;

-- ============================================================
-- 4. TATA TERTIB — BAB I s/d BAB V
-- ============================================================
INSERT INTO school_regulations (bab, nama_bab, pasal, nama_pasal, nomor, isi, urutan) VALUES
  -- BAB I: TUJUAN DAN FUNGSI
  ('BAB I','Tujuan dan Fungsi','Pasal 1','Tujuan','01','Tata Tertib Sekolah bertujuan mendukung dan meningkatkan kualitas proses pembelajaran.',1),
  ('BAB I','Tujuan dan Fungsi','Pasal 1','Tujuan','02','Tata tertib sekolah bertujuan membantu peserta didik menjadi pribadi yang disiplin dan mandiri.',2),
  ('BAB I','Tujuan dan Fungsi','Pasal 1','Tujuan','03','Tata tertib sekolah bertujuan membantu peserta didik agar berkembang menjadi pribadi yang prososial.',3),
  ('BAB I','Tujuan dan Fungsi','Pasal 1','Tujuan','04','Tata Tertib Sekolah bertujuan membantu menumbuhkan nilai-nilai dan semangat cinta kasih sesuai ajaran kristiani.',4),
  ('BAB I','Tujuan dan Fungsi','Pasal 2','Fungsi','01','Tata Tertib Sekolah berfungsi sebagai pedoman perilaku bagi seluruh warga sekolah.',5),
  ('BAB I','Tujuan dan Fungsi','Pasal 2','Fungsi','02','Tata Tertib Sekolah berfungsi sebagai acuan dalam penegakan disiplin dan pemberian sanksi.',6),

  -- BAB II: HAK DAN KEWAJIBAN SISWA
  ('BAB II','Hak dan Kewajiban Siswa','Pasal 3','Hak Siswa','01','Setiap siswa berhak mendapatkan pendidikan dan pengajaran yang layak.',7),
  ('BAB II','Hak dan Kewajiban Siswa','Pasal 3','Hak Siswa','02','Setiap siswa berhak mendapatkan perlindungan dari segala bentuk kekerasan dan diskriminasi.',8),
  ('BAB II','Hak dan Kewajiban Siswa','Pasal 3','Hak Siswa','03','Setiap siswa berhak menggunakan fasilitas sekolah sesuai ketentuan yang berlaku.',9),
  ('BAB II','Hak dan Kewajiban Siswa','Pasal 3','Hak Siswa','04','Setiap siswa berhak menyampaikan pendapat secara santun melalui jalur yang telah ditetapkan.',10),
  ('BAB II','Hak dan Kewajiban Siswa','Pasal 4','Kewajiban Siswa','01','Setiap siswa wajib mematuhi seluruh peraturan dan tata tertib yang berlaku di sekolah.',11),
  ('BAB II','Hak dan Kewajiban Siswa','Pasal 4','Kewajiban Siswa','02','Setiap siswa wajib hadir di sekolah tepat waktu dan mengikuti seluruh kegiatan pembelajaran.',12),
  ('BAB II','Hak dan Kewajiban Siswa','Pasal 4','Kewajiban Siswa','03','Setiap siswa wajib bersikap sopan dan hormat kepada seluruh warga sekolah.',13),
  ('BAB II','Hak dan Kewajiban Siswa','Pasal 4','Kewajiban Siswa','04','Setiap siswa wajib menjaga kebersihan dan ketertiban lingkungan sekolah.',14),
  ('BAB II','Hak dan Kewajiban Siswa','Pasal 4','Kewajiban Siswa','05','Setiap siswa wajib mengenakan seragam lengkap sesuai ketentuan yang telah ditetapkan sekolah.',15),

  -- BAB III: LARANGAN
  ('BAB III','Larangan','Pasal 5','Larangan','01','Siswa dilarang membawa dan menggunakan alat komunikasi (HP) selama kegiatan belajar mengajar berlangsung tanpa izin guru.',16),
  ('BAB III','Larangan','Pasal 5','Larangan','02','Siswa dilarang membawa, menyimpan, dan mengonsumsi rokok, minuman beralkohol, dan narkotika di lingkungan sekolah.',17),
  ('BAB III','Larangan','Pasal 5','Larangan','03','Siswa dilarang melakukan tindakan kekerasan fisik maupun verbal (bullying) terhadap sesama siswa maupun warga sekolah lainnya.',18),
  ('BAB III','Larangan','Pasal 5','Larangan','04','Siswa dilarang merusak, mencoret, atau menghilangkan fasilitas dan perlengkapan sekolah.',19),
  ('BAB III','Larangan','Pasal 5','Larangan','05','Siswa dilarang mengakses, menyebarkan, atau menyimpan konten yang mengandung unsur SARA, pornografi, atau kekerasan.',20),
  ('BAB III','Larangan','Pasal 5','Larangan','06','Siswa dilarang berjudi dalam bentuk apa pun di lingkungan sekolah.',21),
  ('BAB III','Larangan','Pasal 5','Larangan','07','Siswa dilarang membawa dan menggunakan senjata tajam atau benda berbahaya lainnya.',22),
  ('BAB III','Larangan','Pasal 5','Larangan','08','Siswa dilarang meninggalkan lingkungan sekolah selama jam pelajaran berlangsung tanpa izin resmi dari sekolah.',23),

  -- BAB IV: SANKSI DAN PENGHARGAAN
  ('BAB IV','Sanksi dan Penghargaan','Pasal 6','Sanksi','01','Pelanggaran terhadap tata tertib akan dikenakan sanksi berupa pengurangan poin sesuai bobot pelanggaran.',24),
  ('BAB IV','Sanksi dan Penghargaan','Pasal 6','Sanksi','02','Siswa yang poinnya mencapai batas tertentu akan memasuki tahap pembinaan secara berjenjang.',25),
  ('BAB IV','Sanksi dan Fungsi','Pasal 6','Sanksi','03','Sanksi dapat berupa teguran lisan, teguran tertulis, pemanggilan orang tua, skorsing, hingga pengeluaran dari sekolah.',26),
  ('BAB IV','Sanksi dan Penghargaan','Pasal 7','Penghargaan','01','Siswa yang berprestasi dan berperilaku baik akan mendapatkan penambahan poin sesuai ketentuan.',27),
  ('BAB IV','Sanksi dan Penghargaan','Pasal 7','Penghargaan','02','Penghargaan dapat berupa sertifikat, piagam, atau bentuk apresiasi lain yang ditetapkan sekolah.',28),

  -- BAB V: LAIN-LAIN
  ('BAB V','Lain-lain','Pasal 8','Pelaksanaan','01','Tata tertib ini berlaku bagi seluruh siswa SMP Budi Mulia Jakarta.',29),
  ('BAB V','Lain-lain','Pasal 8','Pelaksanaan','02','Tata tertib ini dilaksanakan oleh seluruh warga sekolah di bawah koordinasi Kepala Sekolah.',30),
  ('BAB V','Lain-lain','Pasal 9','Perubahan','01','Tata tertib ini dapat diubah dan disesuaikan sesuai kebutuhan dengan persetujuan pihak yang berwenang.',31),
  ('BAB V','Lain-lain','Pasal 10','Penutup','01','Hal-hal yang belum diatur dalam tata tertib ini akan ditentukan kemudian berdasarkan musyawarah mufakat.',32)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Selesai! Seed data berhasil dimasukkan.
-- ============================================================
