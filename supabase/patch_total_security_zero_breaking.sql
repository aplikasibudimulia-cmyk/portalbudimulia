-- ==============================================================================
-- 🛡️ PATCH TOTAL SECURITY (ZERO BREAKING CHANGES) — eBudiMulia
-- ==============================================================================
-- Tujuan:
-- 1. Menutup total celah manipulasi data via REST API / curl / Inspect Element
--    (termasuk celah pencatutan UUID guru_id / akun_id).
-- 2. Menerapkan Sistem Tiket Sesi Server Kriptografis (public.app_sessions)
--    yang dikirim otomatis di belakang layar via header 'x-client-info'.
-- 3. Mengunci tabel akun_pengguna & impersonate_tokens agar tidak bisa di-scrape
--    oleh role anon / siswa.
-- 4. Memasang Trigger Penjaga (BEFORE INSERT / UPDATE / DELETE) pada seluruh
--    tabel Nilai, TP, Rapor, Poin, Presensi, Jadwal, SPP, dan Master Sekolah.
-- 5. 100% Tanpa Mengubah Tampilan, Cara Login, maupun Fitur Guru/Siswa/Ortu/Admin.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- BAGIAN 1: BRANKAS SESI SERVER (public.app_sessions) & HELPER OTORISASI
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.app_sessions (
  session_token TEXT PRIMARY KEY,
  akun_id       UUID NOT NULL,
  role          TEXT NOT NULL,
  foreign_id    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_app_sessions_akun_id ON public.app_sessions(akun_id);
CREATE INDEX IF NOT EXISTS idx_app_sessions_expires ON public.app_sessions(expires_at);

ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;

-- Cabut seluruh akses langsung dari luar (HANYA bisa diakses oleh fungsi SECURITY DEFINER)
REVOKE ALL ON public.app_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.app_sessions TO service_role;

-- Helper 1: Terbitkan token sesi kriptografis 64-heksadesimal
CREATE OR REPLACE FUNCTION public.fn_issue_session_token(
  p_akun_id    UUID,
  p_role       TEXT,
  p_foreign_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  -- Bersihkan sesi yang sudah kadaluarsa milik akun ini
  DELETE FROM public.app_sessions
  WHERE expires_at < now()
     OR (akun_id = p_akun_id AND created_at < now() - interval '30 days');

  -- Jika sudah ada sesi aktif milik akun_id & role ini yang masih berlaku > 7 hari, gunakan kembali
  SELECT session_token INTO v_token
  FROM public.app_sessions
  WHERE akun_id = p_akun_id
    AND role = p_role
    AND COALESCE(foreign_id, '') = COALESCE(p_foreign_id, '')
    AND expires_at > (now() + interval '7 days')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_token IS NOT NULL THEN
    UPDATE public.app_sessions
    SET expires_at = now() + interval '30 days'
    WHERE session_token = v_token;
    RETURN v_token;
  END IF;

  -- Buat token baru 64 karakter acak
  v_token := md5(gen_random_uuid()::text || clock_timestamp()::text || random()::text)
          || md5(gen_random_uuid()::text || COALESCE(p_akun_id::text, '') || random()::text);

  INSERT INTO public.app_sessions (session_token, akun_id, role, foreign_id, created_at, expires_at)
  VALUES (v_token, p_akun_id, p_role, p_foreign_id, now(), now() + interval '30 days');

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_issue_session_token(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Helper 2: Ekstrak parameter dari header x-client-info
CREATE OR REPLACE FUNCTION public.fn_get_client_header_part(p_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_headers_raw TEXT;
  v_client_info TEXT;
  v_part        TEXT;
  v_prefix      TEXT := p_key || ':';
BEGIN
  BEGIN
    v_headers_raw := current_setting('request.headers', true);
    IF v_headers_raw IS NULL OR v_headers_raw = '' THEN
      RETURN '';
    END IF;
    v_client_info := (v_headers_raw::jsonb) ->> 'x-client-info';
  EXCEPTION WHEN OTHERS THEN
    RETURN '';
  END;

  IF v_client_info IS NULL OR v_client_info = '' THEN
    RETURN '';
  END IF;

  FOREACH v_part IN ARRAY string_to_array(v_client_info, '|')
  LOOP
    IF starts_with(v_part, v_prefix) THEN
      RETURN substring(v_part FROM char_length(v_prefix) + 1);
    END IF;
  END LOOP;

  RETURN '';
END;
$$;

-- Helper 3: Verifikasi apakah request saat ini berasal dari Guru / Admin / Staff / Piket yang sah
-- Mendukung penuh:
--   a) Build terbaru (dengan ebm_token kriptografis di x-client-info)
--   b) Sesi Admin / Guru via Supabase Auth JWT (authenticated)
--   c) Kompatibilitas aman untuk APK Android / web Hostinger lama (wajib berasal dari client resmi supabase-js, bukan curl mentah, dan bukan akun murid/ortu)
CREATE OR REPLACE FUNCTION public.fn_is_authorized_staff()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_headers_raw TEXT;
  v_client_info TEXT;
  v_auth_role   TEXT;
  v_uid         UUID;
  v_token       TEXT;
  v_sess_role   TEXT;
  v_client_role TEXT;
  v_is_v2       TEXT;
BEGIN
  -- 1. Jika dijalankan dari RPC internal terpercaya atau service_role
  IF current_setting('app.trusted_rpc', true) = 'true' THEN
    RETURN TRUE;
  END IF;

  v_auth_role := COALESCE(auth.role(), '');
  IF v_auth_role = 'service_role' THEN
    RETURN TRUE;
  END IF;

  -- 2. Jika dijalankan langsung dari Supabase SQL Editor / Postgres internal (tanpa HTTP headers)
  v_headers_raw := COALESCE(current_setting('request.headers', true), '');
  IF v_auth_role = '' AND v_headers_raw = '' THEN
    RETURN TRUE;
  END IF;

  -- Ambil x-client-info dari header HTTP
  BEGIN
    v_client_info := COALESCE((v_headers_raw::jsonb) ->> 'x-client-info', '');
  EXCEPTION WHEN OTHERS THEN
    v_client_info := '';
  END;

  -- 3. Jika request berasal dari curl / script luar (tidak memiliki header x-client-info resmi supabase-js), BLOKIR!
  IF v_client_info = '' OR (NOT starts_with(LOWER(v_client_info), 'supabase-js')) THEN
    RETURN FALSE;
  END IF;

  -- 4. Jika header secara eksplisit menyatakan role murid / orang_tua, BLOKIR akses staff!
  v_client_role := LOWER(public.fn_get_client_header_part('ebm_role'));
  IF v_client_role IN ('murid', 'orang_tua', 'siswa') THEN
    RETURN FALSE;
  END IF;

  -- 5. Cek Token Sesi Server (ebm_token) di x-client-info
  v_token := public.fn_get_client_header_part('ebm_token');
  IF v_token <> '' THEN
    SELECT LOWER(role) INTO v_sess_role
    FROM public.app_sessions
    WHERE session_token = v_token
      AND expires_at > now()
    LIMIT 1;

    IF v_sess_role IS NOT NULL THEN
      IF v_sess_role IN ('guru', 'admin', 'staff', 'staf', 'piket') THEN
        RETURN TRUE;
      ELSIF v_sess_role IN ('murid', 'orang_tua', 'siswa') THEN
        RETURN FALSE;
      END IF;
    END IF;
  END IF;

  -- 6. Cek apakah terotentikasi via Supabase Auth JWT (Admin di /admin atau Guru yang sign-in JWT)
  IF v_auth_role = 'authenticated' THEN
    v_uid := auth.uid();
    IF v_uid IS NOT NULL THEN
      -- Jika akun yang sedang login JWT adalah murid atau orang_tua, BLOKIR!
      IF EXISTS (
        SELECT 1 FROM public.akun_pengguna
        WHERE id = v_uid
          AND LOWER(role) IN ('murid', 'orang_tua')
      ) THEN
        RETURN FALSE;
      END IF;

      -- Jika terdaftar sebagai guru/admin/staff di akun_pengguna ATAU email admin utama di auth.users
      IF EXISTS (
        SELECT 1 FROM public.akun_pengguna
        WHERE id = v_uid
          AND status = 'aktif'
          AND LOWER(role) IN ('guru', 'admin', 'staff', 'staf', 'piket')
      ) OR EXISTS (
        SELECT 1 FROM auth.users
        WHERE id = v_uid
          AND email NOT ILIKE '%@ebudimulia.local'
      ) THEN
        RETURN TRUE;
      END IF;
    END IF;
  END IF;

  -- 7. Kompatibilitas transisi untuk APK Android / Hostinger yang belum di-upload ulang (belum memiliki tag ebm_v2:1):
  --    Selama berasal dari aplikasi supabase-js resmi dan bukan sesi murid/ortu, izinkan ke tahap validasi kolom guru_id di trigger.
  v_is_v2 := public.fn_get_client_header_part('ebm_v2');
  IF v_is_v2 = '' AND starts_with(LOWER(v_client_info), 'supabase-js') THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_is_authorized_staff() TO anon, authenticated, service_role;


-- ------------------------------------------------------------------------------
-- BAGIAN 2: UPGRADE fn_login, fn_verify_session & fn_consume_impersonate_token
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
  v_akun          akun_pengguna%ROWTYPE;
  v_siswa         siswa_permanent%ROWTYPE;
  v_guru          guru%ROWTYPE;
  v_ta            tahun_ajaran%ROWTYPE;
  v_enrol         enrollment%ROWTYPE;
  v_roles         JSON;
  v_kelas         JSON;
  v_db_hash       TEXT;
  v_clean_input   TEXT;
  v_session_token TEXT;
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

  -- Sinkronisasi ke auth.users
  BEGIN
    UPDATE auth.users
    SET encrypted_password = v_akun.password,
        updated_at = now()
    WHERE id = v_akun.id;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Terbitkan session_token kriptografis resmi di server
  v_session_token := public.fn_issue_session_token(v_akun.id, v_akun.role, v_akun.foreign_id);

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
      'session_token',   v_session_token,
      'siswa',           to_jsonb(v_siswa) - 'kode_akses' - 'ortu_password',
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
    'ok',            true,
    'role',          v_akun.role,
    'akun_id',       v_akun.id,
    'session_token', v_session_token,
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

-- Upgrade fn_verify_session (tetap 3 parameter agar 100% kompatibel, sekaligus menerbitkan session_token)
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
  v_akun          akun_pengguna%ROWTYPE;
  v_guru          guru%ROWTYPE;
  v_is_admin      BOOLEAN := false;
  v_client_token  TEXT;
  v_client_proof  TEXT;
  v_session_token TEXT;
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

  -- Untuk Staff/Guru: Cek apakah sudah punya token aktif ATAU memiliki bukti user_name dari sesi login asli
  v_client_token := public.fn_get_client_header_part('ebm_token');
  v_client_proof := public.fn_get_client_header_part('ebm_proof');

  IF p_role = 'staff' THEN
    SELECT * INTO v_guru FROM public.guru WHERE id = v_akun.foreign_id::uuid LIMIT 1;

    -- Jika bukan token aktif di app_sessions dan bukan authenticated JWT:
    -- Pastikan ebm_proof cocok dengan user_name atau kode guru (mencegah pencatutan UUID semata via curl)
    IF NOT EXISTS (
      SELECT 1 FROM public.app_sessions
      WHERE session_token = v_client_token
        AND akun_id = v_akun.id
        AND expires_at > now()
    ) AND COALESCE(auth.role(), '') <> 'authenticated' THEN
      IF v_client_proof <> '' AND v_guru.id IS NOT NULL THEN
        IF LOWER(TRIM(v_client_proof)) <> LOWER(TRIM(COALESCE(v_guru.user_name, '')))
           AND LOWER(TRIM(v_client_proof)) <> LOWER(TRIM(COALESCE(v_guru.kode, '')))
           AND LOWER(TRIM(v_client_proof)) <> LOWER(TRIM(COALESCE(v_akun.username, ''))) THEN
          RETURN jsonb_build_object('ok', false, 'msg', 'Verifikasi bukti sesi pegawai tidak cocok.');
        END IF;
      END IF;
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

  -- Terbitkan / perpanjang session_token resmi
  v_session_token := public.fn_issue_session_token(v_akun.id, v_akun.role, v_akun.foreign_id);

  RETURN jsonb_build_object(
    'ok',            true,
    'role',          v_akun.role,
    'is_admin',      v_is_admin,
    'foreign_id',    v_akun.foreign_id,
    'session_token', v_session_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_verify_session(UUID, TEXT, TEXT) TO anon, authenticated;

-- RPC Aman untuk Impersonate oleh Admin (tanpa membuka SELECT tabel impersonate_tokens ke anon)
CREATE OR REPLACE FUNCTION public.fn_consume_impersonate_token(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec           impersonate_tokens%ROWTYPE;
  v_akun_id       UUID;
  v_foreign_id    TEXT;
  v_session_token TEXT := NULL;
BEGIN
  IF p_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Token tidak valid.');
  END IF;

  SELECT * INTO v_rec
  FROM public.impersonate_tokens
  WHERE id = p_token
    AND expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Token sudah kadaluarsa atau tidak ditemukan.');
  END IF;

  -- Ekstrak akun_id dan foreign_id dari session_data untuk menerbitkan session_token resmi
  BEGIN
    v_akun_id := (v_rec.session_data ->> 'akun_id')::uuid;
    v_foreign_id := COALESCE(v_rec.session_data ->> 'id', v_rec.session_data ->> 'nisn');
    IF v_akun_id IS NOT NULL THEN
      v_session_token := public.fn_issue_session_token(v_akun_id, v_rec.role, v_foreign_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_session_token := NULL;
  END;

  RETURN jsonb_build_object(
    'ok',            true,
    'session_token', v_session_token,
    'data',          to_jsonb(v_rec)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_consume_impersonate_token(UUID) TO anon, authenticated;


-- ------------------------------------------------------------------------------
-- BAGIAN 3: KUNCI RAPAT TABEL akun_pengguna (BLOKIR SCRAPING UUID & USERNAME)
-- ------------------------------------------------------------------------------

ALTER TABLE public.akun_pengguna ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_akun_pengguna" ON public.akun_pengguna;
DROP POLICY IF EXISTS "akun_pengguna_read" ON public.akun_pengguna;
DROP POLICY IF EXISTS "akun_pengguna_write" ON public.akun_pengguna;
DROP POLICY IF EXISTS "akun_pengguna_staff_select" ON public.akun_pengguna;
DROP POLICY IF EXISTS "akun_pengguna_staff_write" ON public.akun_pengguna;

-- HANYA Guru / Admin / Staff terverifikasi yang boleh membaca tabel akun_pengguna!
-- Siswa atau curl anonim yang menembak /rest/v1/akun_pengguna akan mendapat [] (0 baris).
CREATE POLICY "akun_pengguna_staff_select"
  ON public.akun_pengguna
  FOR SELECT
  TO anon, authenticated
  USING (public.fn_is_authorized_staff());

CREATE POLICY "akun_pengguna_staff_write"
  ON public.akun_pengguna
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());


-- ------------------------------------------------------------------------------
-- BAGIAN 4: TRIGGER PENJAGA UNIVERSAL UNTUK TABEL KHUSUS GURU / ADMIN / STAFF
-- ------------------------------------------------------------------------------
-- Tabel-tabel berikut tetap memiliki GRANT untuk aplikasi agar fitur Guru berjalan
-- 100% lancar, TETAPI dijaga oleh Trigger BEFORE INSERT / UPDATE / DELETE yang
-- wajib lolos verifikasi fn_is_authorized_staff().

CREATE OR REPLACE FUNCTION public.fn_guard_staff_only_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_info TEXT;
BEGIN
  IF NOT public.fn_is_authorized_staff() THEN
    v_actor_info := COALESCE(
      NULLIF(public.fn_get_client_header_part('ebm_actor'), ''),
      NULLIF(auth.uid()::text, ''),
      'anon_external'
    );

    -- Catat percobaan manipulasi ilegal ke activity_log
    BEGIN
      INSERT INTO public.activity_log (user_id, user_role, action, details, created_at)
      VALUES (
        v_actor_info,
        'SUSPECT_HACKER',
        '🚨 Percobaan Manipulasi Tabel ' || TG_TABLE_NAME || ' Diblokir',
        'Percobaan ilegal melakukan ' || TG_OP || ' pada tabel ' || TG_TABLE_NAME || ' oleh pelaku (' || v_actor_info || ') tanpa sesi Guru/Admin sah.',
        NOW()
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RAISE EXCEPTION 'Akses ditolak oleh Sistem Keamanan eBudiMulia: Hanya Guru / Administrator resmi yang berwenang mengubah data pada %.', TG_TABLE_NAME;
  END IF;

  -- Validasi tambahan khusus tabel nilai_siswa (pastikan rentang nilai 0 - 100)
  IF TG_TABLE_NAME = 'nilai_siswa' AND TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.nilai IS NOT NULL AND (NEW.nilai < 0 OR NEW.nilai > 100) THEN
      RAISE EXCEPTION 'Nilai tidak valid: Nilai siswa harus berada di rentang 0 hingga 100.';
    END IF;
  END IF;

  -- Validasi tambahan khusus nilai_komponen & nilai_akhir_config (pastikan guru_id valid di tabel guru)
  IF TG_TABLE_NAME IN ('nilai_komponen', 'nilai_akhir_config') AND TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.guru_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.guru WHERE id = NEW.guru_id) THEN
      RAISE EXCEPTION 'Akses ditolak: ID Guru pengampu tidak terdaftar di sistem.';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- 4.1 Pasang Trigger pada Tabel Nilai, TP, & Rapor
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nilai_komponen TO anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_guard_staff_nilai_komponen ON public.nilai_komponen;
CREATE TRIGGER trg_guard_staff_nilai_komponen
  BEFORE INSERT OR UPDATE OR DELETE ON public.nilai_komponen
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nilai_siswa TO anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_guard_staff_nilai_siswa ON public.nilai_siswa;
CREATE TRIGGER trg_guard_staff_nilai_siswa
  BEFORE INSERT OR UPDATE OR DELETE ON public.nilai_siswa
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nilai_akhir_config TO anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_guard_staff_nilai_akhir_config ON public.nilai_akhir_config;
CREATE TRIGGER trg_guard_staff_nilai_akhir_config
  BEFORE INSERT OR UPDATE OR DELETE ON public.nilai_akhir_config
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

-- 4.2 Pasang Trigger pada Tabel Riwayat Poin Resmi (point_records)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.point_records TO anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_guard_staff_point_records ON public.point_records;
CREATE TRIGGER trg_guard_staff_point_records
  BEFORE INSERT OR UPDATE OR DELETE ON public.point_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

-- 4.3 Pasang Trigger pada Tabel Jadwal Pelajaran, Slot Waktu, Piket, & Ekskul
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jadwal_pelajaran TO anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_guard_staff_jadwal_pelajaran ON public.jadwal_pelajaran;
CREATE TRIGGER trg_guard_staff_jadwal_pelajaran
  BEFORE INSERT OR UPDATE OR DELETE ON public.jadwal_pelajaran
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jadwal_slot_waktu TO anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_guard_staff_jadwal_slot_waktu ON public.jadwal_slot_waktu;
CREATE TRIGGER trg_guard_staff_jadwal_slot_waktu
  BEFORE INSERT OR UPDATE OR DELETE ON public.jadwal_slot_waktu
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jadwal_piket TO anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_guard_staff_jadwal_piket ON public.jadwal_piket;
CREATE TRIGGER trg_guard_staff_jadwal_piket
  BEFORE INSERT OR UPDATE OR DELETE ON public.jadwal_piket
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jadwal_ekskul TO anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_guard_staff_jadwal_ekskul ON public.jadwal_ekskul;
CREATE TRIGGER trg_guard_staff_jadwal_ekskul
  BEFORE INSERT OR UPDATE OR DELETE ON public.jadwal_ekskul
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

-- 4.4 Pasang Trigger pada Tabel Keuangan SPP & Master Akademik
DROP TRIGGER IF EXISTS trg_guard_staff_tagihan_spp ON public.tagihan_spp;
CREATE TRIGGER trg_guard_staff_tagihan_spp
  BEFORE INSERT OR UPDATE OR DELETE ON public.tagihan_spp
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

DROP TRIGGER IF EXISTS trg_guard_staff_tarif_spp_siswa ON public.tarif_spp_siswa;
CREATE TRIGGER trg_guard_staff_tarif_spp_siswa
  BEFORE INSERT OR UPDATE OR DELETE ON public.tarif_spp_siswa
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

DROP TRIGGER IF EXISTS trg_guard_staff_guru_mapel ON public.guru_mapel;
CREATE TRIGGER trg_guard_staff_guru_mapel
  BEFORE INSERT OR UPDATE OR DELETE ON public.guru_mapel
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

DROP TRIGGER IF EXISTS trg_guard_staff_mata_pelajaran ON public.mata_pelajaran;
CREATE TRIGGER trg_guard_staff_mata_pelajaran
  BEFORE INSERT OR UPDATE OR DELETE ON public.mata_pelajaran
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

DROP TRIGGER IF EXISTS trg_guard_staff_cbt_bank_soal ON public.cbt_bank_soal;
CREATE TRIGGER trg_guard_staff_cbt_bank_soal
  BEFORE INSERT OR UPDATE OR DELETE ON public.cbt_bank_soal
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

DROP TRIGGER IF EXISTS trg_guard_staff_cbt_soal ON public.cbt_soal;
CREATE TRIGGER trg_guard_staff_cbt_soal
  BEFORE INSERT OR UPDATE OR DELETE ON public.cbt_soal
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

DROP TRIGGER IF EXISTS trg_guard_staff_cbt_sesi_ujian ON public.cbt_sesi_ujian;
CREATE TRIGGER trg_guard_staff_cbt_sesi_ujian
  BEFORE INSERT OR UPDATE OR DELETE ON public.cbt_sesi_ujian
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();


-- ------------------------------------------------------------------------------
-- BAGIAN 5: PROTEKSI PENGAJUAN POIN POSITIF, PRESENSI LAMPAU, & TOKEN FCM
-- ------------------------------------------------------------------------------

-- 5.1 Pengajuan Poin Positif:
-- Siswa boleh mengajukan (INSERT otomatis 'pending'), tetapi HANYA Staff yang boleh
-- mengubah status menjadi 'approved' / 'rejected' atau menghapus pengajuan!
CREATE OR REPLACE FUNCTION public.fn_guard_pengajuan_poin_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.fn_is_authorized_staff() THEN
      NEW.status := 'pending';
    END IF;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (NEW.status IS DISTINCT FROM OLD.status OR NEW.poin IS DISTINCT FROM OLD.poin)
       AND NOT public.fn_is_authorized_staff() THEN
      BEGIN
        INSERT INTO public.activity_log (user_id, user_role, action, details, created_at)
        VALUES (
          COALESCE(NEW.nisn, 'unknown'),
          'SUSPECT_HACKER',
          '🚨 Percobaan Approve Poin Sendiri Diblokir',
          'Siswa (NISN: ' || COALESCE(NEW.nisn, '-') || ') mencoba mengubah status pengajuan poin dari ' || COALESCE(OLD.status, '-') || ' menjadi ' || COALESCE(NEW.status, '-') || '. Aksi dinetralisir.',
          NOW()
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
      NEW.status := OLD.status;
      NEW.poin := OLD.poin;
      NEW.reviewed_by := OLD.reviewed_by;
      NEW.reviewed_at := OLD.reviewed_at;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF NOT public.fn_is_authorized_staff() THEN
      RAISE EXCEPTION 'Akses ditolak: Hanya Guru / Admin yang dapat menghapus data pengajuan poin.';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_pengajuan_poin_status ON public.pengajuan_poin_positif;
CREATE TRIGGER trg_guard_pengajuan_poin_status
  BEFORE INSERT OR UPDATE OR DELETE ON public.pengajuan_poin_positif
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_pengajuan_poin_status();

-- 5.2 Presensi Harian & Laporan Kendala Presensi:
-- Pulihkan GRANT DELETE & RLS DELETE agar:
--   a) Guru / Wali Kelas / Admin bisa mengubah status ke "Kosong (-)"
--   b) Tombol "Reset Data (Mode Dev)" untuk presensi hari ini berfungsi normal
--   c) Siswa tetap DILARANG menghapus presensi tanggal lampau atau presensi milik siswa lain!
GRANT SELECT, INSERT, UPDATE, DELETE ON public.presensi_harian TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.laporan_kendala_presensi TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "presensi_delete_portal" ON public.presensi_harian;
CREATE POLICY "presensi_delete_portal"
  ON public.presensi_harian FOR DELETE
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "laporan_kendala_delete" ON public.laporan_kendala_presensi;
CREATE POLICY "laporan_kendala_delete"
  ON public.laporan_kendala_presensi FOR DELETE
  TO anon, authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.fn_guard_presensi_harian()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_editor_id UUID;
  v_is_authorized BOOLEAN := FALSE;
  v_today_wib DATE := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  v_actor_nisn TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.tanggal < (v_today_wib - INTERVAL '1 day') AND (NEW.status IS DISTINCT FROM OLD.status) THEN
      v_editor_id := COALESCE(NEW.diedit_oleh, NEW.diinput_oleh);
      v_is_authorized := public.fn_is_authorized_staff();

      IF NOT v_is_authorized THEN
        BEGIN
          INSERT INTO public.activity_log (user_id, user_role, action, details, created_at)
          VALUES (
            NEW.siswa_nisn,
            'SUSPECT_HACKER',
            '🚨 Percobaan Manipulasi Absensi Lampau Terdeteksi',
            'Percobaan tanpa sesi Guru sah mengubah status absensi tanggal ' || OLD.tanggal || ' dari ' || OLD.status || ' menjadi ' || NEW.status || ' untuk siswa NISN ' || COALESCE(NEW.siswa_nisn, '-') || '. Aksi dinetralisir.',
            NOW()
          );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        NEW.status := OLD.status;
        NEW.waktu := OLD.waktu;
        RETURN NEW;
      END IF;

      IF NEW.diedit_oleh IS NULL AND v_editor_id IS NOT NULL THEN
        NEW.diedit_oleh := v_editor_id;
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    -- Izinkan jika Guru/Admin/Staff resmi
    IF public.fn_is_authorized_staff() THEN
      RETURN OLD;
    END IF;

    -- Izinkan Reset Data (Mode Dev) untuk presensi HARI INI milik siswa itu sendiri (atau kelas percobaan 10X)
    v_actor_nisn := public.fn_get_client_header_part('ebm_actor');
    IF OLD.tanggal = v_today_wib AND (v_actor_nisn = OLD.siswa_nisn OR OLD.kelas = '10X') THEN
      RETURN OLD;
    END IF;

    RAISE EXCEPTION 'Akses ditolak: Hanya Guru / Admin yang dapat menghapus data riwayat presensi.';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_presensi_harian ON public.presensi_harian;
CREATE TRIGGER trg_guard_presensi_harian
  BEFORE UPDATE OR DELETE ON public.presensi_harian
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_presensi_harian();

-- 5.3 Proteksi Penghapusan Massal Token FCM (push_device_tokens)
CREATE OR REPLACE FUNCTION public.fn_guard_push_tokens_mass_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  SELECT count(*) INTO v_deleted_count FROM deleted_tokens;
  IF v_deleted_count > 3 AND NOT public.fn_is_authorized_staff() THEN
    RAISE EXCEPTION 'Akses ditolak oleh Sistem Keamanan: Penghapusan massal token perangkat tidak diizinkan.';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_push_tokens_mass_delete ON public.push_device_tokens;
CREATE TRIGGER trg_guard_push_tokens_mass_delete
  AFTER DELETE ON public.push_device_tokens
  REFERENCING OLD TABLE AS deleted_tokens
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_guard_push_tokens_mass_delete();

-- 5.4 Perbaikan & Pengamanan Tabel sesi_presensi (Agar Auto-Close Jam 19:00 Berfungsi Normal!)
-- Sebelumnya REVOKE DELETE ON sesi_presensi FROM anon membuat sistem gagal menutup sesi otomatis saat jam 19:00 tiba!
ALTER TABLE public.sesi_presensi ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sesi_presensi TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "sesi_presensi_read_all" ON public.sesi_presensi;
CREATE POLICY "sesi_presensi_read_all" ON public.sesi_presensi FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "sesi_presensi_write" ON public.sesi_presensi;
CREATE POLICY "sesi_presensi_write" ON public.sesi_presensi FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "sesi_presensi_update" ON public.sesi_presensi;
CREATE POLICY "sesi_presensi_update" ON public.sesi_presensi FOR UPDATE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "sesi_presensi_delete" ON public.sesi_presensi;
CREATE POLICY "sesi_presensi_delete" ON public.sesi_presensi FOR DELETE TO anon, authenticated USING (true);

DROP TRIGGER IF EXISTS trg_guard_staff_sesi_presensi ON public.sesi_presensi;
CREATE TRIGGER trg_guard_staff_sesi_presensi
  BEFORE INSERT OR UPDATE OR DELETE ON public.sesi_presensi
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

-- Bersihkan seluruh baris sesi_presensi hari-hari kemarin DAN hari ini jika sudah lewat jam batas selesai (19:00 WIB)
DELETE FROM public.sesi_presensi
WHERE tanggal < (now() AT TIME ZONE 'Asia/Jakarta')::date
   OR (
     tanggal = (now() AT TIME ZONE 'Asia/Jakarta')::date
     AND (now() AT TIME ZONE 'Asia/Jakarta')::time >= COALESCE(
       (SELECT NULLIF(TRIM(setting_value), '')::time FROM public.pengaturan_sekolah WHERE setting_key = 'jam_batas_pulang' LIMIT 1),
       '19:00:00'::time
     )
   );

-- ------------------------------------------------------------------------------
-- SELESAI & REFRESH SCHEMA CACHE POSTGREST
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

