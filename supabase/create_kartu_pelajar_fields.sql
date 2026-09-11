-- ==============================================================================
-- Migration: Tambah Kolom Identitas & Alamat Lengkap untuk Kartu Pelajar
-- Menambahkan tempat_lahir, tanggal_lahir, alamat, kelurahan, kecamatan, kota, no_hp
-- pada tabel public.siswa_permanent, serta default pengaturan kartu pelajar
-- ==============================================================================

-- 1. Tambah kolom pada siswa_permanent
ALTER TABLE public.siswa_permanent 
ADD COLUMN IF NOT EXISTS tempat_lahir TEXT;

ALTER TABLE public.siswa_permanent 
ADD COLUMN IF NOT EXISTS tanggal_lahir DATE;

ALTER TABLE public.siswa_permanent 
ADD COLUMN IF NOT EXISTS alamat TEXT;

ALTER TABLE public.siswa_permanent 
ADD COLUMN IF NOT EXISTS kelurahan TEXT;

ALTER TABLE public.siswa_permanent 
ADD COLUMN IF NOT EXISTS kecamatan TEXT;

ALTER TABLE public.siswa_permanent 
ADD COLUMN IF NOT EXISTS kota TEXT;

ALTER TABLE public.siswa_permanent 
ADD COLUMN IF NOT EXISTS no_hp TEXT;

-- 2. Default data pengaturan kartu pelajar di pengaturan_sekolah
INSERT INTO public.pengaturan_sekolah (setting_key, setting_value)
VALUES 
  ('kartu_nama_sekolah', 'SMP BUDI MULIA'),
  ('kartu_alamat_sekolah', 'Jl. Mangga Besar No. 2M, Jakarta'),
  ('kartu_nama_kepsek', 'Drs. H. Hendra Wijaya, M.Pd.'),
  ('kartu_nip_kepsek', '19750817 200212 1 003'),
  ('kartu_tema_warna', 'navy_gold'),
  ('kartu_tanggal_terbit', 'Jakarta, 15 Juli 2025'),
  ('kartu_masa_berlaku', 'Selama Menjadi Siswa Aktif'),
  ('kartu_belakang_teks', '1. Kartu ini adalah tanda pengenal sah siswa SMP Budi Mulia Jakarta.\n2. Wajib dibawa saat berada di lingkungan sekolah dan kegiatan resmi.\n3. Kartu ini tidak dapat dipindahtangankan kepada orang lain.\n4. Apabila kartu ini hilang atau rusak, segera lapor ke bagian Tata Usaha / Kesiswaan.\n5. Jika menemukan kartu ini, mohon kembalikan ke alamat sekolah di bawah ini.')
ON CONFLICT (setting_key) DO NOTHING;
