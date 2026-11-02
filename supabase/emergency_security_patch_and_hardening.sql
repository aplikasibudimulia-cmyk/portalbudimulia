-- ==============================================================================
-- 🛡️ EMERGENCY DATABASE SECURITY PATCH: SMP BUDI MULIA JAKARTA
-- Mengunci Total Celah Akses Publik (Anon / Curl), Kebocoran Data Siswa & Guru
-- ==============================================================================
-- Masalah yang Dilaporkan Siswa (Nando / White-Hat):
-- 1. Siswa menggunakan publishable/anon key via curl ke REST API Supabase:
--    - curl .../rest/v1/guru?select=* -> Membocorkan 'kode_akses' (password guru)
--    - Siswa berhasil login ke akun guru (Pak Sandy) dan berpotensi memanipulasi poin.
-- 2. curl .../rest/v1/siswa_permanent -> Membocorkan 627 data siswa lengkap:
--    - Nama orang tua, nomor HP/WA orang tua, alamat, dan password akun.
-- 3. curl .../rest/v1/cbt_soal_kunci -> Kunci jawaban ujian CBT berisiko bocor.
-- 4. Error saat login murid via email: "column sp.email does not exist".
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PERBAIKI BUG fn_login (ERROR: column sp.email does not exist)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_login(
  p_username TEXT,
  p_password TEXT,
  p_role     TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
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
  v_clean_input := LOWER(TRIM(p_username));

  -- STEP 1: Exact username match WITH role filter
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

  -- STEP 2: (murid only) Cari via email_aktif di siswa_permanent (Perbaikan: sp.email_aktif saja, bukan sp.email)
  IF NOT FOUND AND p_role = 'murid' THEN
    SELECT ap.* INTO v_akun
    FROM akun_pengguna ap
    JOIN siswa_permanent sp ON sp.nisn = ap.foreign_id
    WHERE LOWER(TRIM(sp.email_aktif)) = v_clean_input
      AND ap.role = 'murid'
      AND ap.status = 'aktif'
    LIMIT 1;
  END IF;

  -- STEP 3: (murid only) SPLIT_PART email prefix match + role filter
  IF NOT FOUND AND p_role = 'murid' AND v_clean_input LIKE '%@%' THEN
    SELECT * INTO v_akun
    FROM akun_pengguna
    WHERE SPLIT_PART(LOWER(TRIM(username)), '@', 1) = SPLIT_PART(v_clean_input, '@', 1)
      AND role = 'murid'
      AND status = 'aktif'
    LIMIT 1;
  END IF;

  -- STEP 4: Fallback exact match tanpa role filter
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

  -- Validasi role
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

  -- Verifikasi password
  IF v_akun.password IS NULL OR v_akun.password = '' THEN
    RETURN json_build_object('ok', false, 'msg', 'Akun belum memiliki password.');
  END IF;

  v_db_hash := REGEXP_REPLACE(v_akun.password, '^\$2b\$', '$2a$');

  IF extensions.crypt(p_password, v_db_hash) <> v_db_hash THEN
    RETURN json_build_object('ok', false, 'msg', 'Kata sandi salah. Silakan coba lagi.');
  END IF;

  -- SINKRONISASI OTOMATIS KE auth.users AGAR JWT TOKEN SUPABASE VALID
  BEGIN
    UPDATE auth.users
    SET encrypted_password = v_akun.password,
        updated_at = now()
    WHERE id = v_akun.id;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

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
      'siswa',           to_jsonb(v_siswa) - 'kode_akses' - 'ortu_password', -- Hapus plain-text pass dari response
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

GRANT EXECUTE ON FUNCTION public.fn_login(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2. KUNCI TOTAL TABEL GURU (BLOKIR PENCURIAN KODE_AKSES & USERNAME)
-- ------------------------------------------------------------------------------
-- A. Cabut hak akses SELECT pada kolom sensitif dari role 'anon'
-- 'anon' HANYA boleh membaca data profil publik: id, nama_guru, kode, foto_url
REVOKE ALL ON public.guru FROM anon;
GRANT SELECT (id, nama_guru, kode, foto_url) ON public.guru TO anon;
GRANT ALL ON public.guru TO authenticated, service_role;

-- B. Set RLS Policy
ALTER TABLE public.guru ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_guru" ON public.guru;
DROP POLICY IF EXISTS "anon_rw_guru" ON public.guru;
DROP POLICY IF EXISTS "Akses guru" ON public.guru;
DROP POLICY IF EXISTS "staff_all_guru" ON public.guru;
DROP POLICY IF EXISTS "authenticated_select_public_guru" ON public.guru;
DROP POLICY IF EXISTS "allow_read_guru" ON public.guru;
DROP POLICY IF EXISTS "allow_read_guru_public" ON public.guru;

-- Role anon & authenticated diizinkan membaca baris guru (namun kolom kode_akses dilindungi oleh GRANT)
CREATE POLICY "allow_read_guru_public"
ON public.guru
FOR SELECT
TO anon, authenticated
USING (true);

-- Hanya authenticated (Admin / Staff) yang boleh memodifikasi
CREATE POLICY "staff_all_guru"
ON public.guru
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 3. KUNCI TOTAL TABEL SISWA_PERMANENT (BLOKIR BOCORNYA DATA SISWA & ORANG TUA)
-- ------------------------------------------------------------------------------
-- A. Cabut total akses anon ke tabel siswa_permanent
REVOKE ALL ON public.siswa_permanent FROM anon;
GRANT ALL ON public.siswa_permanent TO authenticated, service_role;

-- B. Set RLS Policy ketat
ALTER TABLE public.siswa_permanent ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Akses siswa_permanent" ON public.siswa_permanent;
DROP POLICY IF EXISTS "allow_read_siswa_permanent" ON public.siswa_permanent;
DROP POLICY IF EXISTS "allow_all_siswa_permanent" ON public.siswa_permanent;
DROP POLICY IF EXISTS "allow_update_siswa_permanent" ON public.siswa_permanent;
DROP POLICY IF EXISTS "staff_all_siswa_permanent" ON public.siswa_permanent;
DROP POLICY IF EXISTS "student_select_own_siswa_permanent" ON public.siswa_permanent;
DROP POLICY IF EXISTS "student_update_own_siswa_permanent" ON public.siswa_permanent;
DROP POLICY IF EXISTS "allow_anon_read_siswa_permanent" ON public.siswa_permanent;

-- Hanya Administrator & Guru Terotentikasi yang diizinkan mengakses siswa_permanent
CREATE POLICY "staff_all_siswa_permanent"
ON public.siswa_permanent
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- C. RPC Aman untuk Siswa / Ortu Melihat Profil Pribadi Mereka Sendiri
CREATE OR REPLACE FUNCTION public.fn_get_my_student_profile(
  p_nisn TEXT,
  p_akun_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_res JSONB;
BEGIN
  -- Verifikasi kepemilikan akun: akun_id harus terikat dengan NISN yang diminta
  IF NOT EXISTS (
    SELECT 1 FROM public.akun_pengguna
    WHERE id = p_akun_id AND foreign_id = p_nisn AND status = 'aktif'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Akses ditolak: Verifikasi akun tidak cocok.');
  END IF;

  -- Ambil data siswa dengan MENGELUARKAN kolom kode_akses dan ortu_password
  SELECT to_jsonb(sp.*) - 'kode_akses' - 'ortu_password'
  INTO v_res
  FROM public.siswa_permanent sp
  WHERE sp.nisn = p_nisn;

  RETURN jsonb_build_object('ok', true, 'data', v_res);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_my_student_profile(TEXT, UUID) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. KUNCI VIEW SISWA_LENGKAP (HAPUS KODE_AKSES DARI AKSES ANON)
-- ------------------------------------------------------------------------------
REVOKE ALL ON public.siswa_lengkap FROM anon;
-- Anon hanya diizinkan membaca kolom akademik tanpa password
GRANT SELECT (nisn, nipd, nama_lengkap, email_aktif, no_whatsapp, tahun_lulus, created_at, telegram_ortu, kelas, kode, tahun_ajaran_id, tahun_ajaran, is_aktif) ON public.siswa_lengkap TO anon;
GRANT ALL ON public.siswa_lengkap TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. KUNCI TABEL CBT KUNCI JAWABAN (CEGAH SISWA CONTEK KUNCI SOAL CBT)
-- ------------------------------------------------------------------------------
ALTER TABLE public.cbt_soal_kunci ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_cbt_soal_kunci" ON public.cbt_soal_kunci;
DROP POLICY IF EXISTS "staff_all_cbt_soal_kunci" ON public.cbt_soal_kunci;

REVOKE ALL ON public.cbt_soal_kunci FROM anon;
GRANT ALL ON public.cbt_soal_kunci TO authenticated, service_role;

CREATE POLICY "staff_all_cbt_soal_kunci"
ON public.cbt_soal_kunci
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 6. KUNCI TABEL IMPERSONATE_TOKENS (CEGAH PENGAMBILALIHAN SESI)
-- ------------------------------------------------------------------------------
ALTER TABLE public.impersonate_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_impersonate_tokens" ON public.impersonate_tokens;
DROP POLICY IF EXISTS "staff_all_impersonate_tokens" ON public.impersonate_tokens;
DROP POLICY IF EXISTS "allow_read_valid_token" ON public.impersonate_tokens;

REVOKE ALL ON public.impersonate_tokens FROM anon;
GRANT SELECT ON public.impersonate_tokens TO anon;
GRANT ALL ON public.impersonate_tokens TO authenticated, service_role;

-- Anon hanya boleh membaca token yang belum kadaluarsa
CREATE POLICY "allow_read_valid_token"
ON public.impersonate_tokens
FOR SELECT
TO anon
USING (expires_at > now());

CREATE POLICY "staff_all_impersonate_tokens"
ON public.impersonate_tokens
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 7. REFRESH SCHEMA CACHE POSTGREST
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
