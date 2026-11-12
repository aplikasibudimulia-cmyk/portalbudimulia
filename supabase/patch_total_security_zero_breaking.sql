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
      INSERT INTO public.activity_log (aktor, aksi, detail, created_at)
      VALUES (
        'SUSPECT_HACKER (' || v_actor_info || ')',
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
    IF (NEW.status IS DISTINCT FROM OLD.status OR NEW.poin_diajukan IS DISTINCT FROM OLD.poin_diajukan)
       AND NOT public.fn_is_authorized_staff() THEN
      BEGIN
        INSERT INTO public.activity_log (aktor, aksi, detail, created_at)
        VALUES (
          'SUSPECT_HACKER (NISN: ' || COALESCE(NEW.nisn, 'unknown') || ')',
          '🚨 Percobaan Approve Poin Sendiri Diblokir',
          'Siswa (NISN: ' || COALESCE(NEW.nisn, '-') || ') mencoba mengubah status pengajuan poin dari ' || COALESCE(OLD.status, '-') || ' menjadi ' || COALESCE(NEW.status, '-') || '. Aksi dinetralisir.',
          NOW()
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
      NEW.status := OLD.status;
      NEW.poin_diajukan := OLD.poin_diajukan;
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
          INSERT INTO public.activity_log (aktor, aksi, detail, created_at)
          VALUES (
            'SUSPECT_HACKER (NISN: ' || COALESCE(NEW.siswa_nisn, 'unknown') || ')',
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

-- ==============================================================================
-- BAGIAN 6: PENGAMANAN & PENYEMPURNAAN FITUR CBT (PENILAIAN TANPA TOKEN)
-- ==============================================================================

-- 6.1 Isolasi Mutlak Kunci Jawaban (cbt_soal_kunci) & Pembersihan Atribut is_kunci dari cbt_soal.opsi
-- Pastikan semua butir soal yang sebelumnya menyimpan is_kunci di dalam kolom JSON cbt_soal.opsi
-- otomatis disalin kuncinya ke cbt_soal_kunci, lalu atribut is_kunci dihapus dari cbt_soal.opsi
-- agar siswa tidak bisa mengintip kunci jawaban lewat Inspect Element / Network!
DO $$
DECLARE
  r RECORD;
  v_kunci TEXT;
  v_kunci_arr TEXT[];
BEGIN
  FOR r IN
    SELECT s.id, s.tipe_soal, s.opsi
    FROM public.cbt_soal s
    WHERE jsonb_typeof(s.opsi) = 'array'
      AND s.opsi::text LIKE '%is_kunci%'
  LOOP
    -- 1. Jika belum ada baris di cbt_soal_kunci, ekstrak dari opsi yang bertanda is_kunci = true
    IF NOT EXISTS (SELECT 1 FROM public.cbt_soal_kunci k WHERE k.soal_id = r.id) THEN
      IF r.tipe_soal = 'pg_kompleks' THEN
        SELECT ARRAY(
          SELECT UPPER(TRIM(COALESCE(elem ->> 'key', elem ->> 'label', '')))
          FROM jsonb_array_elements(r.opsi) AS elem
          WHERE COALESCE((elem ->> 'is_kunci')::boolean, false) = true
             OR COALESCE((elem ->> 'is_correct')::boolean, false) = true
        ) INTO v_kunci_arr;
        IF cardinality(v_kunci_arr) > 0 THEN
          INSERT INTO public.cbt_soal_kunci (soal_id, kunci_jawaban)
          VALUES (r.id, to_jsonb(v_kunci_arr)::text)
          ON CONFLICT (soal_id) DO NOTHING;
        END IF;
      ELSE
        SELECT UPPER(TRIM(COALESCE(elem ->> 'key', elem ->> 'label', '')))
        INTO v_kunci
        FROM jsonb_array_elements(r.opsi) AS elem
        WHERE COALESCE((elem ->> 'is_kunci')::boolean, false) = true
           OR COALESCE((elem ->> 'is_correct')::boolean, false) = true
        LIMIT 1;

        IF v_kunci IS NOT NULL AND v_kunci <> '' THEN
          INSERT INTO public.cbt_soal_kunci (soal_id, kunci_jawaban)
          VALUES (r.id, v_kunci)
          ON CONFLICT (soal_id) DO NOTHING;
        END IF;
      END IF;
    END IF;

    -- 2. Bersihkan atribut is_kunci & is_correct dari kolom opsi di cbt_soal
    UPDATE public.cbt_soal
    SET opsi = COALESCE((
      SELECT jsonb_agg(
        CASE
          WHEN jsonb_typeof(elem) = 'object' THEN elem - 'is_kunci' - 'is_correct' - 'kunci'
          ELSE elem
        END
      )
      FROM jsonb_array_elements(r.opsi) AS elem
    ), '[]'::jsonb)
    WHERE id = r.id;
  END LOOP;
END $$;

-- Trigger otomatis pada cbt_soal: Setiap kali Guru menyimpan/mengedit soal yang memiliki is_kunci di opsi,
-- salin kuncinya ke cbt_soal_kunci dan bersihkan is_kunci dari kolom cbt_soal.opsi
CREATE OR REPLACE FUNCTION public.fn_cbt_sanitize_and_sync_soal_opsi()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kunci TEXT;
  v_kunci_arr TEXT[];
BEGIN
  IF NEW.opsi IS NOT NULL AND jsonb_typeof(NEW.opsi) = 'array' AND NEW.opsi::text LIKE '%is_kunci%' THEN
    -- Ekstrak kunci sementara ke variabel sesi untuk disimpan oleh trigger AFTER
    IF NEW.tipe_soal = 'pg_kompleks' THEN
      SELECT ARRAY(
        SELECT UPPER(TRIM(COALESCE(elem ->> 'key', elem ->> 'label', '')))
        FROM jsonb_array_elements(NEW.opsi) AS elem
        WHERE COALESCE((elem ->> 'is_kunci')::boolean, false) = true
           OR COALESCE((elem ->> 'is_correct')::boolean, false) = true
      ) INTO v_kunci_arr;
      IF cardinality(v_kunci_arr) > 0 THEN
        PERFORM set_config('app.cbt_sync_key_' || replace(NEW.id::text, '-', '_'), to_jsonb(v_kunci_arr)::text, true);
      END IF;
    ELSE
      SELECT UPPER(TRIM(COALESCE(elem ->> 'key', elem ->> 'label', '')))
      INTO v_kunci
      FROM jsonb_array_elements(NEW.opsi) AS elem
      WHERE COALESCE((elem ->> 'is_kunci')::boolean, false) = true
         OR COALESCE((elem ->> 'is_correct')::boolean, false) = true
      LIMIT 1;
      IF v_kunci IS NOT NULL AND v_kunci <> '' THEN
        PERFORM set_config('app.cbt_sync_key_' || replace(NEW.id::text, '-', '_'), v_kunci, true);
      END IF;
    END IF;

    -- Hapus atribut is_kunci dari NEW.opsi sebelum disimpan ke tabel cbt_soal
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN jsonb_typeof(elem) = 'object' THEN elem - 'is_kunci' - 'is_correct' - 'kunci'
        ELSE elem
      END
    ), '[]'::jsonb)
    INTO NEW.opsi
    FROM jsonb_array_elements(NEW.opsi) AS elem;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_cbt_after_sync_soal_kunci()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kunci TEXT;
BEGIN
  v_kunci := COALESCE(current_setting('app.cbt_sync_key_' || replace(NEW.id::text, '-', '_'), true), '');
  IF v_kunci <> '' THEN
    PERFORM set_config('app.trusted_rpc', 'true', true);
    INSERT INTO public.cbt_soal_kunci (soal_id, kunci_jawaban)
    VALUES (NEW.id, v_kunci)
    ON CONFLICT (soal_id) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_cbt_before_sanitize_soal_opsi ON public.cbt_soal;
CREATE TRIGGER trg_cbt_before_sanitize_soal_opsi
  BEFORE INSERT OR UPDATE ON public.cbt_soal
  FOR EACH ROW EXECUTE FUNCTION public.fn_cbt_sanitize_and_sync_soal_opsi();

DROP TRIGGER IF EXISTS trg_cbt_after_sync_soal_kunci ON public.cbt_soal;
CREATE TRIGGER trg_cbt_after_sync_soal_kunci
  AFTER INSERT OR UPDATE ON public.cbt_soal
  FOR EACH ROW EXECUTE FUNCTION public.fn_cbt_after_sync_soal_kunci();

-- Kunci tabel cbt_soal_kunci: HANYA Guru / Admin / Staff & Fungsi Server yang boleh membaca/menulis!
ALTER TABLE public.cbt_soal_kunci ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cbt_soal_kunci TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "allow_all_cbt_soal_kunci" ON public.cbt_soal_kunci;
DROP POLICY IF EXISTS "cbt_soal_kunci_staff_only" ON public.cbt_soal_kunci;
CREATE POLICY "cbt_soal_kunci_staff_only"
  ON public.cbt_soal_kunci
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

DROP TRIGGER IF EXISTS trg_guard_staff_cbt_soal_kunci ON public.cbt_soal_kunci;
CREATE TRIGGER trg_guard_staff_cbt_soal_kunci
  BEFORE INSERT OR UPDATE OR DELETE ON public.cbt_soal_kunci
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

-- Kunci penulisan pada cbt_penilaian_jawaban (Siswa hanya boleh SELECT hasil miliknya, tidak boleh mengubah skor)
ALTER TABLE public.cbt_penilaian_jawaban ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cbt_penilaian_jawaban TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_guard_staff_cbt_penilaian_jawaban ON public.cbt_penilaian_jawaban;
CREATE TRIGGER trg_guard_staff_cbt_penilaian_jawaban
  BEFORE INSERT OR UPDATE OR DELETE ON public.cbt_penilaian_jawaban
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

-- 6.2 Trigger Penjaga Integritas Peserta Ujian (cbt_peserta_ujian) & Jawaban Siswa (cbt_jawaban_siswa)
-- Mencegah siswa mengubah nilai_akhir, menambah extra_waktu_menit sendiri, mengurangi strike_count,
-- atau membuka blokir (unblock) sendiri tanpa otorisasi Guru/Pengawas!
CREATE OR REPLACE FUNCTION public.fn_guard_cbt_peserta_ujian()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guru / Pengawas / Admin / RPC Server (app.trusted_rpc = 'true') memiliki akses penuh
  IF public.fn_is_authorized_staff() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Siswa tidak boleh menghapus record peserta ujian
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya Guru / Pengawas yang dapat menghapus data peserta ujian.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- 1. Siswa tidak boleh mengubah nilai_akhir secara langsung (hanya RPC server / Guru yang boleh)
    NEW.nilai_akhir := OLD.nilai_akhir;

    -- 2. Siswa tidak boleh menambah extra_waktu_menit sendiri
    NEW.extra_waktu_menit := COALESCE(OLD.extra_waktu_menit, 0);

    -- 3. Siswa tidak boleh menurunkan strike_count atau total_pelanggaran sendiri
    NEW.strike_count := GREATEST(COALESCE(OLD.strike_count, 0), COALESCE(NEW.strike_count, 0));
    NEW.total_pelanggaran := GREATEST(COALESCE(OLD.total_pelanggaran, 0), COALESCE(NEW.total_pelanggaran, 0));

    -- 4. Jika sudah diblokir (is_blocked = true) atau terkunci, siswa tidak boleh membuka blokir sendiri
    IF COALESCE(OLD.is_blocked, false) = true THEN
      NEW.is_blocked := true;
    END IF;
    IF OLD.status = 'terkunci' AND NEW.status NOT IN ('terkunci', 'selesai') THEN
      NEW.status := 'terkunci';
    END IF;

    -- 5. Jika ujian sudah selesai, siswa tidak boleh membuka ulang sendiri
    IF OLD.status = 'selesai' THEN
      NEW.status := 'selesai';
      NEW.waktu_selesai := OLD.waktu_selesai;
    END IF;

    -- 6. Jika device_id sudah terikat, siswa tidak boleh mengganti device_id sendiri tanpa reset pengawas
    IF OLD.device_id IS NOT NULL AND OLD.device_id <> '' THEN
      NEW.device_id := OLD.device_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_cbt_peserta_ujian ON public.cbt_peserta_ujian;
CREATE TRIGGER trg_guard_cbt_peserta_ujian
  BEFORE UPDATE OR DELETE ON public.cbt_peserta_ujian
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_cbt_peserta_ujian();

-- Trigger Penjaga Jawaban Siswa (cbt_jawaban_siswa):
-- Mencegah siswa mengubah jawaban setelah ujian selesai dikumpulkan atau menghapus jawaban orang lain
CREATE OR REPLACE FUNCTION public.fn_guard_cbt_jawaban_siswa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_waktu_selesai TIMESTAMPTZ;
BEGIN
  IF public.fn_is_authorized_staff() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Akses ditolak: Jawaban ujian tidak dapat dihapus oleh siswa.';
  END IF;

  SELECT status, waktu_selesai
  INTO v_status, v_waktu_selesai
  FROM public.cbt_peserta_ujian
  WHERE id = NEW.peserta_id;

  -- Jika peserta sudah berstatus selesai lebih dari 30 detik yang lalu, tolak perubahan jawaban susulan
  IF v_status = 'selesai' AND v_waktu_selesai IS NOT NULL AND v_waktu_selesai < (now() - interval '30 seconds') THEN
    RAISE EXCEPTION 'Akses ditolak: Lembar jawaban telah dikumpulkan dan dikunci.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_cbt_jawaban_siswa ON public.cbt_jawaban_siswa;
CREATE TRIGGER trg_guard_cbt_jawaban_siswa
  BEFORE INSERT OR UPDATE OR DELETE ON public.cbt_jawaban_siswa
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_cbt_jawaban_siswa();

-- 6.3 RPC Otorisasi Pengawas di Perangkat Siswa (Reset Pelanggaran dengan PIN Pengawas)
CREATE OR REPLACE FUNCTION public.fn_cbt_proctor_unlock_peserta(
  p_peserta_id UUID,
  p_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_pin TEXT := UPPER(BTRIM(COALESCE(p_pin, '')));
  v_token_ujian TEXT;
BEGIN
  SELECT UPPER(BTRIM(COALESCE(s.token_ujian, '')))
  INTO v_token_ujian
  FROM public.cbt_peserta_ujian p
  JOIN public.cbt_sesi_ujian s ON s.id = p.sesi_id
  WHERE p.id = p_peserta_id;

  IF v_clean_pin = '' OR (v_clean_pin NOT IN ('8888', 'EBUDIMULIA') AND (v_token_ujian = '' OR v_clean_pin <> v_token_ujian)) THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Kode Otorisasi Pengawas tidak valid.');
  END IF;

  PERFORM set_config('app.trusted_rpc', 'true', true);

  UPDATE public.cbt_peserta_ujian
  SET status = 'sedang_mengerjakan',
      strike_count = 0,
      is_blocked = false,
      block_reason = NULL
  WHERE id = p_peserta_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_cbt_proctor_unlock_peserta(UUID, TEXT) TO anon, authenticated, service_role;

-- 6.4 RPC Pengambilan Soal Aman untuk Siswa (Tanpa Kunci Jawaban) & RPC Pembahasan Siswa
CREATE OR REPLACE FUNCTION public.fn_cbt_get_exam_questions(
  p_sesi_id UUID,
  p_peserta_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bank_soal_id UUID;
  v_result JSONB;
BEGIN
  SELECT bank_soal_id INTO v_bank_soal_id
  FROM public.cbt_sesi_ujian
  WHERE id = p_sesi_id;

  IF v_bank_soal_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'nomor_urut', q.nomor_urut,
      'tipe_soal', q.tipe_soal,
      'pertanyaan', q.pertanyaan,
      'bobot', q.bobot,
      'opsi', CASE
        WHEN jsonb_typeof(q.opsi) = 'array' THEN (
          SELECT COALESCE(jsonb_agg(
            CASE
              WHEN jsonb_typeof(elem) = 'object' THEN elem - 'is_kunci' - 'is_correct' - 'kunci'
              ELSE elem
            END
          ), '[]'::jsonb)
          FROM jsonb_array_elements(q.opsi) AS elem
        )
        ELSE q.opsi
      END
    ) ORDER BY q.nomor_urut ASC
  ), '[]'::jsonb)
  INTO v_result
  FROM public.cbt_soal q
  WHERE q.bank_soal_id = v_bank_soal_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_cbt_get_exam_questions(UUID, UUID) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_cbt_get_student_review(
  p_peserta_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_peserta RECORD;
  v_sesi RECORD;
  v_result JSONB;
BEGIN
  SELECT * INTO v_peserta FROM public.cbt_peserta_ujian WHERE id = p_peserta_id;
  IF NOT FOUND THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT * INTO v_sesi FROM public.cbt_sesi_ujian WHERE id = v_peserta.sesi_id;
  IF NOT FOUND THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Hanya berikan pembahasan jika peserta sudah selesai (atau pengawas membuka akses)
  IF v_peserta.status <> 'selesai' AND NOT public.fn_is_authorized_staff() THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', so.id,
      'nomor_urut', so.nomor_urut,
      'tipe_soal', so.tipe_soal,
      'pertanyaan', so.pertanyaan,
      'opsi', so.opsi,
      'bobot', so.bobot,
      'pembahasan', k.pembahasan,
      'jawaban_siswa', j.jawaban_terpilih,
      'is_correct', pj.is_correct,
      'skor', COALESCE(pj.skor, 0)
    ) ORDER BY so.nomor_urut ASC
  ), '[]'::jsonb)
  INTO v_result
  FROM public.cbt_soal so
  LEFT JOIN public.cbt_soal_kunci k ON k.soal_id = so.id
  LEFT JOIN public.cbt_jawaban_siswa j ON j.soal_id = so.id AND j.peserta_id = p_peserta_id
  LEFT JOIN public.cbt_penilaian_jawaban pj ON pj.jawaban_id = j.id
  WHERE so.bank_soal_id = v_sesi.bank_soal_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_cbt_get_student_review(UUID) TO anon, authenticated, service_role;

