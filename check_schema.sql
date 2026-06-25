SELECT column_name, column_default 
FROM information_schema.columns 
WHERE table_name = 'berkas_pengumuman' AND column_name = 'is_accessible';
