-- ==============================================================================
-- FIX RLS: Pastikan foto siswa dapat dibaca oleh Akun Siswa & Orang Tua
-- ==============================================================================

-- 1. Aktifkan RLS pada tabel foto jika belum
ALTER TABLE IF EXISTS public.foto ENABLE ROW LEVEL SECURITY;

-- 2. Drop policy lama
DROP POLICY IF EXISTS "Akses foto" ON public.foto;
DROP POLICY IF EXISTS "Public read foto" ON public.foto;
DROP POLICY IF EXISTS "Allow select for all authenticated" ON public.foto;

-- 3. Beri izin SELECT ke semua user yang login (admin, guru, siswa, ortu)
CREATE POLICY "Akses foto" ON public.foto 
  FOR SELECT TO authenticated 
  USING (true);

-- 4. Beri izin SELECT ke publik/anon
CREATE POLICY "Public read foto" ON public.foto 
  FOR SELECT TO anon 
  USING (true);

-- Verifikasi policy
SELECT * FROM pg_policies WHERE tablename = 'foto';
