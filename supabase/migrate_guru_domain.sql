-- ============================================================
-- MIGRATION: Semua akun guru dari @gmail.com ke @ebudimulia.local
-- Jalankan seluruh script ini sekaligus di Supabase SQL Editor
-- ============================================================

-- A. Migrasi auth.identities
UPDATE auth.identities
SET 
  provider_id = REPLACE(provider_id, '@gmail.com', '@ebudimulia.local'),
  identity_data = jsonb_set(
    identity_data, 
    '{email}', 
    to_jsonb(REPLACE(identity_data->>'email', '@gmail.com', '@ebudimulia.local'))
  ),
  updated_at = now()
WHERE provider_id LIKE '%@gmail.com'
  AND user_id IN (
    SELECT id FROM auth.users 
    WHERE email LIKE '%@gmail.com'
      AND raw_user_meta_data->>'role' IN ('guru','admin','staff','staf','piket')
  );

-- B. Migrasi auth.users
UPDATE auth.users
SET 
  email = REPLACE(email, '@gmail.com', '@ebudimulia.local'),
  updated_at = now()
WHERE email LIKE '%@gmail.com'
  AND raw_user_meta_data->>'role' IN ('guru','admin','staff','staf','piket');

-- C. Migrasi akun_pengguna.username (hapus domain, simpan username pendek saja)
UPDATE public.akun_pengguna
SET 
  username = SPLIT_PART(username, '@', 1),
  updated_at = now()
WHERE username LIKE '%@%'
  AND role IN ('guru','admin','staff','staf','piket');

-- D. Update RPC admin_update_username agar selalu pakai @ebudimulia.local
CREATE OR REPLACE FUNCTION admin_update_username(
  p_akun_id UUID,
  p_new_username TEXT
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_new_email TEXT;
  v_clean_username TEXT;
BEGIN
  -- Selalu simpan username tanpa domain
  v_clean_username := SPLIT_PART(LOWER(TRIM(p_new_username)), '@', 1);
  -- Email di auth.users selalu pakai @ebudimulia.local
  v_new_email := v_clean_username || '@ebudimulia.local';

  UPDATE public.akun_pengguna 
  SET username = v_clean_username, updated_at = now()
  WHERE id = p_akun_id;

  UPDATE auth.users 
  SET email = v_new_email, email_confirmed_at = now(), updated_at = now()
  WHERE id = p_akun_id;

  UPDATE auth.identities
  SET identity_data = jsonb_build_object('sub', user_id::text, 'email', v_new_email, 'email_verified', true),
      provider_id = v_new_email,
      updated_at = now()
  WHERE user_id = p_akun_id;

  RETURN json_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'msg', SQLERRM);
END;
$$;

-- E. Update RPC admin_create_user agar selalu pakai @ebudimulia.local
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
  v_clean_username TEXT;
  v_hash          TEXT;
  v_raw_app_meta  JSONB;
  v_raw_user_meta JSONB;
BEGIN
  v_new_uuid := gen_random_uuid();
  -- Selalu simpan username tanpa domain
  v_clean_username := SPLIT_PART(LOWER(TRIM(p_username)), '@', 1);
  -- Email di auth.users selalu pakai @ebudimulia.local
  v_email := v_clean_username || '@ebudimulia.local';

  v_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
  v_raw_app_meta := jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'));
  v_raw_user_meta := jsonb_build_object('role', p_role, 'foreign_id', p_foreign_id);

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token, is_sso_user
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_new_uuid, 'authenticated', 'authenticated', 
    v_email, v_hash, now(), v_raw_app_meta, v_raw_user_meta, now(), now(),
    '', '', '', '', '', '', '', false
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_new_uuid, v_new_uuid, 
    jsonb_build_object('sub', v_new_uuid::text, 'email', v_email, 'email_verified', true),
    'email', v_email, now(), now(), now()
  );

  INSERT INTO public.akun_pengguna (
    id, username, password, role, foreign_id, status, created_at, updated_at
  ) VALUES (
    v_new_uuid, v_clean_username, v_hash, p_role, p_foreign_id, p_status, now(), now()
  );

  RETURN json_build_object('ok', true, 'id', v_new_uuid, 'username', v_clean_username);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'msg', SQLERRM);
END;
$$;

-- F. Update trigger fn_sync_user_update agar selalu pakai @ebudimulia.local
CREATE OR REPLACE FUNCTION public.fn_sync_user_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT;
  v_clean_username TEXT;
BEGIN
  -- Selalu simpan username tanpa domain
  v_clean_username := SPLIT_PART(LOWER(TRIM(NEW.username)), '@', 1);
  v_email := v_clean_username || '@ebudimulia.local';

  -- Update username agar tetap bersih di tabel akun_pengguna
  IF NEW.username LIKE '%@%' THEN
    NEW.username := v_clean_username;
  END IF;

  UPDATE auth.users SET email = v_email, updated_at = now() WHERE id = NEW.id;
  UPDATE auth.identities
  SET identity_data = jsonb_build_object('sub', NEW.id::text, 'email', v_email, 'email_verified', true),
      provider_id = v_email, updated_at = now()
  WHERE user_id = NEW.id;

  RETURN NEW;
END;
$$;

-- ============================================================
-- VERIFIKASI (jalankan setelah migration di atas berhasil)
-- ============================================================
-- SELECT email FROM auth.users 
-- WHERE raw_user_meta_data->>'role' IN ('guru','admin','staff','staf','piket')
-- LIMIT 20;
