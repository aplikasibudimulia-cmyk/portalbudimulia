-- ============================================================
-- TAHAP 1: MIGRASI KE SUPABASE AUTH (BACKWARD-COMPATIBLE)
-- Jalankan ini di Supabase SQL Editor.
-- ============================================================

-- 1. PGCrypto untuk hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. Fungsi untuk menduplikasi akun eksisting dari public.akun_pengguna ke auth.users
-- Kita jalankan dalam block DO agar aman jika dijalankan berulang kali.
DO $$
DECLARE
  r RECORD;
  v_email TEXT;
  v_raw_app_meta JSONB;
  v_raw_user_meta JSONB;
BEGIN
  FOR r IN 
    SELECT id, username, password, role, foreign_id, status, created_at 
    FROM public.akun_pengguna
  LOOP
    -- Jika username bukan format email (seperti akun ortu/guru tertentu), buat email dummy agar GoTrue tidak error
    IF r.username LIKE '%@%' THEN
      v_email := LOWER(TRIM(r.username));
    ELSE
      v_email := LOWER(TRIM(r.username)) || '@ebudimulia.local';
    END IF;

    -- Tentukan metadata user
    v_raw_app_meta := jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'));
    v_raw_user_meta := jsonb_build_object('role', r.role, 'foreign_id', r.foreign_id);

    -- Insert ke auth.users jika belum ada
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = r.id OR email = v_email) THEN
      INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        is_super_admin
      )
      VALUES (
        '00000000-0000-0000-0000-000000000000',
        r.id,
        'authenticated',
        'authenticated',
        v_email,
        -- Kita copy hash bcrypt asli ($2b$ diubah ke $2a$ agar pgcrypto / GoTrue lancar)
        REGEXP_REPLACE(r.password, '^\$2b\$', '$2a$'),
        now(), -- langsung dikonfirmasi agar tidak perlu verifikasi email
        v_raw_app_meta,
        v_raw_user_meta,
        r.created_at,
        now(),
        '',
        '',
        '',
        false
      );

      -- Masukkan juga ke auth.identities agar di dashboard Supabase Auth muncul provider Email-nya
      INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,        -- TAMBAHKAN kolom ini
        last_sign_in_at,
        created_at,
        updated_at
      )
      VALUES (
        r.id,
        r.id,
        jsonb_build_object('sub', r.id::text, 'email', v_email, 'email_verified', true),
        'email',
        v_email,            -- TAMBAHKAN nilai ini
        now(),
        r.created_at,
        now()
      );
    END IF;
  END LOOP;
END $$;


-- 3. Fungsi pembantu Admin: membuat user baru di auth.users & public.akun_pengguna secara aman
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

  -- A. Insert ke auth.users
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000', v_new_uuid, 'authenticated', 'authenticated', 
    v_email, v_hash, now(), v_raw_app_meta, v_raw_user_meta, now(), now()
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


-- 4. Fungsi pembantu Admin: mereset password di auth.users & public.akun_pengguna
CREATE OR REPLACE FUNCTION public.admin_reset_password(
  p_akun_id     UUID,
  p_new_password TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  -- Hash password baru
  v_hash := extensions.crypt(p_new_password, extensions.gen_salt('bf', 10));

  -- Update di auth.users
  UPDATE auth.users
  SET encrypted_password = v_hash,
      updated_at = now()
  WHERE id = p_akun_id;

  -- Update di public.akun_pengguna
  UPDATE public.akun_pengguna
  SET password = v_hash,
      updated_at = now()
  WHERE id = p_akun_id;

  RETURN json_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'msg', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_password(UUID, TEXT) TO anon, authenticated;


-- 5. Trigger Sinkronisasi Otomatis: Hapus akun di public jika di auth dihapus oleh Admin
CREATE OR REPLACE FUNCTION public.fn_sync_user_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.akun_pengguna WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE TRIGGER tr_sync_user_delete
  AFTER DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_user_delete();
