-- ============================================================
-- MIGRATION: Tambah kolom tahun_ajaran_id + semester
-- ke tabel yang sudah terlanjur dibuat tanpa kolom tersebut
-- Jalankan di Supabase SQL Editor
-- ============================================================


-- ============================================================
-- 4. student_points — tambah tahun_ajaran_id + semester
-- ============================================================

-- Tambah kolom baru (nullable dulu agar tidak error jika sudah ada data)
ALTER TABLE student_points
  ADD COLUMN IF NOT EXISTS tahun_ajaran_id UUID REFERENCES tahun_ajaran(id),
  ADD COLUMN IF NOT EXISTS semester INT DEFAULT 1 CHECK (semester IN (1, 2));

-- Hapus UNIQUE constraint lama yang hanya pada nisn
ALTER TABLE student_points
  DROP CONSTRAINT IF EXISTS student_points_nisn_key;

-- Tambah UNIQUE constraint baru (nisn + tahun_ajaran_id + semester)
ALTER TABLE student_points
  ADD CONSTRAINT student_points_nisn_ta_sem_key UNIQUE (nisn, tahun_ajaran_id, semester);


-- ============================================================
-- 5. point_records — tambah tahun_ajaran_id + semester
-- ============================================================

ALTER TABLE point_records
  ADD COLUMN IF NOT EXISTS tahun_ajaran_id UUID REFERENCES tahun_ajaran(id),
  ADD COLUMN IF NOT EXISTS semester INT DEFAULT 1 CHECK (semester IN (1, 2));


-- ============================================================
-- 6. guidance_logs — tambah tahun_ajaran_id + semester
-- ============================================================

ALTER TABLE guidance_logs
  ADD COLUMN IF NOT EXISTS tahun_ajaran_id UUID REFERENCES tahun_ajaran(id),
  ADD COLUMN IF NOT EXISTS semester INT DEFAULT 1;


-- ============================================================
-- Selesai!
-- Tata Tertib, Katalog Poin, dan Tahap Pembinaan
-- tidak perlu diubah — mereka berlaku global (tidak per TA/semester)
-- ============================================================
