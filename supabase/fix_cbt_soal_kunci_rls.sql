-- ==============================================================================
-- FIX RLS POLICY FOR CBT SOAL KUNCI (SMP BUDI MULIA)
-- Mengatasi error: "new row violates row-level security policy for table cbt_soal_kunci" (code 42501)
-- ==============================================================================

-- 1. Buka akses RLS cbt_soal_kunci agar Guru & Pengawas dapat menyimpan dan membaca kunci jawaban
DROP POLICY IF EXISTS "allow_all_cbt_soal_kunci" ON public.cbt_soal_kunci;
CREATE POLICY "allow_all_cbt_soal_kunci" ON public.cbt_soal_kunci
FOR ALL TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 2. Pastikan RLS tetap aktif
ALTER TABLE public.cbt_soal_kunci ENABLE ROW LEVEL SECURITY;

-- 3. Berikan hak akses GRANT pada tabel cbt_soal_kunci
GRANT ALL ON public.cbt_soal_kunci TO authenticated, anon, service_role;
