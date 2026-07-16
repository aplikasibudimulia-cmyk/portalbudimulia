-- ============================================================
-- TOMBOL DARURAT (ROLLBACK RLS)
-- Jalankan ini di Supabase SQL Editor JIKA terjadi kendala/error
-- setelah mengaktifkan apply_secure_rls.sql.
--
-- Perintah ini akan langsung mematikan RLS pada tabel-tabel utama
-- sehingga website Anda kembali normal (terbuka seperti semula).
-- ============================================================

ALTER TABLE public.siswa_permanent DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.akun_pengguna DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.nilai_siswa DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.presensi_harian DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.guidance_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_points DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_records DISABLE ROW LEVEL SECURITY;

-- Memberikan kembali izin read penuh untuk anon agar dashboard admin lancar kembali
DROP POLICY IF EXISTS "Akses siswa_permanent" ON public.siswa_permanent;
DROP POLICY IF EXISTS "Akses akun_pengguna" ON public.akun_pengguna;

CREATE POLICY "Akses siswa_permanent" ON public.siswa_permanent FOR ALL TO anon USING (true);
CREATE POLICY "Akses akun_pengguna" ON public.akun_pengguna FOR ALL TO anon USING (true);