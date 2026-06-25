-- Script untuk menambahkan Trigger Cascade pada tabel enrollment
-- Trigger ini akan secara otomatis memperbarui 'kode_siswa' pada tabel 'berkas_pengumuman'
-- setiap kali 'kode' pada tabel 'enrollment' berubah (misal saat sinkronisasi CSV naik kelas).

-- 1. Buat fungsi trigger
CREATE OR REPLACE FUNCTION public.cascade_enrollment_kode_update()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.kode IS DISTINCT FROM OLD.kode THEN
        -- Perbarui semua berkas pengumuman lama agar tetap terhubung dengan kode yang baru
        UPDATE public.berkas_pengumuman
        SET kode_siswa = NEW.kode
        WHERE kode_siswa = OLD.kode;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Hapus trigger jika sudah ada sebelumnya agar aman dijalankan ulang
DROP TRIGGER IF EXISTS trigger_cascade_enrollment_kode ON public.enrollment;

-- 3. Pasang trigger pada tabel enrollment
CREATE TRIGGER trigger_cascade_enrollment_kode
AFTER UPDATE OF kode ON public.enrollment
FOR EACH ROW
WHEN (OLD.kode IS DISTINCT FROM NEW.kode)
EXECUTE FUNCTION public.cascade_enrollment_kode_update();
