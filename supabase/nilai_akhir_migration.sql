CREATE TABLE IF NOT EXISTS nilai_akhir_config (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  guru_id UUID REFERENCES guru(id) ON DELETE CASCADE,
  tahun_ajaran_id UUID REFERENCES tahun_ajaran(id) ON DELETE CASCADE,
  semester_id UUID REFERENCES semester(id) ON DELETE CASCADE,
  mata_pelajaran_id UUID REFERENCES mata_pelajaran(id) ON DELETE CASCADE,
  kelas VARCHAR(50),
  metode_hitung VARCHAR(50) DEFAULT 'rata_rata',
  bobot_detail JSONB DEFAULT '{}',
  is_visible BOOLEAN DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT nilai_akhir_config_unique UNIQUE (guru_id, tahun_ajaran_id, semester_id, mata_pelajaran_id, kelas)
);

ALTER TABLE nilai_akhir_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all operations for authenticated" ON nilai_akhir_config;
CREATE POLICY "Enable all operations for authenticated" 
ON nilai_akhir_config 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all operations for anon" ON nilai_akhir_config;
CREATE POLICY "Enable all operations for anon" 
ON nilai_akhir_config 
FOR ALL 
TO anon 
USING (true) 
WITH CHECK (true);

-- Jalankan baris ini jika tabel sudah pernah dibuat sebelumnya:
ALTER TABLE nilai_akhir_config ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT false;
