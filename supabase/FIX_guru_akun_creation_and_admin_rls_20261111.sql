-- ==============================================================================
-- 🛠️ FIX: SINKRONISASI AKUN GURU, ADMIN RLS, DAN AUTO-HEAL LOGIN GURU
-- ==============================================================================
-- Masalah yang diselesaikan:
-- 1. admin_create_user gagal dengan error "must be superuser to alter system triggers"
--    karena memanggil ALTER TABLE akun_pengguna DISABLE TRIGGER ALL.
-- 2. Master Admin (email @gmail.com) terblokir RLS akun_pengguna karena
--    is_staff_or_admin() dan is_admin() tidak mengenali admin auth.users non-local.
-- 3. Guru yang dibuat atau diedit di admin portal tidak tersinkronisasi username-nya
--    antara tabel guru dan tabel akun_pengguna / auth.users.
-- 4. fn_login ditambahkan mekanisme auto-heal: jika akun_pengguna belum sinkron
--    tapi guru.user_name ada, otomatis membuatkan akun_pengguna agar login berhasil.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. UPDATE is_staff_or_admin() & is_admin() DENGAN DUKUNGAN MASTER ADMIN
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_role text;
BEGIN
  -- 1. Jika claim JWT mengandung role admin
  IF (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' THEN
    RETURN true;
  END IF;

  -- 2. Cek apakah user saat ini adalah Master Admin di auth.users (email non-@ebudimulia.local)
  IF auth.uid() IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
        AND (email NOT ILIKE '%@ebudimulia.local' OR LOWER(email) = 'aplikasibudimulia@gmail.com')
    ) THEN
      RETURN true;
    END IF;

    -- 3. Cek role di public.akun_pengguna berdasarkan auth.uid()
    SELECT role INTO v_role
    FROM public.akun_pengguna
    WHERE id = auth.uid()
      AND status = 'aktif'
    LIMIT 1;

    IF v_role IN ('guru', 'admin', 'staff', 'staf', 'piket') THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_role text;
  v_foreign_id text;
BEGIN
  -- 1. Jika claim JWT mengandung role admin
  IF (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' THEN
    RETURN true;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    -- 2. Master Admin di auth.users
    IF EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
        AND (email NOT ILIKE '%@ebudimulia.local' OR LOWER(email) = 'aplikasibudimulia@gmail.com')
    ) THEN
      RETURN true;
    END IF;

    -- 3. Akun admin murni di akun_pengguna
    SELECT role, foreign_id INTO v_role, v_foreign_id
    FROM public.akun_pengguna
    WHERE id = auth.uid()
      AND status = 'aktif'
    LIMIT 1;

    IF v_role = 'admin' THEN
      RETURN true;
    END IF;

    -- 4. Guru dengan role Admin di guru_role
    IF v_role = 'guru' AND v_foreign_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM public.guru_role gr
        JOIN public.roles r ON r.id = gr.role_id
        WHERE gr.guru_id::text = v_foreign_id
          AND LOWER(r.nama) = 'admin'
      ) THEN
        RETURN true;
      END IF;
    END IF;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_staff_or_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;


-- ------------------------------------------------------------------------------
-- 2. PERBAIKI RPC admin_create_user (HAPUS DISABLE TRIGGER & SINKRONKAN GURU)
-- ------------------------------------------------------------------------------

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
  IF v_existing_akun_id IS NOT NULL THEN
    v_uuid := v_existing_akun_id;

    IF v_existing_auth_id IS NOT NULL AND v_existing_auth_id <> v_uuid THEN
      DELETE FROM auth.identities WHERE user_id = v_existing_auth_id;
      DELETE FROM auth.users WHERE id = v_existing_auth_id;
    END IF;

  ELSIF v_existing_auth_id IS NOT NULL THEN
    v_uuid := v_existing_auth_id;

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

  -- 7. Sinkronisasi tabel public.akun_pengguna (tanpa DISABLE TRIGGER agar kompatibel RDS Supabase)
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

  -- 8. Sinkronisasi kolom user_name & kode_akses di tabel guru jika role guru
  IF p_role = 'guru' AND v_clean_foreign_id <> '' THEN
    UPDATE public.guru
    SET 
      user_name  = v_clean_username,
      kode_akses = COALESCE(p_password, '123456')
    WHERE id::text = v_clean_foreign_id;
  END IF;

  RETURN json_build_object('ok', true, 'id', v_uuid, 'username', v_clean_username);

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'msg', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, anon;


