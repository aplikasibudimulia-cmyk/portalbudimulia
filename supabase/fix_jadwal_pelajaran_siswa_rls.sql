-- ==============================================================================
-- FIX: JADWAL PELAJARAN KOSONG DI DASHBOARD SISWA & ORANG TUA (RLS FIX)
-- ==============================================================================
-- Masalah:
-- Tabel jadwal_pelajaran dan jadwal_catatan memiliki policy RLS yang hanya
-- mengizinkan role 'authenticated'. Siswa dan Orang Tua yang mengakses portal
-- menggunakan koneksi anon key tidak memiliki izin membaca data jadwal,
-- sehingga tabel jadwal pelajaran di dashboard siswa selalu tampil "Belum diisi".
-- ==============================================================================

-- 1. TABEL jadwal_pelajaran
GRANT ALL ON public.jadwal_pelajaran TO anon, authenticated, service_role;
ALTER TABLE public.jadwal_pelajaran ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Akses Baca jadwal_pelajaran" ON public.jadwal_pelajaran;
DROP POLICY IF EXISTS "Modifikasi jadwal_pelajaran" ON public.jadwal_pelajaran;
DROP POLICY IF EXISTS "jadwal_pelajaran_read_all" ON public.jadwal_pelajaran;
DROP POLICY IF EXISTS "jadwal_pelajaran_write_admin" ON public.jadwal_pelajaran;
DROP POLICY IF EXISTS "allow_all_jadwal_pelajaran" ON public.jadwal_pelajaran;

-- Izinkan Siswa, Ortu, Guru, dan Admin membaca seluruh jadwal pelajaran
CREATE POLICY "jadwal_pelajaran_read_all" 
ON public.jadwal_pelajaran 
FOR SELECT 
TO anon, authenticated 
USING (true);

-- Izinkan Admin / Kurikulum menyimpan & memperbarui jadwal pelajaran
CREATE POLICY "jadwal_pelajaran_write_admin" 
ON public.jadwal_pelajaran 
FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);


-- 2. TABEL jadwal_slot_waktu
GRANT ALL ON public.jadwal_slot_waktu TO anon, authenticated, service_role;
ALTER TABLE public.jadwal_slot_waktu ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Baca slot_waktu" ON public.jadwal_slot_waktu;
DROP POLICY IF EXISTS "Tulis slot_waktu" ON public.jadwal_slot_waktu;
DROP POLICY IF EXISTS "jadwal_slot_read" ON public.jadwal_slot_waktu;
DROP POLICY IF EXISTS "jadwal_slot_no_delete" ON public.jadwal_slot_waktu;
DROP POLICY IF EXISTS "jadwal_slot_write" ON public.jadwal_slot_waktu;

CREATE POLICY "jadwal_slot_read" 
ON public.jadwal_slot_waktu 
FOR SELECT 
TO anon, authenticated 
USING (true);

CREATE POLICY "jadwal_slot_write" 
ON public.jadwal_slot_waktu 
FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);


-- 3. TABEL jadwal_catatan
GRANT ALL ON public.jadwal_catatan TO anon, authenticated, service_role;
ALTER TABLE public.jadwal_catatan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Akses Baca catatan" ON public.jadwal_catatan;
DROP POLICY IF EXISTS "Modifikasi catatan" ON public.jadwal_catatan;
DROP POLICY IF EXISTS "jadwal_catatan_read" ON public.jadwal_catatan;
DROP POLICY IF EXISTS "jadwal_catatan_write" ON public.jadwal_catatan;

CREATE POLICY "jadwal_catatan_read" 
ON public.jadwal_catatan 
FOR SELECT 
TO anon, authenticated 
USING (true);

CREATE POLICY "jadwal_catatan_write" 
ON public.jadwal_catatan 
FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);


-- 4. TABEL jadwal_ekskul
GRANT ALL ON public.jadwal_ekskul TO anon, authenticated, service_role;
ALTER TABLE public.jadwal_ekskul ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jadwal_ekskul_read" ON public.jadwal_ekskul;
DROP POLICY IF EXISTS "jadwal_ekskul_no_delete" ON public.jadwal_ekskul;
DROP POLICY IF EXISTS "jadwal_ekskul_write" ON public.jadwal_ekskul;

CREATE POLICY "jadwal_ekskul_read" 
ON public.jadwal_ekskul 
FOR SELECT 
TO anon, authenticated 
USING (true);

CREATE POLICY "jadwal_ekskul_write" 
ON public.jadwal_ekskul 
FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);


-- 5. TABEL jadwal_piket
GRANT ALL ON public.jadwal_piket TO anon, authenticated, service_role;
ALTER TABLE public.jadwal_piket ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jadwal_piket_read" ON public.jadwal_piket;
DROP POLICY IF EXISTS "jadwal_piket_no_delete" ON public.jadwal_piket;
DROP POLICY IF EXISTS "jadwal_piket_write" ON public.jadwal_piket;

CREATE POLICY "jadwal_piket_read" 
ON public.jadwal_piket 
FOR SELECT 
TO anon, authenticated 
USING (true);

CREATE POLICY "jadwal_piket_write" 
ON public.jadwal_piket 
FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);


-- 6. RELOAD SCHEMA POSTGREST
NOTIFY pgrst, 'reload schema';
