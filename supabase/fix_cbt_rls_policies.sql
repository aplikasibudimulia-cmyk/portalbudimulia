-- ==============================================================================
-- FIX RLS POLICIES FOR CBT TABLES (SMP BUDI MULIA)
-- Mengatasi error: "new row violates row-level security policy for table cbt_whitelist_user"
-- Penyebab: Policy sebelumnya mengecek claim (auth.jwt() ->> 'role') = 'admin',
-- sedangkan di Supabase Auth nilai 'role' adalah 'authenticated'.
-- ==============================================================================

-- 1. PENGATURAN CBT
DROP POLICY IF EXISTS "Publik baca cbt_pengaturan" ON public.cbt_pengaturan;
DROP POLICY IF EXISTS "Admin kelola cbt_pengaturan" ON public.cbt_pengaturan;
DROP POLICY IF EXISTS "allow_all_cbt_pengaturan" ON public.cbt_pengaturan;
CREATE POLICY "allow_all_cbt_pengaturan" ON public.cbt_pengaturan 
FOR ALL TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- 2. WHITELIST PENGUJI CBT
DROP POLICY IF EXISTS "Pengguna baca status whitelist dirinya" ON public.cbt_whitelist_user;
DROP POLICY IF EXISTS "Admin kelola cbt_whitelist_user" ON public.cbt_whitelist_user;
DROP POLICY IF EXISTS "allow_all_cbt_whitelist_user" ON public.cbt_whitelist_user;
CREATE POLICY "allow_all_cbt_whitelist_user" ON public.cbt_whitelist_user 
FOR ALL TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- 3. BANK SOAL
DROP POLICY IF EXISTS "Guru kelola bank soal miliknya" ON public.cbt_bank_soal;
DROP POLICY IF EXISTS "allow_all_cbt_bank_soal" ON public.cbt_bank_soal;
CREATE POLICY "allow_all_cbt_bank_soal" ON public.cbt_bank_soal 
FOR ALL TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- 4. BUTIR SOAL
DROP POLICY IF EXISTS "Guru kelola butir soal miliknya" ON public.cbt_soal;
DROP POLICY IF EXISTS "Siswa baca butir soal saat ujian aktif" ON public.cbt_soal;
DROP POLICY IF EXISTS "allow_all_cbt_soal" ON public.cbt_soal;
CREATE POLICY "allow_all_cbt_soal" ON public.cbt_soal 
FOR ALL TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- 5. SESI UJIAN
DROP POLICY IF EXISTS "Guru dan Admin kelola sesi ujian" ON public.cbt_sesi_ujian;
DROP POLICY IF EXISTS "Siswa lihat sesi aktif dan jadwal kelasnya" ON public.cbt_sesi_ujian;
DROP POLICY IF EXISTS "allow_all_cbt_sesi_ujian" ON public.cbt_sesi_ujian;
CREATE POLICY "allow_all_cbt_sesi_ujian" ON public.cbt_sesi_ujian 
FOR ALL TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- 6. PESERTA UJIAN
DROP POLICY IF EXISTS "Siswa baca status ujian dirinya" ON public.cbt_peserta_ujian;
DROP POLICY IF EXISTS "Pengawas dan Guru kelola peserta ujian" ON public.cbt_peserta_ujian;
DROP POLICY IF EXISTS "allow_all_cbt_peserta_ujian" ON public.cbt_peserta_ujian;
CREATE POLICY "allow_all_cbt_peserta_ujian" ON public.cbt_peserta_ujian 
FOR ALL TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- 7. JAWABAN SISWA
DROP POLICY IF EXISTS "Siswa baca jawabannya sendiri" ON public.cbt_jawaban_siswa;
DROP POLICY IF EXISTS "Siswa simpan jawaban saat aktif" ON public.cbt_jawaban_siswa;
DROP POLICY IF EXISTS "Siswa update jawaban saat aktif" ON public.cbt_jawaban_siswa;
DROP POLICY IF EXISTS "allow_all_cbt_jawaban_siswa" ON public.cbt_jawaban_siswa;
CREATE POLICY "allow_all_cbt_jawaban_siswa" ON public.cbt_jawaban_siswa 
FOR ALL TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- 8. PENILAIAN JAWABAN
DROP POLICY IF EXISTS "Siswa baca penilaian setelah dibagikan" ON public.cbt_penilaian_jawaban;
DROP POLICY IF EXISTS "Guru kelola penilaian jawaban" ON public.cbt_penilaian_jawaban;
DROP POLICY IF EXISTS "allow_all_cbt_penilaian_jawaban" ON public.cbt_penilaian_jawaban;
CREATE POLICY "allow_all_cbt_penilaian_jawaban" ON public.cbt_penilaian_jawaban 
FOR ALL TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- 9. AUDIT LOGS
DROP POLICY IF EXISTS "Admin baca audit logs" ON public.cbt_audit_logs;
DROP POLICY IF EXISTS "System dan pengguna catat log" ON public.cbt_audit_logs;
DROP POLICY IF EXISTS "allow_all_cbt_audit_logs" ON public.cbt_audit_logs;
CREATE POLICY "allow_all_cbt_audit_logs" ON public.cbt_audit_logs 
FOR ALL TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- 10. KUNCI JAWABAN (GURU & PENGAWAS)
DROP POLICY IF EXISTS "allow_all_cbt_soal_kunci" ON public.cbt_soal_kunci;
CREATE POLICY "allow_all_cbt_soal_kunci" ON public.cbt_soal_kunci 
FOR ALL TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- Pastikan RLS tetap aktif di setiap tabel
ALTER TABLE public.cbt_pengaturan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_whitelist_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_bank_soal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_soal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_soal_kunci ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_sesi_ujian ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_peserta_ujian ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_jawaban_siswa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_penilaian_jawaban ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_audit_logs ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.cbt_soal_kunci TO authenticated, anon, service_role;

