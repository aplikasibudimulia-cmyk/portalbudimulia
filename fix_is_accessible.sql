-- Set default value for is_accessible to true
ALTER TABLE public.berkas_pengumuman ALTER COLUMN is_accessible SET DEFAULT true;

-- Update existing records that were accidentally set to false because of default value
-- when only persyaratan was updated
UPDATE public.berkas_pengumuman SET is_accessible = true WHERE is_accessible = false;
