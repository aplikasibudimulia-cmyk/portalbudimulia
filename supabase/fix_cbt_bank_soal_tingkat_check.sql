-- ==============================================================================
-- FIX CONSTRAINT TINGKAT PADA CBT_BANK_SOAL
-- ==============================================================================
-- Mengizinkan tingkat kelas yang lebih fleksibel (misal jenjang 7 s/d 12 dan kelas uji coba)
-- agar proses penerbitan CBT tidak terhalang batas check constraint lama.

ALTER TABLE public.cbt_bank_soal 
DROP CONSTRAINT IF EXISTS cbt_bank_soal_tingkat_check;

ALTER TABLE public.cbt_bank_soal 
ADD CONSTRAINT cbt_bank_soal_tingkat_check 
CHECK (tingkat >= 1 AND tingkat <= 12);
