-- ============================================================
-- SINKRONISASI TOTAL KATALOG POIN eBudimulia (BERSIH & RESMI)
-- Menghilangkan duplikasi pasal lama (NEG-KH-x) dan menggantikan
-- dengan 50 Butir Negatif Resmi (Hal 15-19) & 69 Butir Positif Terstruktur
-- ============================================================

-- 1. Tambahkan kolom sub_kategori & display_no jika belum ada
ALTER TABLE public.point_catalog ADD COLUMN IF NOT EXISTS sub_kategori TEXT DEFAULT '';
ALTER TABLE public.point_catalog ADD COLUMN IF NOT EXISTS display_no TEXT DEFAULT '';

-- 2. Pastikan Foreign Key pada point_records & pengajuan_poin_positif menggunakan ON DELETE SET NULL
--    (Mencegah error foreign key dan MENJAMIN RIWAYAT POIN SISWA TIDAK TERUBAH/HILANG)
ALTER TABLE public.point_records
  DROP CONSTRAINT IF EXISTS point_records_catalog_id_fkey;

ALTER TABLE public.point_records
  ADD CONSTRAINT point_records_catalog_id_fkey
  FOREIGN KEY (catalog_id)
  REFERENCES public.point_catalog(id)
  ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'pengajuan_poin_positif_catalog_id_fkey'
  ) THEN
    ALTER TABLE public.pengajuan_poin_positif DROP CONSTRAINT pengajuan_poin_positif_catalog_id_fkey;
    ALTER TABLE public.pengajuan_poin_positif ADD CONSTRAINT pengajuan_poin_positif_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES public.point_catalog(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Buka hak akses RLS penuh
ALTER TABLE public.point_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "point_catalog_all" ON public.point_catalog;
CREATE POLICY "point_catalog_all" ON public.point_catalog FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 4. Bersihkan seluruh data katalog lama (Riwayat poin siswa tetap aman karena FK bernilai SET NULL)
DELETE FROM public.point_catalog;

-- ============================================================
-- 5. INSERT 50 BUTIR POIN NEGATIF RESMI BUKU AGENDA (Hal 15-19)
-- ============================================================
INSERT INTO public.point_catalog (tipe, kategori, sub_kategori, kode, display_no, jenis, keterangan, poin) VALUES
  -- I. KEHADIRAN (6 Butir)
  ('negative', 'I. KEHADIRAN', '1. Terlambat datang ke sekolah', 'I.1.a', '1.a', 'Terlambat datang ke sekolah < 5 menit', 'Petugas piket akan mencatat nama siswa tersebut dan memperbolehkan dia masuk', -2),
  ('negative', 'I. KEHADIRAN', '1. Terlambat datang ke sekolah', 'I.1.b', '1.b', 'Terlambat datang ke sekolah > 5 menit', 'Petugas piket akan mencatat nama siswa tersebut dan memberikan tugas selama satu jam pelajaran', -4),
  ('negative', 'I. KEHADIRAN', '1. Terlambat datang ke sekolah', 'I.1.c', '1.c', 'Terlambat datang ke sekolah > 5 menit lebih dari 2x', 'Petugas piket akan memberikan tugas dan berkoordinasi dengan wali kelas untuk menghubungi orang tua', -5),
  ('negative', 'I. KEHADIRAN', '2. Tidak hadir sekolah', 'I.2.a', '2.a', 'Tidak hadir sekolah tanpa izin (tanpa keterangan)', 'Wali kelas akan berkoordinasi untuk konfirmasi ke orang tua', -5),
  ('negative', 'I. KEHADIRAN', '2. Tidak hadir sekolah', 'I.2.b', '2.b', 'Tidak hadir sekolah 3 hari berturut-turut tanpa keterangan', 'Wali kelas akan berkoordinasi untuk konfirmasi ke orang tua', -10),
  ('negative', 'I. KEHADIRAN', '2. Tidak hadir sekolah', 'I.2.c', '2.c', 'Tidak hadir pada kegiatan yang diwajibkan oleh sekolah tanpa alasan yang jelas', 'Wali kelas akan menegur dan memanggil orang tua', -5),

  -- II. DALAM WAKTU SEKOLAH (38 Butir)
  ('negative', 'II. DALAM WAKTU SEKOLAH', '', 'II.1', '1', 'Keluar kelas pada waktu pergantian jam pelajaran atau setelah istirahat kecuali ada tugas dari guru dan atau sedang piket', 'Ditegur, diperingatkan dilaporkan pada Guru bidang studi yang bersangkutan dan wali kelas', -2),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '', 'II.2', '2', 'Berada didalam kelas selama jam istirahat', 'Ditegur, diperingatkan dilaporkan pada guru bidang studi yang bersangkutan dan wali kelas', -2),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '', 'II.3', '3', 'Meninggalkan Pelajaran atau sekolah sebelum habis waktunya tanpa izin', 'Ditegur, diperingatkan dan dipanggil orang tuanya', -3),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '', 'II.4', '4', 'Makan dan minum di kelas pada saat jam pelajaran berlangsung dan pergantian jam pelajaran dan waktu istirahat', 'Ditegur, diperingatkan dilaporkan pada guru bidang studi yang bersangkutan dan wali kelas', -2),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '', 'II.5', '5', 'Membuang sampah tidak pada tempatnya', 'Ditegur, diperingatkan dilaporkan pada guru bidang studi yang bersangkutan dan wali kelas serta diberi tugas khusus', -2),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '6. Rambut, kuku, tato, make-up', 'II.6.a', '6.a', 'Rambut Panjang atau gondrong atau potongan tidak rapi (tidak sesuai ketentuan)', 'Ditegur dan diperingatkan', -5),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '6. Rambut, kuku, tato, make-up', 'II.6.b', '6.b', 'Anggota badan di Tato', 'Ditegur, dipanggil Orang Tua', -3),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '6. Rambut, kuku, tato, make-up', 'II.6.c', '6.c', 'Kuku panjang atau dicat', 'Langsung dipotong dan dihapus', -5),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '', 'II.7', '7', 'Peserta didik putri berambut gundul', 'Ditegur dan diperingatkan, dipanggil Orang Tua', -5),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '', 'II.8', '8', 'Mengendarai sepeda motor ke sekolah termasuk pada saat ekstra kurikuler', 'Ditegur dan diperingatkan', -10),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '', 'II.9', '9', 'Menimbulkan dan atau membuat kegaduhan/ berisik pada saat kegiatan belajar mengajar di berlangsung atau pada saat kegiatan sekolah berlangsung', 'Ditegur dan diperingatkan, dikeluarkan dari kelas', -15),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '10. Menyontek', 'II.10.a', '10.a', 'Menyontek pada waktu ulangan', 'Ditegur, diberi nilai Nol (0), dipanggil orang tua', -10),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '10. Menyontek', 'II.10.b', '10.b', 'Memberi/menerima sontekan', 'Ditegur, diberi nilai Nol (0), dipanggil orang tua', -10),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '11. Ketertiban Tempat Duduk', 'II.11.a', '11.a', 'Pindah tempat duduk yang telah ditentukan', 'Ditegur oleh guru yang sedang mengajar pada saat itu', -3),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '11. Ketertiban Tempat Duduk', 'II.11.b', '11.b', 'Mondar-mandir di kelas selama kegiatan belajar mengajar atau pada saat pergantian pelajaran', 'Ditegur oleh Guru yang sedang mengajar pada saat itu', -3),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '12. Tugas & PR', 'II.12.a', '12.a', 'Tidak mengerjakan PR atau mengerjakan PR di sekolah', 'Ditegur, diberi nilai Nol (0), konfirmasi dengan orang tua', -3),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '12. Tugas & PR', 'II.12.b', '12.b', 'Tidak mengumpulkan tugas sesuai dengan hari dan waktu yang telah ditentukan', 'Ditegur, diberi nilai Nol (0), konfirmasi dengan orang tua', -3),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '', 'II.13', '13', 'Membawa senjata tajam atau alat yang membahayakan orang lain kecuali ada tugas khusus', 'Barang disita, dipanggil Orang Tua, pada kondisi tertentu diserahkan ke pihak yang berwajib', -25),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '14. Rokok, Miras, Pornografi & Narkoba', 'II.14.a', '14.a', 'Membawa, menyimpan atau mempergunakan: Rokok', 'Barang disita, pemanggilan Orang Tua, refleksi diri di rumah', -20),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '14. Rokok, Miras, Pornografi & Narkoba', 'II.14.b', '14.b', 'Membawa, menyimpan atau mempergunakan: Minuman beralkohol', 'Barang disita, pemanggilan Orang Tua, refleksi diri di rumah', -20),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '14. Rokok, Miras, Pornografi & Narkoba', 'II.14.c', '14.c', 'Membawa, menyimpan atau mempergunakan: Buku seks/porno', 'Barang disita, pemanggilan Orang Tua, refleksi diri di rumah', -20),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '14. Rokok, Miras, Pornografi & Narkoba', 'II.14.d', '14.d', 'Membawa, menyimpan atau mempergunakan: Obat-obat terlarang atau terlibat narkoba', 'Dikeluarkan dari sekolah', -100),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '', 'II.15', '15', 'Membawa barang–barang tanpa rekomendasi guru terkait atau yang tidak berkaitan dengan kegiatan belajar-mengajar', 'Disita, diperingatkan dan dipanggil orang tua', -5),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '', 'II.16', '16', 'Berkumpul disekitar sekolah atau pintu gerbang Budi Mulia setelah pulang sekolah lebih dari 30 menit', 'Ditegur dan diperingatkan', -3),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '17. Ketertiban Lingkungan Sekolah', 'II.17.a', '17.a', 'Bermain dilokasi TK, SD, SMU selama kegiatan belajar mengajar dan kegiatan sekolah', 'Ditegur dan diperingatkan', -5),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '17. Ketertiban Lingkungan Sekolah', 'II.17.b', '17.b', 'Merayakan ulang tahun di lingkungan sekolah (TK, SD, SMP, SMA)', 'Ditegur dan diperingatkan, pemanggilan orang tua', -5),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '', 'II.18', '18', 'Judi dan main kartu', 'Kartu disita, Pemanggilan orang tua dan dikenakan sanksi khusus yang ditentukan oleh dewan guru', -50),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '', 'II.19', '19', 'Mencuri', 'Mengembalikan atau mengganti barang yang dicuri, Surat Peringatan, Pemanggilan orang tua dan refleksi di rumah', -100),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '', 'II.20', '20', 'Les privat pada guru SMP Budi Mulia', 'Dikeluarkan dari sekolah', -100),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '', 'II.21', '21', 'Berkelahi baik didalam Maupun diluar sekolah', 'Kedua-duanya dihukum (yang memukul lebih dahulu mendapat hukuman berat), Surat peringatan, Pemanggilan orang tua dan sanksi khusus dewan guru', -50),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '', 'II.22', '22', 'Melakukan perbuatan yang dapat menimbulkan citra jelek sekolah atau merusak nama baik sekolah', 'Membuat surat pernyataan bermaterai, serta pemanggilan orang tua membuat pernyataan yang diketahui oleh orang tua, wali kelas dan kepala sekolah', -10),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '', 'II.23', '23', 'Berpacaran di kompleks sekolah', 'Ditegur dan diperingatkan, Refleksi diri dirumah, Pemanggilan orang tua, Surat peringatan', -15),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '', 'II.24', '24', 'Melakukan penganiayaan terhadap teman, guru dan karyawan', 'Dikeluarkan dari sekolah', -100),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '', 'II.25', '25', 'Melakukan Pemalakan', 'Ditegur, diperingatkan, pemanggilan orang tua dan surat peringatan', -25),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '', 'II.26', '26', 'Mengancam teman, guru dan karyawan', 'Ditegur dan diperingatkan serta pemanggilan orang tua dan Refleksi di rumah', -15),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '', 'II.27', '27', 'Berbicara atau berperilaku atau bersikap tidak sopan', 'Ditegur dan diperingatkan serta pemanggilan orang tua', -5),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '', 'II.28', '28', 'Melakukan pemalsuan misalnya: tanda tangan nilai', 'Ditegur dan diperingatkan', -25),
  ('negative', 'II. DALAM WAKTU SEKOLAH', '', 'II.29', '29', 'Menjual barang atau makanan di lingkungan sekolah tanpa rekomendasi guru', 'Ditegur dan diperingatkan serta pemanggilan orang tua', -15),

  -- III. PAKAIAN (2 Butir)
  ('negative', 'III. PAKAIAN', '', 'III.1', '1', 'Tidak memakai atribut sekolah atau kelengkapan seragam sekolah tidak sesuai dengan ketentuan', 'Petugas piket akan menegur dan siswa diwajibkan untuk membeli ke koperasi', -4),
  ('negative', 'III. PAKAIAN', '', 'III.2', '2', 'Memakai seragam atau atribut atau berpenampilan tidak atau sesuai ketentuan sekolah atau perhiasan berlebihan', 'Petugas piket akan menegur, menyita serta mewajibkan siswa untuk memperbaiki penampilannya sesuai peraturan yang berlaku', -10),

  -- IV. ALAT-ALAT PELAJARAN (4 Butir)
  ('negative', 'IV. ALAT-ALAT PELAJARAN', '', 'IV.1', '1', 'Tidak membawa buku pelajaran baik buku cetak, catatan dan peralatan praktek', 'Guru bidang studi akan menegur dan memperingatkan serta memberikan tugas kepada siswa tersebut', -10),
  ('negative', 'IV. ALAT-ALAT PELAJARAN', '', 'IV.2', '2', 'Tidak membawa buku Agenda atau panduan Tata Tertib atau buku pembinaan', 'Guru bidang studi akan menegur dan melaporkan ke wali kelas', -5),
  ('negative', 'IV. ALAT-ALAT PELAJARAN', '', 'IV.3', '3', 'Meminjam peralatan atau Buku pelajaran temannya Saat kegiatan Belajar Mengajar berlangsung', 'Guru bidang studi akan menyita barang dan menegur kedua anak tersebut', -5),
  ('negative', 'IV. ALAT-ALAT PELAJARAN', '', 'IV.4', '4', 'Meninggalkan Buku pelajaran / peralatan sejenisnya dilemari sekolah', 'Guru bidang studi akan menegur dan berkoordinasi ke wali kelas untuk memanggil orang tua', -5);

