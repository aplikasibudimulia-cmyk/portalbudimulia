-- ============================================================
-- SQL DDL & SEED: FITUR PROGRAM SEKOLAH (eBudiMulia)
-- Jalankan skrip ini di Supabase SQL Editor
-- ============================================================

BEGIN;

-- 1. Master Kategori
CREATE TABLE IF NOT EXISTS public.program_sekolah_kategori (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama varchar(100) UNIQUE NOT NULL,
  warna varchar(50) DEFAULT '#6b7280' -- Default Gray
);

-- 2. Master Target Peserta
CREATE TABLE IF NOT EXISTS public.program_sekolah_target_peserta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama varchar(100) UNIQUE NOT NULL
);

-- 3. Master Lokasi
CREATE TABLE IF NOT EXISTS public.program_sekolah_lokasi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama varchar(255) UNIQUE NOT NULL
);

-- 4. Tabel Utama Program Sekolah (Hanya menyimpan tanggal saja, tanpa jam/timezone)
CREATE TABLE IF NOT EXISTS public.program_sekolah (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama varchar(255) NOT NULL,
  deskripsi text,
  tanggal_mulai date NOT NULL,
  tanggal_selesai date NOT NULL,
  lokasi_id uuid REFERENCES public.program_sekolah_lokasi(id) ON DELETE SET NULL,
  estimasi_anggaran numeric(15, 2) DEFAULT 0.00,
  status varchar(50) DEFAULT 'Direncanakan', -- Direncanakan, Disetujui, Berjalan, Selesai, Dibatalkan
  visibilitas varchar(50) DEFAULT 'internal', -- publik, internal
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT chk_dates CHECK (tanggal_selesai >= tanggal_mulai)
);

-- 5. Pivot Kategori (Many-to-Many)
CREATE TABLE IF NOT EXISTS public.program_sekolah_kategori_pivot (
  program_id uuid REFERENCES public.program_sekolah(id) ON DELETE CASCADE,
  kategori_id uuid REFERENCES public.program_sekolah_kategori(id) ON DELETE CASCADE,
  PRIMARY KEY (program_id, kategori_id)
);

-- 6. Pivot PIC Guru (Many-to-Many)
CREATE TABLE IF NOT EXISTS public.program_sekolah_pic_pivot (
  program_id uuid REFERENCES public.program_sekolah(id) ON DELETE CASCADE,
  guru_id uuid REFERENCES public.guru(id) ON DELETE CASCADE,
  PRIMARY KEY (program_id, guru_id)
);

-- 7. Pivot Target Peserta (Many-to-Many)
CREATE TABLE IF NOT EXISTS public.program_sekolah_target_pivot (
  program_id uuid REFERENCES public.program_sekolah(id) ON DELETE CASCADE,
  target_id uuid REFERENCES public.program_sekolah_target_peserta(id) ON DELETE CASCADE,
  PRIMARY KEY (program_id, target_id)
);

-- 8. Lampiran Dokumen Pendukung
CREATE TABLE IF NOT EXISTS public.program_sekolah_dokumen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid REFERENCES public.program_sekolah(id) ON DELETE CASCADE,
  file_name varchar(255) NOT NULL,
  file_url text NOT NULL,
  uploaded_at timestamptz DEFAULT now()
);

-- 9. Laporan Pelaksanaan Kegiatan (1-to-1)
CREATE TABLE IF NOT EXISTS public.program_sekolah_laporan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid UNIQUE REFERENCES public.program_sekolah(id) ON DELETE CASCADE,
  ringkasan text NOT NULL,
  jumlah_peserta_aktual integer DEFAULT 0,
  catatan_evaluasi text,
  created_at timestamptz DEFAULT now()
);

-- 10. Foto Dokumentasi Laporan (Many-to-1)
CREATE TABLE IF NOT EXISTS public.program_sekolah_laporan_foto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  laporan_id uuid REFERENCES public.program_sekolah_laporan(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  uploaded_at timestamptz DEFAULT now()
);

-- ============================================================
-- SEED DATA: Kategori Bawaan & Target Peserta Bawaan
-- ============================================================

-- Tambahkan role Kepala Sekolah jika belum ada di database
INSERT INTO public.roles (id, nama, deskripsi)
VALUES ('7b1897d1-0fcd-4001-92b0-8f9f8f4a1fbf', 'Kepala Sekolah', 'Role untuk Kepala Sekolah yang mengelola program tahunan sekolah')
ON CONFLICT (id) DO NOTHING;

