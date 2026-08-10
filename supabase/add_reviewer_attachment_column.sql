-- -----------------------------------------------------------------------------
-- MIGRATION SQL: Update Schema & Status Constraint untuk Pengajuan Poin Positif
-- -----------------------------------------------------------------------------
-- Jalankan seluruh query di bawah ini di Dashboard Supabase → SQL Editor Anda:

-- 1. Hapus check constraint status yang lama (yang membatasi status hanya pending/disetujui/ditolak)
ALTER TABLE public.pengajuan_poin_positif 
DROP CONSTRAINT IF EXISTS pengajuan_poin_positif_status_check;

-- 2. Tambahkan check constraint status yang baru (termasuk status 'revisi')
ALTER TABLE public.pengajuan_poin_positif 
ADD CONSTRAINT pengajuan_poin_positif_status_check 
CHECK (status IN ('pending', 'revisi', 'disetujui', 'ditolak'));

-- 3. Tambahkan kolom reviewer_attachment jika belum ada
ALTER TABLE public.pengajuan_poin_positif 
ADD COLUMN IF NOT EXISTS reviewer_attachment JSONB DEFAULT NULL;

-- 4. Tambahkan kolom tanggal_kegiatan jika belum ada
ALTER TABLE public.pengajuan_poin_positif 
ADD COLUMN IF NOT EXISTS tanggal_kegiatan DATE DEFAULT CURRENT_DATE;