-- ------------------------------------------------------------------------------
-- 3. UPDATE admin_update_username DENGAN SINKRONISASI KE TABEL GURU
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_update_username(
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
  v_role TEXT;
  v_foreign_id TEXT;
BEGIN
  -- Selalu simpan username tanpa domain
  v_clean_username := SPLIT_PART(LOWER(TRIM(p_new_username)), '@', 1);
  v_new_email := v_clean_username || '@ebudimulia.local';

  UPDATE public.akun_pengguna 
  SET username = v_clean_username, updated_at = now()
  WHERE id = p_akun_id
  RETURNING role, foreign_id INTO v_role, v_foreign_id;

  UPDATE auth.users 
  SET email = v_new_email, email_confirmed_at = now(), updated_at = now()
  WHERE id = p_akun_id;

  UPDATE auth.identities
  SET identity_data = jsonb_build_object('sub', user_id::text, 'email', v_new_email, 'email_verified', true),
      provider_id = v_new_email,
      updated_at = now()
  WHERE user_id = p_akun_id;

  -- Sinkronkan juga ke tabel guru jika role guru
  IF v_role IN ('guru', 'admin', 'staff', 'staf', 'piket') AND v_foreign_id IS NOT NULL THEN
    UPDATE public.guru
    SET user_name = v_clean_username
    WHERE id::text = v_foreign_id;
  END IF;

  RETURN json_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'msg', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_username(UUID, TEXT) TO authenticated, anon;


-- ------------------------------------------------------------------------------
-- 4. UPDATE fn_login DENGAN AUTO-HEAL GURU (JIKA AKUN BELUM SINKRON)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_login(
  p_username TEXT,
  p_password TEXT,
  p_role     TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_akun        akun_pengguna%ROWTYPE;
  v_siswa       siswa_permanent%ROWTYPE;
  v_guru        guru%ROWTYPE;
  v_ta          tahun_ajaran%ROWTYPE;
  v_enrol       enrollment%ROWTYPE;
  v_roles       JSON;
  v_kelas       JSON;
  v_db_hash     TEXT;
  v_clean_input TEXT;
BEGIN
  -- Bersihkan input username
  v_clean_input := LOWER(TRIM(p_username));
  IF v_clean_input LIKE '%@%' THEN
    v_clean_input := SPLIT_PART(v_clean_input, '@', 1);
  END IF;

  -- STEP 1: Exact match akun_pengguna
  SELECT * INTO v_akun
  FROM akun_pengguna
  WHERE (LOWER(TRIM(username)) = v_clean_input OR SPLIT_PART(LOWER(TRIM(username)), '@', 1) = v_clean_input)
    AND status = 'aktif'
    AND (
      (p_role = 'murid'     AND role = 'murid') OR
      (p_role = 'orang_tua' AND role = 'orang_tua') OR
      (p_role = 'staff'     AND role IN ('guru','admin','staff','staf','piket'))
    )
  LIMIT 1;

  -- STEP 2: (murid only) Cari via email_aktif di siswa_permanent
  IF NOT FOUND AND p_role = 'murid' THEN
    SELECT ap.* INTO v_akun
    FROM akun_pengguna ap
    JOIN siswa_permanent sp ON sp.nisn = ap.foreign_id
    WHERE LOWER(TRIM(sp.email_aktif)) = LOWER(TRIM(p_username))
      AND ap.role = 'murid'
      AND ap.status = 'aktif'
    LIMIT 1;
  END IF;

  -- STEP 3: Auto-heal Guru: jika login staff tapi belum ada akun_pengguna, cari di guru.user_name
  IF NOT FOUND AND (p_role = 'staff' OR p_role IS NULL) THEN
    SELECT * INTO v_guru FROM guru
    WHERE LOWER(TRIM(user_name)) = v_clean_input
    LIMIT 1;

    IF FOUND THEN
      -- Cek apakah akun_pengguna sebenarnya sudah ada berdasarkan foreign_id
      SELECT * INTO v_akun FROM akun_pengguna 
      WHERE role = 'guru' AND foreign_id = v_guru.id::text 
      LIMIT 1;

      -- Jika belum ada, buatkan otomatis!
      IF NOT FOUND THEN
        PERFORM public.admin_create_user(
          v_guru.user_name,
          COALESCE(v_guru.kode_akses, p_password, '123456'),
          'guru',
          v_guru.id::text,
          'aktif'
        );
        SELECT * INTO v_akun FROM akun_pengguna WHERE role = 'guru' AND foreign_id = v_guru.id::text LIMIT 1;
      END IF;
    END IF;
  END IF;

  -- STEP 4: Fallback tanpa role filter (backward compatibility)
  IF v_akun.id IS NULL THEN
    SELECT * INTO v_akun
    FROM akun_pengguna
    WHERE (LOWER(TRIM(username)) = v_clean_input OR SPLIT_PART(LOWER(TRIM(username)), '@', 1) = v_clean_input)
      AND status = 'aktif'
    LIMIT 1;
  END IF;

  IF v_akun.id IS NULL THEN
    RETURN json_build_object('ok', false, 'msg', 'Akun tidak ditemukan atau tidak aktif.');
  END IF;

  -- Validasi role matching
  IF p_role = 'murid' AND v_akun.role <> 'murid' THEN
    RETURN json_build_object('ok', false, 'msg', 'Username ini bukan akun Siswa. Silakan pilih tab login yang sesuai.');
  ELSIF p_role = 'orang_tua' AND v_akun.role <> 'orang_tua' THEN
    RETURN json_build_object('ok', false, 'msg', 'Username ini bukan akun Orang Tua. Silakan pilih tab login yang sesuai.');
  ELSIF p_role = 'staff' AND v_akun.role NOT IN ('guru','admin','staff','staf','piket') THEN
    RETURN json_build_object('ok', false, 'msg', 'Username ini bukan akun Guru / Staff.');
  END IF;

  IF v_akun.password IS NULL OR v_akun.password = '' THEN
    RETURN json_build_object('ok', false, 'msg', 'Akun belum memiliki password.');
  END IF;

  -- Verifikasi Kata Sandi (Bcrypt & Fallback Plaintext)
  v_db_hash := REGEXP_REPLACE(v_akun.password, '^\$2b\$', '$2a$');

  IF extensions.crypt(p_password, v_db_hash) <> v_db_hash AND v_akun.password <> p_password THEN
    RETURN json_build_object('ok', false, 'msg', 'Kata sandi salah. Silakan coba lagi.');
  END IF;

  -- Response Data Siswa / Ortu
  IF v_akun.role IN ('murid', 'orang_tua') THEN
    SELECT * INTO v_siswa FROM siswa_permanent
    WHERE nisn = v_akun.foreign_id LIMIT 1;

    IF NOT FOUND THEN
      RETURN json_build_object('ok', false, 'msg', 'Biodata tidak ditemukan.');
    END IF;

    SELECT * INTO v_ta FROM tahun_ajaran WHERE is_aktif = true LIMIT 1;

    IF v_ta.id IS NOT NULL THEN
      SELECT * INTO v_enrol FROM enrollment
      WHERE nisn = v_siswa.nisn AND tahun_ajaran_id = v_ta.id LIMIT 1;
    END IF;

    RETURN json_build_object(
      'ok',              true,
      'role',            v_akun.role,
      'akun_id',         v_akun.id,
      'siswa',           row_to_json(v_siswa),
      'kode',            v_enrol.kode,
      'kelas',           v_enrol.kelas,
      'tahun_ajaran_id', v_ta.id,
      'tahun_ajaran',    v_ta.nama
    );
  END IF;

  -- Response Data Guru / Staff
  SELECT * INTO v_guru FROM guru WHERE id::text = TRIM(v_akun.foreign_id) LIMIT 1;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'msg', 'Data pegawai tidak ditemukan.');
  END IF;

  SELECT json_agg(json_build_object('id', gr.role_id, 'nama', r.nama))
  INTO v_roles
  FROM guru_role gr
  LEFT JOIN roles r ON r.id = gr.role_id
  WHERE gr.guru_id = v_guru.id;

  SELECT json_agg(json_build_object('kelas', gk.kelas, 'tahun_ajaran_id', gk.tahun_ajaran_id))
  INTO v_kelas
  FROM guru_kelas gk
  WHERE gk.guru_id = v_guru.id;

  RETURN json_build_object(
    'ok',      true,
    'role',    v_akun.role,
    'akun_id', v_akun.id,
    'guru', json_build_object(
      'id',        v_guru.id,
      'kode',      v_guru.kode,
      'nama_guru', v_guru.nama_guru,
      'user_name', v_guru.user_name,
      'foto_url',  v_guru.foto_url,
      'roles',     COALESCE(v_roles, '[]'::json),
      'kelas',     COALESCE(v_kelas, '[]'::json)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_login(TEXT, TEXT, TEXT) TO anon, authenticated;
