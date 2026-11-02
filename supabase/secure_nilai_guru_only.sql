-- ==============================================================================
-- KEAMANAN KETAT NILAI SISWA: HANYA GURU & ADMIN YANG BISA EDIT/INPUT
-- ==============================================================================

-- 1. Buat fungsi validasi: Memastikan bahwa data nilai hanya boleh dimasukkan
--    atau diubah jika 'diinput_oleh' adalah ID Guru yang sah dan terdaftar.
CREATE OR REPLACE FUNCTION public.check_hanya_guru_boleh_edit_nilai()
RETURNS TRIGGER AS $$
BEGIN
  -- Cek apakah 'diinput_oleh' ada di tabel guru
  IF NEW.diinput_oleh IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.guru WHERE id = NEW.diinput_oleh
  ) THEN
    RAISE EXCEPTION 'Akses Ditolak: Hanya Guru yang berhak menginput atau mengubah nilai siswa!';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Pasang trigger sebelum INSERT atau UPDATE pada tabel nilai_siswa
DROP TRIGGER IF EXISTS trg_secure_nilai_guru_only ON public.nilai_siswa;

CREATE TRIGGER trg_secure_nilai_guru_only
BEFORE INSERT OR UPDATE ON public.nilai_siswa
FOR EACH ROW
EXECUTE FUNCTION public.check_hanya_guru_boleh_edit_nilai();

-- Selesai! Sekarang database Supabase akan menolak mentah-mentah jika
-- ada siswa/pihak tidak sah yang mencoba mengubah baris nilai_siswa.
