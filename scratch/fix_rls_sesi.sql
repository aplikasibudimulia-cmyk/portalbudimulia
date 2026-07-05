-- Hapus policy lama jika ada
DROP POLICY IF EXISTS "Allow all actions for authenticated users" ON public.sesi_presensi;
DROP POLICY IF EXISTS "Allow public read for sesi_presensi" ON public.sesi_presensi;
DROP POLICY IF EXISTS "Allow all for anon" ON public.sesi_presensi;

-- Buat policy baru yang mengizinkan SEMUA akses (termasuk anon)
CREATE POLICY "Allow all for anon" ON public.sesi_presensi
FOR ALL TO public
USING (true) WITH CHECK (true);
