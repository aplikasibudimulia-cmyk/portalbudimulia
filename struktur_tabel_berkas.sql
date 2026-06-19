-- Tabel untuk mencatat file pengumuman yang diunggah ke Cloudinary
CREATE TABLE public.berkas_pengumuman (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    kode_siswa VARCHAR NOT NULL,
    kode_jenis VARCHAR NOT NULL,
    file_name VARCHAR NOT NULL,
    file_url VARCHAR NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(kode_siswa, kode_jenis)
);

-- Atur hak akses (RLS)
ALTER TABLE public.berkas_pengumuman ENABLE ROW LEVEL SECURITY;

-- Izinkan semua pengguna (termasuk admin dan siswa yang login) untuk melihat
CREATE POLICY "Allow select for everyone" ON public.berkas_pengumuman
    FOR SELECT USING (true);

-- Izinkan public/anon/admin untuk melakukan insert/update/delete 
-- (karena aplikasi ini menggunakan Supabase anon key di frontend admin)
CREATE POLICY "Allow all operations for anon" ON public.berkas_pengumuman
    FOR ALL USING (true) WITH CHECK (true);
