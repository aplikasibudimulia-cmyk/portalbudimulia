-- Skrip untuk menambahkan pengaturan target kelas dan tampilan info ke jenis_pengumuman

ALTER TABLE public.jenis_pengumuman 
ADD COLUMN IF NOT EXISTS target_kelas JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS show_tahun_lulus BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS show_nisn BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS show_nipd BOOLEAN DEFAULT false;
