-- ============================================================
-- MIGRATION: Membuat Tabel jadwal_pelajaran
-- Jalankan script ini di Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.jadwal_pelajaran (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tahun_ajaran_id UUID REFERENCES public.tahun_ajaran(id) ON DELETE CASCADE,
  kelas TEXT NOT NULL,
  hari TEXT NOT NULL, -- 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'
  jam_ke INTEGER NOT NULL, -- 1, 2, 3, dst.
  waktu_mulai TIME NOT NULL,
  waktu_selesai TIME NOT NULL,
  guru_id UUID REFERENCES public.guru(id) ON DELETE SET NULL,
  mata_pelajaran_id UUID REFERENCES public.mata_pelajaran(id) ON DELETE SET NULL,
  keterangan TEXT, -- Misal 'UPACARA', 'ISTIRAHAT 1'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitasikan RLS
ALTER TABLE public.jadwal_pelajaran ENABLE ROW LEVEL SECURITY;

-- Drop Policy lama jika ada
DROP POLICY IF EXISTS "Akses Baca jadwal_pelajaran" ON public.jadwal_pelajaran;
DROP POLICY IF EXISTS "Modifikasi jadwal_pelajaran" ON public.jadwal_pelajaran;

-- Policy SELECT untuk semua user yang terautentikasi (Guru, Siswa, Ortu, Admin)
CREATE POLICY "Akses Baca jadwal_pelajaran" ON public.jadwal_pelajaran
  FOR SELECT TO authenticated USING (true);

-- Policy ALL untuk Admin saja
CREATE POLICY "Modifikasi jadwal_pelajaran" ON public.jadwal_pelajaran
  FOR ALL TO authenticated
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' )
  WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

-- Index untuk efisiensi pencarian
CREATE INDEX IF NOT EXISTS idx_jadwal_pelajaran_guru_hari 
  ON public.jadwal_pelajaran(guru_id, hari, tahun_ajaran_id);
