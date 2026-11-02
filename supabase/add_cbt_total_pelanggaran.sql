-- Tambahkan kolom total_pelanggaran di cbt_peserta_ujian jika belum ada
ALTER TABLE public.cbt_peserta_ujian 
ADD COLUMN IF NOT EXISTS total_pelanggaran INT DEFAULT 0 NOT NULL;

-- Inisialisasi data lama jika strike_count > 0
UPDATE public.cbt_peserta_ujian
SET total_pelanggaran = GREATEST(COALESCE(total_pelanggaran, 0), COALESCE(strike_count, 0))
WHERE strike_count > 0;
