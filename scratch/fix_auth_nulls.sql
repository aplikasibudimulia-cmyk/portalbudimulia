-- ============================================================
-- PATCH: Perbaikan Kolom NULL di auth.users (Error 500 Fix)
-- Jalankan ini di Supabase SQL Editor.
--
-- Masalah: Supabase Auth (GoTrue) mengharapkan kolom-kolom token 
-- bernilai '' (string kosong) daripada NULL. Jika bernilai NULL, 
-- auth API akan menghasilkan Error 500 "Database error querying schema".
-- ============================================================

-- 1. Jalankan update dinamis untuk membersihkan seluruh data NULL di auth.users saat ini
DO $$
BEGIN
  -- A. confirmation_token
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'confirmation_token') THEN
    UPDATE auth.users SET confirmation_token = '' WHERE confirmation_token IS NULL;
  END IF;

  -- B. email_change
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_change') THEN
    UPDATE auth.users SET email_change = '' WHERE email_change IS NULL;
  END IF;

  -- C. email_change_token_new
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_change_token_new') THEN
    UPDATE auth.users SET email_change_token_new = '' WHERE email_change_token_new IS NULL;
  END IF;

  -- D. email_change_token_current
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_change_token_current') THEN
    UPDATE auth.users SET email_change_token_current = '' WHERE email_change_token_current IS NULL;
  END IF;

  -- E. phone_change
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'phone_change') THEN
    UPDATE auth.users SET phone_change = '' WHERE phone_change IS NULL;
  END IF;

  -- F. phone_change_token
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'phone_change_token') THEN
    UPDATE auth.users SET phone_change_token = '' WHERE phone_change_token IS NULL;
  END IF;

  -- G. reauthentication_token
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'reauthentication_token') THEN
    UPDATE auth.users SET reauthentication_token = '' WHERE reauthentication_token IS NULL;
  END IF;

  -- H. is_sso_user
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'is_sso_user') THEN
    UPDATE auth.users SET is_sso_user = false WHERE is_sso_user IS NULL;
  END IF;

  -- I. is_anonymous
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'is_anonymous') THEN
    UPDATE auth.users SET is_anonymous = false WHERE is_anonymous IS NULL;
  END IF;
END $$;


-- 2. Perbarui Fungsi admin_create_user agar memasukkan string kosong ('') saat pembuatan user baru
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_username   TEXT,
  p_password   TEXT,
  p_role       TEXT,
  p_foreign_id TEXT,
  p_status     TEXT DEFAULT 'aktif'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_new_uuid      UUID;
  v_email         TEXT;
  v_hash          TEXT;
  v_raw_app_meta  JSONB;
  v_raw_user_meta JSONB;
BEGIN
  v_new_uuid := gen_random_uuid();
  
  -- Konversi username ke format email jika perlu
  IF p_username LIKE '%@%' THEN
    v_email := LOWER(TRIM(p_username));
  ELSE
    v_email := LOWER(TRIM(p_username)) || '@ebudimulia.local';
  END IF;

  -- Enkripsi password menggunakan extensions.crypt
  v_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
  
  v_raw_app_meta := jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'));
  v_raw_user_meta := jsonb_build_object('role', p_role, 'foreign_id', p_foreign_id);

  -- A. Insert ke auth.users (dengan menginisialisasi string kosong agar tidak NULL)
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token, is_sso_user
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000', v_new_uuid, 'authenticated', 'authenticated', 
    v_email, v_hash, now(), v_raw_app_meta, v_raw_user_meta, now(), now(),
    '', '', '', '', '', '', '', false
  );

  -- B. Insert ke auth.identities
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  )
  VALUES (
    v_new_uuid, v_new_uuid, 
    jsonb_build_object('sub', v_new_uuid::text, 'email', v_email, 'email_verified', true),
    'email', v_email, now(), now(), now()
  );

  -- C. Insert ke public.akun_pengguna agar sinkron
  INSERT INTO public.akun_pengguna (
    id, username, password, role, foreign_id, status, created_at, updated_at
  )
  VALUES (
    v_new_uuid, p_username, v_hash, p_role, p_foreign_id, p_status, now(), now()
  );

  RETURN json_build_object('ok', true, 'id', v_new_uuid, 'username', p_username);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'msg', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
