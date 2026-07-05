CREATE OR REPLACE FUNCTION public.temp_debug_system()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_gurus jsonb;
  v_roles jsonb;
  v_guru_roles jsonb;
  v_akun jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(json_build_object('id', id, 'nama_guru', nama_guru, 'kode', kode)), '[]'::jsonb) INTO v_gurus FROM public.guru;
  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_roles FROM public.roles r;
  SELECT COALESCE(jsonb_agg(gr), '[]'::jsonb) INTO v_guru_roles FROM public.guru_role gr;
  SELECT COALESCE(jsonb_agg(json_build_object('id', id, 'username', username, 'role', role, 'foreign_id', foreign_id)), '[]'::jsonb) INTO v_akun FROM public.akun_pengguna;

  -- Tambahan debug auth.users
  DECLARE
    v_auth_users jsonb;
  BEGIN
    SELECT COALESCE(jsonb_agg(json_build_object('id', id, 'email', email, 'raw_app_meta_data', raw_app_meta_data, 'raw_user_meta_data', raw_user_meta_data)), '[]'::jsonb)
    INTO v_auth_users
    FROM auth.users;
    
    RETURN jsonb_build_object(
      'gurus', v_gurus,
      'roles', v_roles,
      'guru_roles', v_guru_roles,
      'akun_pengguna', v_akun,
      'auth_users', v_auth_users
    );
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.temp_debug_system() TO anon, authenticated;
