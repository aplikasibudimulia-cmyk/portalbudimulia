-- ============================================================
-- PATCH UTAMA: OPTIMALISASI KINERJA DATABASE & RESOLUSI TIMEOUT
-- Solusi untuk error jam sibuk (06:30 - 07:00 AM):
-- 1. PGRST003: Timed out acquiring connection from connection pool
-- 2. 57014: Canceling statement due to statement timeout (fn_login)
-- 3. HTTP 504 Gateway Timeout pada line_bindings & siswa_lengkap
-- ============================================================

-- 1. INDEKS EXPRESSION UNTUK KECAPATAN LOGIN & AUTH
CREATE INDEX IF NOT EXISTS idx_akun_pengguna_lower_username 
  ON akun_pengguna(LOWER(TRIM(username)));

CREATE INDEX IF NOT EXISTS idx_akun_pengguna_prefix_username 
  ON akun_pengguna(LOWER(SPLIT_PART(username, '@', 1)));

CREATE INDEX IF NOT EXISTS idx_akun_pengguna_status 
  ON akun_pengguna(status);

-- 2. INDEKS UNTUK TABEL SIBUK PAGI HARI (Presensi, Line Binding, Push Notif)
CREATE INDEX IF NOT EXISTS idx_line_bindings_nisn 
  ON line_bindings(nisn);

CREATE INDEX IF NOT EXISTS idx_line_bindings_user_id 
  ON line_bindings(line_user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_nisn 
  ON push_subscriptions(nisn);

CREATE INDEX IF NOT EXISTS idx_presensi_harian_tanggal_nisn 
  ON presensi_harian(tanggal, siswa_nisn);

CREATE INDEX IF NOT EXISTS idx_presensi_harian_tanggal 
  ON presensi_harian(tanggal);

CREATE INDEX IF NOT EXISTS idx_siswa_permanent_nisn 
  ON siswa_permanent(nisn);


CREATE INDEX IF NOT EXISTS idx_enrollment_nisn_ta 
  ON enrollment(nisn, tahun_ajaran_id);

-- 3. RE-OPTIMIZE FUNGSI FN_LOGIN (Mencegah Full Table Scan saat Jam Sibuk Login)
CREATE OR REPLACE FUNCTION public.fn_login(
  p_username TEXT,
  p_password TEXT,
  p_role     TEXT   -- 'murid' | 'orang_tua' | 'staff'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
SET statement_timeout = '15s'
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
  v_clean_user  TEXT;
  v_user_prefix TEXT;
BEGIN
  v_clean_user  := LOWER(TRIM(p_username));
  v_user_prefix := SPLIT_PART(v_clean_user, '@', 1);

  -- Step A: Fast Lookup menggunakan Index Username Persis (99% pencarian cepat < 1ms)
  SELECT * INTO v_akun
  FROM akun_pengguna
  WHERE LOWER(TRIM(username)) = v_clean_user
    AND status = 'aktif'
  LIMIT 1;

  -- Step B: Fallback Lookup menggunakan Index Prefix Domain (jika user mengetik tanpa @domain)
  IF NOT FOUND THEN
    SELECT * INTO v_akun
    FROM akun_pengguna
    WHERE LOWER(SPLIT_PART(username, '@', 1)) = v_user_prefix
      AND status = 'aktif'
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'msg', 'Akun tidak ditemukan atau tidak aktif.');
  END IF;

  -- Validasi role
  IF p_role = 'murid' AND v_akun.role <> 'murid' THEN
    RETURN json_build_object('ok', false, 'msg', 'Email tidak terdaftar sebagai Siswa.');
  ELSIF p_role = 'orang_tua' AND v_akun.role <> 'orang_tua' THEN
    RETURN json_build_object('ok', false, 'msg', 'Username tidak terdaftar sebagai Orang Tua.');
  ELSIF p_role = 'staff' AND v_akun.role NOT IN ('guru','admin','staff','staf','piket') THEN
    RETURN json_build_object('ok', false, 'msg', 'Akun ini bukan milik Guru / Staff / Piket.');
  END IF;

  -- Verifikasi password
  IF v_akun.password IS NULL OR v_akun.password = '' THEN
    RETURN json_build_object('ok', false, 'msg', 'Akun belum memiliki password.');
  END IF;

  v_db_hash := REGEXP_REPLACE(v_akun.password, '^\$2b\$', '$2a$');

  IF extensions.crypt(p_password, v_db_hash) <> v_db_hash THEN
    RETURN json_build_object('ok', false, 'msg', 'Kata sandi salah. Silakan coba lagi.');
  END IF;

  -- LOGIN SISWA / ORANG TUA
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

  -- LOGIN GURU / STAFF
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
