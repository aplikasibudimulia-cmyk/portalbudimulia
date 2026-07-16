-- ============================================================
-- ⚠️  EMERGENCY SECURITY FIX — JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================
-- Berdasarkan daftar tabel aktual dari database.
-- Jalankan SELURUH file ini sekaligus (Ctrl+A → Run).
-- ============================================================


-- ============================================================
-- BAGIAN 1: AKTIFKAN RLS DI SEMUA TABEL
-- ============================================================

ALTER TABLE activity_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE akun_pengguna           ENABLE ROW LEVEL SECURITY;
ALTER TABLE berita_sekolah          ENABLE ROW LEVEL SECURITY;
ALTER TABLE berkas_pengumuman       ENABLE ROW LEVEL SECURITY;
ALTER TABLE dokumen                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE dokumen_type            ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment              ENABLE ROW LEVEL SECURITY;
ALTER TABLE foto                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE guidance_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE guidance_stages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE guru                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE guru_bk                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE guru_kelas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE guru_mapel              ENABLE ROW LEVEL SECURITY;
ALTER TABLE guru_role               ENABLE ROW LEVEL SECURITY;
ALTER TABLE impersonate_tokens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE jenis_pengumuman        ENABLE ROW LEVEL SECURITY;
ALTER TABLE kumpulan_dokumen        ENABLE ROW LEVEL SECURITY;
ALTER TABLE mata_pelajaran          ENABLE ROW LEVEL SECURITY;
ALTER TABLE nilai_akhir_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE nilai_komponen          ENABLE ROW LEVEL SECURITY;
ALTER TABLE nilai_siswa             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifikasi              ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifikasi_read         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pengaturan              ENABLE ROW LEVEL SECURITY;
ALTER TABLE pengaturan_sekolah      ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_catalog           ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_records           ENABLE ROW LEVEL SECURITY;
ALTER TABLE presensi_harian         ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions_ortu ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_tokens               ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_fitur              ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_regulations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE semester                ENABLE ROW LEVEL SECURITY;
ALTER TABLE sesi_presensi           ENABLE ROW LEVEL SECURITY;
ALTER TABLE siswa_backup            ENABLE ROW LEVEL SECURITY;
ALTER TABLE siswa_permanent         ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_points          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tahun_ajaran            ENABLE ROW LEVEL SECURITY;
ALTER TABLE guru_kode_ta            ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- BAGIAN 2: HAPUS SEMUA POLICY LAMA YANG TERLALU PERMISIF
-- ============================================================

DO $cleanup$
DECLARE
  tbl TEXT;
  pol TEXT;
  old_policies TEXT[] := ARRAY[
    'Allow anon select', 'Allow all select', 'Enable read access for all',
    'Public read', 'anon_read', 'allow_select', 'Allow all inserts',
    'Enable insert for all users', 'Allow anon insert'
  ];
  tables TEXT[] := ARRAY[
    'activity_log','akun_pengguna','berita_sekolah','berkas_pengumuman',
    'dokumen','dokumen_type','enrollment','foto','guidance_logs',
    'guidance_stages','guru','guru_bk','guru_kelas','guru_mapel','guru_role',
    'impersonate_tokens','jenis_pengumuman','kumpulan_dokumen','mata_pelajaran',
    'nilai_akhir_config','nilai_komponen','nilai_siswa','notifikasi','notifikasi_read',
    'pengaturan','pengaturan_sekolah','point_catalog','point_records','presensi_harian',
    'push_subscriptions','push_subscriptions_ortu','qr_tokens','role_fitur','roles',
    'school_regulations','semester','sesi_presensi','siswa_backup','siswa_permanent',
    'student_points','tahun_ajaran','guru_kode_ta'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    FOREACH pol IN ARRAY old_policies LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol, tbl);
    END LOOP;
  END LOOP;
END $cleanup$;


-- ============================================================
-- BAGIAN 2.5: HAPUS POLICY BARU (AGAR SCRIPT BISA DIULANG)
-- ============================================================

