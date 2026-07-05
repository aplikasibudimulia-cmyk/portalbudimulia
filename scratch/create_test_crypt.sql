CREATE OR REPLACE FUNCTION public.check_password_direct(p_username text, p_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
  v_match boolean;
  v_crypt_result text;
BEGIN
  SELECT password INTO v_hash
  FROM akun_pengguna
  WHERE LOWER(TRIM(username)) = LOWER(TRIM(p_username))
  LIMIT 1;

  IF v_hash IS NULL THEN
    RETURN json_build_object('ok', false, 'msg', 'Hash tidak ditemukan');
  END IF;

  v_crypt_result := crypt(p_password, v_hash);
  v_match := (v_crypt_result = v_hash);

  RETURN json_build_object(
    'ok', true,
    'username', p_username,
    'input_password', p_password,
    'stored_hash', v_hash,
    'crypt_result', v_crypt_result,
    'is_match', v_match
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_password_direct(text, text) TO anon, authenticated;
