-- ============================================================
-- PATCH v2: Fix Bug Login Siswa - Username dengan domain Gmail
-- 
-- Perubahan dari v1:
-- Trigger fn_sync_user_update dinonaktifkan sementara selama
-- proses update, untuk menghindari error duplicate key di auth.users.
-- Update ke akun_pengguna, auth.users, dan auth.identities
-- dilakukan secara manual dan terpisah.
--
-- Jalankan script ini di Supabase SQL Editor
-- ============================================================


-- ================================================================
-- LANGKAH 1: Diagnosa dulu - lihat akun bermasalah
-- Jalankan ini sendiri dulu untuk memastikan ada yang perlu diperbaiki
-- ================================================================
SELECT 
  ap.id,
  ap.username                                                    AS username_sekarang,
  SPLIT_PART(LOWER(ap.username), '@', 1)                        AS username_seharusnya,
  au.email                                                       AS auth_email_sekarang,
  SPLIT_PART(LOWER(ap.username), '@', 1) || '@ebudimulia.local' AS auth_email_seharusnya,
  ap.status
FROM public.akun_pengguna ap
LEFT JOIN auth.users au ON au.id = ap.id
WHERE ap.role = 'murid'
  AND (
    ap.username LIKE '%@gmail.com%'
    OR ap.username LIKE '%@yahoo.com%'
    OR ap.username LIKE '%@hotmail.com%'
    OR (ap.username LIKE '%@%' AND ap.username NOT LIKE '%@ebudimulia.local%')
  )
ORDER BY ap.username;


-- ================================================================
-- LANGKAH 2-4: Fix semua data yang bermasalah
-- (Jalankan blok DO ini setelah melihat hasil diagnosa di atas)
-- ================================================================
DO $$
DECLARE
  r RECORD;
  v_clean_username TEXT;
  v_target_email   TEXT;
BEGIN
  -- Nonaktifkan trigger yang menyebabkan konflik
  ALTER TABLE public.akun_pengguna DISABLE TRIGGER ALL;

  FOR r IN
    SELECT ap.id, ap.username, ap.role
    FROM public.akun_pengguna ap
    WHERE ap.role = 'murid'
      AND (
        ap.username LIKE '%@gmail.com%'
        OR ap.username LIKE '%@yahoo.com%'
        OR ap.username LIKE '%@hotmail.com%'
        OR (ap.username LIKE '%@%' AND ap.username NOT LIKE '%@ebudimulia.local%')
      )
  LOOP
    v_clean_username := SPLIT_PART(LOWER(TRIM(r.username)), '@', 1);
    v_target_email   := v_clean_username || '@ebudimulia.local';

    -- 2a. Update akun_pengguna.username (tanpa trigger)
    UPDATE public.akun_pengguna
    SET username = v_clean_username, updated_at = NOW()
    WHERE id = r.id;

    -- 2b. Update auth.users.email — lewati jika email target sudah dipakai user LAIN
    UPDATE auth.users
    SET email = v_target_email, updated_at = NOW()
    WHERE id = r.id
      AND NOT EXISTS (
        SELECT 1 FROM auth.users WHERE email = v_target_email AND id <> r.id
      );

    -- 2c. Update auth.identities — lewati jika provider_id target sudah dipakai identity LAIN
    UPDATE auth.identities
    SET 
      provider_id   = v_target_email,
      identity_data = jsonb_set(
        COALESCE(identity_data, '{}'::jsonb),
        '{email}',
        to_jsonb(v_target_email)
      ),
      updated_at = NOW()
    WHERE user_id = r.id
      AND NOT EXISTS (
        SELECT 1 FROM auth.identities WHERE provider_id = v_target_email AND user_id <> r.id
      );

  END LOOP;

  -- Aktifkan kembali trigger
  ALTER TABLE public.akun_pengguna ENABLE TRIGGER ALL;

  RAISE NOTICE 'Selesai! Periksa hasil di Langkah 5.';
END;
$$;


-- ================================================================
-- LANGKAH 5: Update fn_login agar lebih robust
-- (Menangani kasus apapun di masa depan dengan fuzzy username matching)
-- ================================================================
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
  -- Bersihkan input: potong domain jika ada (adelio7a@gmail.com -> adelio7a)
  v_clean_input := SPLIT_PART(LOWER(TRIM(p_username)), '@', 1);

  SELECT * INTO v_akun
  FROM akun_pengguna
  WHERE (
    LOWER(TRIM(username)) = LOWER(TRIM(p_username))
    OR LOWER(TRIM(username)) = v_clean_input
    OR SPLIT_PART(LOWER(TRIM(username)), '@', 1) = v_clean_input
  )
    AND status = 'aktif'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'msg', 'Akun tidak ditemukan atau tidak aktif.');
  END IF;

  IF p_role = 'murid' AND v_akun.role <> 'murid' THEN
    RETURN json_build_object('ok', false, 'msg', 'Email tidak terdaftar sebagai Siswa.');
  ELSIF p_role = 'orang_tua' AND v_akun.role <> 'orang_tua' THEN
    RETURN json_build_object('ok', false, 'msg', 'Username tidak terdaftar sebagai Orang Tua.');
  ELSIF p_role = 'staff' AND v_akun.role NOT IN ('guru','admin','staff','staf','piket') THEN
    RETURN json_build_object('ok', false, 'msg', 'Akun ini bukan milik Guru / Staff / Piket.');
  END IF;

  IF v_akun.password IS NULL OR v_akun.password = '' THEN
    RETURN json_build_object('ok', false, 'msg', 'Akun belum memiliki password.');
  END IF;

  v_db_hash := REGEXP_REPLACE(v_akun.password, '^\$2b\$', '$2a$');

  IF extensions.crypt(p_password, v_db_hash) <> v_db_hash THEN
    RETURN json_build_object('ok', false, 'msg', 'Kata sandi salah. Silakan coba lagi.');
  END IF;

  IF v_akun.role IN ('murid', 'orang_tua') THEN
    SELECT * INTO v_siswa FROM siswa_permanent
    WHERE nisn = v_akun.foreign_id LIMIT 1;

    IF NOT FOUND THEN
      RETURN json_build_object('ok', false, 'msg',
        CASE WHEN v_akun.role = 'murid'
             THEN 'Biodata Siswa tidak ditemukan.'
             ELSE 'Data Anak tidak ditemukan.' END);
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

  SELECT * INTO v_guru FROM guru WHERE id = v_akun.foreign_id::uuid LIMIT 1;
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

REVOKE ALL ON FUNCTION public.fn_login(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_login(TEXT, TEXT, TEXT) TO anon, authenticated;


-- ================================================================
-- LANGKAH 6: Verifikasi hasil akhir
-- Pastikan semua baris menampilkan status 'OK' atau 'DILEWATI (duplikat)'
-- ================================================================
SELECT 
  ap.id,
  ap.username                                AS username_bersih,
  au.email                                   AS auth_email,
  ap.status,
  CASE 
    WHEN au.email = ap.username || '@ebudimulia.local' 
      THEN 'OK - sinkron'
    WHEN au.email IS NULL 
      THEN 'WARNING - tidak ada di auth.users'
    ELSE 'PERLU CEK MANUAL: ' || au.email
  END AS status_sinkron
FROM public.akun_pengguna ap
LEFT JOIN auth.users au ON au.id = ap.id
WHERE ap.role = 'murid'
ORDER BY status_sinkron, ap.username;
