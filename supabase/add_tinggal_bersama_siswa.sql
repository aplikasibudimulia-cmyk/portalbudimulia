-- Migration: Tambah kolom tinggal_bersama pada tabel siswa_permanent
-- Digunakan untuk data kelengkapan kartu pelajar (Kedua Orang Tua, Ayah, Ibu, Wali, Lainnya)

ALTER TABLE public.siswa_permanent 
ADD COLUMN IF NOT EXISTS tinggal_bersama TEXT;

-- Keterangan:
-- Nilai yang dapat disimpan:
-- - 'Kedua Orang Tua'
-- - 'Ayah'
-- - 'Ibu'
-- - 'Wali'
-- - 'Lainnya: [keterangan bebas]'
