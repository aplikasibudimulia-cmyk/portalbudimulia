-- ============================================================
-- PATCH: Perbaiki bug perbandingan prefix hash di verify_my_password
-- Bandingkan hasil crypt dengan hash yang sudah disesuaikan prefix-nya
-- ============================================================

CREATE OR REPLACE FUNCTION public.verify_my_password(p_old_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash TEXT;
  v_db_hash TEXT;
BEGIN
  -- Ambil hash password milik user yang sedang aktif login (auth.uid())
  SELECT password INTO v_hash FROM public.akun_pengguna WHERE id = auth.uid();
  
  IF v_hash IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Ubah prefix $2b$ menjadi $2a$ agar pgcrypto.crypt() memproses dengan benar
  v_db_hash := REGEXP_REPLACE(v_hash, '^\$2b\$', '$2a$');

  -- Bandingkan hasil crypt dengan v_db_hash (keduanya sekarang sama-sama ber-prefix $2a$)
  RETURN extensions.crypt(p_old_password, v_db_hash) = v_db_hash;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_my_password(TEXT) TO authenticated;
