-- =========================================================================
-- TRIGGER PATCH: Auto-fix NULL Columns in auth.users (Preventing Error 500)
-- =========================================================================

-- 1. Bersihkan data NULL pada user eksisting saat ini
UPDATE auth.users SET confirmation_token = '' WHERE confirmation_token IS NULL;
UPDATE auth.users SET email_change = '' WHERE email_change IS NULL;
UPDATE auth.users SET email_change_token_new = '' WHERE email_change_token_new IS NULL;
UPDATE auth.users SET email_change_token_current = '' WHERE email_change_token_current IS NULL;
UPDATE auth.users SET phone_change = '' WHERE phone_change IS NULL;
UPDATE auth.users SET phone_change_token = '' WHERE phone_change_token IS NULL;
UPDATE auth.users SET reauthentication_token = '' WHERE reauthentication_token IS NULL;
UPDATE auth.users SET is_sso_user = false WHERE is_sso_user IS NULL;

-- Jalankan secara dinamis jika kolom is_anonymous ada di database Anda
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'is_anonymous') THEN
    UPDATE auth.users SET is_anonymous = false WHERE is_anonymous IS NULL;
  END IF;
END $$;


-- 2. Buat fungsi trigger pembersih NULL
CREATE OR REPLACE FUNCTION public.fn_clean_auth_user_nulls()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  -- Paksa kolom token string kosong agar tidak NULL
  NEW.confirmation_token := COALESCE(NEW.confirmation_token, '');
  NEW.email_change := COALESCE(NEW.email_change, '');
  NEW.email_change_token_new := COALESCE(NEW.email_change_token_new, '');
  NEW.email_change_token_current := COALESCE(NEW.email_change_token_current, '');
  NEW.phone_change := COALESCE(NEW.phone_change, '');
  NEW.phone_change_token := COALESCE(NEW.phone_change_token, '');
  NEW.reauthentication_token := COALESCE(NEW.reauthentication_token, '');
  
  -- Paksa kolom boolean false jika NULL
  NEW.is_sso_user := COALESCE(NEW.is_sso_user, false);

  -- Setel is_anonymous dengan aman
  BEGIN
    NEW.is_anonymous := COALESCE(NEW.is_anonymous, false);
  EXCEPTION WHEN OTHERS THEN
    -- Abaikan jika kolom is_anonymous tidak ada di skema database
  END;

  RETURN NEW;
END;
$$;


-- 3. Pasangkan trigger BEFORE INSERT OR UPDATE pada tabel auth.users
DROP TRIGGER IF EXISTS tr_clean_auth_user_nulls ON auth.users;
CREATE TRIGGER tr_clean_auth_user_nulls
  BEFORE INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_clean_auth_user_nulls();