DO $drop_new$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname IN (
        'service_only_siswa_permanent', 'service_only_siswa_backup', 'anon_read_akun',
        'service_write_akun', 'authenticated_read_guru', 'service_write_guru',
        'authenticated_read_guru_bk', 'service_write_guru_bk', 'authenticated_read_guru_kelas',
        'service_write_guru_kelas', 'authenticated_read_guru_mapel', 'service_write_guru_mapel',
        'authenticated_read_guru_role', 'service_write_guru_role', 'authenticated_read_enrollment',
        'service_write_enrollment', 'authenticated_rw_presensi_harian', 'service_rw_presensi_harian',
        'authenticated_read_sesi', 'service_write_sesi', 'authenticated_rw_qr_tokens',
        'service_rw_qr_tokens', 'service_only_impersonate', 'authenticated_read_nilai_siswa',
        'service_write_nilai_siswa', 'authenticated_read_nilai_komponen', 'service_write_nilai_komponen',
        'authenticated_read_nilai_config', 'service_write_nilai_config', 'authenticated_read_student_points',
        'service_write_student_points', 'authenticated_read_point_records', 'service_write_point_records',
        'authenticated_read_point_catalog', 'service_write_point_catalog', 'authenticated_read_guidance_logs',
        'service_write_guidance_logs', 'authenticated_read_guidance_stages', 'service_write_guidance_stages',
        'authenticated_rw_notifikasi', 'service_rw_notifikasi', 'authenticated_rw_notifikasi_read',
        'service_rw_notifikasi_read', 'anon_insert_push', 'authenticated_rw_push', 'service_rw_push',
        'anon_insert_push_ortu', 'authenticated_rw_push_ortu', 'service_rw_push_ortu',
        'authenticated_read_dokumen', 'service_write_dokumen', 'authenticated_read_kumpulan',
        'service_write_kumpulan', 'authenticated_read_berkas', 'service_write_berkas',
        'authenticated_read_foto', 'service_write_foto', 'authenticated_rw_guru_kode_ta',
        'service_write_guru_kode_ta', 'all_insert_activity_log', 'service_read_activity_log',
        'public_read_tahun_ajaran', 'service_write_tahun_ajaran', 'public_read_semester',
        'service_write_semester', 'public_read_roles', 'service_write_roles',
        'public_read_role_fitur', 'service_write_role_fitur', 'public_read_mata_pelajaran',
        'service_write_mata_pelajaran', 'public_read_dokumen_type', 'service_write_dokumen_type',
        'public_read_jenis_pengumuman', 'service_write_jenis_pengumuman', 'public_read_berita',
        'service_write_berita', 'public_read_pengaturan_sekolah', 'service_write_pengaturan_sekolah',
        'public_read_school_regulations', 'service_write_school_regulations',
        'authenticated_read_pengaturan', 'service_write_pengaturan'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $drop_new$;


-- ============================================================
-- BAGIAN 3: BUAT POLICY BARU YANG AMAN PER TABEL
-- ============================================================

-- -------------------------------------------------------
-- siswa_permanent: BLOKIR TOTAL untuk anon
-- (data sensitif: nama, NISN, ortu, dsb.)
-- Hanya service_role (server) yang boleh akses.
-- -------------------------------------------------------
CREATE POLICY "service_only_siswa_permanent"
  ON siswa_permanent FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- siswa_backup: BLOKIR TOTAL untuk anon
-- -------------------------------------------------------
CREATE POLICY "service_only_siswa_backup"
  ON siswa_backup FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- akun_pengguna: anon hanya bisa baca (untuk login),
-- tapi kolom password SUDAH diblokir via GRANT di bawah.
-- -------------------------------------------------------
CREATE POLICY "anon_read_akun"
  ON akun_pengguna FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "service_write_akun"
  ON akun_pengguna FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- guru & tabel terkait: hanya authenticated
-- -------------------------------------------------------
CREATE POLICY "authenticated_read_guru"
  ON guru FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write_guru"
  ON guru FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_guru_bk"
  ON guru_bk FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write_guru_bk"
  ON guru_bk FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_guru_kelas"
  ON guru_kelas FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write_guru_kelas"
  ON guru_kelas FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_guru_mapel"
  ON guru_mapel FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write_guru_mapel"
  ON guru_mapel FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_guru_role"
  ON guru_role FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write_guru_role"
  ON guru_role FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- enrollment: hanya authenticated
-- -------------------------------------------------------
CREATE POLICY "authenticated_read_enrollment"
  ON enrollment FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write_enrollment"
  ON enrollment FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- presensi_harian: hanya authenticated
-- -------------------------------------------------------
CREATE POLICY "authenticated_rw_presensi_harian"
  ON presensi_harian FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_rw_presensi_harian"
  ON presensi_harian FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- sesi_presensi: authenticated baca, service_role tulis
-- -------------------------------------------------------
CREATE POLICY "authenticated_read_sesi"
  ON sesi_presensi FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write_sesi"
  ON sesi_presensi FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- qr_tokens: hanya authenticated
-- -------------------------------------------------------
CREATE POLICY "authenticated_rw_qr_tokens"
  ON qr_tokens FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_rw_qr_tokens"
  ON qr_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- impersonate_tokens: HANYA service_role
-- -------------------------------------------------------
CREATE POLICY "service_only_impersonate"
  ON impersonate_tokens FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- Nilai: hanya authenticated
-- -------------------------------------------------------
CREATE POLICY "authenticated_read_nilai_siswa"
  ON nilai_siswa FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write_nilai_siswa"
  ON nilai_siswa FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_nilai_komponen"
  ON nilai_komponen FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write_nilai_komponen"
  ON nilai_komponen FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_nilai_config"
  ON nilai_akhir_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write_nilai_config"
  ON nilai_akhir_config FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- Poin siswa: hanya authenticated
-- -------------------------------------------------------
CREATE POLICY "authenticated_read_student_points"
  ON student_points FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write_student_points"
  ON student_points FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_point_records"
  ON point_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write_point_records"
  ON point_records FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_point_catalog"
  ON point_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write_point_catalog"
  ON point_catalog FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- Bimbingan: hanya authenticated
-- -------------------------------------------------------
CREATE POLICY "authenticated_read_guidance_logs"
  ON guidance_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write_guidance_logs"
  ON guidance_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_guidance_stages"
  ON guidance_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write_guidance_stages"
  ON guidance_stages FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- Notifikasi: hanya authenticated
-- -------------------------------------------------------
CREATE POLICY "authenticated_rw_notifikasi"
  ON notifikasi FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_rw_notifikasi"
  ON notifikasi FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_rw_notifikasi_read"
  ON notifikasi_read FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_rw_notifikasi_read"
  ON notifikasi_read FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- Push subscriptions: authenticated + anon insert
-- -------------------------------------------------------
CREATE POLICY "anon_insert_push"
  ON push_subscriptions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "authenticated_rw_push"
  ON push_subscriptions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_rw_push"
  ON push_subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "anon_insert_push_ortu"
  ON push_subscriptions_ortu FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "authenticated_rw_push_ortu"
  ON push_subscriptions_ortu FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_rw_push_ortu"
  ON push_subscriptions_ortu FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- Dokumen: authenticated bisa baca
-- -------------------------------------------------------
CREATE POLICY "authenticated_read_dokumen"
  ON dokumen FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write_dokumen"
  ON dokumen FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_kumpulan"
  ON kumpulan_dokumen FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write_kumpulan"
  ON kumpulan_dokumen FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_berkas"
  ON berkas_pengumuman FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write_berkas"
  ON berkas_pengumuman FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- Foto: authenticated bisa baca
-- -------------------------------------------------------
CREATE POLICY "authenticated_read_foto"
  ON foto FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write_foto"
  ON foto FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- Activity log: anon & authenticated bisa insert (audit trail)
-- -------------------------------------------------------
CREATE POLICY "all_insert_activity_log"
  ON activity_log FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "service_read_activity_log"
  ON activity_log FOR SELECT TO service_role USING (true);

-- -------------------------------------------------------
-- Data publik / semi-publik (aman dibaca anon)
-- -------------------------------------------------------
CREATE POLICY "public_read_tahun_ajaran"
  ON tahun_ajaran FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "service_write_tahun_ajaran"
  ON tahun_ajaran FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "public_read_semester"
  ON semester FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "service_write_semester"
  ON semester FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "public_read_roles"
  ON roles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "service_write_roles"
  ON roles FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "public_read_role_fitur"
  ON role_fitur FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "service_write_role_fitur"
  ON role_fitur FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "public_read_mata_pelajaran"
  ON mata_pelajaran FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "service_write_mata_pelajaran"
  ON mata_pelajaran FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "public_read_dokumen_type"
  ON dokumen_type FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "service_write_dokumen_type"
  ON dokumen_type FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "public_read_jenis_pengumuman"
  ON jenis_pengumuman FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "service_write_jenis_pengumuman"
  ON jenis_pengumuman FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "public_read_berita"
  ON berita_sekolah FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "service_write_berita"
  ON berita_sekolah FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "public_read_pengaturan_sekolah"
  ON pengaturan_sekolah FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "service_write_pengaturan_sekolah"
  ON pengaturan_sekolah FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "public_read_school_regulations"
  ON school_regulations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "service_write_school_regulations"
  ON school_regulations FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_pengaturan"
  ON pengaturan FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write_pengaturan"
  ON pengaturan FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- guru_kode_ta: authenticated bisa read & write
-- (admin frontend butuh insert/delete langsung)
-- -------------------------------------------------------
CREATE POLICY "authenticated_rw_guru_kode_ta"
  ON guru_kode_ta FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_write_guru_kode_ta"
  ON guru_kode_ta FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================
-- BAGIAN 4: SEMBUNYIKAN KOLOM password DI akun_pengguna
-- ============================================================

-- Cabut semua akses SELECT dari anon & authenticated
REVOKE SELECT ON TABLE public.akun_pengguna FROM anon;
REVOKE SELECT ON TABLE public.akun_pengguna FROM authenticated;

-- Berikan kembali SELECT hanya kolom yang aman (tanpa password)
GRANT SELECT (id, username, role, status, foreign_id, created_at, updated_at)
  ON TABLE public.akun_pengguna TO anon;

GRANT SELECT (id, username, role, status, foreign_id, created_at, updated_at)
  ON TABLE public.akun_pengguna TO authenticated;


-- ============================================================
-- BAGIAN 5: PERBAIKI Security Definer View — siswa_lengkap
-- (jika view ini ada)
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'siswa_lengkap'
  ) THEN
    EXECUTE 'ALTER VIEW public.siswa_lengkap SET (security_invoker = true)';
    RAISE NOTICE 'View siswa_lengkap: diubah ke security_invoker.';
  ELSE
    RAISE NOTICE 'View siswa_lengkap tidak ditemukan, skip.';
  END IF;