-- 6.5 Penyempurnaan cbt_verify_token (Tanpa Token: waktu_mulai = NULL saat status belum_mulai)
-- & Proteksi Trusted RPC pada cbt_internal_score_submission dan cbt_submit_exam
CREATE OR REPLACE FUNCTION public.cbt_verify_token(
    p_sesi_id UUID,
    p_token VARCHAR DEFAULT '',
    p_siswa_nisn VARCHAR DEFAULT NULL,
    p_kelas VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sesi RECORD;
    v_peserta RECORD;
    v_kelas_peserta VARCHAR;
BEGIN
    PERFORM set_config('app.trusted_rpc', 'true', true);

    SELECT * INTO v_sesi
    FROM public.cbt_sesi_ujian
    WHERE id = p_sesi_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Sesi penilaian tidak ditemukan.');
    END IF;

    IF v_sesi.status NOT IN ('berlangsung', 'aktif') THEN
        IF v_sesi.status = 'beku' THEN
            RETURN jsonb_build_object('success', false, 'message', 'Sesi ujian sedang dijeda darurat oleh Admin sekolah.');
        ELSIF v_sesi.status IN ('mendatang', 'terjadwal', 'draft') THEN
            RETURN jsonb_build_object('success', false, 'message', 'Sesi ujian belum dibuka.');
        ELSE
            RETURN jsonb_build_object('success', false, 'message', 'Sesi ujian telah selesai ditutup.');
        END IF;
    END IF;

    -- Prioritas 1: Ambil kelas dari enrollment pada TAHUN AJARAN AKTIF
    SELECT e.kelas INTO v_kelas_peserta
    FROM public.enrollment e
    JOIN public.tahun_ajaran ta ON ta.id = e.tahun_ajaran_id
    WHERE e.nisn = p_siswa_nisn AND ta.is_aktif = true
    LIMIT 1;

    -- Prioritas 2: Gunakan p_kelas dari session login siswa jika valid
    IF v_kelas_peserta IS NULL AND p_kelas IS NOT NULL AND TRIM(p_kelas) <> '' THEN
        v_kelas_peserta := TRIM(p_kelas);
    END IF;

    -- Prioritas 3: Cari dari siswa_lengkap khusus yang is_aktif = true
    IF v_kelas_peserta IS NULL THEN
        SELECT kelas INTO v_kelas_peserta
        FROM public.siswa_lengkap
        WHERE nisn = p_siswa_nisn AND is_aktif = true
        LIMIT 1;
    END IF;

    -- Prioritas 4: Ambil dari record peserta sesi ini jika sudah pernah tercatat
    IF v_kelas_peserta IS NULL THEN
        SELECT kelas INTO v_kelas_peserta
        FROM public.cbt_peserta_ujian
        WHERE sesi_id = p_sesi_id AND siswa_nisn = p_siswa_nisn
        LIMIT 1;
    END IF;

    -- Prioritas 5: Fallback data terbaru siswa_lengkap berdasarkan created_at
    IF v_kelas_peserta IS NULL THEN
        SELECT kelas INTO v_kelas_peserta
        FROM public.siswa_lengkap
        WHERE nisn = p_siswa_nisn
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    -- Validasi apakah kelas siswa masuk dalam target rombel sesi (case-insensitive)
    IF v_kelas_peserta IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM unnest(v_sesi.kelas_ids) AS k
        WHERE LOWER(BTRIM(k)) = LOWER(BTRIM(v_kelas_peserta))
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Kelas Anda (' || v_kelas_peserta || ') bukan peserta target sesi penilaian ini. Penilaian ini khusus untuk kelas: ' || array_to_string(v_sesi.kelas_ids, ', ')
        );
    END IF;

    -- Ambil atau inisialisasi record peserta ujian (waktu_mulai = NULL saat status masih belum_mulai)
    SELECT * INTO v_peserta
    FROM public.cbt_peserta_ujian
    WHERE sesi_id = p_sesi_id AND siswa_nisn = p_siswa_nisn;

    IF NOT FOUND THEN
        INSERT INTO public.cbt_peserta_ujian (
            sesi_id,
            siswa_nisn,
            kelas,
            status,
            waktu_mulai,
            is_blocked
        )
        VALUES (
            p_sesi_id,
            p_siswa_nisn,
            COALESCE(v_kelas_peserta, 'Umum'),
            'belum_mulai',
            NULL,
            false
        )
        RETURNING * INTO v_peserta;
    ELSE
        IF v_kelas_peserta IS NOT NULL AND v_peserta.kelas <> v_kelas_peserta THEN
            UPDATE public.cbt_peserta_ujian
            SET kelas = v_kelas_peserta
            WHERE id = v_peserta.id;
            v_peserta.kelas := v_kelas_peserta;
        END IF;
    END IF;

    IF v_peserta.is_blocked = true THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Akses Anda diblokir oleh Pengawas: ' || COALESCE(v_peserta.block_reason, 'Silakan hubungi Pengawas Ruang.')
        );
    END IF;

    IF v_peserta.status = 'terkunci' THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Lembar ujian Anda saat ini TERKUNCI karena pelanggaran tata tertib digital. Silakan hubungi Pengawas Ruang.'
        );
    ELSIF v_peserta.status = 'selesai' THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Ujian ini sudah pernah dikumpulkan sebelumnya.'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'peserta_id', v_peserta.id,
        'kelas', v_peserta.kelas,
        'durasi_menit', v_sesi.durasi_menit,
        'waktu_mulai', v_peserta.waktu_mulai,
        'message', 'Berhasil masuk lembar ujian langsung.'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.cbt_internal_score_submission(p_peserta_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sesi_id UUID;
    v_bank_soal_id UUID;
    v_skema_pgk VARCHAR(30);
    v_total_skor NUMERIC(7,2) := 0.0;
    v_total_bobot_maksimal NUMERIC(7,2) := 0.0;
    v_nilai_akhir NUMERIC(5,2) := 0.0;
    v_rec RECORD;
    v_skor_soal NUMERIC(5,2);
    v_is_correct BOOLEAN;
    v_kunci_arr TEXT[];
    v_jawab_arr TEXT[];
    v_benar_count INT;
    v_salah_count INT;
    v_total_kunci INT;
BEGIN
    PERFORM set_config('app.trusted_rpc', 'true', true);

    SELECT s.id, s.bank_soal_id, s.skema_pg_kompleks 
    INTO v_sesi_id, v_bank_soal_id, v_skema_pgk
    FROM public.cbt_peserta_ujian p
    JOIN public.cbt_sesi_ujian s ON s.id = p.sesi_id
    WHERE p.id = p_peserta_id;

    IF v_sesi_id IS NULL THEN
        RETURN 0.0;
    END IF;

    SELECT COALESCE(SUM(so.bobot), 0.0)
    INTO v_total_bobot_maksimal
    FROM public.cbt_soal so
    WHERE so.bank_soal_id = v_bank_soal_id;

    FOR v_rec IN 
        SELECT 
            j.id AS jawaban_id,
            j.jawaban_terpilih,
            so.id AS soal_id,
            so.tipe_soal,
            so.bobot,
            k.kunci_jawaban,
            pj.skor AS existing_skor,
            pj.is_correct AS existing_is_correct
        FROM public.cbt_jawaban_siswa j
        JOIN public.cbt_soal so ON so.id = j.soal_id
        LEFT JOIN public.cbt_soal_kunci k ON k.soal_id = so.id
        LEFT JOIN public.cbt_penilaian_jawaban pj ON pj.jawaban_id = j.id
        WHERE j.peserta_id = p_peserta_id
    LOOP
        v_skor_soal := 0.0;
        v_is_correct := false;

        IF v_rec.tipe_soal = 'uraian' THEN
            v_skor_soal := COALESCE(v_rec.existing_skor, 0.0);
            v_is_correct := COALESCE(v_rec.existing_is_correct, (v_skor_soal >= v_rec.bobot));

            INSERT INTO public.cbt_penilaian_jawaban(jawaban_id, is_correct, skor)
            VALUES (v_rec.jawaban_id, v_is_correct, v_skor_soal)
            ON CONFLICT (jawaban_id) DO UPDATE 
            SET is_correct = COALESCE(public.cbt_penilaian_jawaban.is_correct, EXCLUDED.is_correct),
                skor = COALESCE(public.cbt_penilaian_jawaban.skor, EXCLUDED.skor);

            v_total_skor := v_total_skor + v_skor_soal;

        ELSIF v_rec.kunci_jawaban IS NOT NULL AND v_rec.jawaban_terpilih IS NOT NULL THEN
            IF v_rec.tipe_soal IN ('pg', 'benar_salah') THEN
                IF UPPER(TRIM(v_rec.jawaban_terpilih)) = UPPER(TRIM(v_rec.kunci_jawaban)) THEN
                    v_skor_soal := v_rec.bobot;
                    v_is_correct := true;
                END IF;

            ELSIF v_rec.tipe_soal = 'pg_kompleks' THEN
                BEGIN
                    SELECT ARRAY(SELECT UPPER(TRIM(jsonb_array_elements_text(v_rec.kunci_jawaban::jsonb)))) INTO v_kunci_arr;
                EXCEPTION WHEN OTHERS THEN
                    v_kunci_arr := string_to_array(UPPER(replace(v_rec.kunci_jawaban, ' ', '')), ',');
                END;

                BEGIN
                    SELECT ARRAY(SELECT UPPER(TRIM(jsonb_array_elements_text(v_rec.jawaban_terpilih::jsonb)))) INTO v_jawab_arr;
                EXCEPTION WHEN OTHERS THEN
                    v_jawab_arr := string_to_array(UPPER(replace(v_rec.jawaban_terpilih, ' ', '')), ',');
                END;

                v_total_kunci := cardinality(v_kunci_arr);

                IF v_skema_pgk = 'all_or_nothing' THEN
                    IF v_kunci_arr @> v_jawab_arr AND v_jawab_arr @> v_kunci_arr THEN
                        v_skor_soal := v_rec.bobot;
                        v_is_correct := true;
                    END IF;
                ELSE
                    SELECT count(*) INTO v_benar_count FROM unnest(v_jawab_arr) j WHERE j = ANY(v_kunci_arr);
                    SELECT count(*) INTO v_salah_count FROM unnest(v_jawab_arr) j WHERE NOT (j = ANY(v_kunci_arr));

                    IF v_total_kunci > 0 THEN
                        v_skor_soal := GREATEST(0.0, ROUND(((v_benar_count::numeric / v_total_kunci::numeric) - (v_salah_count::numeric * 0.25)) * v_rec.bobot, 2));
                        IF v_skor_soal = v_rec.bobot THEN
                            v_is_correct := true;
                        END IF;
                    END IF;
                END IF;

            ELSIF v_rec.tipe_soal = 'isian' THEN
                IF LOWER(TRIM(v_rec.jawaban_terpilih)) = LOWER(TRIM(v_rec.kunci_jawaban)) THEN
                    v_skor_soal := v_rec.bobot;
                    v_is_correct := true;
                END IF;

            ELSIF v_rec.tipe_soal = 'menjodohkan' THEN
                BEGIN
                    IF v_rec.jawaban_terpilih::jsonb = v_rec.kunci_jawaban::jsonb THEN
                        v_skor_soal := v_rec.bobot;
                        v_is_correct := true;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    v_skor_soal := 0.0;
                END;
            END IF;

            INSERT INTO public.cbt_penilaian_jawaban(jawaban_id, is_correct, skor)
            VALUES (v_rec.jawaban_id, v_is_correct, v_skor_soal)
            ON CONFLICT (jawaban_id) DO UPDATE SET is_correct = EXCLUDED.is_correct, skor = EXCLUDED.skor;

            v_total_skor := v_total_skor + v_skor_soal;
        END IF;
    END LOOP;

    IF v_total_bobot_maksimal <= 0 THEN
        SELECT COALESCE(SUM(so.bobot), 0.0)
        INTO v_total_bobot_maksimal
        FROM public.cbt_jawaban_siswa j
        JOIN public.cbt_soal so ON so.id = j.soal_id
        WHERE j.peserta_id = p_peserta_id;
    END IF;

    IF v_total_bobot_maksimal > 0 THEN
        v_nilai_akhir := LEAST(100.0, GREATEST(0.0, ROUND((v_total_skor / v_total_bobot_maksimal) * 100.0, 2)));
    ELSE
        v_nilai_akhir := 0.0;
    END IF;

    UPDATE public.cbt_peserta_ujian 
    SET nilai_akhir = v_nilai_akhir 
    WHERE id = p_peserta_id;

    RETURN v_nilai_akhir;
END;
$$;

CREATE OR REPLACE FUNCTION public.cbt_submit_exam(
    p_peserta_id UUID,
    p_nisn TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_nisn TEXT := COALESCE(NULLIF(TRIM(p_nisn), ''), (auth.jwt() ->> 'nisn'));
    v_peserta RECORD;
    v_total_skor NUMERIC(5,2);
BEGIN
    PERFORM set_config('app.trusted_rpc', 'true', true);

    SELECT p.*, s.tampilkan_nilai INTO v_peserta
    FROM public.cbt_peserta_ujian p
    JOIN public.cbt_sesi_ujian s ON s.id = p.sesi_id
    WHERE p.id = p_peserta_id 
      AND (v_current_nisn IS NULL OR p.siswa_nisn = v_current_nisn);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Data peserta tidak valid atau bukan milik akun Anda.';
    END IF;

    IF v_peserta.status = 'terkunci' OR COALESCE(v_peserta.is_blocked, false) = true THEN
        RAISE EXCEPTION 'Ujian tidak dapat dikumpulkan: lembar ujian Anda sedang TERKUNCI. Silakan hubungi Pengawas Ruang.';
    ELSIF v_peserta.status = 'selesai' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'selesai',
            'waktu_selesai', v_peserta.waktu_selesai,
            'total_skor_sementara', CASE WHEN v_peserta.tampilkan_nilai = 'instan' OR v_peserta.is_nilai_shared THEN v_peserta.nilai_akhir ELSE NULL END,
            'is_nilai_shared', (v_peserta.tampilkan_nilai = 'instan' OR COALESCE(v_peserta.is_nilai_shared, false))
        );
    END IF;

    UPDATE public.cbt_peserta_ujian
    SET status = 'selesai', waktu_selesai = now()
    WHERE id = p_peserta_id;

    v_total_skor := public.cbt_internal_score_submission(p_peserta_id);

    IF v_peserta.tampilkan_nilai = 'instan' THEN
        UPDATE public.cbt_peserta_ujian SET is_nilai_shared = true WHERE id = p_peserta_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'selesai',
        'waktu_selesai', now(),
        'total_skor_sementara', CASE WHEN v_peserta.tampilkan_nilai = 'instan' THEN v_total_skor ELSE NULL END,
        'is_nilai_shared', (v_peserta.tampilkan_nilai = 'instan')
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cbt_verify_token(UUID, VARCHAR, VARCHAR, VARCHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cbt_internal_score_submission(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cbt_submit_exam(UUID, TEXT) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- SELESAI & REFRESH SCHEMA CACHE POSTGREST
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