-- Kategori dengan warna sesuai request user
INSERT INTO public.program_sekolah_kategori (nama, warna) VALUES
  ('Acara', '#3b82f6'),                  -- Biru
  ('Ujian', '#f97316'),                  -- Orange
  ('Libur', '#ef4444'),                  -- Merah
  ('Lainnya', '#6b7280'),                -- Abu-abu
  ('Program Kepala Sekolah', '#10b981')   -- Hijau
ON CONFLICT (nama) DO UPDATE SET warna = EXCLUDED.warna;

-- Target Peserta Bawaan
INSERT INTO public.program_sekolah_target_peserta (nama) VALUES
  ('Semua Siswa'),
  ('Guru'),
  ('Orang Tua')
ON CONFLICT (nama) DO NOTHING;

-- ============================================================
-- SECURITY: FUNGSI DETEKSI ROLE & KEBIJAKAN RLS
-- ============================================================

-- Fungsi pembantu mendeteksi Kepala Sekolah atau Admin secara aman (Mendukung JWT Claim & Fallback langsung ke database)
CREATE OR REPLACE FUNCTION public.is_admin_or_kepala_sekolah(user_id uuid)
RETURNS boolean AS $$
DECLARE
  v_role text;
  v_foreign_id uuid;
BEGIN
  -- 1. Pengecekan Cepat: Jika JWT App Metadata role adalah admin, langsung izinkan
  IF (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' THEN
    RETURN true;
  END IF;

  -- 2. Cari role dan foreign_id dari database public.akun_pengguna sebagai fallback
  SELECT 
    role, 
    CASE WHEN foreign_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' 
         THEN foreign_id::uuid 
         ELSE NULL 
    END
  INTO v_role, v_foreign_id
  FROM public.akun_pengguna 
  WHERE id = user_id;

  -- 3. Jika di DB terdaftar sebagai admin / superadmin (case-insensitive)
  IF LOWER(v_role) IN ('admin', 'superadmin') THEN
    RETURN true;
  END IF;

  -- 4. Cek apakah memiliki role 'Kepala Sekolah' di tabel role
  IF v_foreign_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.guru_role gr
      JOIN public.roles r ON r.id = gr.role_id
      WHERE gr.guru_id = v_foreign_id
        AND LOWER(r.nama) = 'kepala sekolah'
    );
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aktifkan RLS
ALTER TABLE public.program_sekolah ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_sekolah_kategori_pivot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_sekolah_pic_pivot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_sekolah_target_pivot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_sekolah_dokumen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_sekolah_laporan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_sekolah_laporan_foto ENABLE ROW LEVEL SECURITY;

-- Hapus policy lama jika sudah ada (mencegah error duplikasi saat dijalankan ulang)
DROP POLICY IF EXISTS "Akses Baca program_sekolah" ON public.program_sekolah;
DROP POLICY IF EXISTS "Akses Baca pivot_kategori" ON public.program_sekolah_kategori_pivot;
DROP POLICY IF EXISTS "Akses Baca pivot_pic" ON public.program_sekolah_pic_pivot;
DROP POLICY IF EXISTS "Akses Baca pivot_target" ON public.program_sekolah_target_pivot;
DROP POLICY IF EXISTS "Akses Baca dokumen" ON public.program_sekolah_dokumen;
DROP POLICY IF EXISTS "Akses Baca laporan" ON public.program_sekolah_laporan;
DROP POLICY IF EXISTS "Akses Baca laporan_foto" ON public.program_sekolah_laporan_foto;

DROP POLICY IF EXISTS "Modifikasi program_sekolah" ON public.program_sekolah;
DROP POLICY IF EXISTS "Modifikasi pivot_kategori" ON public.program_sekolah_kategori_pivot;
DROP POLICY IF EXISTS "Modifikasi pivot_pic" ON public.program_sekolah_pic_pivot;
DROP POLICY IF EXISTS "Modifikasi pivot_target" ON public.program_sekolah_target_pivot;
DROP POLICY IF EXISTS "Modifikasi dokumen" ON public.program_sekolah_dokumen;
DROP POLICY IF EXISTS "Modifikasi laporan" ON public.program_sekolah_laporan;
DROP POLICY IF EXISTS "Modifikasi laporan_foto" ON public.program_sekolah_laporan_foto;

