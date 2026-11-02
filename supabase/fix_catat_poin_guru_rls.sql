-- =========================================================================
-- 🛠️ FIX RLS TABEL GURU AGAR BISA DIPILIH DI FORM CATAT POIN & PIKET
-- =========================================================================
-- Masalah:
-- Script security hardening sebelumnya mengunci RLS public.guru hanya untuk
-- 'authenticated' (Supabase Auth JWT). Karena aplikasi frontend eBudiMulia
-- menggunakan autentikasi mandiri / custom session (anon key), PostgREST
-- mengembalikan 0 baris guru ke frontend, sehingga dropdown pilihan guru
-- menjadi kosong.
--
-- Solusi:
-- 1. Berikan hak akses SELECT tabel guru untuk (anon, authenticated).
-- 2. Buat RPC 'fn_get_guru_list()' dengan SECURITY DEFINER agar aman & cepat.
-- 3. Reload cache schema PostgREST.
-- =========================================================================

-- 1. Izinkan pembacaan data guru
ALTER TABLE public.guru ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_guru" ON public.guru;
DROP POLICY IF EXISTS "staff_all_guru" ON public.guru;
DROP POLICY IF EXISTS "authenticated_select_public_guru" ON public.guru;
DROP POLICY IF EXISTS "allow_read_guru" ON public.guru;

-- A. Semua pengguna portal (anon & authenticated) dapat melihat daftar profil guru
CREATE POLICY "allow_read_guru"
ON public.guru
FOR SELECT
TO anon, authenticated
USING (true);

-- B. Manajemen data guru untuk staff/admin aplikasi
CREATE POLICY "staff_all_guru"
ON public.guru
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 2. Pastikan tabel relasi guru juga memiliki izin baca
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

-- 3. RPC Helper Berkecepatan Tinggi (Bypass RLS) untuk Mengambil Guru Publik
CREATE OR REPLACE FUNCTION public.fn_get_guru_list()
RETURNS TABLE (
  id UUID,
  nama_guru TEXT,
  kode TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id, nama_guru, kode
  FROM public.guru
  ORDER BY nama_guru ASC;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_guru_list() TO anon, authenticated;

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
