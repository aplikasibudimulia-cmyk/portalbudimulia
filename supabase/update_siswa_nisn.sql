-- Script ini akan memperbaiki database Anda agar secara otomatis mengizinkan perubahan NISN (ON UPDATE CASCADE)
-- Anda cukup menjalankan script ini 1 KALI saja di SQL Editor Supabase.

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 
            tc.table_schema, 
            tc.table_name, 
            tc.constraint_name,
            kcu.column_name
        FROM 
            information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu 
            ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' 
            AND ccu.table_name = 'siswa_permanent'
            AND ccu.column_name = 'nisn'
    ) LOOP
        -- Hapus aturan lama yang mencegah perubahan (NO ACTION)
        EXECUTE 'ALTER TABLE ' || quote_ident(r.table_schema) || '.' || quote_ident(r.table_name) || 
                ' DROP CONSTRAINT ' || quote_ident(r.constraint_name);
                
        -- Tambahkan aturan baru yang mengizinkan perubahan otomatis (CASCADE)
        EXECUTE 'ALTER TABLE ' || quote_ident(r.table_schema) || '.' || quote_ident(r.table_name) || 
                ' ADD CONSTRAINT ' || quote_ident(r.constraint_name) || 
                ' FOREIGN KEY (' || quote_ident(r.column_name) || ') ' ||
                ' REFERENCES siswa_permanent(nisn) ON UPDATE CASCADE ON DELETE CASCADE';
    END LOOP;
END;
$$;

-- Setelah menjalankan script di atas, kita perbarui juga fungsi update_siswa_nisn
-- Karena database sekarang sudah otomatis merambat perubahannya (CASCADE), fungsinya jadi sangat sederhana:

CREATE OR REPLACE FUNCTION update_siswa_nisn(old_nisn text, new_nisn text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Tabel Utama Siswa
  UPDATE public.siswa_permanent SET nisn = new_nisn WHERE nisn = old_nisn;

  -- 2. Akun Pengguna (Murid & Orang Tua)
  UPDATE public.akun_pengguna SET foreign_id = new_nisn WHERE foreign_id = old_nisn AND role IN ('murid', 'orang_tua');

  -- 3. Tabungan Siswa (Transaksi, Rekening, dan Bendahara Kelas)
  UPDATE public.tabungan_transaksi SET siswa_nisn = new_nisn WHERE siswa_nisn = old_nisn;
  UPDATE public.tabungan_transaksi SET diinput_oleh_nisn = new_nisn WHERE diinput_oleh_nisn = old_nisn;
  UPDATE public.tabungan_rekening SET siswa_nisn = new_nisn WHERE siswa_nisn = old_nisn;
  UPDATE public.bendahara_kelas SET siswa_nisn = new_nisn WHERE siswa_nisn = old_nisn;

  -- 4. Tagihan & SPP Siswa
  UPDATE public.tagihan_spp SET siswa_nisn = new_nisn WHERE siswa_nisn = old_nisn;
  UPDATE public.tarif_spp_siswa SET siswa_nisn = new_nisn WHERE siswa_nisn = old_nisn;
  UPDATE public.transaksi_bca_log SET siswa_nisn = new_nisn WHERE siswa_nisn = old_nisn;

  -- 5. Akademik, Presensi, Nilai & Poin
  UPDATE public.enrollment SET nisn = new_nisn WHERE nisn = old_nisn;
  UPDATE public.presensi_harian SET siswa_nisn = new_nisn WHERE siswa_nisn = old_nisn;
  UPDATE public.nilai_siswa SET siswa_nisn = new_nisn WHERE siswa_nisn = old_nisn;
  UPDATE public.point_records SET nisn = new_nisn WHERE nisn = old_nisn;
  UPDATE public.student_points SET nisn = new_nisn WHERE nisn = old_nisn;
  UPDATE public.prestasi_siswa SET siswa_nisn = new_nisn WHERE siswa_nisn = old_nisn;
  UPDATE public.bk_konsultasi SET siswa_nisn = new_nisn WHERE siswa_nisn = old_nisn;
  UPDATE public.bk_konsultasi_booking SET siswa_nisn = new_nisn WHERE siswa_nisn = old_nisn;
  UPDATE public.foto SET nisn = new_nisn WHERE nisn = old_nisn;
  UPDATE public.push_device_tokens SET nisn = new_nisn WHERE nisn = old_nisn;
  UPDATE public.berkas_pengumuman SET kode_siswa = new_nisn WHERE kode_siswa = old_nisn;
  UPDATE public.impersonate_tokens SET target_user_id = new_nisn WHERE target_user_id = old_nisn;

  -- 6. Auth Metadata
  UPDATE auth.users 
  SET raw_user_meta_data = jsonb_set(raw_user_meta_data, '{foreign_id}', to_jsonb(new_nisn))
  WHERE raw_user_meta_data->>'foreign_id' = old_nisn;
END;
$$;
