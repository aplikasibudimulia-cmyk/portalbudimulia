-- ============================================================
-- DIAGNOSTIK: Cek Trigger Aktif & Penyebab Error 500
-- Jalankan ini di Supabase SQL Editor untuk melihat daftar trigger.
-- Hasilnya akan menampilkan jika ada trigger yang merusak alur login.
-- ============================================================

SELECT 
  event_object_table AS nama_tabel,
  trigger_name AS nama_trigger,
  event_manipulation AS aksi,
  action_statement AS statement_sql,
  action_timing AS timing
FROM information_schema.triggers
WHERE event_object_schema IN ('auth', 'public')
ORDER BY event_object_table;
