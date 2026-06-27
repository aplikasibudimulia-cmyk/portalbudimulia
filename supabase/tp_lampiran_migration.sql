-- Menambahkan kolom instruksi dan lampiran_urls ke nilai_komponen
ALTER TABLE nilai_komponen ADD COLUMN IF NOT EXISTS instruksi TEXT;
ALTER TABLE nilai_komponen ADD COLUMN IF NOT EXISTS lampiran_urls JSONB DEFAULT '[]';

-- Membuat Storage Bucket "tp_lampiran"
INSERT INTO storage.buckets (id, name, public) 
VALUES ('tp_lampiran', 'tp_lampiran', true) 
ON CONFLICT (id) DO NOTHING;

-- Menghapus policy lama jika ada untuk mencegah error conflict saat dijalankan ulang
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Users can delete" ON storage.objects;

-- Membuat policy agar file di bucket tp_lampiran bisa diakses secara publik (dibaca oleh siapa saja/siswa)
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'tp_lampiran');

-- Membuat policy agar Guru (authenticated) bisa mengunggah file
CREATE POLICY "Authenticated Users can upload" 
ON storage.objects FOR INSERT 
WITH CHECK (
  bucket_id = 'tp_lampiran' AND 
  auth.role() = 'authenticated'
);

-- Membuat policy agar Guru (authenticated) bisa menghapus file
CREATE POLICY "Authenticated Users can delete" 
ON storage.objects FOR DELETE 
USING (
  bucket_id = 'tp_lampiran' AND 
  auth.role() = 'authenticated'
);