DROP POLICY IF EXISTS "Baca master_kategori" ON public.program_sekolah_kategori;
DROP POLICY IF EXISTS "Baca master_lokasi" ON public.program_sekolah_lokasi;
DROP POLICY IF EXISTS "Baca master_target" ON public.program_sekolah_target_peserta;

DROP POLICY IF EXISTS "Tulis master_kategori" ON public.program_sekolah_kategori;
DROP POLICY IF EXISTS "Tulis master_lokasi" ON public.program_sekolah_lokasi;
DROP POLICY IF EXISTS "Tulis master_target" ON public.program_sekolah_target_peserta;

DROP POLICY IF EXISTS "Baca Berkas Program Sekolah" ON storage.objects;
DROP POLICY IF EXISTS "Unggah & Kelola Berkas Program Sekolah" ON storage.objects;

-- Izinkan SELECT ke semua tabel program bagi user sekolah yang login (termasuk role kepala_sekolah)
CREATE POLICY "Akses Baca program_sekolah" ON public.program_sekolah
  FOR SELECT TO authenticated USING (
    visibilitas = 'publik' OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket', 'kepala_sekolah')
  );

CREATE POLICY "Akses Baca pivot_kategori" ON public.program_sekolah_kategori_pivot FOR SELECT TO authenticated USING (true);
CREATE POLICY "Akses Baca pivot_pic" ON public.program_sekolah_pic_pivot FOR SELECT TO authenticated USING (true);
CREATE POLICY "Akses Baca pivot_target" ON public.program_sekolah_target_pivot FOR SELECT TO authenticated USING (true);
CREATE POLICY "Akses Baca dokumen" ON public.program_sekolah_dokumen FOR SELECT TO authenticated USING (true);
CREATE POLICY "Akses Baca laporan" ON public.program_sekolah_laporan FOR SELECT TO authenticated USING (true);
CREATE POLICY "Akses Baca laporan_foto" ON public.program_sekolah_laporan_foto FOR SELECT TO authenticated USING (true);

-- Hanya Kepala Sekolah & Admin yang bisa INSERT, UPDATE, DELETE (Modifikasi)
CREATE POLICY "Modifikasi program_sekolah" ON public.program_sekolah
  FOR ALL TO authenticated
  USING ( public.is_admin_or_kepala_sekolah(auth.uid()) )
  WITH CHECK ( public.is_admin_or_kepala_sekolah(auth.uid()) );

CREATE POLICY "Modifikasi pivot_kategori" ON public.program_sekolah_kategori_pivot
  FOR ALL TO authenticated 
  USING ( public.is_admin_or_kepala_sekolah(auth.uid()) ) 
  WITH CHECK ( public.is_admin_or_kepala_sekolah(auth.uid()) );

CREATE POLICY "Modifikasi pivot_pic" ON public.program_sekolah_pic_pivot
  FOR ALL TO authenticated 
  USING ( public.is_admin_or_kepala_sekolah(auth.uid()) ) 
  WITH CHECK ( public.is_admin_or_kepala_sekolah(auth.uid()) );

CREATE POLICY "Modifikasi pivot_target" ON public.program_sekolah_target_pivot
  FOR ALL TO authenticated 
  USING ( public.is_admin_or_kepala_sekolah(auth.uid()) ) 
  WITH CHECK ( public.is_admin_or_kepala_sekolah(auth.uid()) );

CREATE POLICY "Modifikasi dokumen" ON public.program_sekolah_dokumen
  FOR ALL TO authenticated 
  USING ( public.is_admin_or_kepala_sekolah(auth.uid()) ) 
  WITH CHECK ( public.is_admin_or_kepala_sekolah(auth.uid()) );

CREATE POLICY "Modifikasi laporan" ON public.program_sekolah_laporan
  FOR ALL TO authenticated 
  USING ( public.is_admin_or_kepala_sekolah(auth.uid()) ) 
  WITH CHECK ( public.is_admin_or_kepala_sekolah(auth.uid()) );

CREATE POLICY "Modifikasi laporan_foto" ON public.program_sekolah_laporan_foto
  FOR ALL TO authenticated 
  USING ( public.is_admin_or_kepala_sekolah(auth.uid()) ) 
  WITH CHECK ( public.is_admin_or_kepala_sekolah(auth.uid()) );

