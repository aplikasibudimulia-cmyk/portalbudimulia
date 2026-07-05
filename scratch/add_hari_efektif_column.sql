-- ============================================================
-- MIGRATION: Tambah kolom hari_efektif pada program_sekolah
-- Jalankan di Supabase SQL Editor
-- ============================================================

ALTER TABLE public.program_sekolah
  ADD COLUMN IF NOT EXISTS hari_efektif boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.program_sekolah.hari_efektif 
  IS 'true = Hari Efektif (belajar berlangsung), false = Tidak Efektif (libur/ujian/kegiatan luar)';
