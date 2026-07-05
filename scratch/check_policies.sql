-- ============================================================
-- DIAGNOSTIK: Cek Daftar Policy Aktif di akun_pengguna
-- Jalankan ini di Supabase SQL Editor untuk melihat policy
-- apa saja yang sedang aktif saat ini.
-- ============================================================

SELECT policyname, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'akun_pengguna';
