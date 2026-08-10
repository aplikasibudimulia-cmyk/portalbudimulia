-- =========================================================================
-- TABEL MASTER PRESTASI & KEIKUTSERTAAN LOMBA SISWA
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.prestasi_siswa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    siswa_nisn TEXT NOT NULL REFERENCES public.siswa_permanent(nisn) ON DELETE CASCADE,
    nama_lomba TEXT NOT NULL,
    kategori_lomba TEXT DEFAULT 'Akademik', -- Akademik, Olahraga, Seni & Budaya, Keagamaan, Teknologi, Lainnya
    tingkat TEXT NOT NULL, -- Sekolah, Kecamatan, Kota / Kabupaten, Provinsi, Nasional, Internasional
    peringkat TEXT NOT NULL, -- Juara 1, Juara 2, Juara 3, Harapan 1, Harapan 2, Harapan 3, Peserta / Keikutsertaan, Finalis
    penyelenggara TEXT,
    tanggal_lomba DATE NOT NULL,
    poin_record_id UUID REFERENCES public.point_records(id) ON DELETE SET NULL,
    bukti_url TEXT,
    keterangan TEXT,
    tahun_ajaran_id UUID REFERENCES public.tahun_ajaran(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable RLS
ALTER TABLE public.prestasi_siswa ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "allow_all_prestasi_siswa" ON public.prestasi_siswa;

-- Create policy for full read/write access for anon & authenticated
CREATE POLICY "allow_all_prestasi_siswa"
  ON public.prestasi_siswa
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
