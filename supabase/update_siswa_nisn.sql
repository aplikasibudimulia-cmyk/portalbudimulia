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
  -- Cukup update 1 tabel utama saja, semua tabel lain akan otomatis ikut berubah berkat CASCADE!
  UPDATE siswa_permanent SET nisn = new_nisn WHERE nisn = old_nisn;
END;
$$;
