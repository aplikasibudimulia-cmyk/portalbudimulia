-- ============================================================
-- FIX: Sinkronisasi Ulang Role & Foreign ID di auth.users
-- Jalankan skrip ini di Supabase SQL Editor jika data tiba-tiba
-- kosong (karena role ter-reset ke 'murid' saat migrasi awal).
-- ============================================================

BEGIN;

UPDATE auth.users u
SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
  'role', a.role,
  'foreign_id', a.foreign_id
)
FROM public.akun_pengguna a
WHERE a.id = u.id;

COMMIT;
