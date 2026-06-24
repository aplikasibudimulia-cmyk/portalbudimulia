-- =====================================================
-- SETUP SEMESTER & NILAI SISWA
-- Jalankan script ini di Supabase SQL Editor
-- =====================================================

-- ==================== TABEL SEMESTER ====================
-- Menyimpan rentang tanggal Semester 1 & 2 per Tahun Ajaran
CREATE TABLE IF NOT EXISTS semester (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tahun_ajaran_id UUID REFERENCES tahun_ajaran(id) ON DELETE CASCADE,
  nomor INTEGER NOT NULL CHECK (nomor IN (1, 2)),
  tanggal_mulai DATE NOT NULL,
  tanggal_selesai DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tahun_ajaran_id, nomor)
);

-- RLS Semester
ALTER TABLE semester ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all semester" ON semester FOR ALL USING (true) WITH CHECK (true);

-- ==================== TABEL KOMPONEN NILAI ====================
-- Menyimpan komponen/jenis nilai yang dibuat guru (TP1, PH, PTS, dll)
CREATE TABLE IF NOT EXISTS nilai_komponen (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  guru_id UUID REFERENCES guru(id) ON DELETE CASCADE,
  tahun_ajaran_id UUID REFERENCES tahun_ajaran(id) ON DELETE CASCADE,
  semester_id UUID REFERENCES semester(id) ON DELETE CASCADE,
  kelas TEXT NOT NULL,
  mata_pelajaran_id UUID REFERENCES mata_pelajaran(id) ON DELETE CASCADE,
  nama TEXT NOT NULL,         -- e.g. "TP1", "PH", "PTS", "Tugas 1"
  bobot NUMERIC DEFAULT 1,    -- bobot nilai untuk perhitungan rata-rata tertimbang
  urutan INTEGER DEFAULT 0,
  is_nilai_visible BOOLEAN DEFAULT false,  -- kontrol akses: apakah nilai sudah bisa dilihat siswa
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Komponen Nilai
ALTER TABLE nilai_komponen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all nilai_komponen" ON nilai_komponen FOR ALL USING (true) WITH CHECK (true);

-- ==================== TABEL NILAI SISWA ====================
-- Menyimpan nilai per siswa per komponen nilai
CREATE TABLE IF NOT EXISTS nilai_siswa (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  komponen_id UUID REFERENCES nilai_komponen(id) ON DELETE CASCADE,
  siswa_nisn TEXT REFERENCES siswa_permanent(nisn) ON DELETE CASCADE,
  nilai NUMERIC CHECK (nilai >= 0 AND nilai <= 100),
  catatan TEXT,
  diinput_oleh UUID REFERENCES guru(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(komponen_id, siswa_nisn)
);

-- RLS Nilai Siswa
ALTER TABLE nilai_siswa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all nilai_siswa" ON nilai_siswa FOR ALL USING (true) WITH CHECK (true);

-- ==================== ROLE FITUR NILAI ====================
-- Menambahkan fitur input_nilai ke role Guru (jika belum ada)
DO $$
DECLARE
    guru_role_id UUID;
BEGIN
    SELECT id INTO guru_role_id FROM roles WHERE nama = 'Guru' LIMIT 1;
    
    IF FOUND THEN
        INSERT INTO role_fitur (role_id, fitur) 
        VALUES (guru_role_id, 'input_nilai')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- =====================================================
-- Verifikasi: Periksa tabel berhasil dibuat
-- =====================================================
SELECT 
  table_name, 
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name AND table_schema = 'public') AS column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_name IN ('semester', 'nilai_komponen', 'nilai_siswa')
ORDER BY table_name;
