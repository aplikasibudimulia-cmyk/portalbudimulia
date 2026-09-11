-- =========================================================================
-- SKRIP PERBAIKAN AKSES DAFTAR SISWA KELAS UNTUK BENDAHARA (TABUNGAN SISWA)
-- =========================================================================

-- 1. Berikan hak akses SELECT pada enrollment dan siswa_permanent untuk anon dan authenticated
ALTER TABLE IF EXISTS public.siswa_permanent ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_read_siswa_permanent" ON public.siswa_permanent;
CREATE POLICY "allow_read_siswa_permanent" ON public.siswa_permanent FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE IF EXISTS public.enrollment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_read_enrollment" ON public.enrollment;
CREATE POLICY "allow_read_enrollment" ON public.enrollment FOR SELECT TO anon, authenticated USING (true);

-- 2. Buat fungsi RPC SECURITY DEFINER untuk memuat siswa per kelas (bebas dari batasan RLS)
CREATE OR REPLACE FUNCTION public.get_siswa_by_kelas(p_kelas TEXT)
RETURNS TABLE (
  nisn VARCHAR,
  nama_lengkap VARCHAR,
  kelas VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.nisn::VARCHAR,
    COALESCE(sp.nama_lengkap, e.nisn)::VARCHAR AS nama_lengkap,
    e.kelas::VARCHAR
  FROM enrollment e
  LEFT JOIN siswa_permanent sp ON sp.nisn = e.nisn
  WHERE UPPER(REPLACE(e.kelas, ' ', '')) = UPPER(REPLACE(p_kelas, ' ', ''))
  ORDER BY sp.nama_lengkap ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_siswa_by_kelas(TEXT) TO anon, authenticated;
