-- ==============================================================================
-- 🛡️ PERBAIKAN AKSES PETUGAS PIKET & VIEW SISWA_LENGKAP
-- Mengizinkan Piket/Guru Membaca Daftar Siswa Tanpa Membocorkan Password Siswa/Guru
-- ==============================================================================

-- 1. Cabut akses menyeluruh agar role 'anon' tidak bisa melakukan SELECT * ke siswa_permanent
REVOKE ALL ON public.siswa_permanent FROM anon;

-- 2. Berikan izin SELECT HANYA pada kolom-kolom biodata yang valid ke anon
-- PERHATIKAN: Kolom 'kode_akses' dan 'ortu_password' TIDAK DIBERIKAN!
-- Sehingga jika ada yang mencoba curl /siswa_permanent?select=* atau select=kode_akses,
-- PostgreSQL akan tetap menolaknya dengan pesan: "permission denied for column kode_akses"
GRANT SELECT (
  nisn, nipd, nama_lengkap, email_aktif, no_whatsapp, tahun_lulus, 
  created_at, telegram_ortu, line_user_id, tempat_lahir, tanggal_lahir, 
  jenis_kelamin, alamat, kelurahan, kecamatan, kota, 
  no_hp, kontak_ortu, nama_ortu, no_hp_ortu, email_ortu, ortu_username, tinggal_bersama
) ON public.siswa_permanent TO anon;

-- Berikan akses penuh ke role authenticated (Staf/Guru yang login) dan service_role
GRANT ALL ON public.siswa_permanent TO authenticated, service_role;

-- 3. Atur RLS Policy pada siswa_permanent
ALTER TABLE public.siswa_permanent ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Akses siswa_permanent" ON public.siswa_permanent;
DROP POLICY IF EXISTS "allow_read_siswa_permanent" ON public.siswa_permanent;
DROP POLICY IF EXISTS "allow_all_siswa_permanent" ON public.siswa_permanent;
DROP POLICY IF EXISTS "allow_read_siswa_permanent_public" ON public.siswa_permanent;
DROP POLICY IF EXISTS "staff_all_siswa_permanent" ON public.siswa_permanent;

CREATE POLICY "allow_read_siswa_permanent_public"
  ON public.siswa_permanent
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "staff_all_siswa_permanent"
  ON public.siswa_permanent
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 4. Buka akses VIEW siswa_lengkap agar Petugas Piket & Presensi TV bisa memuat daftar siswa
GRANT SELECT ON public.enrollment TO anon, authenticated, service_role;
GRANT SELECT ON public.tahun_ajaran TO anon, authenticated, service_role;
GRANT SELECT ON public.siswa_lengkap TO anon, authenticated, service_role;

DO $$ 
BEGIN
  EXECUTE 'ALTER VIEW public.siswa_lengkap SET (security_invoker = false)';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 5. Kunci total tabel point_records agar siswa nakal tidak bisa menambah/menghapus poin via curl
ALTER TABLE public.point_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_point_records" ON public.point_records;
DROP POLICY IF EXISTS "anon_rw_point_records" ON public.point_records;
DROP POLICY IF EXISTS "Akses point_records" ON public.point_records;
DROP POLICY IF EXISTS "allow_read_point_records_public" ON public.point_records;
DROP POLICY IF EXISTS "staff_write_point_records" ON public.point_records;

-- Publik hanya boleh membaca (SELECT) riwayat poin di dashboard
CREATE POLICY "allow_read_point_records_public"
  ON public.point_records
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Hanya guru/staf terotentikasi yang boleh MENAMBAH, MENGUBAH, atau MENGHAPUS poin
CREATE POLICY "staff_write_point_records"
  ON public.point_records
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 6. Reload schema cache Supabase
NOTIFY pgrst, 'reload schema';
