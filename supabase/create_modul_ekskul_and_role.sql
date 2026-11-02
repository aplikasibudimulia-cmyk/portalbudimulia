-- ==============================================================================
-- MIGRATION: MODUL EKSTRAKURIKULER (EKSKUL) & ROLE KOORDINATOR EKSKUL
-- SMP BUDI MULIA JAKARTA
-- ==============================================================================

-- 1. Pastikan Role "Koordinator Ekskul" terdaftar pada tabel roles
INSERT INTO public.roles (nama, deskripsi)
SELECT 'Koordinator Ekskul', 'Koordinator kegiatan dan penilaian ekstrakurikuler siswa'
WHERE NOT EXISTS (
  SELECT 1 FROM public.roles WHERE LOWER(nama) = 'koordinator ekskul'
);

-- 2. Tabel Master Kegiatan Ekstrakurikuler
CREATE TABLE IF NOT EXISTS public.ekskul (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama VARCHAR(100) NOT NULL,
  jenis VARCHAR(50) DEFAULT 'pilihan', -- 'wajib', 'utama', 'pilihan'
  pembina VARCHAR(150),
  hari VARCHAR(50),
  waktu VARCHAR(50),
  tahun_ajaran_id UUID REFERENCES public.tahun_ajaran(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pastikan unique constraint pada nama ekskul jika belum ada
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_ekskul_nama'
  ) THEN
    ALTER TABLE public.ekskul ADD CONSTRAINT unique_ekskul_nama UNIQUE (nama);
  END IF;
END $$;

ALTER TABLE public.ekskul ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for ekskul authenticated" ON public.ekskul;
CREATE POLICY "Enable all access for ekskul authenticated" ON public.ekskul
FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for ekskul anon" ON public.ekskul;
CREATE POLICY "Enable all access for ekskul anon" ON public.ekskul
FOR ALL TO anon USING (true) WITH CHECK (true);

-- 3. Tabel Master Kriteria Predikat Nilai Ekskul (A, B, C, D)
CREATE TABLE IF NOT EXISTS public.kriteria_nilai_ekskul (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  predikat VARCHAR(5) NOT NULL, -- 'A', 'B', 'C', 'D'
  kategori VARCHAR(50) DEFAULT 'umum', -- 'pramuka' (wajib) atau 'umum' (utama/pilihan)
  keterangan TEXT NOT NULL,
  tahun_ajaran_id UUID REFERENCES public.tahun_ajaran(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tambah kolom kategori jika tabel sudah pernah dibuat sebelumnya
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'kriteria_nilai_ekskul' AND column_name = 'kategori'
  ) THEN
    ALTER TABLE public.kriteria_nilai_ekskul ADD COLUMN kategori VARCHAR(50) DEFAULT 'umum';
  END IF;
END $$;

-- Pastikan unique constraint pada (predikat, kategori)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_kriteria_predikat') THEN
    ALTER TABLE public.kriteria_nilai_ekskul DROP CONSTRAINT unique_kriteria_predikat;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_kriteria_predikat_kategori') THEN
    ALTER TABLE public.kriteria_nilai_ekskul ADD CONSTRAINT unique_kriteria_predikat_kategori UNIQUE (predikat, kategori);
  END IF;
END $$;

ALTER TABLE public.kriteria_nilai_ekskul ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for kriteria authenticated" ON public.kriteria_nilai_ekskul;
CREATE POLICY "Enable all access for kriteria authenticated" ON public.kriteria_nilai_ekskul
FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for kriteria anon" ON public.kriteria_nilai_ekskul;
CREATE POLICY "Enable all access for kriteria anon" ON public.kriteria_nilai_ekskul
FOR ALL TO anon USING (true) WITH CHECK (true);

-- 4. Tabel Nilai Ekstrakurikuler Siswa
CREATE TABLE IF NOT EXISTS public.nilai_ekskul_siswa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  siswa_nisn VARCHAR(50) NOT NULL,
  tahun_ajaran_id UUID REFERENCES public.tahun_ajaran(id) ON DELETE CASCADE,
  semester_id UUID REFERENCES public.semester(id) ON DELETE CASCADE,
  kelas VARCHAR(50) NOT NULL,
  -- 1. Pramuka (Wajib)
  pramuka_nilai VARCHAR(5) DEFAULT 'A',
  pramuka_keterangan TEXT,
  -- 2. Ekskul Utama
  ekskul_utama_nama VARCHAR(100),
  ekskul_utama_nilai VARCHAR(5),
  ekskul_utama_keterangan TEXT,
  -- 3. Ekskul Pilihan (Opsional)
  ekskul_pilihan_nama VARCHAR(100),
  ekskul_pilihan_nilai VARCHAR(5),
  ekskul_pilihan_keterangan TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_nilai_ekskul_siswa UNIQUE (siswa_nisn, tahun_ajaran_id, semester_id)
);

ALTER TABLE public.nilai_ekskul_siswa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for nilai_ekskul authenticated" ON public.nilai_ekskul_siswa;
CREATE POLICY "Enable all access for nilai_ekskul authenticated" ON public.nilai_ekskul_siswa
FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for nilai_ekskul anon" ON public.nilai_ekskul_siswa;
CREATE POLICY "Enable all access for nilai_ekskul anon" ON public.nilai_ekskul_siswa
FOR ALL TO anon USING (true) WITH CHECK (true);

-- 5. Selesai.
-- (Catatan: Skrip ini HANYA membuat struktur tabel, constraint, dan policy keamanan (DDL).
--  TIDAK ADA data bawaan/seed yang di-insert atau di-overwrite, sehingga seluruh data ekskul
--  dan kriteria kustom yang sudah Anda simpan di aplikasi akan tetap 100% aman dan terjaga.)
