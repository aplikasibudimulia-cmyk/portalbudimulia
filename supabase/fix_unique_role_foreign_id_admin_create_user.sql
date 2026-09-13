-- ==============================================================================
-- MIGRATION: Fix Unique Role Foreign ID in admin_create_user (Idempotent Safe)
-- 
-- Masalah:
-- Saat menyimpan / membuat akun siswa atau orang tua, jika (role, foreign_id) 
-- sudah ada di public.akun_pengguna (misal karena akun lama, form unlinked,
-- atau sinkronisasi NISN), admin_create_user sebelumnya membuat UUID baru
-- lalu melakukan INSERT ... ON CONFLICT (id) DO UPDATE.
-- Karena ON CONFLICT hanya mengecek (id) dan bukan (role, foreign_id),
-- PostgreSQL melempar error:
-- "duplicate key value violates unique constraint 'unique_role_foreign_id'"
--
-- Solusi:
-- admin_create_user sekarang mengecek apakah (role, foreign_id) sudah ada di
-- public.akun_pengguna. Jika ada, gunakan UUID yang sudah ada (v_existing_akun_id)
-- dan lakukan UPDATE langsung ke row tersebut alih-alih membuat akun baru.
-- ==============================================================================

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
  v_uuid               UUID;
  v_email              TEXT;
  v_clean_username     TEXT;
  v_hash               TEXT;
  v_raw_app_meta       JSONB;
  v_raw_user_meta      JSONB;
  v_existing_auth_id   UUID;
  v_existing_akun_id   UUID;
  v_clean_foreign_id   TEXT;
BEGIN
  -- 1. Normalisasi input
  v_clean_username   := SPLIT_PART(LOWER(TRIM(p_username)), '@', 1);
  v_email            := v_clean_username || '@ebudimulia.local';
  v_clean_foreign_id := TRIM(COALESCE(p_foreign_id, ''));

  IF v_clean_username = '' THEN
    RETURN json_build_object('ok', false, 'msg', 'Username tidak boleh kosong');
  END IF;

  v_hash := extensions.crypt(COALESCE(p_password, '123456'), extensions.gen_salt('bf', 10));
  v_raw_app_meta := jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'));
  v_raw_user_meta := jsonb_build_object('role', p_role, 'foreign_id', v_clean_foreign_id);

  -- 2. Cek apakah di public.akun_pengguna SUDAH ADA akun dengan role dan foreign_id ini
  IF v_clean_foreign_id <> '' THEN
    SELECT id INTO v_existing_akun_id 
    FROM public.akun_pengguna 
    WHERE role = p_role AND (foreign_id = v_clean_foreign_id OR TRIM(foreign_id) = v_clean_foreign_id)
    LIMIT 1;
  END IF;

  -- 3. Cek apakah email sudah ada di auth.users
  SELECT id INTO v_existing_auth_id 
  FROM auth.users 
  WHERE LOWER(email) = LOWER(v_email) 
  LIMIT 1;

  -- 4. Tentukan UUID yang dipakai
  -- Prioritas 1: Jika akun_pengguna sudah ada untuk (role, foreign_id), gunakan UUID tersebut
  IF v_existing_akun_id IS NOT NULL THEN
    v_uuid := v_existing_akun_id;

    -- Jika ada auth.users lain yang memegang email ini tapi beda UUID, hapus auth.users yatim tersebut
    IF v_existing_auth_id IS NOT NULL AND v_existing_auth_id <> v_uuid THEN
      DELETE FROM auth.identities WHERE user_id = v_existing_auth_id;
      DELETE FROM auth.users WHERE id = v_existing_auth_id;
    END IF;

  -- Prioritas 2: Jika email sudah ada di auth.users, gunakan UUID auth.users tersebut
  ELSIF v_existing_auth_id IS NOT NULL THEN
    v_uuid := v_existing_auth_id;

  -- Prioritas 3: Buat UUID baru
  ELSE
    v_uuid := gen_random_uuid();
  END IF;

  -- 5. Sinkronisasi tabel auth.users
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_uuid) THEN
    UPDATE auth.users
    SET 
      email              = v_email,
      encrypted_password = v_hash,
      raw_app_meta_data  = v_raw_app_meta,
      raw_user_meta_data = v_raw_user_meta,
      updated_at         = now()
    WHERE id = v_uuid;
  ELSE
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token, is_sso_user
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_uuid, 'authenticated', 'authenticated',
      v_email, v_hash, now(), v_raw_app_meta, v_raw_user_meta, now(), now(),
      '', '', '', '', '', '', '', false
    );
  END IF;

  -- 6. Sinkronisasi tabel auth.identities
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_uuid, v_uuid,
    jsonb_build_object('sub', v_uuid::text, 'email', v_email, 'email_verified', true),
    'email', v_email, now(), now(), now()
  ) ON CONFLICT (provider, provider_id) DO UPDATE
    SET 
      user_id       = EXCLUDED.user_id,
      identity_data = EXCLUDED.identity_data, 
      updated_at    = now();

  -- 7. Sinkronisasi tabel public.akun_pengguna
  ALTER TABLE public.akun_pengguna DISABLE TRIGGER ALL;

  IF v_existing_akun_id IS NOT NULL THEN
    UPDATE public.akun_pengguna
    SET
      username   = v_clean_username,
      password   = v_hash,
      role       = p_role,
      foreign_id = v_clean_foreign_id,
      status     = COALESCE(p_status, 'aktif'),
      updated_at = now()
    WHERE id = v_existing_akun_id;
  ELSE
    INSERT INTO public.akun_pengguna (
      id, username, password, role, foreign_id, status, created_at, updated_at
    ) VALUES (
      v_uuid, v_clean_username, v_hash, p_role, v_clean_foreign_id, COALESCE(p_status, 'aktif'), now(), now()
    )
    ON CONFLICT (id) DO UPDATE
      SET 
        username   = EXCLUDED.username,
        password   = EXCLUDED.password,
        role       = EXCLUDED.role,
        foreign_id = EXCLUDED.foreign_id,
        status     = EXCLUDED.status,
        updated_at = now();
  END IF;

  ALTER TABLE public.akun_pengguna ENABLE TRIGGER ALL;

  RETURN json_build_object('ok', true, 'id', v_uuid, 'username', v_clean_username);

EXCEPTION WHEN OTHERS THEN
  BEGIN
    ALTER TABLE public.akun_pengguna ENABLE TRIGGER ALL;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN json_build_object('ok', false, 'msg', SQLERRM);
END;
$$;
