-- ============================================================
-- MIGRATION: Semua akun siswa (murid) dari domain luar ke @ebudimulia.local
-- Jalankan seluruh script ini sekaligus di Supabase SQL Editor
-- ============================================================

-- A. Migrasi auth.identities untuk role murid
UPDATE auth.identities
SET 
  provider_id = SPLIT_PART(provider_id, '@', 1) || '@ebudimulia.local',
  identity_data = jsonb_set(
    identity_data, 
    '{email}', 
    to_jsonb(SPLIT_PART(identity_data->>'email', '@', 1) || '@ebudimulia.local')
  ),
  updated_at = now()
WHERE user_id IN (
  SELECT id FROM auth.users 
  WHERE email LIKE '%@%'
    AND raw_user_meta_data->>'role' = 'murid'
);

-- B. Migrasi auth.users untuk role murid
UPDATE auth.users
SET 
  email = SPLIT_PART(email, '@', 1) || '@ebudimulia.local',
  updated_at = now()
WHERE email LIKE '%@%'
  AND raw_user_meta_data->>'role' = 'murid';

-- C. Migrasi akun_pengguna.username (hapus domain, simpan username pendek saja)
UPDATE public.akun_pengguna
SET 
  username = SPLIT_PART(username, '@', 1),
  updated_at = now()
WHERE username LIKE '%@%'
  AND role = 'murid';
