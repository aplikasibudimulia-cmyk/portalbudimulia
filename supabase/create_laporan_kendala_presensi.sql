-- ============================================================
-- MIGRATION: Tabel Laporan Kendala Presensi Siswa
-- Dijalankan di SQL Editor Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS public.laporan_kendala_presensi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tanggal DATE NOT NULL,
  tipe TEXT NOT NULL DEFAULT 'masuk', -- 'masuk' atau 'pulang'
  siswa_nisn TEXT NOT NULL,
  nama_siswa TEXT NOT NULL,
  kelas TEXT,
  tahun_ajaran_id UUID,
  deskripsi TEXT NOT NULL,
  bukti_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'disetujui', 'ditolak'
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_laporan_kendala_presensi UNIQUE (tanggal, siswa_nisn, tipe)
);

-- Pastikan kolom tahun_ajaran_id bertipe UUID (jika tabel sudah terlanjur dibuat dengan BIGINT)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'laporan_kendala_presensi' 
      AND column_name = 'tahun_ajaran_id' 
      AND data_type = 'bigint'
  ) THEN
    ALTER TABLE public.laporan_kendala_presensi DROP COLUMN tahun_ajaran_id;
    ALTER TABLE public.laporan_kendala_presensi ADD COLUMN tahun_ajaran_id UUID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_laporan_kendala_tanggal ON public.laporan_kendala_presensi(tanggal);
CREATE INDEX IF NOT EXISTS idx_laporan_kendala_nisn ON public.laporan_kendala_presensi(siswa_nisn);
CREATE INDEX IF NOT EXISTS idx_laporan_kendala_status ON public.laporan_kendala_presensi(status);

-- Enable RLS
ALTER TABLE public.laporan_kendala_presensi ENABLE ROW LEVEL SECURITY;

-- Policy agar siswa bisa insert/select dan guru/admin bisa select/update
DROP POLICY IF EXISTS "Allow all on laporan_kendala_presensi" ON public.laporan_kendala_presensi;
CREATE POLICY "Allow all on laporan_kendala_presensi"
  ON public.laporan_kendala_presensi
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Verifikasi tabel
SELECT 'laporan_kendala_presensi OK' AS status 
WHERE EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_name = 'laporan_kendala_presensi'
);
