-- ============================================================
-- PEMBARUAN MASTER KATALOG POIN POSITIF eBudimulia
-- Mengikuti Struktur Bab / Sub-Kategori Terperinci & Sistem Milestone Lomba
-- ============================================================

-- 1. Tambahkan kolom sub_kategori & display_no jika belum ada di tabel point_catalog
ALTER TABLE public.point_catalog ADD COLUMN IF NOT EXISTS sub_kategori TEXT DEFAULT '';
ALTER TABLE public.point_catalog ADD COLUMN IF NOT EXISTS display_no TEXT DEFAULT '';

-- 2. Pastikan Foreign Key pada point_records & pengajuan_poin_positif menggunakan ON DELETE SET NULL
--    (Mencegah error 23503 dan menjaga keutuhan riwayat poin siswa masa lalu)
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

-- 3. Pastikan RLS di point_catalog aktif dan memiliki hak akses penuh (anon & authenticated)
ALTER TABLE public.point_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "point_catalog_select" ON public.point_catalog;
DROP POLICY IF EXISTS "point_catalog_insert" ON public.point_catalog;
DROP POLICY IF EXISTS "point_catalog_update" ON public.point_catalog;
DROP POLICY IF EXISTS "point_catalog_delete" ON public.point_catalog;
DROP POLICY IF EXISTS "point_catalog_all" ON public.point_catalog;

CREATE POLICY "point_catalog_all" ON public.point_catalog
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 4. Hapus data katalog positif lama (foreign key otomatis SET NULL tanpa merusak riwayat poin siswa)
DELETE FROM public.point_catalog WHERE tipe = 'positive' OR poin > 0;

