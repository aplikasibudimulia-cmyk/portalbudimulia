-- ============================================================
-- DIAGNOSTIK: Cek metadata akun Admin
-- Jalankan ini di Supabase SQL Editor untuk melihat apakah
-- akun Admin sudah memiliki metadata role 'admin' yang benar.
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_admins_metadata()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_agg(t) INTO v_result
  FROM (
    SELECT 
      a.id, 
      a.username, 
      a.role as public_role, 
      u.email,
      u.raw_user_meta_data
    FROM public.akun_pengguna a
    LEFT JOIN auth.users u ON u.id = a.id
    WHERE a.role IN ('admin', 'superadmin')
  ) t;
  RETURN v_result;
END;
$$;

SELECT public.check_admins_metadata();
