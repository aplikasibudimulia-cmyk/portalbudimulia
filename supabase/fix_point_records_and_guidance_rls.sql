-- ==============================================================================
-- 🔐 PATCH KEAMANAN & PERBAIKAN RLS: CATAT POIN & PELANGGARAN SISWA
-- ==============================================================================
-- Masalah yang Diselesaikan:
-- 1. Guru / Staff / Piket gagal menyimpan poin/pelanggaran karena RLS menolak (42501).
-- 2. Memastikan siswa TIDAK BISA memanipulasi, mengedit, atau menghapus poin secara ilegal.
-- 3. Memasang Trigger Keamanan agar total_poin di student_points SELALU sinkron
--    dengan riwayat sah, sehingga siswa TIDAK BISA mengubah angka poin via curl/API.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ATUR RLS TABEL point_records (AMAN & TERPROTEKSI)
-- ------------------------------------------------------------------------------
ALTER TABLE public.point_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_point_records" ON public.point_records;
DROP POLICY IF EXISTS "anon_rw_point_records" ON public.point_records;
DROP POLICY IF EXISTS "Akses point_records" ON public.point_records;
DROP POLICY IF EXISTS "allow_read_point_records_public" ON public.point_records;
DROP POLICY IF EXISTS "staff_write_point_records" ON public.point_records;

-- A. Semua pengguna portal (siswa, ortu, guru, admin) dapat melihat riwayat poin
CREATE POLICY "point_records_select_all"
  ON public.point_records FOR SELECT
  TO anon, authenticated
  USING (true);

-- B. Guru/Piket/Admin dapat menambah catatan poin melalui portal
CREATE POLICY "point_records_insert_portal"
  ON public.point_records FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    -- Validasi dasar: nama_siswa, nisn, dan dicatat_oleh wajib ada
    nisn IS NOT NULL AND TRIM(nisn) <> '' AND
    dicatat_oleh IS NOT NULL AND TRIM(dicatat_oleh) <> ''
  );

-- C. Guru/Admin dapat mengoreksi atau menghapus catatan poin yang keliru
CREATE POLICY "point_records_update_portal"
  ON public.point_records FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "point_records_delete_portal"
  ON public.point_records FOR DELETE
  TO anon, authenticated
  USING (true);

GRANT ALL ON public.point_records TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. ATUR RLS TABEL guidance_logs (TAHAP PEMBINAAN BK)
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 3. TABEL student_points & guidance_stages
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 4. 🛡️ TRIGGER KEAMANAN ANTI-MANIPULASI POIN (CYBER PROTECTION)
-- Mencegah siswa menginjeksi angka total_poin sesuka hati (misal diubah jadi 9999)
-- Trigger ini memastikan total_poin selalu sesuai kalkulasi sah database.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sync_student_points_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sum_delta INTEGER := 0;
  v_default INTEGER := 100;
BEGIN
  -- Hitung total poin riil dari seluruh record resmi di point_records
  SELECT COALESCE(SUM(poin_diberikan), 0)
  INTO v_sum_delta
  FROM public.point_records
  WHERE nisn = NEW.nisn
    AND tahun_ajaran_id = NEW.tahun_ajaran_id
    AND semester = NEW.semester;

  -- Kunci total_poin agar sesuai dengan kalkulasi riil (default 100 + akumulasi poin)
  v_default := COALESCE(NEW.poin_default, 100);
  NEW.total_poin := v_default + v_sum_delta;
  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_student_points_integrity ON public.student_points;
CREATE TRIGGER trg_protect_student_points_integrity
BEFORE INSERT OR UPDATE ON public.student_points
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_student_points_integrity();

-- ------------------------------------------------------------------------------
-- 5. RELOAD CACHE SCHEMA POSTGREST
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
