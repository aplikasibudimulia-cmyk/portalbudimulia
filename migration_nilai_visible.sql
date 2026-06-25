ALTER TABLE public.nilai_komponen 
ADD COLUMN IF NOT EXISTS is_nilai_visible BOOLEAN DEFAULT true;
