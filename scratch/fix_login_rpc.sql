-- ============================================================
-- PATCH: Upgrade fn_login + kunci akun_pengguna dari anon
-- Jalankan ini SETELAH EMERGENCY_security_fix.sql berhasil.
-- ============================================================

-- Aktifkan pgcrypto untuk verifikasi bcrypt server-side
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Fungsi login lengkap (SECURITY DEFINER = jalan sebagai
-- service_role, bisa baca semua tabel meski anon yang memanggil)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_login(
  p_username TEXT,
  p_password TEXT,
  p_role     TEXT   -- 'murid' | 'orang_tua' | 'staff'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_akun   akun_pengguna%ROWTYPE;
  v_siswa  siswa_permanent%ROWTYPE;
  v_guru   guru%ROWTYPE;
  v_ta     tahun_ajaran%ROWTYPE;
  v_enrol  enrollment%ROWTYPE;
  v_roles  JSON;
  v_kelas  JSON;
BEGIN
  -- 1. Cari akun (case-insensitive)
  SELECT * INTO v_akun
  FROM akun_pengguna
  WHERE LOWER(TRIM(username)) = LOWER(TRIM(p_username))
    AND status = 'aktif'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'msg', 'Akun tidak ditemukan atau tidak aktif.');
  END IF;

  -- 2. Validasi role
  IF p_role = 'murid' AND v_akun.role <> 'murid' THEN
    RETURN json_build_object('ok', false, 'msg', 'Email tidak terdaftar sebagai Siswa.');
  ELSIF p_role = 'orang_tua' AND v_akun.role <> 'orang_tua' THEN
    RETURN json_build_object('ok', false, 'msg', 'Username tidak terdaftar sebagai Orang Tua.');
  ELSIF p_role = 'staff' AND v_akun.role NOT IN ('guru','admin','staff','staf','piket') THEN
    RETURN json_build_object('ok', false, 'msg', 'Akun ini bukan milik Guru / Staff / Piket.');
  END IF;

  -- 3. Verifikasi password (bcrypt via pgcrypto — kompatibel dengan bcryptjs)
  IF v_akun.password IS NULL OR v_akun.password = '' THEN
    RETURN json_build_object('ok', false, 'msg', 'Akun belum memiliki password.');
  END IF;

  IF crypt(p_password, v_akun.password) <> v_akun.password THEN
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
  SELECT * INTO v_guru FROM guru WHERE id = v_akun.foreign_id LIMIT 1;
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

-- Berikan izin eksekusi fungsi ke anon (bukan akses tabel)
REVOKE ALL ON FUNCTION public.fn_login(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_login(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ============================================================
-- Kunci akun_pengguna dari anon (fn_login sudah handle semua)
-- ============================================================

-- Hapus policy lama yang masih kasih akses anon
DROP POLICY IF EXISTS "anon_read_akun"           ON akun_pengguna;
DROP POLICY IF EXISTS "anon_login_lookup_akun"   ON akun_pengguna;

-- Hanya service_role yang boleh akses langsung
DROP POLICY IF EXISTS "service_write_akun"        ON akun_pengguna;
DROP POLICY IF EXISTS "service_only_akun_pengguna" ON akun_pengguna;

CREATE POLICY "service_only_akun_pengguna"
  ON akun_pengguna FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Cabut semua akses direct dari anon/authenticated
REVOKE ALL ON TABLE public.akun_pengguna FROM anon;
REVOKE ALL ON TABLE public.akun_pengguna FROM authenticated;
GRANT ALL ON TABLE public.akun_pengguna TO service_role;
