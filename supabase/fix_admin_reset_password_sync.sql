-- ============================================================
-- PATCH: Sinkronisasi kode_akses Guru otomatis saat reset password
-- Update RPC admin_reset_password agar otomatis memperbarui kolom
-- kode_akses di tabel guru jika akun yang diubah milik Guru/Staff.
-- ============================================================

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

GRANT EXECUTE ON FUNCTION public.admin_reset_password(UUID, TEXT) TO anon, authenticated;
