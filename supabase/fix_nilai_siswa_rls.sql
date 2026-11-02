-- ==============================================================================
-- FIX RLS NILAI SISWA, NILAI KOMPONEN, & NILAI AKHIR CONFIG
-- Deskripsi: Mengembalikan hak akses penuh (SELECT, INSERT, UPDATE, DELETE)
-- untuk role 'anon' dan 'authenticated' agar guru dapat menginput dan mengedit nilai
-- tanpa terblokir error RLS ("new row violates row-level security policy").
-- ==============================================================================

-- 1. Tabel nilai_siswa (Tabel Input Nilai TP Guru)
ALTER TABLE public.nilai_siswa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon read on nilai_siswa" ON public.nilai_siswa;
DROP POLICY IF EXISTS "allow_all_nilai_siswa_read" ON public.nilai_siswa;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.nilai_siswa;
DROP POLICY IF EXISTS "allow_all_nilai_siswa" ON public.nilai_siswa;
DROP POLICY IF EXISTS "allow_all_nilai_siswa_all" ON public.nilai_siswa;

CREATE POLICY "allow_all_nilai_siswa"
ON public.nilai_siswa
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

GRANT ALL ON public.nilai_siswa TO anon, authenticated, service_role;


-- 2. Tabel nilai_komponen (Tabel TP, Bab, & Lingkup Materi)
ALTER TABLE public.nilai_komponen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon read on nilai_komponen" ON public.nilai_komponen;
DROP POLICY IF EXISTS "allow_all_nilai_komponen_read" ON public.nilai_komponen;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.nilai_komponen;
DROP POLICY IF EXISTS "allow_all_nilai_komponen" ON public.nilai_komponen;

CREATE POLICY "allow_all_nilai_komponen"
ON public.nilai_komponen
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

GRANT ALL ON public.nilai_komponen TO anon, authenticated, service_role;


-- 3. Tabel nilai_akhir_config (Bobot Rapor & Konfirmasi PTS)
ALTER TABLE public.nilai_akhir_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon read on nilai_akhir_config" ON public.nilai_akhir_config;
DROP POLICY IF EXISTS "allow_all_nilai_akhir_config_read" ON public.nilai_akhir_config;
DROP POLICY IF EXISTS "Enable all operations for anon" ON public.nilai_akhir_config;
DROP POLICY IF EXISTS "allow_all_nilai_akhir_config" ON public.nilai_akhir_config;

CREATE POLICY "allow_all_nilai_akhir_config"
ON public.nilai_akhir_config
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

GRANT ALL ON public.nilai_akhir_config TO anon, authenticated, service_role;


-- 4. Tabel guru_mapel
ALTER TABLE public.guru_mapel ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_guru_mapel_read" ON public.guru_mapel;
DROP POLICY IF EXISTS "allow_all_guru_mapel" ON public.guru_mapel;

CREATE POLICY "allow_all_guru_mapel"
ON public.guru_mapel
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

GRANT ALL ON public.guru_mapel TO anon, authenticated, service_role;
