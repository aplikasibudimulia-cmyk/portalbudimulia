-- ==============================================================================
-- FIX KRUSIAL: Buka Izin RLS pengaturan_sekolah untuk Siswa & Ortu
-- Masalah: Kolom presensi_pulang_aktif, jadwal_otomatis_aktif, jam_batas_pulang
-- terblokir oleh RLS untuk akun siswa, sehingga di HP siswa selalu 'Belum Dibuka'
-- ==============================================================================

-- 1. Drop policy lama
DROP POLICY IF EXISTS "Akses pengaturan_sekolah" ON public.pengaturan_sekolah;
DROP POLICY IF EXISTS "Allow select for all authenticated" ON public.pengaturan_sekolah;

-- 2. Buat policy baru: Semua user yang login (admin, guru, piket, siswa, ortu) 
--    bisa membaca data pengaturan sekolah
CREATE POLICY "Akses pengaturan_sekolah" ON public.pengaturan_sekolah 
  FOR SELECT TO authenticated 
  USING (true);

-- 3. Izinkan juga anon/public untuk select jika ada halaman tanpa login
DROP POLICY IF EXISTS "Public read pengaturan_sekolah" ON public.pengaturan_sekolah;
CREATE POLICY "Public read pengaturan_sekolah" ON public.pengaturan_sekolah 
  FOR SELECT TO anon 
  USING (true);

-- Verifikasi policy
SELECT * FROM pg_policies WHERE tablename = 'pengaturan_sekolah';
