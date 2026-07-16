-- ============================================================
-- SQL ALTER MIGRATION: ADD kode_guru TO jadwal_beban_mengajar
-- Jalankan skrip ini di Supabase SQL Editor
-- ============================================================

ALTER TABLE public.jadwal_beban_mengajar ADD COLUMN IF NOT EXISTS kode_guru TEXT;
