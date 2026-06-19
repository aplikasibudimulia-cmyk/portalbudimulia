-- Skrip untuk menambahkan kolom nipd dan no_whatsapp ke tabel siswa

ALTER TABLE public.siswa 
ADD COLUMN IF NOT EXISTS nipd VARCHAR,
ADD COLUMN IF NOT EXISTS no_whatsapp VARCHAR;
