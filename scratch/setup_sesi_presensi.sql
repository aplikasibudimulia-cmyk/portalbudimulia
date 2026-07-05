-- 1. Buat tabel sesi_presensi
CREATE TABLE public.sesi_presensi (
    tanggal DATE PRIMARY KEY,
    dibuka_oleh UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    dibuka_pada TIMESTAMPTZ DEFAULT NOW()
);

-- Mengaktifkan Row Level Security (RLS)
ALTER TABLE public.sesi_presensi ENABLE ROW LEVEL SECURITY;

-- Memberikan akses ke semua orang yang terautentikasi (Siswa & Guru/Piket)
CREATE POLICY "Enable read access for authenticated users"
ON public.sesi_presensi FOR SELECT
TO authenticated
USING (true);

-- Hanya Piket/Admin yang boleh membuka sesi
CREATE POLICY "Enable insert for authenticated users"
ON public.sesi_presensi FOR INSERT
TO authenticated
WITH CHECK (true);

-- 2. Tambahkan pengaturan default untuk link_grup_guru jika belum ada
INSERT INTO public.pengaturan_sekolah (setting_key, setting_value, updated_at)
VALUES ('link_grup_guru', '', NOW())
ON CONFLICT (setting_key) DO NOTHING;
