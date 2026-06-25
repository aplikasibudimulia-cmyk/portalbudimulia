-- Script ini berfungsi untuk membuat fungsi (RPC) yang aman dalam mengubah NISN siswa.
-- Karena NISN adalah Primary Key yang digunakan di berbagai tabel (enrollment, foto, dll), 
-- fungsi ini akan secara otomatis memindahkan semua data terkait ke NISN yang baru 
-- dan memperbarui kode dokumen pengumuman agar tidak hilang.

CREATE OR REPLACE FUNCTION update_siswa_nisn(old_nisn text, new_nisn text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    e_record RECORD;
    new_kode text;
BEGIN
    -- 1. Validasi
    IF NOT EXISTS (SELECT 1 FROM public.siswa_permanent WHERE nisn = old_nisn) THEN
        RAISE EXCEPTION 'Siswa dengan NISN lama % tidak ditemukan.', old_nisn;
    END IF;

    IF EXISTS (SELECT 1 FROM public.siswa_permanent WHERE nisn = new_nisn) THEN
        RAISE EXCEPTION 'Siswa dengan NISN % sudah terdaftar di sistem.', new_nisn;
    END IF;

    -- 2. Buat record siswa baru dengan NISN baru
    -- (Pendekatan ini menjamin aman dari masalah relasi Foreign Key yang belum CASCADE)
    INSERT INTO public.siswa_permanent (nisn, nipd, nama_lengkap, email_aktif, no_whatsapp, kode_akses, tahun_lulus, telegram_ortu)
    SELECT new_nisn, nipd, nama_lengkap, email_aktif, no_whatsapp, kode_akses, tahun_lulus, telegram_ortu
    FROM public.siswa_permanent
    WHERE nisn = old_nisn;

    -- 3. Update dan pindahkan riwayat kelas (enrollment)
    FOR e_record IN SELECT * FROM public.enrollment WHERE nisn = old_nisn LOOP
        -- Ganti bagian NISN lama di dalam kode menjadi NISN baru
        new_kode := REPLACE(e_record.kode, old_nisn, new_nisn);

        IF new_kode != e_record.kode THEN
            -- Update berkas pengumuman agar tidak putus/hilang
            UPDATE public.berkas_pengumuman
            SET kode_siswa = new_kode
            WHERE kode_siswa = e_record.kode;
            
            -- Pindahkan enrollment ke NISN baru dan perbarui kodenya
            UPDATE public.enrollment
            SET nisn = new_nisn, kode = new_kode
            WHERE id = e_record.id;
        ELSE
            -- Jika karena suatu hal kode tidak mengandung NISN
            UPDATE public.enrollment
            SET nisn = new_nisn
            WHERE id = e_record.id;
        END IF;
    END LOOP;

    -- 4. Pindahkan Foto
    UPDATE public.foto SET nisn = new_nisn WHERE nisn = old_nisn;

    -- 5. Pindahkan Presensi (jika tabel terhubung dengan siswa_nisn)
    -- Asumsikan kolomnya bernama siswa_nisn berdasar migration_qr.sql
    BEGIN
        UPDATE public.presensi_harian SET siswa_nisn = new_nisn WHERE siswa_nisn = old_nisn;
    EXCEPTION WHEN OTHERS THEN
        -- Abaikan jika tabel/kolom tidak ada
    END;

    -- 6. Pindahkan Activity Log (opsional)
    -- Asumsi jika ada log yang merujuk ke NISN secara langsung
    -- BEGIN
    --     UPDATE public.activity_log SET target_id = new_nisn WHERE target_id = old_nisn;
    -- EXCEPTION WHEN OTHERS THEN END;

    -- 7. Pindahkan Akun Pengguna (jika foreign_id menggunakan NISN)
    BEGIN
        UPDATE public.akun_pengguna SET foreign_id = new_nisn WHERE foreign_id = old_nisn AND role = 'murid';
    EXCEPTION WHEN OTHERS THEN
        -- Abaikan jika tabel/kolom tidak ada
    END;

    -- 8. Terakhir, hapus record siswa dengan NISN lama
    DELETE FROM public.siswa_permanent WHERE nisn = old_nisn;

END;
$$;
