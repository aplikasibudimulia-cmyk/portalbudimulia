-- =========================================================================
-- SKRIP PERBAIKAN RLS & SINKRONISASI TOTAL POIN SISWA (EBUDIMULIA)
-- =========================================================================

-- 1. Berikan hak akses penuh (RLS) pada tabel point_records
ALTER TABLE public.point_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_point_records" ON public.point_records;
DROP POLICY IF EXISTS "anon_rw_point_records" ON public.point_records;
DROP POLICY IF EXISTS "Akses point_records" ON public.point_records;
CREATE POLICY "allow_all_point_records"
  ON public.point_records
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 2. Berikan hak akses penuh (RLS) pada tabel student_points
ALTER TABLE public.student_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_student_points" ON public.student_points;
DROP POLICY IF EXISTS "anon_rw_student_points" ON public.student_points;
DROP POLICY IF EXISTS "Akses student_points" ON public.student_points;
CREATE POLICY "allow_all_student_points"
  ON public.student_points
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 3. Berikan hak akses penuh (RLS) pada tabel pengajuan_poin_positif & ban
ALTER TABLE public.pengajuan_poin_positif ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_pengajuan_poin_positif" ON public.pengajuan_poin_positif;
CREATE POLICY "allow_all_pengajuan_poin_positif"
  ON public.pengajuan_poin_positif
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pengajuan_poin_ban') THEN
    EXECUTE 'ALTER TABLE public.pengajuan_poin_ban ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "allow_all_pengajuan_poin_ban" ON public.pengajuan_poin_ban';
    EXECUTE 'CREATE POLICY "allow_all_pengajuan_poin_ban" ON public.pengajuan_poin_ban FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- 4. Sinkronisasi Ulang & Pulihkan Semua Poin dari Pengajuan yang Sudah Disetujui
INSERT INTO public.point_records (
    nisn,
    nama_siswa,
    kelas,
    tahun_ajaran_id,
    semester,
    catalog_id,
    kode_katalog,
    jenis,
    poin_diberikan,
    keterangan,
    dicatat_oleh,
    tanggal,
    created_at
)
SELECT 
    p.nisn,
    p.nama_siswa,
    p.kelas,
    p.tahun_ajaran_id,
    p.semester,
    p.catalog_id,
    p.kode_katalog,
    p.jenis,
    p.poin_diajukan,
    '[Pengajuan Mandiri] ' || COALESCE(p.alasan, 'Kegiatan Positif'),
    COALESCE(p.reviewed_by, 'Admin'),
    COALESCE(p.tanggal_kegiatan, p.created_at::date, CURRENT_DATE),
    COALESCE(p.reviewed_at, p.created_at)
FROM public.pengajuan_poin_positif p
WHERE p.status = 'disetujui'
  AND NOT EXISTS (
      SELECT 1 FROM public.point_records pr 
      WHERE pr.nisn = p.nisn 
        AND pr.tahun_ajaran_id = p.tahun_ajaran_id 
        AND pr.semester = p.semester 
        AND pr.catalog_id = p.catalog_id
        AND pr.keterangan LIKE '[Pengajuan Mandiri]%'
  );

-- 5. Hitung Ulang & Perbarui Rekap Poin Total Siswa di student_points
INSERT INTO public.student_points (nisn, tahun_ajaran_id, semester, total_poin, poin_default, updated_at)
SELECT 
    p.nisn,
    p.tahun_ajaran_id,
    p.semester,
    100 + COALESCE(SUM(CASE WHEN p.poin_diberikan IS NOT NULL THEN p.poin_diberikan ELSE 0 END), 0) AS total_poin,
    100 AS poin_default,
    NOW() AS updated_at
FROM public.point_records p
GROUP BY p.nisn, p.tahun_ajaran_id, p.semester
ON CONFLICT (nisn, tahun_ajaran_id, semester)
DO UPDATE SET 
    total_poin = EXCLUDED.total_poin,
    updated_at = NOW();
