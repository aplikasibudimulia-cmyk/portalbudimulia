ALTER TABLE public.jenis_pengumuman 
ADD COLUMN IF NOT EXISTS visible_orangtua boolean DEFAULT true;
