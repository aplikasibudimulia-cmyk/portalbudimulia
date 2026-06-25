-- Drop policy lama yang menggunakan Supabase Auth
DROP POLICY IF EXISTS "Allow student to insert their own presence" ON public.presensi_harian;
DROP POLICY IF EXISTS "Allow student to update their own presence" ON public.presensi_harian;
DROP POLICY IF EXISTS "Allow public delete presensi_harian" ON public.presensi_harian;

-- Buat policy baru yang mengizinkan insert dari aplikasi (karena siswa menggunakan custom auth, bukan Supabase Auth)
CREATE POLICY "Allow public insert presensi_harian"
ON public.presensi_harian FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow public update presensi_harian"
ON public.presensi_harian FOR UPDATE
USING (true);

CREATE POLICY "Allow public read presensi_harian"
ON public.presensi_harian FOR SELECT
USING (true);

-- Khusus untuk testing/development: izinkan Hapus Data
CREATE POLICY "Allow public delete presensi_harian"
ON public.presensi_harian FOR DELETE
USING (true);