-- Tabel Master Tag (Kategori, Lokasi, Target Peserta) boleh dibaca dan dimodifikasi (ditambah tag baru) oleh Kepala Sekolah & Admin
ALTER TABLE public.program_sekolah_kategori ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_sekolah_lokasi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_sekolah_target_peserta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Baca master_kategori" ON public.program_sekolah_kategori FOR SELECT TO authenticated USING (true);
CREATE POLICY "Baca master_lokasi" ON public.program_sekolah_lokasi FOR SELECT TO authenticated USING (true);
CREATE POLICY "Baca master_target" ON public.program_sekolah_target_peserta FOR SELECT TO authenticated USING (true);

CREATE POLICY "Tulis master_kategori" ON public.program_sekolah_kategori 
  FOR ALL TO authenticated 
  USING ( public.is_admin_or_kepala_sekolah(auth.uid()) ) 
  WITH CHECK ( public.is_admin_or_kepala_sekolah(auth.uid()) );

CREATE POLICY "Tulis master_lokasi" ON public.program_sekolah_lokasi 
  FOR ALL TO authenticated 
  USING ( public.is_admin_or_kepala_sekolah(auth.uid()) ) 
  WITH CHECK ( public.is_admin_or_kepala_sekolah(auth.uid()) );

CREATE POLICY "Tulis master_target" ON public.program_sekolah_target_peserta 
  FOR ALL TO authenticated 
  USING ( public.is_admin_or_kepala_sekolah(auth.uid()) ) 
  WITH CHECK ( public.is_admin_or_kepala_sekolah(auth.uid()) );


-- ============================================================
-- AUTOMATION: TRIGGER UNTUK AUTO-UPDATE KOLOM updated_at
-- ============================================================

-- Fungsi Trigger updated_at (Buat jika belum ada di database)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Pasang trigger pada tabel program_sekolah
CREATE OR REPLACE TRIGGER tr_program_sekolah_updated_at
  BEFORE UPDATE ON public.program_sekolah
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- STORAGE: MEMBUAT BUCKET & KEBIJAKAN STORAGE RLS
-- ============================================================

-- Buat bucket baru khusus untuk file-file program sekolah
INSERT INTO storage.buckets (id, name, public)
VALUES ('program_sekolah_assets', 'program_sekolah_assets', false)
ON CONFLICT (id) DO NOTHING;

-- Kebijakan akses file di bucket 'program_sekolah_assets'
CREATE POLICY "Baca Berkas Program Sekolah" ON storage.objects
  FOR SELECT TO authenticated
  USING ( bucket_id = 'program_sekolah_assets' );

CREATE POLICY "Unggah & Kelola Berkas Program Sekolah" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'program_sekolah_assets'
    AND public.is_admin_or_kepala_sekolah(auth.uid())
  )
  WITH CHECK (
    bucket_id = 'program_sekolah_assets'
    AND public.is_admin_or_kepala_sekolah(auth.uid())
  );

-- ============================================================
-- PRIVILEGES: MEMBERIKAN IZIN AKSES TABEL (GRANT)
-- ============================================================

-- Berikan izin akses penuh ke user terotentikasi & service_role, dan izin baca ke publik/anon
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.program_sekolah TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.program_sekolah TO service_role;
GRANT SELECT ON TABLE public.program_sekolah TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.program_sekolah_kategori TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.program_sekolah_kategori TO service_role;
GRANT SELECT ON TABLE public.program_sekolah_kategori TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.program_sekolah_lokasi TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.program_sekolah_lokasi TO service_role;
GRANT SELECT ON TABLE public.program_sekolah_lokasi TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.program_sekolah_target_peserta TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.program_sekolah_target_peserta TO service_role;
GRANT SELECT ON TABLE public.program_sekolah_target_peserta TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.program_sekolah_kategori_pivot TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.program_sekolah_kategori_pivot TO service_role;
GRANT SELECT ON TABLE public.program_sekolah_kategori_pivot TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.program_sekolah_pic_pivot TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.program_sekolah_pic_pivot TO service_role;
GRANT SELECT ON TABLE public.program_sekolah_pic_pivot TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.program_sekolah_target_pivot TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.program_sekolah_target_pivot TO service_role;
GRANT SELECT ON TABLE public.program_sekolah_target_pivot TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.program_sekolah_dokumen TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.program_sekolah_dokumen TO service_role;
GRANT SELECT ON TABLE public.program_sekolah_dokumen TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.program_sekolah_laporan TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.program_sekolah_laporan TO service_role;
GRANT SELECT ON TABLE public.program_sekolah_laporan TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.program_sekolah_laporan_foto TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.program_sekolah_laporan_foto TO service_role;
GRANT SELECT ON TABLE public.program_sekolah_laporan_foto TO anon;

COMMIT;
