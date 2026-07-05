-- ============================================================
-- TAHAP 4: PENGAKTIFAN KEAMANAN DATABASE KETAT (RLS POLICIES)
-- Jalankan ini di Supabase SQL Editor SETELAH website versi baru dideploy.
-- Perintah ini akan mengunci akses data dari siswa iseng/anonim.
-- ============================================================

-- Pastikan RLS Aktif pada tabel-tabel sensitif
ALTER TABLE public.siswa_permanent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.akun_pengguna ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nilai_siswa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presensi_harian ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guidance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_records ENABLE ROW LEVEL SECURITY;

-- Bersihkan policy lama jika ada
DROP POLICY IF EXISTS "Akses siswa_permanent" ON public.siswa_permanent;
DROP POLICY IF EXISTS "Akses akun_pengguna" ON public.akun_pengguna;
DROP POLICY IF EXISTS "Akses nilai_siswa" ON public.nilai_siswa;
DROP POLICY IF EXISTS "Akses presensi_harian" ON public.presensi_harian;
DROP POLICY IF EXISTS "Akses guidance_logs" ON public.guidance_logs;
DROP POLICY IF EXISTS "Akses student_points" ON public.student_points;
DROP POLICY IF EXISTS "Akses point_records" ON public.point_records;


-- ==========================================
-- 1. POLICIES UNTUK: siswa_permanent
-- ==========================================
CREATE POLICY "Akses siswa_permanent" ON public.siswa_permanent
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    -- Admin & Guru memiliki akses penuh membaca data
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
    OR
    -- Siswa & Orang Tua hanya bisa membaca data diri sendiri berdasarkan NISN
    (
      (auth.jwt() -> 'user_metadata' ->> 'role') IN ('murid', 'orang_tua')
      AND 
      nisn = (auth.jwt() -> 'user_metadata' ->> 'foreign_id')
    )
  )
  WITH CHECK (
    -- Hanya Admin & Guru yang bisa mengedit/menambah data
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
  );


-- ==========================================
-- 2. POLICIES UNTUK: akun_pengguna
-- ==========================================
CREATE POLICY "Akses akun_pengguna" ON public.akun_pengguna
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    -- Admin memiliki akses penuh
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    OR
    -- User biasa hanya bisa membaca data akun miliknya sendiri
    id = auth.uid()
  )
  WITH CHECK (
    -- Hanya Admin yang bisa memodifikasi akun pengguna
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );


-- ==========================================
-- 3. POLICIES UNTUK: nilai_siswa
-- ==========================================
CREATE POLICY "Akses nilai_siswa" ON public.nilai_siswa
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    -- Admin & Guru bisa mengelola semua nilai
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
    OR
    -- Siswa & Orang Tua hanya bisa melihat nilai miliknya sendiri
    siswa_nisn = (auth.jwt() -> 'user_metadata' ->> 'foreign_id')
  )
  WITH CHECK (
    -- Hanya Admin & Guru yang bisa mengedit/menambah nilai
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
  );


-- ==========================================
-- 4. POLICIES UNTUK: presensi_harian
-- ==========================================
CREATE POLICY "Akses presensi_harian" ON public.presensi_harian
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    -- Admin & Guru bisa melihat semua presensi
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
    OR
    -- Siswa & Orang Tua hanya bisa melihat presensi miliknya sendiri
    siswa_nisn = (auth.jwt() -> 'user_metadata' ->> 'foreign_id')
  )
  WITH CHECK (
    -- Admin & Guru bisa mengedit/menambah presensi
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
    OR
    -- Siswa bisa melakukan presensi mandiri (INSERT) untuk dirinya sendiri
    (
      (auth.jwt() -> 'user_metadata' ->> 'role') = 'murid'
      AND
      siswa_nisn = (auth.jwt() -> 'user_metadata' ->> 'foreign_id')
    )
  );


-- ==========================================
-- 5. POLICIES UNTUK: guidance_logs (Bimbingan Konseling)
-- ==========================================
CREATE POLICY "Akses guidance_logs" ON public.guidance_logs
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    -- Admin & Guru (terutama BK) bisa membaca logs
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
    OR
    -- Siswa & Orang Tua hanya bisa melihat log miliknya sendiri
    nisn = (auth.jwt() -> 'user_metadata' ->> 'foreign_id')
  )
  WITH CHECK (
    -- Hanya Admin & Guru BK yang bisa membuat/mengedit log bimbingan
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
  );


-- ==========================================
-- 6. POLICIES UNTUK: student_points & point_records
-- ==========================================
CREATE POLICY "Akses student_points" ON public.student_points
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
    OR
    nisn = (auth.jwt() -> 'user_metadata' ->> 'foreign_id')
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
  );

CREATE POLICY "Akses point_records" ON public.point_records
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
    OR
    nisn = (auth.jwt() -> 'user_metadata' ->> 'foreign_id')
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
  );
