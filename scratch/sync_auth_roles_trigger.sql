-- ============================================================
-- SINKRONISASI OTOMATIS ROLE & FOREIGN_ID KE AUTH.USERS (ROBUST VERSION)
-- ============================================================
-- Jalankan skrip ini di Supabase SQL Editor (Dashboard -> SQL Editor)
--
-- Masalah: ID pengguna di auth.users dan public.akun_pengguna bisa
-- berbeda karena perbedaan proses import/registrasi.
-- Skrip ini mencocokkan akun berdasarkan username/email local part
-- (bagian depan sebelum tanda '@'), sehingga sangat aman dan akurat.
-- ============================================================

BEGIN;

-- 1. Jalankan sinkronisasi satu kali untuk semua user yang sudah ada
-- Mencocokkan local part dari email auth.users dengan username public.akun_pengguna
UPDATE auth.users u
SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
  'role', a.role,
  'foreign_id', a.foreign_id
)
FROM public.akun_pengguna a
WHERE split_part(u.email, '@', 1) = split_part(a.username, '@', 1);

-- 2. Buat fungsi trigger sinkronisasi otomatis
CREATE OR REPLACE FUNCTION public.fn_sync_user_app_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_local_part TEXT;
BEGIN
  -- Dapatkan local part (nama depan sebelum @) dari username/email baru
  v_local_part := split_part(NEW.username, '@', 1);

  -- Update raw_app_meta_data di auth.users dengan mencocokkan local part
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', NEW.role,
    'foreign_id', NEW.foreign_id
  )
  WHERE split_part(email, '@', 1) = v_local_part;

  RETURN NEW;
END;
$$;

-- 3. Daftarkan trigger ke tabel public.akun_pengguna
DROP TRIGGER IF EXISTS tr_sync_user_app_metadata ON public.akun_pengguna;
CREATE TRIGGER tr_sync_user_app_metadata
  AFTER INSERT OR UPDATE OF role, foreign_id ON public.akun_pengguna
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_user_app_metadata();

COMMIT;
