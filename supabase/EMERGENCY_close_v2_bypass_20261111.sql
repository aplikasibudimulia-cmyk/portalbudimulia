-- ==============================================================================
-- 🚨 EMERGENCY SECURITY PATCH: TUTUP BYPASS fn_is_authorized_staff()
-- ==============================================================================
-- Tanggal: 2026-11-11
-- Prioritas: KRITIS
-- 
-- MASALAH YANG DITEMUKAN:
-- Fallback "kompatibilitas transisi" di fn_is_authorized_staff() baris 229-234:
--   v_is_v2 := fn_get_client_header_part('ebm_v2');
--   IF v_is_v2 = '' AND starts_with(LOWER(v_client_info), 'supabase-js') THEN
--     RETURN TRUE;  ← CELAH INI!
--   END IF;
--
-- Supabase JS client secara otomatis mengirim header:
--   x-client-info: supabase-js/2.x.x
-- tanpa ebm_v2, sehingga SEMUA REQUEST dari DevTools/Console dianggap STAFF!
--
-- DAMPAK:
-- • 167 kunci jawaban CBT (cbt_soal_kunci) bocor ke siswa
-- • jadwal_pelajaran bisa diubah/dihapus oleh siapa saja
-- • nilai_siswa, point_records, activity_log bisa dibaca tanpa auth
-- • Dilaporkan oleh siswa "Axel" via WhatsApp 2026-11-11
--
-- SOLUSI:
-- Hapus fallback transisi. App resmi (web & Android) sudah mengirim
-- ebm_v2:1 di x-client-info sejak deploy terakhir (dist/assets/index-DdBcRs-u.js).
-- Semua trigger (fn_guard_staff_only_write) dan RLS policy sudah AKTIF di DB.
-- ==============================================================================

-- ==============================================================================
-- BAGIAN 1: PERBAIKI fn_is_authorized_staff() — HAPUS FALLBACK TRANSISI
-- ==============================================================================

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

  -- 7. [DIHAPUS] Fallback kompatibilitas transisi APK lama SUDAH DIHAPUS.
  --    Semua client WAJIB mengirim ebm_v2:1 di x-client-info header.
  --    Jika tidak ada ebm_v2:1 dan tidak lolos cek di atas, TOLAK!

  -- 8. Cek ebm_v2 untuk client resmi yang belum punya token tapi sudah tag v2
  v_is_v2 := public.fn_get_client_header_part('ebm_v2');
  IF v_is_v2 = '1' THEN
    -- Client resmi v2 tapi bukan staff → tetap TOLAK
    -- (hanya client yang sudah tervalidasi di langkah 5-6 yang boleh lolos)
    RETURN FALSE;
  END IF;

  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_is_authorized_staff() TO anon, authenticated, service_role;

-- ==============================================================================
-- BAGIAN 2: RE-CREATE TRIGGER GUARD (IDEMPOTENT — AMAN DIJALANKAN ULANG)
-- ==============================================================================
-- Trigger ini sebenarnya sudah aktif di production, tapi kita pasang ulang
-- untuk memastikan 100% konsistensi setelah perbaikan fn_is_authorized_staff.

-- jadwal_pelajaran
DROP TRIGGER IF EXISTS trg_guard_staff_jadwal_pelajaran ON public.jadwal_pelajaran;
CREATE TRIGGER trg_guard_staff_jadwal_pelajaran
  BEFORE INSERT OR UPDATE OR DELETE ON public.jadwal_pelajaran
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

-- cbt_soal_kunci (RLS + trigger — PALING KRITIS)
ALTER TABLE public.cbt_soal_kunci ENABLE ROW LEVEL SECURITY;

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

-- cbt_soal
DROP TRIGGER IF EXISTS trg_guard_staff_cbt_soal ON public.cbt_soal;
CREATE TRIGGER trg_guard_staff_cbt_soal
  BEFORE INSERT OR UPDATE OR DELETE ON public.cbt_soal
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

-- nilai_siswa
DROP TRIGGER IF EXISTS trg_guard_staff_nilai_siswa ON public.nilai_siswa;
CREATE TRIGGER trg_guard_staff_nilai_siswa
  BEFORE INSERT OR UPDATE OR DELETE ON public.nilai_siswa
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

-- point_records
DROP TRIGGER IF EXISTS trg_guard_staff_point_records ON public.point_records;
CREATE TRIGGER trg_guard_staff_point_records
  BEFORE INSERT OR UPDATE OR DELETE ON public.point_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

-- ==============================================================================
-- BAGIAN 4: VERIFIKASI — Test Queries (jalankan setelah patch untuk konfirmasi)
-- ==============================================================================
-- Jalankan query berikut di SQL Editor untuk memverifikasi:
--
-- 1. SELECT public.fn_is_authorized_staff();
--    → Harus TRUE (karena dari SQL Editor, tanpa HTTP headers)
--
-- 2. Dari browser siswa / DevTools:
--    const { data } = await supabase.from('cbt_soal_kunci').select('*')
--    → Harus mengembalikan 0 rows (RLS block)
--
-- 3. Dari browser siswa:
--    await supabase.from('jadwal_pelajaran').delete().eq('id', 'xxx')
--    → Harus error: new row violates row-level security / trigger blocks
-- ==============================================================================
