-- ============================================================
-- PATCH: Trigger Sinkronisasi Update Akun (Admin & Import Excel)
-- Masalah: Ketika Admin mengedit username (email) di public,
-- email login di auth.users harus ikut terupdate secara otomatis.
--
-- Jalankan ini di Supabase SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_sync_user_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT;
BEGIN
  -- Tentukan email baru berdasarkan username
  IF NEW.username LIKE '%@%' THEN
    v_email := LOWER(TRIM(NEW.username));
  ELSE
    v_email := LOWER(TRIM(NEW.username)) || '@ebudimulia.local';
  END IF;

  -- Update email di auth.users
  UPDATE auth.users
  SET email = v_email,
      updated_at = now()
  WHERE id = NEW.id;

  -- Update email di auth.identities
  UPDATE auth.identities
  SET identity_data = jsonb_build_object('sub', NEW.id::text, 'email', v_email, 'email_verified', true),
      provider_id = v_email,
      updated_at = now()
  WHERE user_id = NEW.id;

  RETURN NEW;
END;
$$;

-- Daftarkan trigger ke tabel public.akun_pengguna
DROP TRIGGER IF EXISTS tr_sync_user_update ON public.akun_pengguna;
CREATE TRIGGER tr_sync_user_update
  AFTER UPDATE OF username ON public.akun_pengguna
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_user_update();
