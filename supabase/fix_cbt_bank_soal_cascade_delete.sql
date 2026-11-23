-- ==============================================================================
-- 🛠️ FIX CONSTRAINT: Izinkan Hapus Bank Soal (CASCADE ke Sesi Ujian Terkait)
-- ==============================================================================
-- Masalah:
-- Saat Guru/Admin menghapus Bank Soal yang pernah dibuatkan sesi (misal sesi latihan/tes),
-- Postgres menolak dengan error:
-- "violates foreign key constraint 'cbt_sesi_ujian_bank_soal_id_fkey' on table 'cbt_sesi_ujian'"
-- karena foreign key tersebut diset ON DELETE RESTRICT.
--
-- Solusi:
-- Ubah constraint foreign key menjadi ON DELETE CASCADE.
-- Proteksi keamanan tetap terjaga 100%:
-- Trigger 'fn_cbt_bank_soal_lock_guard' tetap aktif dan otomatis memblokir
-- jika sesi ujian sedang berjalan ('terjadwal', 'aktif', 'beku').
-- Jika sesi sudah selesai atau sesi tes, bank soal beserta sesinya dapat dihapus tuntas.
-- ==============================================================================

ALTER TABLE public.cbt_sesi_ujian
  DROP CONSTRAINT IF EXISTS cbt_sesi_ujian_bank_soal_id_fkey;

ALTER TABLE public.cbt_sesi_ujian
  ADD CONSTRAINT cbt_sesi_ujian_bank_soal_id_fkey
  FOREIGN KEY (bank_soal_id)
  REFERENCES public.cbt_bank_soal(id)
  ON DELETE CASCADE;
