-- ============================================================
-- CEK & PERBAIKI TRIGGER DATABASE POINT_RECORDS
-- ============================================================
-- Jalankan di Supabase SQL Editor (Dashboard → SQL Editor)
-- Script ini AMAN — tidak mengubah data apapun, hanya mendiagnosa.

-- 1. CEK APAKAH ADA TRIGGER PADA TABEL point_records
SELECT 
  trigger_name, 
  event_manipulation, 
  event_object_table,
  action_statement
FROM information_schema.triggers 
WHERE event_object_table IN ('point_records', 'student_points')
ORDER BY event_object_table, trigger_name;

-- 2. CEK APAKAH ADA FUNCTION YANG BERHUBUNGAN DENGAN POIN
SELECT 
  routine_name, 
  routine_type,
  routine_definition
FROM information_schema.routines 
WHERE routine_schema = 'public'
  AND (
    routine_name ILIKE '%poin%' 
    OR routine_name ILIKE '%point%'
    OR routine_name ILIKE '%recalc%'
    OR routine_name ILIKE '%rekalkulasi%'
  );

-- 3. CEK KOLOM YANG ADA DI TABEL point_records
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'point_records' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 4. CEK KOLOM YANG ADA DI TABEL student_points
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'student_points' AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================================
-- JIKA DITEMUKAN TRIGGER YANG BERMASALAH, NONAKTIFKAN:
-- (Uncomment baris di bawah dan ganti <nama_trigger> sesuai hasil query #1)
-- ============================================================
-- ALTER TABLE point_records DISABLE TRIGGER <nama_trigger>;
-- ALTER TABLE student_points DISABLE TRIGGER <nama_trigger>;