-- 5. Masukkan Katalog Poin Positif Terperinci & Terstruktur
INSERT INTO public.point_catalog (tipe, kategori, sub_kategori, kode, display_no, jenis, keterangan, poin) VALUES
  -- I. PENGHARGAAN KEPENGURUSAN & ORGANISASI
  -- 1. Kepengurusan OSIS
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '1. Kepengurusan OSIS', 'POS-PKEP-1', '1.a', 'Ketua OSIS (yang bertanggung jawab)', 'SK Pengurus OSIS dari Sekolah', 15),
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '1. Kepengurusan OSIS', 'POS-PKEP-2', '1.b', 'Wakil Ketua OSIS', 'SK Pengurus OSIS dari Sekolah', 12),
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '1. Kepengurusan OSIS', 'POS-PKEP-3', '1.c', 'Pengurus Inti OSIS (Sekretaris, Bendahara)', 'SK Pengurus OSIS dari Sekolah', 10),
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '1. Kepengurusan OSIS', 'POS-PKEP-4', '1.d', 'Koordinator Seksi / Bidang OSIS', 'SK Pengurus OSIS dari Sekolah', 8),
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '1. Kepengurusan OSIS', 'POS-PKEP-5', '1.e', 'Anggota Seksi / Pengurus OSIS Lainnya', 'SK Pengurus OSIS dari Sekolah', 6),

  -- 2. Pramuka & Ekstrakurikuler
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '2. Pramuka & Ekstrakurikuler', 'POS-PKEP-6', '2.a', 'Pramuka Inti (Pasukan Khusus Pramuka)', 'Penetapan Pembina Pramuka / Sekolah', 10),
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '2. Pramuka & Ekstrakurikuler', 'POS-PKEP-7', '2.b', 'Dewan Penggalang Pramuka', 'Penetapan Pembina Pramuka', 8),
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '2. Pramuka & Ekstrakurikuler', 'POS-PKEP-8', '2.c', 'Penanggung Jawab / Ketua Ekstrakurikuler', 'Laporan Pembina Ekstrakurikuler', 5),
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '2. Pramuka & Ekstrakurikuler', 'POS-PKEP-9', '2.d', 'Kapten Tim Olahraga / Tim Sekolah (Basket, Futsal, dll)', 'Kapten Tim Resmi Sekolah', 5),
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '2. Pramuka & Ekstrakurikuler', 'POS-PKEP-10', '2.e', 'Panitia Kegiatan / Acara Sekolah (BMLJ, Cup, dll)', 'Laporan Pembina / Panitia Guru', 4),

  -- 3. Kepengurusan Kelas
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '3. Kepengurusan Kelas', 'POS-PKEP-11', '3.a', 'Ketua Kelas (yang bertanggung jawab)', 'Ditetapkan Wali Kelas', 8),
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '3. Kepengurusan Kelas', 'POS-PKEP-12', '3.b', 'Wakil Ketua Kelas', 'Ditetapkan Wali Kelas', 6),
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '3. Kepengurusan Kelas', 'POS-PKEP-13', '3.c', 'Sekretaris Kelas', 'Ditetapkan Wali Kelas', 5),
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '3. Kepengurusan Kelas', 'POS-PKEP-14', '3.d', 'Bendahara Kelas', 'Ditetapkan Wali Kelas', 5),
  ('positive', 'I. PENGHARGAAN KEPENGURUSAN & ORGANISASI', '3. Kepengurusan Kelas', 'POS-PKEP-15', '3.e', 'Seksi / Pengurus Kelas Lainnya (Seksi Kebersihan, Keamanan, dll)', 'Ditetapkan Wali Kelas', 3),

  -- II. PENGHARGAAN AKADEMIK
  -- 1. Nilai & Asesmen Harian
  ('positive', 'II. PENGHARGAAN AKADEMIK', '1. Nilai & Asesmen Harian', 'POS-PA-1', '1.a', 'Mendapatkan nilai 100 saat penilaian harian (asesmen)', 'Bukti nilai asesmen guru', 2),
  ('positive', 'II. PENGHARGAAN AKADEMIK', '1. Nilai & Asesmen Harian', 'POS-PA-2', '1.b', 'Tidak ada nilai di bawah KKTP pada rapor tengah semester / semester', 'Bukti rapor hasil belajar', 10),
  ('positive', 'II. PENGHARGAAN AKADEMIK', '1. Nilai & Asesmen Harian', 'POS-PA-3', '1.c', 'Menemukan inovasi / teknologi / karya ilmiah yang bermanfaat bagi pendidikan', 'Karya ilmiah disetujui pihak sekolah', 40),

  -- 2. Peringkat Paralel Angkatan (Rapor Semester) - 1 s/d 20
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
  -- 1. Lomba Lingkup Sekolah & Antar Kelas
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '1. Lomba Lingkup Sekolah & Antar Kelas', 'POS-LOM-1', '1.a', 'Mewakili lomba / kegiatan antar kelas (Class Meeting / Porseni)', 'Laporan Panitia / Wali Kelas', 2),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '1. Lomba Lingkup Sekolah & Antar Kelas', 'POS-LOM-2', '1.b', 'Juara 3 Lomba Antar Kelas (Individu / Kelompok)', 'Piagam / Pengumuman Panitia', 3),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '1. Lomba Lingkup Sekolah & Antar Kelas', 'POS-LOM-3', '1.c', 'Juara 2 Lomba Antar Kelas (Individu / Kelompok)', 'Piagam / Pengumuman Panitia', 4),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '1. Lomba Lingkup Sekolah & Antar Kelas', 'POS-LOM-4', '1.d', 'Juara 1 Lomba Antar Kelas (Individu / Kelompok)', 'Piagam / Pengumuman Panitia', 6),

  -- 2. Lomba Swasta & Cup Antar Sekolah (Akumulatif Bertahap)
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '2. Lomba Swasta & Cup Antar Sekolah', 'POS-LSW-1', '2.a', 'Mewakili lomba antar sekolah / kegiatan swasta (undangan/cup)', 'Surat Tugas / Sertifikat Peserta', 3),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '2. Lomba Swasta & Cup Antar Sekolah', 'POS-LSW-2', '2.b', 'Juara Harapan / Finalis Lomba Swasta (Individu / Kelompok)', 'Sertifikat Juara Harapan / Finalis', 4),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '2. Lomba Swasta & Cup Antar Sekolah', 'POS-LSW-3', '2.c', 'Juara 3 Lomba Swasta (Individu / Kelompok)', 'Sertifikat / Piala Juara 3', 6),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '2. Lomba Swasta & Cup Antar Sekolah', 'POS-LSW-4', '2.d', 'Juara 2 Lomba Swasta (Individu / Kelompok)', 'Sertifikat / Piala Juara 2', 8),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '2. Lomba Swasta & Cup Antar Sekolah', 'POS-LSW-5', '2.e', 'Juara 1 Lomba Swasta (Individu / Kelompok)', 'Sertifikat / Piala Juara 1', 10),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '2. Lomba Swasta & Cup Antar Sekolah', 'POS-LSW-6', '2.f', 'Juara Lomba Swasta Tingkat Wilayah / Nasional Terbuka', 'Sertifikat Juara Lomba Terbuka', 15),

  -- 3. Lomba Resmi Dinas (Kecamatan / Kota) - Akumulatif Bertahap
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '3. Lomba Resmi Dinas (Kecamatan / Kota)', 'POS-LDIN-1', '3.a', 'Mewakili lomba / kegiatan tingkat Kecamatan (resmi dinas)', 'Surat Tugas / Sertifikat Peserta Kecamatan', 3),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '3. Lomba Resmi Dinas (Kecamatan / Kota)', 'POS-LDIN-2', '3.b', 'Juara 3 / 2 / 1 Lomba Dinas Tingkat Kecamatan', 'Sertifikat / Piagam Juara Kecamatan', 6),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '3. Lomba Resmi Dinas (Kecamatan / Kota)', 'POS-LDIN-3', '3.c', 'Lolos Seleksi & Mewakili lomba tingkat Kota / Daerah (resmi dinas)', 'Surat Tugas / Sertifikat Peserta Kota', 4),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '3. Lomba Resmi Dinas (Kecamatan / Kota)', 'POS-LDIN-4', '3.d', 'Juara Harapan / Finalis Tingkat Kota / Daerah (resmi dinas)', 'Sertifikat Juara Harapan Kota', 5),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '3. Lomba Resmi Dinas (Kecamatan / Kota)', 'POS-LDIN-5', '3.e', 'Juara 3 Lomba Dinas Tingkat Kota / Daerah', 'Sertifikat / Medali Juara 3 Kota', 8),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '3. Lomba Resmi Dinas (Kecamatan / Kota)', 'POS-LDIN-6', '3.f', 'Juara 2 Lomba Dinas Tingkat Kota / Daerah', 'Sertifikat / Medali Juara 2 Kota', 10),
  ('positive', 'III. PENGHARGAAN PRESTASI & LOMBA', '3. Lomba Resmi Dinas (Kecamatan / Kota)', 'POS-LDIN-7', '3.g', 'Juara 1 Lomba Dinas Tingkat Kota / Daerah', 'Sertifikat / Medali Juara 1 Kota', 12),

  -- 4. Lomba Resmi Dinas (Provinsi / Nasional) - Akumulatif Bertahap
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
  -- 1. Petugas Upacara Bendera & Acara
  ('positive', 'IV. PETUGAS UPACARA & PELAYANAN', '1. Petugas Upacara Bendera & Acara', 'POS-PUP-1', '1.a', 'Pengibar Bendera (Paskibra Upacara Bendera)', 'Penetapan Pembina Upacara', 5),
  ('positive', 'IV. PETUGAS UPACARA & PELAYANAN', '1. Petugas Upacara Bendera & Acara', 'POS-PUP-2', '1.b', 'Petugas Upacara Lainnya (Pemimpin, UUD, Janji Siswa, Doa)', 'Penetapan Pembina Upacara', 4),
  ('positive', 'IV. PETUGAS UPACARA & PELAYANAN', '1. Petugas Upacara Bendera & Acara', 'POS-PUP-3', '1.c', 'Paduan Suara saat Upacara Bendera / Misa Sekolah', 'Laporan Pembina Paduan Suara', 4),
  ('positive', 'IV. PETUGAS UPACARA & PELAYANAN', '1. Petugas Upacara Bendera & Acara', 'POS-PUP-4', '1.d', 'Petugas PMR / Tim Medis saat Upacara Bendera', 'Laporan Pembina PMR', 2),
  ('positive', 'IV. PETUGAS UPACARA & PELAYANAN', '1. Petugas Upacara Bendera & Acara', 'POS-PUP-5', '1.e', 'Pemimpin Senam Pagi Sekolah', 'Laporan Guru Olahraga / Pembina', 2),

  -- 2. Pelayanan Ibadat & Keagamaan
  ('positive', 'IV. PETUGAS UPACARA & PELAYANAN', '2. Pelayanan Ibadat & Keagamaan', 'POS-PIB-1', '2.a', 'Menjadi Misdinar di Gereja / di Sekolah', 'Surat Keterangan / Laporan Gereja/Sekolah', 4),
  ('positive', 'IV. PETUGAS UPACARA & PELAYANAN', '2. Pelayanan Ibadat & Keagamaan', 'POS-PIB-2', '2.b', 'Menjadi Putri Sakristi / Lektor / Pemazmur di Gereja', 'Surat Keterangan / Laporan Gereja', 3),
  ('positive', 'IV. PETUGAS UPACARA & PELAYANAN', '2. Pelayanan Ibadat & Keagamaan', 'POS-PIB-3', '2.c', 'Menjadi Petugas saat Ibadat / Doa Bersama di Sekolah', 'Laporan Guru Agama / Wali Kelas', 2),

  -- V. KETERTIBAN & KETELADANAN
  -- 1. Kedisiplinan & Kehadiran Teladan
  ('positive', 'V. KETERTIBAN & KETELADANAN', '1. Kedisiplinan & Kehadiran Teladan', 'POS-PKET-1', '1.a', 'Tidak pernah terlambat dalam 1 bulan penuh', 'Rekap Presensi Harian Sekolah', 4),
  ('positive', 'V. KETERTIBAN & KETELADANAN', '1. Kedisiplinan & Kehadiran Teladan', 'POS-PKET-2', '1.b', 'Kehadiran sempurna (tanpa absen / alpha) selama 1 semester', 'Rekap Presensi Rapor Semester', 15),
  ('positive', 'V. KETERTIBAN & KETELADANAN', '1. Kedisiplinan & Kehadiran Teladan', 'POS-PKET-3', '1.c', 'Kelas terbersih / piket kelas terbaik', 'Penilaian Tim Kebersihan Sekolah / Wali Kelas', 5),

  -- 2. Kejujuran & Budi Pekerti
  ('positive', 'V. KETERTIBAN & KETELADANAN', '2. Kejujuran & Budi Pekerti', 'POS-PKET-4', '2.a', 'Menemukan & mengembalikan barang berharga / uang di lingkungan sekolah', 'Laporan Guru Piket / Kesiswaan', 10),
  ('positive', 'V. KETERTIBAN & KETELADANAN', '2. Kejujuran & Budi Pekerti', 'POS-PKET-5', '2.b', 'Melaporkan terjadinya pelanggaran oleh murid lain (Integritas)', 'Laporan Terverifikasi Guru / BK', 6),
  ('positive', 'V. KETERTIBAN & KETELADANAN', '2. Kejujuran & Budi Pekerti', 'POS-PKET-6', '2.c', 'Menolong warga sekolah / tindakan teladan sopan santun', 'Rekomendasi Guru / Wali Kelas', 5)

ON CONFLICT (kode) DO UPDATE SET
  tipe = EXCLUDED.tipe,
  kategori = EXCLUDED.kategori,
  sub_kategori = EXCLUDED.sub_kategori,
  display_no = EXCLUDED.display_no,
  jenis = EXCLUDED.jenis,
  keterangan = EXCLUDED.keterangan,
  poin = EXCLUDED.poin;
