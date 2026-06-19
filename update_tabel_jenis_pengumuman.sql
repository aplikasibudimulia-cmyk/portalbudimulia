-- Skrip untuk menambahkan kolom template_url dan template_config ke tabel jenis_pengumuman

ALTER TABLE public.jenis_pengumuman 
ADD COLUMN IF NOT EXISTS template_url VARCHAR,
ADD COLUMN IF NOT EXISTS template_config JSONB;
