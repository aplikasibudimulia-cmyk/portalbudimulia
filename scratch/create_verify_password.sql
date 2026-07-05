-- ============================================================
-- PATCH: Fungsi Verifikasi Password User Aktif (Untuk Ubah Sandi)
-- Fungsi ini digunakan oleh user (Guru/Staff/Siswa) untuk 
-- memverifikasi kata sandi lama mereka sebelum diubah.
-- Aman karena menggunakan auth.uid() (hanya bisa memverifikasi diri sendiri).
-- ============================================================

CREATE OR REPLACE FUNCTION public.verify_my_password(p_old_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  -- Ambil hash password milik user yang sedang aktif login (auth.uid())
  SELECT password INTO v_hash FROM public.akun_pengguna WHERE id = auth.uid();
  
  IF v_hash IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Bandingkan input password lama dengan hash (mengubah $2b$ ke $2a$ jika perlu)
  RETURN extensions.crypt(p_old_password, REGEXP_REPLACE(v_hash, '^\$2b\$', '$2a$')) = v_hash;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_my_password(TEXT) TO authenticated;
