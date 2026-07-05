-- ============================================================
-- DIAGNOSTIK 2: Cek Struktur auth.users & Kolom Kosong
-- Jalankan ini di Supabase SQL Editor untuk melihat apakah ada 
-- kolom password yang NULL atau kolom yang rusak.
-- ============================================================

-- A. Cek kolom-kolom auth.users yang bernilai NULL untuk password
SELECT id, email, role, (encrypted_password IS NULL) as password_kosong
FROM auth.users
WHERE email LIKE '%@%'
LIMIT 20;

-- B. Cek apakah ada error log internal Postgres (jika ada extension pg_log)
-- Catatan: Supabase biasanya merekam error di menu "Logs" -> "Database" di sidebar kiri.
-- Coba buka menu "Logs" -> "Database" di Supabase Dashboard untuk melihat detail error 500.
