-- ============================================================
-- RPC: fn_get_username_by_email
-- Mengonversi input Email Siswa (misal: aaron.30des@gmail.com)
-- menjadi Username Akun Siswa (misal: ebmsiswa.aaron5028)
--
-- Jalankan script ini di Supabase SQL Editor jika ingin memastikan
-- RPC tersedia di database.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_get_username_by_email(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username TEXT;
  v_clean_email TEXT;
BEGIN
  v_clean_email := LOWER(TRIM(p_email));

  -- 1. Cari berdasarkan email_aktif atau email_ortu di tabel siswa_permanent
  SELECT ap.username INTO v_username
  FROM public.siswa_permanent sp
  JOIN public.akun_pengguna ap ON ap.foreign_id = sp.nisn
  WHERE (LOWER(TRIM(sp.email_aktif)) = v_clean_email OR LOWER(TRIM(sp.email_ortu)) = v_clean_email)
    AND ap.role = 'murid'
    AND ap.status = 'aktif'
  LIMIT 1;

  -- 2. Jika belum ketemu, cari berdasarkan email atau username di tabel akun_pengguna
  IF v_username IS NULL THEN
    SELECT username INTO v_username
    FROM public.akun_pengguna
    WHERE (LOWER(TRIM(email)) = v_clean_email OR LOWER(TRIM(username)) = v_clean_email)
      AND role = 'murid'
      AND status = 'aktif'
  LIMIT 1;
  END IF;

  RETURN v_username;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_get_username_by_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_get_username_by_email(TEXT) TO anon, authenticated;
