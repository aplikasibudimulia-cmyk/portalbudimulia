-- ============================================================
-- PATCH: Update fn_login untuk mendukung login dengan email Gmail atau Username ebmsiswa
-- 
-- Dengan patch ini, siswa bisa login menggunakan:
-- 1. Username standard (contoh: ebmsiswa.adelio7a334)
-- 2. Email Gmail (contoh: adelio7A@gmail.com)
-- ============================================================

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

  -- 1. Cari akun siswa berdasarkan username di akun_pengguna
  SELECT * INTO v_akun
  FROM akun_pengguna
  WHERE (
    LOWER(TRIM(username)) = v_clean_input
    OR SPLIT_PART(LOWER(TRIM(username)), '@', 1) = SPLIT_PART(v_clean_input, '@', 1)
  )
    AND status = 'aktif'
  LIMIT 1;

  -- 2. Jika akun belum ketemu dan login sebagai murid, coba cari berdasarkan email_aktif di siswa_permanent
  IF NOT FOUND AND p_role = 'murid' THEN
    SELECT ap.* INTO v_akun
    FROM akun_pengguna ap
    JOIN siswa_permanent sp ON sp.nisn = ap.foreign_id
    WHERE LOWER(TRIM(sp.email_aktif)) = v_clean_input
      AND ap.role = 'murid'
      AND ap.status = 'aktif'
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'msg', 'Akun tidak ditemukan atau tidak aktif.');
  END IF;

  -- 3. Validasi role
  IF p_role = 'murid' AND v_akun.role <> 'murid' THEN
    RETURN json_build_object('ok', false, 'msg', 'Email tidak terdaftar sebagai Siswa.');
  ELSIF p_role = 'orang_tua' AND v_akun.role <> 'orang_tua' THEN
    RETURN json_build_object('ok', false, 'msg', 'Username tidak terdaftar sebagai Orang Tua.');
  ELSIF p_role = 'staff' AND v_akun.role NOT IN ('guru','admin','staff','staf','piket') THEN
    RETURN json_build_object('ok', false, 'msg', 'Akun ini bukan milik Guru / Staff / Piket.');
  END IF;

  -- 4. Verifikasi password
  IF v_akun.password IS NULL OR v_akun.password = '' THEN
    RETURN json_build_object('ok', false, 'msg', 'Akun belum memiliki password.');
  END IF;

  v_db_hash := REGEXP_REPLACE(v_akun.password, '^\$2b\$', '$2a$');

  IF extensions.crypt(p_password, v_db_hash) <> v_db_hash THEN
    RETURN json_build_object('ok', false, 'msg', 'Kata sandi salah. Silakan coba lagi.');
  END IF;

  -- ── LOGIN SISWA / ORANG TUA ──────────────────────────────
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

  -- ── LOGIN GURU / STAFF ───────────────────────────────────
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
