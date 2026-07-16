-- ============================================================
-- SQL MIGRATION: TABEL MASTER KELAS
-- Jalankan skrip ini di Supabase SQL Editor
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.master_kelas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tahun_ajaran_id UUID NOT NULL REFERENCES public.tahun_ajaran(id) ON DELETE CASCADE,
  nama_kelas TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tahun_ajaran_id, nama_kelas)
);

ALTER TABLE public.master_kelas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Baca master_kelas" ON public.master_kelas;
DROP POLICY IF EXISTS "Tulis master_kelas" ON public.master_kelas;

CREATE POLICY "Baca master_kelas" ON public.master_kelas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Tulis master_kelas" ON public.master_kelas FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_kelas TO authenticated, service_role;

COMMIT;