-- ============================================================
-- 6. INSERT 69 BUTIR POIN POSITIF RESMI TERSTRUKTUR
-- ============================================================
INSERT INTO public.point_catalog (tipe, kategori, sub_kategori, kode, display_no, jenis, keterangan, poin) VALUES
  -- I. PENGHARGAAN KEPENGURUSAN & ORGANISASI
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '1. Kepengurusan OSIS', 'POS-PKEP-1', '1.a', 'Ketua OSIS (yang bertanggung jawab)', 'SK Pengurus OSIS dari Sekolah', 15),
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '1. Kepengurusan OSIS', 'POS-PKEP-2', '1.b', 'Wakil Ketua OSIS', 'SK Pengurus OSIS dari Sekolah', 12),
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '1. Kepengurusan OSIS', 'POS-PKEP-3', '1.c', 'Pengurus Inti OSIS (Sekretaris, Bendahara)', 'SK Pengurus OSIS dari Sekolah', 10),
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '1. Kepengurusan OSIS', 'POS-PKEP-4', '1.d', 'Koordinator Seksi / Bidang OSIS', 'SK Pengurus OSIS dari Sekolah', 8),
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '1. Kepengurusan OSIS', 'POS-PKEP-5', '1.e', 'Anggota Seksi / Pengurus OSIS Lainnya', 'SK Pengurus OSIS dari Sekolah', 6),

  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '2. Pramuka & Ekstrakurikuler', 'POS-PKEP-6', '2.a', 'Pramuka Inti (Pasukan Khusus Pramuka)', 'Penetapan Pembina Pramuka / Sekolah', 10),
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '2. Pramuka & Ekstrakurikuler', 'POS-PKEP-7', '2.b', 'Dewan Penggalang Pramuka', 'Penetapan Pembina Pramuka', 8),
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '2. Pramuka & Ekstrakurikuler', 'POS-PKEP-8', '2.c', 'Penanggung Jawab / Ketua Ekstrakurikuler', 'Laporan Pembina Ekstrakurikuler', 5),
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '2. Pramuka & Ekstrakurikuler', 'POS-PKEP-9', '2.d', 'Kapten Tim Olahraga / Tim Sekolah (Basket, Futsal, dll)', 'Kapten Tim Resmi Sekolah', 5),
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '2. Pramuka & Ekstrakurikuler', 'POS-PKEP-10', '2.e', 'Panitia Kegiatan / Acara Sekolah (BMLJ, Cup, dll)', 'Laporan Pembina / Panitia Guru', 4),

  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '3. Kepengurusan Kelas', 'POS-PKEP-11', '3.a', 'Ketua Kelas (yang bertanggung jawab)', 'Ditetapkan Wali Kelas', 8),
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '3. Kepengurusan Kelas', 'POS-PKEP-12', '3.b', 'Wakil Ketua Kelas', 'Ditetapkan Wali Kelas', 6),
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '3. Kepengurusan Kelas', 'POS-PKEP-13', '3.c', 'Sekretaris Kelas', 'Ditetapkan Wali Kelas', 5),
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '3. Kepengurusan Kelas', 'POS-PKEP-14', '3.d', 'Bendahara Kelas', 'Ditetapkan Wali Kelas', 5),
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '3. Kepengurusan Kelas', 'POS-PKEP-15', '3.e', 'Seksi / Pengurus Kelas Lainnya (Seksi Kebersihan, Keamanan, dll)', 'Ditetapkan Wali Kelas', 3),

  -- II. PENGHARGAAN AKADEMIK
  ('positive', 'II. PENGHARGAAN AKADEMIK', '1. Nilai & Asesmen Harian', 'POS-PA-1', '1.a', 'Mendapatkan nilai 100 saat penilaian harian (asesmen)', 'Bukti nilai asesmen guru', 2),
  ('positive', 'II. PENGHARGAAN AKADEMIK', '1. Nilai & Asesmen Harian', 'POS-PA-2', '1.b', 'Tidak ada nilai di bawah KKTP pada rapor tengah semester / semester', 'Bukti rapor hasil belajar', 10),
  ('positive', 'II. PENGHARGAAN AKADEMIK', '1. Nilai & Asesmen Harian', 'POS-PA-3', '1.c', 'Menemukan inovasi / teknologi / karya ilmiah yang bermanfaat bagi pendidikan', 'Karya ilmiah disetujui pihak sekolah', 40),

  ('positive', 'II. PENGHARGAAN AKADEMIK', '2. Peringkat Paralel Angkatan', 'POS-PA-4', '2.a', 'Peringkat 1 Besar 1 Angkatan pada Rapor Semester', 'Ditetapkan berdasarkan rapor semester resmi', 20),
  ('positive', 'II. PENGHARGAAN AKADEMIK', '2. Peringkat Paralel Angkatan', 'POS-PA-5', '2.b', 'Peringkat 2 Besar 1 Angkatan pada Rapor Semester', 'Ditetapkan berdasarkan rapor semester resmi', 15),
  ('positive', 'II. PENGHARGAAN AKADEMIK', '2. Peringkat Paralel Angkatan', 'POS-PA-6', '2.c', 'Peringkat 3 Besar 1 Angkatan pada Rapor Semester', 'Ditetapkan berdasarkan rapor semester resmi', 12),
  ('positive', 'II. PENGHARGAAN AKADEMIK', '2. Peringkat Paralel Angkatan', 'POS-PA-7', '2.d', 'Peringkat 4 Besar 1 Angkatan pada Rapor Semester', 'Ditetapkan berdasarkan rapor semester resmi', 10),
  ('positive', 'II. PENGHARGAAN AKADEMIK', '2. Peringkat Paralel Angkatan', 'POS-PA-8', '2.e', 'Peringkat 5 Besar 1 Angkatan pada Rapor Semester', 'Ditetapkan berdasarkan rapor semester resmi', 10),
  ('positive', 'II. PENGHARGAAN AKADEMIK', '2. Peringkat Paralel Angkatan', 'POS-PA-9', '2.f', 'Peringkat 6 Besar 1 Angkatan pada Rapor Semester', 'Ditetapkan berdasarkan rapor semester resmi', 8),
  ('positive', 'II. PENGHARGAAN AKADEMIK', '2. Peringkat Paralel Angkatan', 'POS-PA-10', '2.g', 'Peringkat 7 Besar 1 Angkatan pada Rapor Semester', 'Ditetapkan berdasarkan rapor semester resmi', 8),
  ('positive', 'II. PENGHARGAAN AKADEMIK', '2. Peringkat Paralel Angkatan', 'POS-PA-11', '2.h', 'Peringkat 8 Besar 1 Angkatan pada Rapor Semester', 'Ditetapkan berdasarkan rapor semester resmi', 8),
  ('positive', 'II. PENGHARGAAN AKADEMIK', '2. Peringkat Paralel Angkatan', 'POS-PA-12', '2.i', 'Peringkat 9 Besar 1 Angkatan pada Rapor Semester', 'Ditetapkan berdasarkan rapor semester resmi', 8),
  ('positive', 'II. PENGHARGAAN AKADEMIK', '2. Peringkat Paralel Angkatan', 'POS-PA-13', '2.j', 'Peringkat 10 Besar 1 Angkatan pada Rapor Semester', 'Ditetapkan berdasarkan rapor semester resmi', 8),
  ('positive', 'II. PENGHARGAAN AKADEMIK', '2. Peringkat Paralel Angkatan', 'POS-PA-14', '2.k', 'Peringkat 11 Besar 1 Angkatan pada Rapor Semester', 'Ditetapkan berdasarkan rapor semester resmi', 7),
  ('positive', 'II. PENGHARGAAN AKADEMIK', '2. Peringkat Paralel Angkatan', 'POS-PA-15', '2.l', 'Peringkat 12 Besar 1 Angkatan pada Rapor Semester', 'Ditetapkan berdasarkan rapor semester resmi', 7),
  ('positive', 'II. PENGHARGAAN AKADEMIK', '2. Peringkat Paralel Angkatan', 'POS-PA-16', '2.m', 'Peringkat 13 Besar 1 Angkatan pada Rapor Semester', 'Ditetapkan berdasarkan rapor semester resmi', 7),
  ('positive', 'II. PENGHARGAAN AKADEMIK', '2. Peringkat Paralel Angkatan', 'POS-PA-17', '2.n', 'Peringkat 14 Besar 1 Angkatan pada Rapor Semester', 'Ditetapkan berdasarkan rapor semester resmi', 7),
  ('positive', 'II. PENGHARGAAN AKADEMIK', '2. Peringkat Paralel Angkatan', 'POS-PA-18', '2.o', 'Peringkat 15 Besar 1 Angkatan pada Rapor Semester', 'Ditetapkan berdasarkan rapor semester resmi', 7),
  ('positive', 'II. PENGHARGAAN AKADEMIK', '2. Peringkat Paralel Angkatan', 'POS-PA-19', '2.p', 'Peringkat 16 Besar 1 Angkatan pada Rapor Semester', 'Ditetapkan berdasarkan rapor semester resmi', 6),
  ('positive', 'II. PENGHARGAAN AKADEMIK', '2. Peringkat Paralel Angkatan', 'POS-PA-20', '2.q', 'Peringkat 17 Besar 1 Angkatan pada Rapor Semester', 'Ditetapkan berdasarkan rapor semester resmi', 6),
  ('positive', 'II. PENGHARGAAN AKADEMIK', '2. Peringkat Paralel Angkatan', 'POS-PA-21', '2.r', 'Peringkat 18 Besar 1 Angkatan pada Rapor Semester', 'Ditetapkan berdasarkan rapor semester resmi', 6),
  ('positive', 'II. PENGHARGAAN AKADEMIK', '2. Peringkat Paralel Angkatan', 'POS-PA-22', '2.s', 'Peringkat 19 Besar 1 Angkatan pada Rapor Semester', 'Ditetapkan berdasarkan rapor semester resmi', 6),
  ('positive', 'II. PENGHARGAAN AKADEMIK', '2. Peringkat Paralel Angkatan', 'POS-PA-23', '2.t', 'Peringkat 20 Besar 1 Angkatan pada Rapor Semester', 'Ditetapkan berdasarkan rapor semester resmi', 5),

  -- III. PENGHARGAAN PRESTASI & LOMBA
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '1. Lomba Lingkup Sekolah & Antar Kelas', 'POS-LOM-1', '1.a', 'Mewakili lomba / kegiatan antar kelas (Class Meeting / Porseni)', 'Laporan Panitia / Wali Kelas', 2),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '1. Lomba Lingkup Sekolah & Antar Kelas', 'POS-LOM-2', '1.b', 'Juara 3 Lomba Antar Kelas (Individu / Kelompok)', 'Piagam / Pengumuman Panitia', 3),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '1. Lomba Lingkup Sekolah & Antar Kelas', 'POS-LOM-3', '1.c', 'Juara 2 Lomba Antar Kelas (Individu / Kelompok)', 'Piagam / Pengumuman Panitia', 4),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '1. Lomba Lingkup Sekolah & Antar Kelas', 'POS-LOM-4', '1.d', 'Juara 1 Lomba Antar Kelas (Individu / Kelompok)', 'Piagam / Pengumuman Panitia', 6),

  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '2. Lomba Swasta & Cup Antar Sekolah', 'POS-LSW-1', '2.a', 'Mewakili lomba antar sekolah / kegiatan swasta (undangan/cup)', 'Surat Tugas / Sertifikat Peserta', 3),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '2. Lomba Swasta & Cup Antar Sekolah', 'POS-LSW-2', '2.b', 'Juara Harapan / Finalis Lomba Swasta (Individu / Kelompok)', 'Sertifikat Juara Harapan / Finalis', 4),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '2. Lomba Swasta & Cup Antar Sekolah', 'POS-LSW-3', '2.c', 'Juara 3 Lomba Swasta (Individu / Kelompok)', 'Sertifikat / Piala Juara 3', 6),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '2. Lomba Swasta & Cup Antar Sekolah', 'POS-LSW-4', '2.d', 'Juara 2 Lomba Swasta (Individu / Kelompok)', 'Sertifikat / Piala Juara 2', 8),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '2. Lomba Swasta & Cup Antar Sekolah', 'POS-LSW-5', '2.e', 'Juara 1 Lomba Swasta (Individu / Kelompok)', 'Sertifikat / Piala Juara 1', 10),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '2. Lomba Swasta & Cup Antar Sekolah', 'POS-LSW-6', '2.f', 'Juara Lomba Swasta Tingkat Wilayah / Nasional Terbuka', 'Sertifikat Juara Lomba Terbuka', 15),

  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '3. Lomba Resmi Dinas (Kecamatan / Kota)', 'POS-LDIN-1', '3.a', 'Mewakili lomba / kegiatan tingkat Kecamatan (resmi dinas)', 'Surat Tugas / Sertifikat Peserta Kecamatan', 3),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '3. Lomba Resmi Dinas (Kecamatan / Kota)', 'POS-LDIN-2', '3.b', 'Juara 3 / 2 / 1 Lomba Dinas Tingkat Kecamatan', 'Sertifikat / Piagam Juara Kecamatan', 6),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '3. Lomba Resmi Dinas (Kecamatan / Kota)', 'POS-LDIN-3', '3.c', 'Lolos Seleksi & Mewakili lomba tingkat Kota / Daerah (resmi dinas)', 'Surat Tugas / Sertifikat Peserta Kota', 4),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '3. Lomba Resmi Dinas (Kecamatan / Kota)', 'POS-LDIN-4', '3.d', 'Juara Harapan / Finalis Tingkat Kota / Daerah (resmi dinas)', 'Sertifikat Juara Harapan Kota', 5),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '3. Lomba Resmi Dinas (Kecamatan / Kota)', 'POS-LDIN-5', '3.e', 'Juara 3 Lomba Dinas Tingkat Kota / Daerah', 'Sertifikat / Medali Juara 3 Kota', 8),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '3. Lomba Resmi Dinas (Kecamatan / Kota)', 'POS-LDIN-6', '3.f', 'Juara 2 Lomba Dinas Tingkat Kota / Daerah', 'Sertifikat / Medali Juara 2 Kota', 10),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '3. Lomba Resmi Dinas (Kecamatan / Kota)', 'POS-LDIN-7', '3.g', 'Juara 1 Lomba Dinas Tingkat Kota / Daerah', 'Sertifikat / Medali Juara 1 Kota', 12),

  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '4. Lomba Resmi Dinas (Provinsi / Nasional)', 'POS-LDIN-8', '4.a', 'Lolos Seleksi & Mewakili kontingen tingkat Provinsi (resmi dinas)', 'Surat Tugas Kontingen / Sertifikat Peserta Provinsi', 6),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '4. Lomba Resmi Dinas (Provinsi / Nasional)', 'POS-LDIN-9', '4.b', 'Juara Harapan / Finalis Tingkat Provinsi (resmi dinas)', 'Sertifikat Juara Harapan Provinsi', 8),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '4. Lomba Resmi Dinas (Provinsi / Nasional)', 'POS-LDIN-10', '4.c', 'Juara 3 Lomba Dinas Tingkat Provinsi', 'Sertifikat / Medali Juara 3 Provinsi', 12),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '4. Lomba Resmi Dinas (Provinsi / Nasional)', 'POS-LDIN-11', '4.d', 'Juara 2 Lomba Dinas Tingkat Provinsi', 'Sertifikat / Medali Juara 2 Provinsi', 15),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '4. Lomba Resmi Dinas (Provinsi / Nasional)', 'POS-LDIN-12', '4.e', 'Juara 1 Lomba Dinas Tingkat Provinsi', 'Sertifikat / Medali Juara 1 Provinsi', 18),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '4. Lomba Resmi Dinas (Provinsi / Nasional)', 'POS-LDIN-13', '4.f', 'Lolos Seleksi & Mewakili kontingen tingkat Nasional / Internasional', 'Surat Tugas Kontingen Nasional / Sertifikat Finalis', 10),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '4. Lomba Resmi Dinas (Provinsi / Nasional)', 'POS-LDIN-14', '4.g', 'Juara Harapan / Finalis Tingkat Nasional / Internasional', 'Sertifikat Juara Harapan Nasional', 12),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '4. Lomba Resmi Dinas (Provinsi / Nasional)', 'POS-LDIN-15', '4.h', 'Juara 3 Tingkat Nasional / Internasional (Medali Perunggu)', 'Sertifikat / Medali Perunggu Nasional', 18),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '4. Lomba Resmi Dinas (Provinsi / Nasional)', 'POS-LDIN-16', '4.i', 'Juara 2 Tingkat Nasional / Internasional (Medali Perak)', 'Sertifikat / Medali Perak Nasional', 22),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '4. Lomba Resmi Dinas (Provinsi / Nasional)', 'POS-LDIN-17', '4.j', 'Juara 1 Tingkat Nasional / Internasional (Medali Emas)', 'Sertifikat / Medali Emas Nasional', 25),

  -- IV. PETUGAS UPACARA & PELAYANAN
  ('positive', 'IV. PETUGAS UPACARA & PELAYANAN', '1. Petugas Upacara Bendera & Acara', 'POS-PUP-1', '1.a', 'Pengibar Bendera (Paskibra Upacara Bendera)', 'Penetapan Pembina Upacara', 5),
  ('positive', 'IV. PETUGAS UPACARA & PELAYANAN', '1. Petugas Upacara Bendera & Acara', 'POS-PUP-2', '1.b', 'Petugas Upacara Lainnya (Pemimpin, UUD, Janji Siswa, Doa)', 'Penetapan Pembina Upacara', 4),
  ('positive', 'IV. PETUGAS UPACARA & PELAYANAN', '1. Petugas Upacara Bendera & Acara', 'POS-PUP-3', '1.c', 'Paduan Suara saat Upacara Bendera / Misa Sekolah', 'Laporan Pembina Paduan Suara', 4),
  ('positive', 'IV. PETUGAS UPACARA & PELAYANAN', '1. Petugas Upacara Bendera & Acara', 'POS-PUP-4', '1.d', 'Petugas PMR / Tim Medis saat Upacara Bendera', 'Laporan Pembina PMR', 2),
  ('positive', 'IV. PETUGAS UPACARA & PELAYANAN', '1. Petugas Upacara Bendera & Acara', 'POS-PUP-5', '1.e', 'Pemimpin Senam Pagi Sekolah', 'Laporan Guru Olahraga / Pembina', 2),

  ('positive', 'IV. PETUGAS UPACARA & PELAYANAN', '2. Pelayanan Ibadat & Keagamaan', 'POS-PIB-1', '2.a', 'Menjadi Misdinar di Gereja / di Sekolah', 'Surat Keterangan / Laporan Gereja/Sekolah', 4),
  ('positive', 'IV. PETUGAS UPACARA & PELAYANAN', '2. Pelayanan Ibadat & Keagamaan', 'POS-PIB-2', '2.b', 'Menjadi Putri Sakristi / Lektor / Pemazmur di Gereja', 'Surat Keterangan / Laporan Gereja', 3),
  ('positive', 'IV. PETUGAS UPACARA & PELAYANAN', '2. Pelayanan Ibadat & Keagamaan', 'POS-PIB-3', '2.c', 'Menjadi Petugas saat Ibadat / Doa Bersama di Sekolah', 'Laporan Guru Agama / Wali Kelas', 2),

  -- V. KETERTIBAN & KETELADANAN
  ('positive', 'V. KETERTIBAN & KETELADANAN', '1. Kedisiplinan & Kehadiran Teladan', 'POS-PKET-1', '1.a', 'Tidak pernah terlambat dalam 1 bulan penuh', 'Rekap Presensi Harian Sekolah', 4),
  ('positive', 'V. KETERTIBAN & KETELADANAN', '1. Kedisiplinan & Kehadiran Teladan', 'POS-PKET-2', '1.b', 'Kehadiran sempurna (tanpa absen / alpha) selama 1 semester', 'Rekap Presensi Rapor Semester', 15),
  ('positive', 'V. KETERTIBAN & KETELADANAN', '1. Kedisiplinan & Kehadiran Teladan', 'POS-PKET-3', '1.c', 'Kelas terbersih / piket kelas terbaik', 'Penilaian Tim Kebersihan Sekolah / Wali Kelas', 5),

  ('positive', 'V. KETERTIBAN & KETELADANAN', '2. Kejujuran & Budi Pekerti', 'POS-PKET-4', '2.a', 'Menemukan & mengembalikan barang berharga / uang di lingkungan sekolah', 'Laporan Guru Piket / Kesiswaan', 10),
  ('positive', 'V. KETERTIBAN & KETELADANAN', '2. Kejujuran & Budi Pekerti', 'POS-PKET-5', '2.b', 'Melaporkan terjadinya pelanggaran oleh murid lain (Integritas)', 'Laporan Terverifikasi Guru / BK', 6),
  ('positive', 'V. KETERTIBAN & KETELADANAN', '2. Kejujuran & Budi Pekerti', 'POS-PKET-6', '2.c', 'Menolong warga sekolah / tindakan teladan sopan santun', 'Rekomendasi Guru / Wali Kelas', 5);
