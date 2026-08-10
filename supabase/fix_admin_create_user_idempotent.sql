-- ============================================================
-- PATCH: Fix admin_create_user agar idempotent
-- 
-- Masalah: Saat membuat akun siswa, jika email username@ebudimulia.local
-- sudah ada di auth.users (sisa dari pembuatan akun sebelumnya yang gagal,
-- atau akun yang pernah ada tapi tidak terhapus bersih),
-- INSERT langsung gagal dengan error duplicate key.
--
-- Solusi: admin_create_user sekarang mengecek terlebih dahulu apakah
-- email sudah ada di auth.users. Jika ada, gunakan UUID yang sudah ada
-- (reuse) alih-alih membuat UUID baru.
-- ============================================================


-- ================================================================
-- LANGKAH 1: Diagnosa - Cek auth.users yang "yatim" (tidak punya akun_pengguna)
-- Ini adalah akun-akun yang menyebabkan conflict
-- ================================================================
SELECT 
  au.id,
  au.email,
  au.created_at,
  au.raw_user_meta_data->>'role'       AS meta_role,
  au.raw_user_meta_data->>'foreign_id' AS meta_foreign_id,
  ap.id IS NOT NULL                    AS punya_akun_pengguna
FROM auth.users au
LEFT JOIN public.akun_pengguna ap ON ap.id = au.id
WHERE au.email LIKE '%@ebudimulia.local'
  AND ap.id IS NULL  -- Tidak punya pasangan di akun_pengguna
ORDER BY au.created_at DESC;


-- ================================================================
-- LANGKAH 2: Update admin_create_user menjadi idempotent
-- Jika email sudah ada di auth.users -> reuse UUID tersebut
-- Jika belum ada -> buat baru seperti biasa
-- ================================================================
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
  v_uuid           UUID;
  v_email          TEXT;
  v_clean_username TEXT;
  v_hash           TEXT;
  v_raw_app_meta   JSONB;
  v_raw_user_meta  JSONB;
  v_existing_id    UUID;
BEGIN
  -- Selalu simpan username tanpa domain
  v_clean_username := SPLIT_PART(LOWER(TRIM(p_username)), '@', 1);
  -- Email di auth.users selalu pakai @ebudimulia.local
  v_email := v_clean_username || '@ebudimulia.local';

  v_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
  v_raw_app_meta := jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'));
  v_raw_user_meta := jsonb_build_object('role', p_role, 'foreign_id', p_foreign_id);

  -- Cek apakah email sudah ada di auth.users
  SELECT id INTO v_existing_id FROM auth.users WHERE email = v_email LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Email sudah ada — reuse UUID yang ada, update password saja
    v_uuid := v_existing_id;

    UPDATE auth.users
    SET 
      encrypted_password = v_hash,
      raw_user_meta_data = v_raw_user_meta,
      updated_at         = now()
    WHERE id = v_uuid;

    -- Pastikan ada identity juga
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_uuid, v_uuid,
      jsonb_build_object('sub', v_uuid::text, 'email', v_email, 'email_verified', true),
      'email', v_email, now(), now(), now()
    ) ON CONFLICT (provider, provider_id) DO UPDATE
      SET identity_data = EXCLUDED.identity_data, updated_at = now();

  ELSE
    -- Email belum ada — buat akun baru sepenuhnya
    v_uuid := gen_random_uuid();

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

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_uuid, v_uuid,
      jsonb_build_object('sub', v_uuid::text, 'email', v_email, 'email_verified', true),
      'email', v_email, now(), now(), now()
    );
  END IF;

  -- Insert atau update akun_pengguna
  -- Nonaktifkan trigger sementara agar tidak konflik saat INSERT
  ALTER TABLE public.akun_pengguna DISABLE TRIGGER ALL;

  INSERT INTO public.akun_pengguna (
    id, username, password, role, foreign_id, status, created_at, updated_at
  ) VALUES (
    v_uuid, v_clean_username, v_hash, p_role, p_foreign_id, p_status, now(), now()
  )
  ON CONFLICT (id) DO UPDATE
    SET 
      username   = EXCLUDED.username,
      password   = EXCLUDED.password,
      role       = EXCLUDED.role,
      foreign_id = EXCLUDED.foreign_id,
      status     = EXCLUDED.status,
      updated_at = now();

  ALTER TABLE public.akun_pengguna ENABLE TRIGGER ALL;

  RETURN json_build_object('ok', true, 'id', v_uuid, 'username', v_clean_username);
EXCEPTION WHEN OTHERS THEN
  -- Pastikan trigger diaktifkan kembali meski ada error
  BEGIN
    ALTER TABLE public.akun_pengguna ENABLE TRIGGER ALL;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN json_build_object('ok', false, 'msg', SQLERRM);
END;
$$;
