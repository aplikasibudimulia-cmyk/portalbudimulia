-- ==============================================================================
-- FIX: PERMISSION DENIED FOR TABLE nilai_komponen, nilai_akhir_config & nilai_siswa
-- ==============================================================================
-- Masalah:
-- Hak akses INSERT, UPDATE, DELETE pada tabel nilai_komponen (dan tabel nilai terkait)
-- tercabut dari role anon, sehingga saat Guru menambahkan atau mengedit TP (Tujuan Pembelajaran),
-- Bab, Bobot, atau Konfigurasi Nilai Akhir, sistem memunculkan error:
-- "Gagal: permission denied for table nilai_komponen"
-- ==============================================================================

-- 1. TABEL nilai_komponen (TP, Bab, & Lingkup Materi)
GRANT ALL ON public.nilai_komponen TO anon, authenticated, service_role;
ALTER TABLE public.nilai_komponen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_nilai_komponen" ON public.nilai_komponen;
DROP POLICY IF EXISTS "allow_all_nilai_komponen_read" ON public.nilai_komponen;
DROP POLICY IF EXISTS "Allow anon read on nilai_komponen" ON public.nilai_komponen;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.nilai_komponen;
DROP POLICY IF EXISTS "allow_read_nilai_komponen" ON public.nilai_komponen;

CREATE POLICY "allow_all_nilai_komponen"
ON public.nilai_komponen
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);


-- 2. TABEL nilai_akhir_config (Bobot Rapor, Konfigurasi PTS/PAS)
GRANT ALL ON public.nilai_akhir_config TO anon, authenticated, service_role;
ALTER TABLE public.nilai_akhir_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_nilai_akhir_config" ON public.nilai_akhir_config;
DROP POLICY IF EXISTS "allow_all_nilai_akhir_config_read" ON public.nilai_akhir_config;
DROP POLICY IF EXISTS "Allow anon read on nilai_akhir_config" ON public.nilai_akhir_config;
DROP POLICY IF EXISTS "Enable all operations for anon" ON public.nilai_akhir_config;
DROP POLICY IF EXISTS "allow_read_nilai_akhir_config" ON public.nilai_akhir_config;
DROP POLICY IF EXISTS "allow_write_nilai_akhir_config" ON public.nilai_akhir_config;

CREATE POLICY "allow_all_nilai_akhir_config"
ON public.nilai_akhir_config
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);


-- 3. TABEL nilai_siswa (Input & Rekap Nilai Siswa)
GRANT ALL ON public.nilai_siswa TO anon, authenticated, service_role;
ALTER TABLE public.nilai_siswa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_nilai_siswa" ON public.nilai_siswa;
DROP POLICY IF EXISTS "allow_all_nilai_siswa_read" ON public.nilai_siswa;
DROP POLICY IF EXISTS "Allow anon read on nilai_siswa" ON public.nilai_siswa;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.nilai_siswa;
DROP POLICY IF EXISTS "allow_read_nilai_siswa" ON public.nilai_siswa;

CREATE POLICY "allow_all_nilai_siswa"
ON public.nilai_siswa
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);


-- 4. TABEL guru_mapel & mata_pelajaran (Penugasan Guru & Mapel)
GRANT ALL ON public.guru_mapel TO anon, authenticated, service_role;
ALTER TABLE public.guru_mapel ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_guru_mapel" ON public.guru_mapel;
CREATE POLICY "allow_all_guru_mapel" ON public.guru_mapel FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.mata_pelajaran TO anon, authenticated, service_role;
ALTER TABLE public.mata_pelajaran ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_mata_pelajaran" ON public.mata_pelajaran;
CREATE POLICY "allow_all_mata_pelajaran" ON public.mata_pelajaran FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);


-- 5. RELOAD SCHEMA POSTGREST
NOTIFY pgrst, 'reload schema';
