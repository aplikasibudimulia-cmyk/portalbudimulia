-- ============================================================
-- DIAGNOSTIK: Cek Detail Akun Abigail
-- Jalankan ini di Supabase SQL Editor untuk melihat status
-- akun Abigail di database publik dan Supabase Auth.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_info(p_email TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_public_id UUID;
  v_public_username TEXT;
  v_public_hash TEXT;
  v_auth_id UUID;
  v_auth_email TEXT;
  v_auth_hash TEXT;
BEGIN
  -- 1. Ambil data dari public.akun_pengguna
  SELECT id, username, password INTO v_public_id, v_public_username, v_public_hash
  FROM public.akun_pengguna
  WHERE LOWER(username) = LOWER(p_email);

  -- 2. Ambil data dari auth.users
  SELECT id, email, encrypted_password INTO v_auth_id, v_auth_email, v_auth_hash
  FROM auth.users
  WHERE LOWER(email) = LOWER(p_email);

  RETURN json_build_object(
    'public_exists', v_public_id IS NOT NULL,
    'public_id', v_public_id,
    'public_username', v_public_username,
    'public_hash', v_public_hash,
    'auth_exists', v_auth_id IS NOT NULL,
    'auth_id', v_auth_id,
    'auth_email', v_auth_email,
    'auth_hash', v_auth_hash,
    'hash_match', v_public_hash = v_auth_hash
  );
END;
$$;

-- Jalankan fungsi untuk abigail.weisly@gmail.com
SELECT public.get_user_info('abigail.weisly@gmail.com');
