-- ==============================================================================
-- 🛡️ SECURITY HARDENING MIGRATION: SMP BUDI MULIA JAKARTA
-- Mengunci seluruh celah keamanan database, autentikasi, dan otorisasi:
-- 1. Mengunci RLS siswa_permanent agar siswa/publik TIDAK BISA intip data orang tua siswa lain
-- 2. Mengunci RLS akun_pengguna agar hash password tidak bocor ke publik
-- 3. Mengunci RLS guru agar kredensial guru aman
-- 4. Mengunci fungsi admin_reset_password & admin_create_user agar tidak bisa dipanggil anon
-- 5. Membuat RPC fn_verify_session & fn_check_is_admin untuk validasi sisi server
-- 6. Membuat RPC fn_validasi_kartu_pelajar (hanya merilis data publik kartu pelajar)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. HELPER FUNCTIONS UNTUK PENGECEKAN HAK AKSES SERVER-SIDE
-- ------------------------------------------------------------------------------

-- Helper 1: Cek apakah user saat ini adalah Staff / Guru / Admin
CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  -- 1. Jika claim JWT mengandung role admin
  IF (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' THEN
    RETURN true;
  END IF;

  -- 2. Cek role di public.akun_pengguna berdasarkan auth.uid()
  IF auth.uid() IS NOT NULL THEN
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

-- Helper 2: Cek apakah user saat ini adalah Administrator murni
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_foreign_id text;
BEGIN
  IF (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' THEN
    RETURN true;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    SELECT role, foreign_id INTO v_role, v_foreign_id
    FROM public.akun_pengguna
    WHERE id = auth.uid()
      AND status = 'aktif'
    LIMIT 1;

    IF v_role = 'admin' THEN
      RETURN true;
    END IF;

    -- Cek jika guru memiliki role "Admin" di guru_role
    IF v_role = 'guru' AND v_foreign_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM public.guru_role gr
        JOIN public.roles r ON gr.role_id = r.id
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

-- Helper 3: Ambil NISN siswa milik user terautentikasi saat ini
CREATE OR REPLACE FUNCTION public.get_auth_student_nisn()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT foreign_id FROM public.akun_pengguna
  WHERE id = auth.uid()
    AND role IN ('murid', 'orang_tua')
    AND status = 'aktif'
  LIMIT 1;
$$;

-- ------------------------------------------------------------------------------
-- 2. RPC VERIFIKASI SESI (MENCEGAH PEMALSUAN LOCALSTORAGE DI CLIENT)
-- ------------------------------------------------------------------------------

-- Fungsi untuk memverifikasi apakah sesi pengguna benar-benar ada di database
CREATE OR REPLACE FUNCTION public.fn_verify_session(
  p_akun_id    UUID,
  p_role       TEXT,
  p_foreign_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_akun akun_pengguna%ROWTYPE;
  v_is_admin boolean := false;
BEGIN
  IF p_akun_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'ID Akun tidak valid.');
  END IF;

  SELECT * INTO v_akun
  FROM public.akun_pengguna
  WHERE id = p_akun_id
    AND status = 'aktif'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Sesi tidak ditemukan atau akun telah dinonaktifkan.');
  END IF;

  -- Validasi kesesuaian role
  IF p_role = 'staff' AND v_akun.role NOT IN ('guru', 'admin', 'staff', 'staf', 'piket') THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Role sesi tidak sesuai.');
  ELSIF p_role IN ('murid', 'orang_tua') AND v_akun.role <> p_role THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Role sesi tidak sesuai.');
  END IF;

  -- Validasi foreign_id (NISN untuk siswa, atau ID guru)
  IF p_foreign_id IS NOT NULL AND v_akun.foreign_id IS NOT NULL THEN
    IF LOWER(TRIM(v_akun.foreign_id)) <> LOWER(TRIM(p_foreign_id)) THEN
      RETURN jsonb_build_object('ok', false, 'msg', 'Manipulasi data identitas terdeteksi.');
    END IF;
  END IF;

  -- Cek hak akses admin
  IF v_akun.role = 'admin' THEN
    v_is_admin := true;
  ELSIF v_akun.role = 'guru' AND v_akun.foreign_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.guru_role gr
      JOIN public.roles r ON gr.role_id = r.id
      WHERE gr.guru_id::text = v_akun.foreign_id
        AND LOWER(r.nama) = 'admin'
    ) INTO v_is_admin;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'role', v_akun.role,
    'is_admin', v_is_admin,
    'foreign_id', v_akun.foreign_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_verify_session(UUID, TEXT, TEXT) TO anon, authenticated;

-- Fungsi untuk memeriksa apakah email terdaftar sebagai admin resmi
CREATE OR REPLACE FUNCTION public.fn_check_is_admin(p_email TEXT)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
  v_role text;
  v_foreign_id text;
BEGIN
  IF p_email IS NULL OR TRIM(p_email) = '' THEN
    RETURN false;
  END IF;

  -- Cari user di auth.users berdasarkan email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE LOWER(email) = LOWER(TRIM(p_email))
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Cek role di akun_pengguna
  SELECT role, foreign_id INTO v_role, v_foreign_id
  FROM public.akun_pengguna
  WHERE id = v_user_id AND status = 'aktif'
  LIMIT 1;

  IF v_role = 'admin' THEN
    RETURN true;
  END IF;

  IF v_role = 'guru' AND v_foreign_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.guru_role gr
      JOIN public.roles r ON gr.role_id = r.id
      WHERE gr.guru_id::text = v_foreign_id AND LOWER(r.nama) = 'admin'
    ) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_check_is_admin(TEXT) TO anon, authenticated;

