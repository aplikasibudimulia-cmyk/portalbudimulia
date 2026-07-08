-- Cek kondisi data Mesrawati di semua tabel
SELECT 
  ap.id        AS akun_id,
  ap.username  AS akun_username,
  ap.role      AS akun_role,
  au.email     AS auth_email,
  ai.provider_id AS identity_email
FROM public.akun_pengguna ap
LEFT JOIN auth.users au ON ap.id = au.id
LEFT JOIN auth.identities ai ON ai.user_id = ap.id
WHERE ap.username ILIKE '%mesrawati%'
   OR au.email ILIKE '%mesrawati%';

-- Cek apakah ada konflik username/email yang sama
SELECT email, COUNT(*) FROM auth.users GROUP BY email HAVING COUNT(*) > 1;
