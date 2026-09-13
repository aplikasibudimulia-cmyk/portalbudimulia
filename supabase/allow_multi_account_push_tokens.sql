-- ====================================================================
-- MIGRASI: DUKUNG MULTI-ACCOUNT PADA PUSH DEVICE TOKENS (EBUDIMULIA)
-- ====================================================================
-- Memungkinkan 1 perangkat HP / Tablet menerima notifikasi untuk SEMUA akun yang tersimpan
-- (misalnya akun Siswa + akun Orang Tua, atau beberapa anak yang bersekolah di eBudiMulia)

-- 1. Hapus batasan UNIQUE tunggal pada kolom token
ALTER TABLE public.push_device_tokens DROP CONSTRAINT IF EXISTS push_device_tokens_token_key;

-- 2. Hapus duplikat identik jika ada sebelum membuat batasan komposit
DELETE FROM public.push_device_tokens a
USING public.push_device_tokens b
WHERE a.id < b.id
  AND a.token = b.token
  AND a.nisn = b.nisn
  AND a.role = b.role;

-- 3. Tambahkan batasan UNIQUE komposit pada (token, nisn, role)
ALTER TABLE public.push_device_tokens DROP CONSTRAINT IF EXISTS push_device_tokens_token_nisn_role_key;
ALTER TABLE public.push_device_tokens ADD CONSTRAINT push_device_tokens_token_nisn_role_key UNIQUE (token, nisn, role);
