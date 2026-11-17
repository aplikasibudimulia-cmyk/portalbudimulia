-- ==============================================================================
-- 🚨 LOCKDOWN TABEL activity_log DAN notifikasi
-- Tanggal : 2026-11-17
--
-- MASALAH:
--   1. activity_log memiliki policy "activity_log_read" FOR SELECT USING (true)
--      sehingga siapa pun (termasuk siswa via curl) bisa mengunduh 17.000+ catatan
--      aktivitas seluruh sekolah (login guru, aksi admin, dsb).
--   2. notifikasi memiliki policy "anon_rw_notifikasi" FOR ALL USING (true)
--      sehingga siswa bisa melihat notifikasi siswa lain, bahkan menghapus atau
--      membuat notifikasi palsu.
--
-- SOLUSI:
--   • activity_log:
--       - SELECT: HANYA staf resmi (fn_is_authorized_staff())
--       - INSERT: boleh dilakukan aplikasi (anon, authenticated)
--       - UPDATE/DELETE: HANYA staf resmi
--   • notifikasi:
--       - SELECT: staf resmi ATAU target_nisn IS NULL (pengumuman) ATAU fn_is_token_owner(target_nisn)
--       - INSERT/UPDATE/DELETE: HANYA staf resmi (fn_is_authorized_staff())
-- ==============================================================================

BEGIN;

-- 1. Bersihkan policy lama di activity_log
DROP POLICY IF EXISTS "activity_log_read" ON public.activity_log;
DROP POLICY IF EXISTS "Akses activity_log" ON public.activity_log;
DROP POLICY IF EXISTS "Simpan activity_log" ON public.activity_log;
DROP POLICY IF EXISTS "activity_log_insert" ON public.activity_log;

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Policy baru activity_log:
-- Staff bisa baca log
CREATE POLICY "activity_log_staff_read"
  ON public.activity_log
  FOR SELECT TO anon, authenticated
  USING (public.fn_is_authorized_staff());

-- Aplikasi bisa simpan log aksi
CREATE POLICY "activity_log_app_insert"
  ON public.activity_log
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Hanya staf yang boleh ubah / hapus log
CREATE POLICY "activity_log_staff_modify"
  ON public.activity_log
  FOR ALL TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

-- 2. Bersihkan policy lama di notifikasi
DROP POLICY IF EXISTS "anon_rw_notifikasi" ON public.notifikasi;
DROP POLICY IF EXISTS "Akses notifikasi" ON public.notifikasi;
DROP POLICY IF EXISTS "Modifikasi notifikasi" ON public.notifikasi;

ALTER TABLE public.notifikasi ENABLE ROW LEVEL SECURITY;

-- Siswa/Ortu hanya bisa baca notifikasi broadcast atau miliknya sendiri; Staf bisa baca semua
CREATE POLICY "notifikasi_select_policy"
  ON public.notifikasi
  FOR SELECT TO anon, authenticated
  USING (
    public.fn_is_authorized_staff()
    OR target_nisn IS NULL
    OR public.fn_is_token_owner(target_nisn)
  );

-- Hanya staf yang bisa menambah / mengubah / menghapus notifikasi
CREATE POLICY "notifikasi_staff_manage"
  ON public.notifikasi
  FOR ALL TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

COMMIT;

-- Verifikasi policy
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('activity_log', 'notifikasi')
ORDER BY tablename, policyname;
