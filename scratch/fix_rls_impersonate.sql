-- SQL Script untuk memperbaiki error RLS pada tabel impersonate_tokens
-- Buka Supabase Dashboard -> SQL Editor, lalu jalankan script ini.

-- 1. Pastikan RLS aktif (biasanya sudah aktif)
ALTER TABLE impersonate_tokens ENABLE ROW LEVEL SECURITY;

-- 2. Hapus policy lama jika ada yang membatasi INSERT
DROP POLICY IF EXISTS "Allow all inserts" ON impersonate_tokens;
DROP POLICY IF EXISTS "Enable insert for all users" ON impersonate_tokens;
DROP POLICY IF EXISTS "Allow anon insert" ON impersonate_tokens;

-- 3. Buat policy baru yang mengizinkan INSERT dari siapa pun (anon key)
CREATE POLICY "Allow anon insert" 
ON impersonate_tokens
FOR INSERT 
TO public
WITH CHECK (true);

-- (Opsional) Memastikan SELECT juga berfungsi 
DROP POLICY IF EXISTS "Allow anon select" ON impersonate_tokens;
CREATE POLICY "Allow anon select" 
ON impersonate_tokens
FOR SELECT 
TO public
USING (true);
