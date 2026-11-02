-- ============================================================
-- FIX: fn_login role mismatch bug
-- 
-- Konvensi username:
--   Siswa     → ebmsiswa.xxx  (login: username ebmsiswa.xxx ATAU email Gmail)
--   Orang Tua → ebmortu.xxx   (login: username ebmortu.xxx)
--   Guru/Staff→ username biasa (login: username)
--
-- BUG SEBELUMNYA:
--   1. Query pertama tidak filter role → LIMIT 1 bisa ambil akun orang tua
--   2. SPLIT_PART email prefix match terlalu longgar (john@gmail = john@yahoo)
--   3. Jika akun salah ditemukan (FOUND=true), fallback email_aktif tidak jalan
--
-- FIX: Cascade lookup dengan role filter di setiap tahap:
--   Step 1: Exact username match + role filter
--   Step 2: (murid only) Cari via email_aktif di siswa_permanent → akun ebmsiswa
--   Step 3: (murid only) SPLIT_PART email prefix + role filter (last resort)
--   Step 4: Fallback exact match tanpa role (backward compat) + validasi role
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

  -- ═══════════════════════════════════════════════════════════
  -- STEP 1: Exact username match WITH role filter
  -- Paling akurat — langsung cocokkan username + role yang diminta
  -- Contoh: ebmsiswa.adelio7a334 (murid), ebmortu.adelio7a334 (orang_tua)
  -- ═══════════════════════════════════════════════════════════
  SELECT * INTO v_akun
  FROM akun_pengguna
  WHERE LOWER(TRIM(username)) = v_clean_input
    AND status = 'aktif'
    AND (
      (p_role = 'murid'     AND role = 'murid') OR
      (p_role = 'orang_tua' AND role = 'orang_tua') OR
      (p_role = 'staff'     AND role IN ('guru','admin','staff','staf','piket'))
    )
  LIMIT 1;

  -- ═══════════════════════════════════════════════════════════
  -- STEP 2: (murid only) Cari via email_aktif di siswa_permanent
  -- Ketika siswa login pakai email Gmail, cari NISN di siswa_permanent
  -- lalu ambil akun ebmsiswa.xxx milik murid tersebut
  -- ═══════════════════════════════════════════════════════════
  IF NOT FOUND AND p_role = 'murid' THEN
    SELECT ap.* INTO v_akun
    FROM akun_pengguna ap
    JOIN siswa_permanent sp ON sp.nisn = ap.foreign_id
    WHERE LOWER(TRIM(sp.email_aktif)) = v_clean_input
      AND ap.role = 'murid'
      AND ap.status = 'aktif'
    LIMIT 1;
  END IF;

  -- ═══════════════════════════════════════════════════════════
  -- STEP 3: (murid only) SPLIT_PART email prefix match + role filter
  -- Last resort jika username di DB berbentuk email (edge case)
  -- Hanya jika input mengandung @ (memang email)
  -- ═══════════════════════════════════════════════════════════
  IF NOT FOUND AND p_role = 'murid' AND v_clean_input LIKE '%@%' THEN
    SELECT * INTO v_akun
    FROM akun_pengguna
    WHERE SPLIT_PART(LOWER(TRIM(username)), '@', 1) = SPLIT_PART(v_clean_input, '@', 1)
      AND role = 'murid'
      AND status = 'aktif'
    LIMIT 1;
  END IF;

  -- ═══════════════════════════════════════════════════════════
  -- STEP 4: Fallback — exact match tanpa role filter
  -- Untuk backward compat jika siswa pakai username ebmortu, dll
  -- Validasi role dilakukan di bawah
  -- ═══════════════════════════════════════════════════════════
  IF NOT FOUND THEN
    SELECT * INTO v_akun
    FROM akun_pengguna
    WHERE LOWER(TRIM(username)) = v_clean_input
      AND status = 'aktif'
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'msg', 'Akun tidak ditemukan atau tidak aktif.');
  END IF;

  -- ═══════════════════════════════════════════════════════════
  -- Validasi role (safety net untuk Step 4 fallback)
  -- Jika akun ditemukan tapi role tidak cocok, beri pesan yang jelas
  -- ═══════════════════════════════════════════════════════════
  IF p_role = 'murid' AND v_akun.role <> 'murid' THEN
    RETURN json_build_object('ok', false, 'msg',
      CASE WHEN v_akun.role = 'orang_tua'
        THEN 'Username ini milik akun Orang Tua (ebmortu), bukan Siswa. Silakan pilih tab "Orang Tua" untuk login.'
        ELSE 'Username ini terdaftar sebagai ' || v_akun.role || ', bukan Siswa. Silakan pilih tab login yang sesuai.'
      END);
  ELSIF p_role = 'orang_tua' AND v_akun.role <> 'orang_tua' THEN
    RETURN json_build_object('ok', false, 'msg',
      CASE WHEN v_akun.role = 'murid'
        THEN 'Username ini milik akun Siswa (ebmsiswa), bukan Orang Tua. Silakan pilih tab "Siswa" untuk login.'
        ELSE 'Username ini terdaftar sebagai ' || v_akun.role || ', bukan Orang Tua. Silakan pilih tab login yang sesuai.'
      END);
  ELSIF p_role = 'staff' AND v_akun.role NOT IN ('guru','admin','staff','staf','piket') THEN
    RETURN json_build_object('ok', false, 'msg', 'Akun ini bukan milik Guru / Staff / Piket.');
  END IF;

  -- ═══════════════════════════════════════════════════════════
  -- Verifikasi password
  -- ═══════════════════════════════════════════════════════════
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
