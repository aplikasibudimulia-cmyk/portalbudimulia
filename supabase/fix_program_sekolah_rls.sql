-- =========================================================================
-- SOLUSI PERBAIKAN RLS POLICY UNTUK PROGRAM SEKOLAH / KALENDER AKADEMIK
-- =========================================================================
-- Jalankan skrip SQL ini di Supabase Dashboard -> SQL Editor
-- Skrip ini membuka akses baca (SELECT) untuk publik (anon & authenticated)
-- agar guru piket yang login lewat penyamaran (impersonate) tetap dapat membaca
-- data master kategori, lokasi, dan daftar kegiatan sekolah secara lancar.

-- 1. Tabel Kategori Program Sekolah
DROP POLICY IF EXISTS "Baca master_kategori" ON public.program_sekolah_kategori;
CREATE POLICY "Baca master_kategori" 
  ON public.program_sekolah_kategori 
  FOR SELECT 
  USING (true); -- Membuka akses baca untuk siapa saja (anon & authenticated)

-- 2. Tabel Lokasi Program Sekolah
DROP POLICY IF EXISTS "Baca master_lokasi" ON public.program_sekolah_lokasi;
CREATE POLICY "Baca master_lokasi" 
  ON public.program_sekolah_lokasi 
  FOR SELECT 
  USING (true);

-- 3. Tabel Target Peserta
DROP POLICY IF EXISTS "Baca master_target" ON public.program_sekolah_target_peserta;
CREATE POLICY "Baca master_target" 
  ON public.program_sekolah_target_peserta 
  FOR SELECT 
  USING (true);

-- 4. Tabel Utama Program Sekolah
DROP POLICY IF EXISTS "Akses Baca program_sekolah" ON public.program_sekolah;
CREATE POLICY "Akses Baca program_sekolah" 
  ON public.program_sekolah 
  FOR SELECT 
  USING (true);

-- 5. Tabel Pivot Kategori
DROP POLICY IF EXISTS "Akses Baca pivot_kategori" ON public.program_sekolah_kategori_pivot;
CREATE POLICY "Akses Baca pivot_kategori" 
  ON public.program_sekolah_kategori_pivot 
  FOR SELECT 
  USING (true);

-- 6. Tabel Pivot Target
DROP POLICY IF EXISTS "Akses Baca pivot_target" ON public.program_sekolah_target_pivot;
CREATE POLICY "Akses Baca pivot_target" 
  ON public.program_sekolah_target_pivot 
  FOR SELECT 
  USING (true);

-- 7. Tabel Pivot PIC Guru
DROP POLICY IF EXISTS "Akses Baca pivot_pic" ON public.program_sekolah_pic_pivot;
CREATE POLICY "Akses Baca pivot_pic" 
  ON public.program_sekolah_pic_pivot 
  FOR SELECT 
  USING (true);

-- 8. Menambahkan role "Piket" dan "Guru" ke izin modifikasi jika diperlukan
-- Agar petugas piket/guru yang memiliki akses menu diizinkan menyimpan data ke database.
CREATE OR REPLACE FUNCTION public.is_admin_or_kepala_sekolah(user_id uuid)
RETURNS boolean AS $$
DECLARE
  v_role text;
  v_foreign_id uuid;
BEGIN
  -- 1. Jika JWT role adalah admin, langsung izinkan
  IF (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' THEN
    RETURN true;
  END IF;

  -- 2. Ambil data role dari public.akun_pengguna
  SELECT 
    role, 
    foreign_id
  INTO
    v_role,
    v_foreign_id
  FROM public.akun_pengguna
  WHERE id = user_id;

  IF v_role = 'admin' THEN
    RETURN true;
  END IF;

  -- 3. Cek apakah user memiliki role Kepala Sekolah ATAU Piket di guru_role
  IF v_role = 'guru' AND v_foreign_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 
      FROM public.guru_role gr
      JOIN public.roles r ON gr.role_id = r.id
      WHERE gr.guru_id = v_foreign_id AND r.nama IN ('Kepala Sekolah', 'Piket')
    ) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
