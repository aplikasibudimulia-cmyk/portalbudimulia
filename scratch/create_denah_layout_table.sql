-- ============================================================
-- MIGRATION: Pembuatan Tabel Denah Kelas Layout
-- Jalankan skrip ini di Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.denah_kelas_layout (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kelas varchar(50) UNIQUE NOT NULL, -- Nama kelas unik (misal: 'VII-A', 'VIII-B')
  posisi_x integer NOT NULL DEFAULT 0,
  posisi_y integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Aktifkan RLS
ALTER TABLE public.denah_kelas_layout ENABLE ROW LEVEL SECURITY;

-- Kebijakan RLS (Semua user terotentikasi dapat membaca, hanya Admin/Kepala Sekolah yang bisa modifikasi)
DROP POLICY IF EXISTS "Akses Baca denah_kelas_layout" ON public.denah_kelas_layout;
CREATE POLICY "Akses Baca denah_kelas_layout" ON public.denah_kelas_layout
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Modifikasi denah_kelas_layout" ON public.denah_kelas_layout;
CREATE POLICY "Modifikasi denah_kelas_layout" ON public.denah_kelas_layout
  FOR ALL TO authenticated
  USING (public.is_admin_or_kepala_sekolah(auth.uid()))
  WITH CHECK (public.is_admin_or_kepala_sekolah(auth.uid()));

-- Berikan izin akses dasar
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.denah_kelas_layout TO authenticated;
GRANT SELECT ON TABLE public.denah_kelas_layout TO anon;
