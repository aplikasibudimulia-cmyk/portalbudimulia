-- ============================================================
-- PATCH: Perbaiki Metadata Admin di Supabase Auth
-- Jalankan ini di Supabase SQL Editor.
--
-- Masalah: Akun Admin saat ini belum memiliki klaim metadata 
-- 'role': 'admin' di tabel auth.users. Akibatnya, RLS menolak 
-- akses Admin untuk melihat data akun siswa/guru (sehingga 
-- muncul "(Belum Punya Akun)" untuk semua orang).
--
-- Solusi: Sinkronkan metadata 'role': 'admin' secara otomatis 
-- untuk semua akun yang terdaftar sebagai admin/superadmin.
-- ============================================================

-- 1. Update metadata di auth.users berdasarkan role di public.akun_pengguna
UPDATE auth.users u
SET raw_user_meta_data = 
  COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', a.role, 'foreign_id', a.foreign_id)
FROM public.akun_pengguna a
WHERE a.id = u.id 
  AND a.role IN ('admin', 'superadmin');

-- 2. Pastikan field-field penting lainnya tidak NULL (mencegah error 500)
UPDATE auth.users
SET 
  confirmation_token = COALESCE(confirmation_token, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  is_sso_user = COALESCE(is_sso_user, false)
WHERE raw_user_meta_data->>'role' IN ('admin', 'superadmin');