END $$;


-- ============================================================
-- BAGIAN 6: BUAT FUNGSI LOGIN AMAN (SECURITY DEFINER)
-- Tujuan: agar password hash TIDAK pernah keluar ke browser.
-- Frontend kirim username + password → fungsi validasi server-side.
-- ============================================================

-- Aktifkan pgcrypto untuk verifikasi bcrypt
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.fn_login(
  p_username TEXT,
  p_password TEXT,
  p_role     TEXT  -- 'murid', 'orang_tua', 'guru', 'admin', 'staff', 'piket'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_akun  akun_pengguna%ROWTYPE;
BEGIN
  -- Cari akun berdasarkan username + role + status aktif
  SELECT * INTO v_akun
  FROM akun_pengguna
  WHERE LOWER(TRIM(username)) = LOWER(TRIM(p_username))
    AND (
      p_role = 'any'
      OR role = p_role
      OR (p_role = 'staff' AND role IN ('guru','admin','staff','staf','piket'))
    )
    AND status = 'aktif'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'msg', 'Akun tidak ditemukan atau tidak aktif.');
  END IF;

  -- Verifikasi password dengan bcrypt
  IF v_akun.password IS NULL OR v_akun.password = '' THEN
    RETURN json_build_object('ok', false, 'msg', 'Akun belum memiliki password.');
  END IF;

  -- crypt() dari pgcrypto bekerja dengan hash bcrypt
  IF crypt(p_password, v_akun.password) <> v_akun.password THEN
    RETURN json_build_object('ok', false, 'msg', 'Password salah.');
  END IF;

  -- Kembalikan data akun TANPA field password
  RETURN json_build_object(
    'ok',         true,
    'id',         v_akun.id,
    'username',   v_akun.username,
    'role',       v_akun.role,
    'status',     v_akun.status,
    'foreign_id', v_akun.foreign_id
  );
END;
$$;

-- Izinkan anon memanggil fungsi ini (bukan akses tabel langsung)
REVOKE ALL ON FUNCTION public.fn_login(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_login(TEXT, TEXT, TEXT) TO anon, authenticated;


-- ============================================================
-- VERIFIKASI AKHIR — cek RLS status semua tabel
-- ============================================================

SELECT
  tablename,
  CASE WHEN rowsecurity THEN '✅ RLS ON' ELSE '❌ RLS OFF' END AS status_rls
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
