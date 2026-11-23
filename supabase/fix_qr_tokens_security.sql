-- ==============================================================================
-- 🛡️ FIX KEAMANAN: qr_tokens (ANTI-SCRAPING PRESENSI TV DARI RUMAH)
-- ==============================================================================
-- Masalah: Sebelumnya tabel qr_tokens bisa di-SELECT langsung oleh siapapun (publik).
-- Siswa (seperti Axel) bisa men-dump token aktif yang sedang tayang di TV sekolah,
-- lalu melakukan presensi dari rumah tanpa perlu berada di sekolah.
--
-- Solusi:
-- 1. Cabut akses SELECT & WRITE langsung dari role publik/siswa pada qr_tokens.
-- 2. Buat RPC Aman 'fn_verify_qr_token(p_token)':
--    Siswa hanya bisa memvalidasi token yang mereka scan. Server hanya return TRUE/FALSE
--    tanpa pernah membocorkan token aktif yang ada di TV.
-- 3. Buat RPC Aman 'fn_presensi_tv_push_token(p_token, p_expires_at)':
--    Layar Presensi TV di lobi sekolah dapat merotasi token dengan aman.
-- 4. Kunci tabel qr_tokens dengan RLS & Trigger Guard hanya untuk Staff resmi.
-- ==============================================================================

-- 1. RPC Verifikasi Token QR untuk Siswa (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.fn_verify_qr_token(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL OR BTRIM(p_token) = '' THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.qr_tokens
    WHERE token = BTRIM(p_token)
      AND expires_at > now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_verify_qr_token(TEXT) TO anon, authenticated, service_role;


-- 2. RPC Pemasangan Token Baru untuk Layar Presensi TV (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.fn_presensi_tv_push_token(
  p_token TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL OR BTRIM(p_token) = '' THEN
    RETURN FALSE;
  END IF;

  -- Bersihkan token kadaluarsa lebih dari 2 menit yang lalu
  DELETE FROM public.qr_tokens
  WHERE expires_at < (now() - interval '2 minutes');

  -- Masukkan token rotasi baru
  INSERT INTO public.qr_tokens (token, expires_at)
  VALUES (BTRIM(p_token), COALESCE(p_expires_at, now() + interval '90 seconds'));

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_presensi_tv_push_token(TEXT, TIMESTAMPTZ) TO anon, authenticated, service_role;


-- 3. KUNCI TABEL qr_tokens DENGAN RLS (BLOKIR SELECT DARI SISWA / SCRAPER)
ALTER TABLE public.qr_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public select qr_tokens" ON public.qr_tokens;
DROP POLICY IF EXISTS "Public modify qr_tokens" ON public.qr_tokens;
DROP POLICY IF EXISTS "qr_tokens_read" ON public.qr_tokens;
DROP POLICY IF EXISTS "qr_tokens_staff_write" ON public.qr_tokens;
DROP POLICY IF EXISTS "qr_tokens_staff_only" ON public.qr_tokens;

-- HANYA Staff resmi yang boleh SELECT atau modifikasi tabel qr_tokens secara langsung.
-- Siswa / Scraper luar yang menembak 'SELECT * FROM qr_tokens' akan mendapat 0 baris ([]).
CREATE POLICY "qr_tokens_staff_only"
  ON public.qr_tokens
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

DROP TRIGGER IF EXISTS trg_guard_staff_qr_tokens ON public.qr_tokens;
CREATE TRIGGER trg_guard_staff_qr_tokens
  BEFORE INSERT OR UPDATE OR DELETE ON public.qr_tokens
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();
