-- =========================================================================
-- FIX RLS PADA TABEL GURU & ROLES (UNTUK AKSES DROPDOWN PIKET / PORTAL)
-- =========================================================================

-- 1. Berikan hak akses baca (SELECT) pada tabel guru untuk semua pengguna terotentikasi & anon
ALTER TABLE public.guru ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_guru" ON public.guru;
DROP POLICY IF EXISTS "allow_read_guru" ON public.guru;
DROP POLICY IF EXISTS "anon_rw_guru" ON public.guru;
DROP POLICY IF EXISTS "Akses guru" ON public.guru;

CREATE POLICY "allow_all_guru"
  ON public.guru
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 2. Hak akses pada guru_role dan roles
ALTER TABLE public.guru_role ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_guru_role" ON public.guru_role;
CREATE POLICY "allow_all_guru_role"
  ON public.guru_role
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_roles" ON public.roles;
CREATE POLICY "allow_all_roles"
  ON public.roles
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 3. Reload skema cache PostgREST
NOTIFY pgrst, 'reload schema';
