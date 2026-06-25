-- Script untuk membuat fungsi batch update kode (Diperbarui)
-- Menggunakan 2 tahap update untuk menghindari error "duplicate key value" 
-- saat kode yang baru saling bertukar dengan kode lama.

CREATE OR REPLACE FUNCTION public.batch_update_enrollment_kode(payload json)
RETURNS void AS $$
DECLARE
    item json;
    temp_suffix text := '_temp_' || md5(random()::text);
BEGIN
    -- Tahap 1: Ubah semua kode menjadi temporary sementara
    -- (Ini mencegah bentrok jika siswa A akan memakai kode lama siswa B)
    FOR item IN SELECT * FROM json_array_elements(payload)
    LOOP
        UPDATE public.enrollment
        SET kode = (item->>'new_kode') || temp_suffix
        WHERE nisn = item->>'nisn' AND tahun_ajaran_id = (item->>'tahun_ajaran_id')::uuid;
    END LOOP;

    -- Tahap 2: Hapus suffix temporary, ubah ke kode final
    FOR item IN SELECT * FROM json_array_elements(payload)
    LOOP
        UPDATE public.enrollment
        SET kode = item->>'new_kode'
        WHERE nisn = item->>'nisn' AND tahun_ajaran_id = (item->>'tahun_ajaran_id')::uuid;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
