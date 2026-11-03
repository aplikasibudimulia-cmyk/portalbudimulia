-- ==============================================================================
-- 🛠️ FIX RLS TABEL CATAT POIN & PELANGGARAN SISWA
-- ==============================================================================
-- Masalah yang Diselesaikan:
-- 1. Guru / Staff / Piket yang mencatat pelanggaran atau poin siswa gagal menyimpan
--    karena RLS point_records menolak akses INSERT dari role 'anon' (error 42501).
-- 2. guidance_logs juga menolak insert saat siswa mencapai batas tahap pembinaan.
-- 3. Akibatnya form catat poin stuck / hanya loading berputar terus tanpa tersimpan.
-- ==============================================================================

-- 1. Buka akses penuh untuk point_records (anon & authenticated)
ALTER TABLE public.point_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_point_records" ON public.point_records;
DROP POLICY IF EXISTS "anon_rw_point_records" ON public.point_records;
DROP POLICY IF EXISTS "Akses point_records" ON public.point_records;
DROP POLICY IF EXISTS "allow_read_point_records_public" ON public.point_records;
DROP POLICY IF EXISTS "staff_write_point_records" ON public.point_records;

CREATE POLICY "allow_all_point_records"
  ON public.point_records
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.point_records TO anon, authenticated, service_role;

-- 2. Buka akses untuk guidance_logs
ALTER TABLE public.guidance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_guidance_logs" ON public.guidance_logs;
DROP POLICY IF EXISTS "guidance_logs_read" ON public.guidance_logs;
DROP POLICY IF EXISTS "guidance_logs_write" ON public.guidance_logs;

CREATE POLICY "allow_all_guidance_logs"
  ON public.guidance_logs
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.guidance_logs TO anon, authenticated, service_role;

-- 3. Pastikan student_points dan guidance_stages juga aman
ALTER TABLE public.student_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_student_points" ON public.student_points;
CREATE POLICY "allow_all_student_points"
  ON public.student_points
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.student_points TO anon, authenticated, service_role;

ALTER TABLE public.guidance_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_guidance_stages" ON public.guidance_stages;
CREATE POLICY "allow_all_guidance_stages"
  ON public.guidance_stages
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.guidance_stages TO anon, authenticated, service_role;

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
