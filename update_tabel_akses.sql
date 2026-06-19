-- Skrip untuk menambahkan kolom is_accessible ke tabel berkas_pengumuman

ALTER TABLE public.berkas_pengumuman 
ADD COLUMN IF NOT EXISTS is_accessible BOOLEAN DEFAULT false;
