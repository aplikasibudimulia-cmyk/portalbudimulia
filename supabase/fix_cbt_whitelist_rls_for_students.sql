-- ==============================================================================
-- FIX: Izinkan Siswa Membaca Status Whitelist CBT & Tambah Helper RPC
-- 
-- Masalah:
-- Sebelumnya cbt_whitelist_user hanya memiliki policy "cbt_whitelist_staff_all" 
-- yang membatasi akses SELECT hanya untuk staf (admin/guru).
-- Akibatnya, saat akun Siswa memeriksa apakah dirinya terdaftar sebagai penguji,
-- query mengembalikan [] (kosong) karena tertahan Row Level Security (RLS).
-- ==============================================================================

-- 1. Perbaiki RLS Policy pada cbt_whitelist_user
DROP POLICY IF EXISTS "allow_all_cbt_whitelist_user" ON public.cbt_whitelist_user;
DROP POLICY IF EXISTS "cbt_whitelist_staff_all" ON public.cbt_whitelist_user;
DROP POLICY IF EXISTS "cbt_whitelist_read" ON public.cbt_whitelist_user;
DROP POLICY IF EXISTS "cbt_whitelist_read_all" ON public.cbt_whitelist_user;
DROP POLICY IF EXISTS "cbt_whitelist_staff_write" ON public.cbt_whitelist_user;

-- Siapapun yang terautentikasi / anonim boleh membaca status whitelist CBT
CREATE POLICY "cbt_whitelist_read"
  ON public.cbt_whitelist_user
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- HANYA Staf / Admin yang boleh menambah, mengubah, atau menghapus penguji
CREATE POLICY "cbt_whitelist_staff_write"
  ON public.cbt_whitelist_user
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

GRANT SELECT ON public.cbt_whitelist_user TO anon, authenticated;
GRANT ALL ON public.cbt_whitelist_user TO service_role;

-- 2. Fungsi Helper SECURITY DEFINER untuk Verifikasi Akses Menu CBT Siswa
-- Berfungsi sebagai jaminan akses instan tanpa terhalang RLS apapun di masa depan
CREATE OR REPLACE FUNCTION public.fn_is_cbt_accessible_for_student(p_nisn text, p_kelas text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_active boolean;
  v_is_whitelisted boolean;
BEGIN
  -- 1. Cek Saklar Mode Rilis Publik di cbt_pengaturan
  SELECT is_cbt_active INTO v_is_active 
  FROM public.cbt_pengaturan 
  WHERE id = 1 
  LIMIT 1;

  IF v_is_active = true THEN
    RETURN true;
  END IF;

  -- 2. Cek apakah NISN siswa terdaftar di whitelist penguji
  IF p_nisn IS NOT NULL AND TRIM(p_nisn) <> '' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.cbt_whitelist_user 
      WHERE TRIM(nisn) = TRIM(p_nisn) AND role = 'siswa'
    ) INTO v_is_whitelisted;
    
    IF v_is_whitelisted = true THEN
      RETURN true;
    END IF;
  END IF;

  -- 3. Cek apakah kelas siswa memiliki Sesi Ujian aktif / mendatang
  IF p_kelas IS NOT NULL AND TRIM(p_kelas) <> '' THEN
    IF EXISTS (
      SELECT 1 FROM public.cbt_sesi_ujian
      WHERE status <> 'draft'
        AND (
          kelas_ids @> ARRAY[TRIM(p_kelas)]
          OR kelas_ids @> ARRAY[REGEXP_REPLACE(TRIM(p_kelas), '^kelas\s*', '', 'i')]
          OR kelas_ids @> ARRAY['Kelas ' || REGEXP_REPLACE(TRIM(p_kelas), '^kelas\s*', '', 'i')]
        )
    ) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_is_cbt_accessible_for_student(text, text) TO anon, authenticated;
