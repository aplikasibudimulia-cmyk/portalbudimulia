-- Tambahkan kolom show_download_stats ke tabel jenis_pengumuman
ALTER TABLE jenis_pengumuman ADD COLUMN IF NOT EXISTS show_download_stats BOOLEAN DEFAULT TRUE;
