-- ============================================================
-- MIGRATION: Buat fungsi fn_sync_student_passwords
-- Fungsi ini menyinkronkan password dari siswa_permanent.kode_akses
-- ke auth.users.encrypted_password dan akun_pengguna.password
-- Dipanggil otomatis saat bulk import Excel dari Admin
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_sync_student_passwords(p_nisn_list TEXT[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  -- Buat temp table dengan hash baru dari kode_akses
  CREATE TEMP TABLE _temp_sync ON COMMIT DROP AS
  SELECT 
    ap.id AS akun_id,
    extensions.crypt(sp.kode_akses, extensions.gen_salt('bf', 10)) AS new_hash
  FROM akun_pengguna ap
  JOIN siswa_permanent sp ON ap.foreign_id = sp.nisn::text
  WHERE ap.role = 'murid'
    AND sp.nisn::text = ANY(p_nisn_list)
    AND sp.kode_akses IS NOT NULL
    AND sp.kode_akses <> '';

  -- Update auth.users
  UPDATE auth.users au
  SET 
    encrypted_password = t.new_hash,
    updated_at = now()
  FROM _temp_sync t
  WHERE au.id = t.akun_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Update akun_pengguna agar sinkron
  UPDATE public.akun_pengguna ap
  SET 
    password = t.new_hash,
    updated_at = now()
  FROM _temp_sync t
  WHERE ap.id = t.akun_id;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_sync_student_passwords(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_sync_student_passwords(TEXT[]) TO authenticated;
