-- 1. Hapus unique constraint lama yang membatasi 1 baris per (tanggal, siswa_nisn)
ALTER TABLE public.presensi_harian DROP CONSTRAINT IF EXISTS presensi_harian_tanggal_siswa_nisn_key;

-- 2. Hapus index unik lain jika ada yang membatasi hal serupa
DROP INDEX IF EXISTS idx_presensi_harian_tanggal_nisn;

-- 3. Tambahkan unique constraint baru yang membatasi 1 baris per (tanggal, siswa_nisn, tipe)
-- Dengan ini, siswa diperbolehkan memiliki 1 baris 'masuk' dan 1 baris 'pulang' di hari yang sama.
ALTER TABLE public.presensi_harian ADD CONSTRAINT presensi_harian_tanggal_siswa_nisn_tipe_key UNIQUE (tanggal, siswa_nisn, tipe);