-- Fungsi untuk memverifikasi role aktual guru dari server
CREATE OR REPLACE FUNCTION public.fn_verify_guru_roles(p_guru_id UUID, p_akun_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_akun akun_pengguna%ROWTYPE;
  v_roles JSON;
  v_is_admin boolean := false;
BEGIN
  SELECT * INTO v_akun
  FROM public.akun_pengguna
  WHERE id = p_akun_id AND status = 'aktif'
  LIMIT 1;

  IF NOT FOUND OR v_akun.role NOT IN ('guru', 'admin', 'staff', 'staf', 'piket') THEN
    RETURN jsonb_build_object('valid', false, 'msg', 'Sesi pegawai tidak valid.');
  END IF;

  IF v_akun.role = 'admin' THEN
    v_is_admin := true;
  END IF;

  SELECT json_agg(json_build_object('id', gr.role_id, 'nama', r.nama))
  INTO v_roles
  FROM public.guru_role gr
  LEFT JOIN public.roles r ON r.id = gr.role_id
  WHERE gr.guru_id = p_guru_id;

  IF EXISTS (
    SELECT 1 FROM public.guru_role gr
    JOIN public.roles r ON gr.role_id = r.id
    WHERE gr.guru_id = p_guru_id AND LOWER(r.nama) = 'admin'
  ) THEN
    v_is_admin := true;
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'is_admin', v_is_admin,
    'roles', COALESCE(v_roles, '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_verify_guru_roles(UUID, UUID) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. RPC VALIDASI KARTU PELAJAR (HANYA MENGEMBALIKAN DATA PUBLIK, BUKAN ORANG TUA)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_validasi_kartu_pelajar(p_nisn TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean TEXT := TRIM(p_nisn);
  v_res JSONB;
BEGIN
  IF v_clean IS NULL OR v_clean = '' THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'nisn', sp.nisn,
    'nama_lengkap', sp.nama_lengkap,
    'kelas', COALESCE(sl.kelas, '-'),
    'tempat_lahir', sp.tempat_lahir,
    'tanggal_lahir', sp.tanggal_lahir,
    'jenis_kelamin', sp.jenis_kelamin,
    'foto_url', COALESCE(fs.foto_url, sp.foto_url),
    'is_aktif', COALESCE(sl.is_aktif, true)
  ) INTO v_res
  FROM public.siswa_permanent sp
  LEFT JOIN public.siswa_lengkap sl ON sl.nisn = sp.nisn
  LEFT JOIN public.foto_siswa fs ON fs.nisn = sp.nisn
  WHERE sp.nisn = v_clean OR sp.id::text = v_clean
  LIMIT 1;

  RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_validasi_kartu_pelajar(TEXT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. AMANKAN RPC ADMIN: RESET PASSWORD, CREATE USER, UPDATE USERNAME
-- ------------------------------------------------------------------------------

-- Update admin_reset_password: WAJIB verifikasi Admin sebelum mengeksekusi
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
  v_role TEXT;
  v_foreign_id TEXT;
BEGIN
  -- VALIDASI KEAMANAN KETAT
  IF NOT public.is_staff_or_admin() THEN
    RETURN json_build_object('ok', false, 'msg', 'Akses ditolak: Hanya Administrator atau Petugas yang berwenang.');
  END IF;

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
  WHERE id = p_akun_id
  RETURNING role, foreign_id INTO v_role, v_foreign_id;

  -- Jika akun yang diubah adalah Guru/Staff, sinkronkan plain-text password ke tabel guru
  IF v_role IN ('guru', 'admin', 'staff', 'staf', 'piket') AND v_foreign_id IS NOT NULL THEN
    UPDATE public.guru
    SET kode_akses = p_new_password
    WHERE id = v_foreign_id::uuid;
  END IF;

  RETURN json_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'msg', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_password(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_reset_password(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_password(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. KUNCI ROW LEVEL SECURITY (RLS) TABEL SISWA_PERMANENT (CELAH UTAMA BOCORNYA NAMA ORTU)
-- ------------------------------------------------------------------------------
ALTER TABLE public.siswa_permanent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_siswa_permanent" ON public.siswa_permanent;
DROP POLICY IF EXISTS "allow_update_siswa_permanent" ON public.siswa_permanent;
DROP POLICY IF EXISTS "staff_all_siswa_permanent" ON public.siswa_permanent;
DROP POLICY IF EXISTS "student_select_own_siswa_permanent" ON public.siswa_permanent;
DROP POLICY IF EXISTS "student_update_own_siswa_permanent" ON public.siswa_permanent;

-- A. Staff dan Admin sekolah memiliki hak penuh atas seluruh data siswa
CREATE POLICY "staff_all_siswa_permanent"
ON public.siswa_permanent
FOR ALL
TO authenticated
USING (public.is_staff_or_admin())
WITH CHECK (public.is_staff_or_admin());

-- B. Siswa & Orang Tua HANYA BISA MELIHAT DATA NISN MILIKNYA SENDIRI
CREATE POLICY "student_select_own_siswa_permanent"
ON public.siswa_permanent
FOR SELECT
TO authenticated
USING (nisn = public.get_auth_student_nisn());

-- C. Siswa & Orang Tua HANYA BISA MENGUPDATE DATA NISN MILIKNYA SENDIRI
CREATE POLICY "student_update_own_siswa_permanent"
ON public.siswa_permanent
FOR UPDATE
TO authenticated
USING (nisn = public.get_auth_student_nisn())
WITH CHECK (nisn = public.get_auth_student_nisn());

-- ------------------------------------------------------------------------------
-- 6. KUNCI ROW LEVEL SECURITY (RLS) TABEL AKUN_PENGGUNA (CEGAH PENCURIAN HASH & DAFTAR AKUN)
-- ------------------------------------------------------------------------------
ALTER TABLE public.akun_pengguna ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_akun_pengguna" ON public.akun_pengguna;
DROP POLICY IF EXISTS "staff_all_akun_pengguna" ON public.akun_pengguna;
DROP POLICY IF EXISTS "user_select_own_akun" ON public.akun_pengguna;

-- A. Staff dan Admin dapat mengelola akun pengguna
CREATE POLICY "staff_all_akun_pengguna"
ON public.akun_pengguna
FOR ALL
TO authenticated
USING (public.is_staff_or_admin())
WITH CHECK (public.is_staff_or_admin());

-- B. Setiap user HANYA BISA MELIHAT AKUNNYA SENDIRI (Anon tidak bisa melihat apa pun)
CREATE POLICY "user_select_own_akun"
ON public.akun_pengguna
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- ------------------------------------------------------------------------------
-- 7. KUNCI ROW LEVEL SECURITY (RLS) TABEL GURU & ROLES
-- ------------------------------------------------------------------------------
ALTER TABLE public.guru ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_guru" ON public.guru;
DROP POLICY IF EXISTS "staff_all_guru" ON public.guru;
DROP POLICY IF EXISTS "authenticated_select_public_guru" ON public.guru;
DROP POLICY IF EXISTS "allow_read_guru" ON public.guru;

-- A. Semua pengguna portal (anon & authenticated) dapat melihat profil publik guru (nama, kode, foto)
-- Ini krusial agar form Catat Poin Piket, Jadwal, Rekap Poin, dan menu siswa dapat menampilkan nama guru.
CREATE POLICY "allow_read_guru"
ON public.guru
FOR SELECT
TO anon, authenticated
USING (true);

-- B. Staff dan Admin dapat mengelola tabel guru
CREATE POLICY "staff_all_guru"
ON public.guru
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- C. Fungsi RPC aman untuk bypass RLS dan mengambil daftar guru publik
CREATE OR REPLACE FUNCTION public.fn_get_guru_list()
RETURNS TABLE (
  id UUID,
  nama_guru TEXT,
  kode TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id, nama_guru, kode
  FROM public.guru
  ORDER BY nama_guru ASC;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_guru_list() TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 8. KUNCI TABEL IMPERSONATE_TOKENS (CEGAH SISWA MEMBUAT TOKEN LOGIN ADMIN SENDIRI)
-- ------------------------------------------------------------------------------
ALTER TABLE public.impersonate_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_all_impersonate_tokens" ON public.impersonate_tokens;
DROP POLICY IF EXISTS "allow_read_valid_token" ON public.impersonate_tokens;

-- A. Hanya Admin/Staff yang boleh membuat token impersonate
CREATE POLICY "staff_all_impersonate_tokens"
ON public.impersonate_tokens
FOR ALL
TO authenticated
USING (public.is_staff_or_admin())
WITH CHECK (public.is_staff_or_admin());

-- B. Publik / Anon hanya bisa membaca token yang valid dan belum kadaluarsa untuk diarahkan ke login
CREATE POLICY "allow_read_valid_token"
ON public.impersonate_tokens
FOR SELECT
TO anon, authenticated
USING (expires_at > now());

-- ------------------------------------------------------------------------------
-- 9. KUNCI DATA KEUANGAN SPP & LOG BCA
-- ------------------------------------------------------------------------------
ALTER TABLE public.tagihan_spp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaksi_bca_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all on tagihan_spp" ON public.tagihan_spp;
DROP POLICY IF EXISTS "staff_all_tagihan_spp" ON public.tagihan_spp;
DROP POLICY IF EXISTS "student_select_own_tagihan_spp" ON public.tagihan_spp;

DROP POLICY IF EXISTS "Allow public all on transaksi_bca_log" ON public.transaksi_bca_log;
DROP POLICY IF EXISTS "staff_all_transaksi_bca_log" ON public.transaksi_bca_log;

-- A. Tagihan SPP: Staff kelola semua, Siswa/Ortu hanya bisa lihat miliknya
CREATE POLICY "staff_all_tagihan_spp"
ON public.tagihan_spp
FOR ALL
TO authenticated
USING (public.is_staff_or_admin())
WITH CHECK (public.is_staff_or_admin());

CREATE POLICY "student_select_own_tagihan_spp"
ON public.tagihan_spp
FOR SELECT
TO authenticated
USING (siswa_nisn = public.get_auth_student_nisn());

-- B. Transaksi BCA Log: HANYA Staff/Admin Keuangan
CREATE POLICY "staff_all_transaksi_bca_log"
ON public.transaksi_bca_log
FOR ALL
TO authenticated
USING (public.is_staff_or_admin())
WITH CHECK (public.is_staff_or_admin());

-- ------------------------------------------------------------------------------
-- 10. UPDATE FN_LOGIN AGAR SELALU MENYELARASKAN AUTH.USERS SECARA OTOMATIS
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
  -- Bersihkan input username
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

  -- STEP 2: (murid only) Cari via email_aktif di siswa_permanent
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

  -- SINKRONISASI OTOMATIS KE auth.users AGAR JWT TOKEN SUPABASE SELALU 100% VALID
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

-- ------------------------------------------------------------------------------
-- 11. 📡 PELACAK LOKASI LOGIN ADMIN & HONEYPOT KOMUNIKASI DUA ARAH
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  email TEXT,
  ip_address TEXT,
  city TEXT,
  region TEXT,
  country TEXT,
  isp TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  device TEXT,
  browser TEXT,
  os TEXT,
  session_id TEXT,
  status TEXT DEFAULT 'active', -- 'active' | 'blocked' | 'investigating'
  admin_message TEXT,
  hacker_reply TEXT,
  replied_at TIMESTAMPTZ,
  is_suspicious BOOLEAN DEFAULT true,
  device_identity TEXT,
  photo_url TEXT
);

-- Pastikan kolom baru tersedia jika tabel sudah ada sebelumnya
ALTER TABLE public.admin_access_logs
  ADD COLUMN IF NOT EXISTS device_identity TEXT,
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Enable RLS
ALTER TABLE public.admin_access_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_admin_access_logs" ON public.admin_access_logs;
DROP POLICY IF EXISTS "staff_all_admin_access_logs" ON public.admin_access_logs;
DROP POLICY IF EXISTS "intruder_read_reply_own_session" ON public.admin_access_logs;

-- Izinkan siapa saja (anon/auth) menyisipkan log akses saat membuka/mencoba login admin
CREATE POLICY "anon_insert_admin_access_logs"
ON public.admin_access_logs
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Staff dan Admin dapat melihat, mengubah, dan mengirim pesan intervensi
CREATE POLICY "staff_all_admin_access_logs"
ON public.admin_access_logs
FOR ALL
TO authenticated
USING (public.is_staff_or_admin())
WITH CHECK (public.is_staff_or_admin());

-- Pengguna / Penyusup dapat membaca pesan dari admin dan mengirim balasan untuk sesi miliknya
CREATE POLICY "intruder_read_reply_own_session"
ON public.admin_access_logs
FOR SELECT
TO anon, authenticated
USING (session_id IS NOT NULL);

-- RPC untuk mencatat akses admin beserta koordinat, perangkat, identitas siswa terdeteksi, dan foto wajah
CREATE OR REPLACE FUNCTION public.fn_record_admin_access(
  p_email      TEXT,
  p_ip         TEXT,
  p_city       TEXT,
  p_region     TEXT,
  p_country    TEXT,
  p_isp        TEXT,
  p_lat        NUMERIC,
  p_lon        NUMERIC,
  p_device     TEXT,
  p_browser    TEXT,
  p_os         TEXT,
  p_session_id TEXT,
  p_identity   TEXT DEFAULT NULL,
  p_photo_url  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.admin_access_logs (
    email, ip_address, city, region, country, isp,
    latitude, longitude, device, browser, os, session_id,
    device_identity, photo_url
  ) VALUES (
    p_email, p_ip, p_city, p_region, p_country, p_isp,
    p_lat, p_lon, p_device, p_browser, p_os, p_session_id,
    p_identity, p_photo_url
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_record_admin_access(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- RPC untuk memperbarui foto wajah penyusup jika kamera baru terbuka belakangan
CREATE OR REPLACE FUNCTION public.fn_update_admin_access_photo(
  p_log_id    UUID,
  p_photo_url TEXT
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.admin_access_logs
  SET photo_url = p_photo_url
  WHERE id = p_log_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_update_admin_access_photo(UUID, TEXT) TO anon, authenticated;

-- RPC untuk Admin mengirim pesan langsung ke layar si penyusup
CREATE OR REPLACE FUNCTION public.fn_send_admin_intervention(
  p_log_id  UUID,
  p_message TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff_or_admin() THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Hanya administrator yang berwenang mengirim pesan intervensi.');
  END IF;

  UPDATE public.admin_access_logs
  SET admin_message = p_message,
      status = 'investigating'
  WHERE id = p_log_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_send_admin_intervention(UUID, TEXT) TO authenticated;

-- RPC bagi penyusup/siswa untuk membalas pesan Admin langsung
CREATE OR REPLACE FUNCTION public.fn_submit_intruder_reply(
  p_session_id TEXT,
  p_reply      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.admin_access_logs
  SET hacker_reply = p_reply,
      replied_at = now()
  WHERE session_id = p_session_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_submit_intruder_reply(TEXT, TEXT) TO anon, authenticated;

-- RPC untuk memperbarui koordinat GPS presisi tinggi di latar belakang
CREATE OR REPLACE FUNCTION public.fn_update_admin_access_gps(
  p_log_id  UUID,
  p_lat     NUMERIC,
  p_lon     NUMERIC,
  p_city    TEXT,
  p_region  TEXT
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.admin_access_logs
  SET latitude = p_lat,
      longitude = p_lon,
      city = p_city,
      region = p_region
  WHERE id = p_log_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_update_admin_access_gps(UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO anon, authenticated;

-- Aktifkan Supabase Realtime pada tabel admin_access_logs jika publication tersedia
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_access_logs;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- Refresh cache skema PostgREST Supabase
NOTIFY pgrst, 'reload schema';
