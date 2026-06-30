-- Script untuk memastikan semua data yang berhubungan dengan user (Siswa/Guru/Akun) ikut terhapus otomatis (CASCADE)
-- Jalankan ini di SQL Editor Supabase

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 
            tc.table_schema, 
            tc.table_name, 
            tc.constraint_name,
            kcu.column_name,
            ccu.table_name AS foreign_table,
            ccu.column_name AS foreign_column
        FROM 
            information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu 
            ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' 
            AND ccu.table_name IN ('siswa_permanent', 'guru', 'akun_pengguna', 'enrollment')
    ) LOOP
        -- Hapus constraint lama
        EXECUTE 'ALTER TABLE ' || quote_ident(r.table_schema) || '.' || quote_ident(r.table_name) || 
                ' DROP CONSTRAINT ' || quote_ident(r.constraint_name);
                
        -- Tambahkan constraint baru dengan CASCADE
        EXECUTE 'ALTER TABLE ' || quote_ident(r.table_schema) || '.' || quote_ident(r.table_name) || 
                ' ADD CONSTRAINT ' || quote_ident(r.constraint_name) || 
                ' FOREIGN KEY (' || quote_ident(r.column_name) || ') ' ||
                ' REFERENCES ' || quote_ident(r.foreign_table) || '(' || quote_ident(r.foreign_column) || ') ' ||
                ' ON UPDATE CASCADE ON DELETE CASCADE';
    END LOOP;
END;
$$;
