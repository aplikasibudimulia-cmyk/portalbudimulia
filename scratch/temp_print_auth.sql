CREATE OR REPLACE FUNCTION public.temp_print_auth()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_users jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(json_build_object('id', id, 'email', email, 'raw_app_meta_data', raw_app_meta_data, 'raw_user_meta_data', raw_user_meta_data)), '[]'::jsonb)
  INTO v_users
  FROM auth.users;
  RETURN v_users;
END;
$$;

GRANT EXECUTE ON FUNCTION public.temp_print_auth() TO anon, authenticated;
