-- =========================================================================
-- SKRIP PERBAIKAN RLS POLICY UNTUK TABEL PRESENSI HARIAN (KELAS 7 & SISWA BARU)
-- =========================================================================

-- 1. Enable RLS pada tabel presensi_harian
ALTER TABLE public.presensi_harian ENABLE ROW LEVEL SECURITY;

-- 2. Hapus seluruh kebijakan RLS lama yang berpotensi memblokir simpan presensi
DROP POLICY IF EXISTS "anon_rw_presensi_harian" ON public.presensi_harian;
DROP POLICY IF EXISTS "Akses presensi_harian" ON public.presensi_harian;
DROP POLICY IF EXISTS "Siswa insert presensi_harian" ON public.presensi_harian;
DROP POLICY IF EXISTS "Allow all for presensi_harian" ON public.presensi_harian;
DROP POLICY IF EXISTS "Presensi harian access" ON public.presensi_harian;

-- 3. Buat kebijakan RLS baru yang mengizinkan seluruh aksi (SELECT, INSERT, UPDATE, DELETE) bagi anon & authenticated
CREATE POLICY "allow_all_presensi_harian"
  ON public.presensi_harian
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 4. Kebijakan RLS untuk tabel sesi_presensi (jika ada di database)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sesi_presensi') THEN
    EXECUTE 'ALTER TABLE public.sesi_presensi ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "allow_all_sesi_presensi" ON public.sesi_presensi';
    EXECUTE 'CREATE POLICY "allow_all_sesi_presensi" ON public.sesi_presensi FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;
