-- ============================================================
-- MIGRATION: Pembuatan Tabel Pengumuman Resmi Kepala Sekolah
-- Jalankan skrip ini di Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pengumuman_resmi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judul text NOT NULL,
  nomor_surat varchar(100),
  isi text NOT NULL, -- HTML / Rich Text
  tanggal_terbit date NOT NULL DEFAULT CURRENT_DATE,
  status varchar(20) DEFAULT 'Draft', -- Draft / Terbit / Diarsipkan
  tanda_tangan_url text, -- URL tanda tangan digital kepala sekolah
  target_kelas text[], -- Array nama kelas yang ditargetkan (jika target = kelas tertentu)
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pengumuman_resmi_target_pivot (
  pengumuman_id uuid REFERENCES public.pengumuman_resmi(id) ON DELETE CASCADE,
  target_id uuid REFERENCES public.program_sekolah_target_peserta(id) ON DELETE CASCADE,
  PRIMARY KEY (pengumuman_id, target_id)
);

CREATE TABLE IF NOT EXISTS public.pengumuman_resmi_dokumen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pengumuman_id uuid REFERENCES public.pengumuman_resmi(id) ON DELETE CASCADE,
  file_name varchar(255) NOT NULL,
  file_url text NOT NULL,
  uploaded_at timestamptz DEFAULT now()
);

-- Aktifkan RLS untuk semua tabel pengumuman
ALTER TABLE public.pengumuman_resmi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pengumuman_resmi_target_pivot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pengumuman_resmi_dokumen ENABLE ROW LEVEL SECURITY;

-- Kebijakan RLS untuk: pengumuman_resmi
-- Pembacaan: Semua user yang login dapat membaca pengumuman berstatus 'Terbit'
DROP POLICY IF EXISTS "Akses Baca pengumuman_resmi" ON public.pengumuman_resmi;
CREATE POLICY "Akses Baca pengumuman_resmi" ON public.pengumuman_resmi
  FOR SELECT TO authenticated USING (status = 'Terbit' OR public.is_admin_or_kepala_sekolah(auth.uid()));

-- Modifikasi: Hanya Admin / Kepala Sekolah yang bisa mengelola (ALL)
DROP POLICY IF EXISTS "Modifikasi pengumuman_resmi" ON public.pengumuman_resmi;
CREATE POLICY "Modifikasi pengumuman_resmi" ON public.pengumuman_resmi
  FOR ALL TO authenticated
  USING (public.is_admin_or_kepala_sekolah(auth.uid()))
  WITH CHECK (public.is_admin_or_kepala_sekolah(auth.uid()));

-- Kebijakan RLS untuk: pengumuman_resmi_target_pivot
DROP POLICY IF EXISTS "Akses Baca pivot" ON public.pengumuman_resmi_target_pivot;
CREATE POLICY "Akses Baca pivot" ON public.pengumuman_resmi_target_pivot
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Modifikasi pivot" ON public.pengumuman_resmi_target_pivot;
CREATE POLICY "Modifikasi pivot" ON public.pengumuman_resmi_target_pivot
  FOR ALL TO authenticated
  USING (public.is_admin_or_kepala_sekolah(auth.uid()))
  WITH CHECK (public.is_admin_or_kepala_sekolah(auth.uid()));

-- Kebijakan RLS untuk: pengumuman_resmi_dokumen
DROP POLICY IF EXISTS "Akses Baca dokumen" ON public.pengumuman_resmi_dokumen;
CREATE POLICY "Akses Baca dokumen" ON public.pengumuman_resmi_dokumen
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Modifikasi dokumen" ON public.pengumuman_resmi_dokumen;
CREATE POLICY "Modifikasi dokumen" ON public.pengumuman_resmi_dokumen
  FOR ALL TO authenticated
  USING (public.is_admin_or_kepala_sekolah(auth.uid()))
  WITH CHECK (public.is_admin_or_kepala_sekolah(auth.uid()));

-- Berikan izin akses dasar (GRANT)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pengumuman_resmi TO authenticated;
GRANT SELECT ON TABLE public.pengumuman_resmi TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pengumuman_resmi_target_pivot TO authenticated;
GRANT SELECT ON TABLE public.pengumuman_resmi_target_pivot TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pengumuman_resmi_dokumen TO authenticated;
GRANT SELECT ON TABLE public.pengumuman_resmi_dokumen TO anon;
