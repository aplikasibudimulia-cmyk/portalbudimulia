-- =========================================================================
-- COMPLETE PATCH: Auto-fix NULL Columns in auth.users & auth.identities
-- (Mengatasi Error 500 "Database error querying schema" Secara Permanen)
-- =========================================================================

-- 1. BERSIHKAN DATA NULL PADA USER EKSISTING DI auth.users
UPDATE auth.users 
SET 
  confirmation_token = COALESCE(confirmation_token, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  is_sso_user = COALESCE(is_sso_user, false);

-- Bersihkan is_anonymous secara dinamis jika kolomnya ada
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'is_anonymous') THEN
    UPDATE auth.users SET is_anonymous = false WHERE is_anonymous IS NULL;
  END IF;
END $$;


-- 2. BERSIHKAN DATA NULL PADA IDENTITIES EKSISTING DI auth.identities
-- Catatan: Kolom 'email' di auth.identities adalah generated column,
-- jadi kita harus mengupdate kolom 'identity_data' agar 'email' terhitung otomatis.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'email') THEN
    UPDATE auth.identities ai
    SET identity_data = COALESCE(ai.identity_data, '{}'::jsonb) || jsonb_build_object('email', au.email)
    FROM auth.users au
    WHERE ai.user_id = au.id 
      AND (ai.identity_data->>'email' IS NULL OR ai.identity_data->>'email' = '');
  END IF;
END $$;


-- 3. FUNGSI TRIGGER UNTUK MEMASTIKAN KOLOM auth.users TIDAK NULL
CREATE OR REPLACE FUNCTION public.fn_clean_auth_user_nulls()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  NEW.confirmation_token := COALESCE(NEW.confirmation_token, '');
  NEW.email_change := COALESCE(NEW.email_change, '');
  NEW.email_change_token_new := COALESCE(NEW.email_change_token_new, '');
  NEW.email_change_token_current := COALESCE(NEW.email_change_token_current, '');
  NEW.phone_change := COALESCE(NEW.phone_change, '');
  NEW.phone_change_token := COALESCE(NEW.phone_change_token, '');
  NEW.reauthentication_token := COALESCE(NEW.reauthentication_token, '');
  NEW.recovery_token := COALESCE(NEW.recovery_token, '');
  NEW.is_sso_user := COALESCE(NEW.is_sso_user, false);

  BEGIN
    NEW.is_anonymous := COALESCE(NEW.is_anonymous, false);
  EXCEPTION WHEN OTHERS THEN
    -- Abaikan jika kolom tidak ada
  END;

  RETURN NEW;
END;
$$;

-- Pasang trigger BEFORE INSERT/UPDATE pada auth.users
DROP TRIGGER IF EXISTS tr_clean_auth_user_nulls ON auth.users;
CREATE TRIGGER tr_clean_auth_user_nulls
  BEFORE INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_clean_auth_user_nulls();


-- 4. FUNGSI TRIGGER UNTUK MEMASTIKAN KOLOM auth.identities TIDAK NULL
-- Catatan: Karena 'email' adalah generated column, kita harus memasukkan
-- nilai 'email' ke dalam objek 'identity_data' agar dihitung secara otomatis.
CREATE OR REPLACE FUNCTION public.fn_clean_auth_identity_nulls()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  NEW.identity_data := COALESCE(NEW.identity_data, '{}'::jsonb) || 
    jsonb_build_object('email', COALESCE(NEW.identity_data->>'email', SPLIT_PART(NEW.provider_id, '@', 1) || '@ebudimulia.local'));

  RETURN NEW;
END;
$$;

-- Pasang trigger BEFORE INSERT/UPDATE pada auth.identities
DROP TRIGGER IF EXISTS tr_clean_auth_identity_nulls ON auth.identities;
CREATE TRIGGER tr_clean_auth_identity_nulls
  BEFORE INSERT OR UPDATE ON auth.identities
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_clean_auth_identity_nulls();
