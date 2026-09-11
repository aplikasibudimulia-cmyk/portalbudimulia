-- ====================================================================
-- MIGRATION: Membuat Tabel Pendamping Lomba / Kegiatan Guru
-- Jalankan script ini di Supabase SQL Editor:
-- Dashboard > SQL Editor > New Query > Paste & Run
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.pendamping_lomba (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_kegiatan TEXT NOT NULL,
    kategori TEXT DEFAULT 'Akademik',
    tingkat TEXT DEFAULT 'Kota / Kabupaten',
    penyelenggara TEXT,
    tempat_lokasi TEXT,
    tanggal_mulai DATE NOT NULL,
    tanggal_selesai DATE,
    guru_id UUID REFERENCES public.guru(id) ON DELETE SET NULL,
    nama_guru TEXT,
    tahun_ajaran_id UUID REFERENCES public.tahun_ajaran(id) ON DELETE SET NULL,
    peserta JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of object: [{"nisn": "...", "nama_lengkap": "...", "kelas": "...", "peran": "..."}]
    keterangan TEXT,
    status TEXT DEFAULT 'Direncanakan' CHECK (status IN ('Direncanakan', 'Sedang Berjalan', 'Selesai')),
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Mengaktifkan Row Level Security (RLS)
ALTER TABLE public.pendamping_lomba ENABLE ROW LEVEL SECURITY;

-- Drop policy lama jika sudah ada
DROP POLICY IF EXISTS "Allow all actions on pendamping_lomba for anon and authenticated" ON public.pendamping_lomba;

-- Buat policy untuk akses read, insert, update, delete
CREATE POLICY "Allow all actions on pendamping_lomba for anon and authenticated"
ON public.pendamping_lomba
FOR ALL
USING (true)
WITH CHECK (true);

-- Indeks performa query
CREATE INDEX IF NOT EXISTS idx_pendamping_lomba_guru ON public.pendamping_lomba(guru_id);
CREATE INDEX IF NOT EXISTS idx_pendamping_lomba_ta ON public.pendamping_lomba(tahun_ajaran_id);
CREATE INDEX IF NOT EXISTS idx_pendamping_lomba_tgl ON public.pendamping_lomba(tanggal_mulai);
CREATE INDEX IF NOT EXISTS idx_pendamping_lomba_status ON public.pendamping_lomba(status);
