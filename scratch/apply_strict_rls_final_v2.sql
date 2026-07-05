-- ============================================================
-- ⚠️  FINAL STRICT SECURITY PATCH V2 — RUN IN SUPABASE SQL EDITOR
-- ============================================================
-- Membersihkan seluruh policy lama/longgar dan menerapkan
-- Row Level Security (RLS) ketat berbasis app_metadata (JWT)
-- serta menyembunyikan konfigurasi sensitif sekolah.
-- ============================================================

BEGIN;

-- ============================================================
-- TAHAP 1: MIGRASI METADATA USER DARI user_metadata -> app_metadata
-- ============================================================
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
  'role', COALESCE(raw_user_meta_data ->> 'role', 'murid'),
  'foreign_id', raw_user_meta_data ->> 'foreign_id'
);


-- ============================================================
-- TAHAP 2: BERSIHKAN TOTAL SELURUH POLICY LAMA
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT schemaname, tablename, policyname 
    FROM pg_policies 
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;


-- ============================================================
-- TAHAP 3: AKTIFKAN RLS DI SEMUA TABEL
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


-- ============================================================
-- TAHAP 4: TERAPKAN POLICY RLS BARU YANG KETAT & AMAN
-- ============================================================

-- ── siswa_permanent (Hanya Owner & Staff/Admin) ──
CREATE POLICY "Akses siswa_permanent" ON public.siswa_permanent
  FOR ALL TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket')
    OR
    (
      (auth.jwt() -> 'app_metadata' ->> 'role') IN ('murid', 'orang_tua')
      AND nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
    )
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket')
    OR
    (
      (auth.jwt() -> 'app_metadata' ->> 'role') IN ('murid', 'orang_tua')
      AND nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
    )
  );

-- ── siswa_backup (Admin/Service Only) ──
CREATE POLICY "Akses siswa_backup" ON public.siswa_backup
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── akun_pengguna ──
CREATE POLICY "Akses akun_pengguna" ON public.akun_pengguna
  FOR ALL TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR id = auth.uid()
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- Hak akses direct SELECT akun_pengguna (tanpa password)
REVOKE SELECT ON TABLE public.akun_pengguna FROM anon;
REVOKE SELECT ON TABLE public.akun_pengguna FROM authenticated;
GRANT SELECT (id, username, role, status, foreign_id, created_at, updated_at) ON TABLE public.akun_pengguna TO anon;
GRANT SELECT (id, username, role, status, foreign_id, created_at, updated_at) ON TABLE public.akun_pengguna TO authenticated;

-- ── guru ──
CREATE POLICY "Akses guru" ON public.guru
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Modifikasi guru" ON public.guru
  FOR ALL TO authenticated
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' )
  WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

-- ── guru_bk, guru_kelas, guru_mapel, guru_role ──
CREATE POLICY "Akses guru_bk" ON public.guru_bk FOR SELECT TO authenticated USING (true);
CREATE POLICY "Modifikasi guru_bk" ON public.guru_bk FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

CREATE POLICY "Akses guru_kelas" ON public.guru_kelas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Modifikasi guru_kelas" ON public.guru_kelas FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

CREATE POLICY "Akses guru_mapel" ON public.guru_mapel FOR SELECT TO authenticated USING (true);
CREATE POLICY "Modifikasi guru_mapel" ON public.guru_mapel FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

CREATE POLICY "Akses guru_role" ON public.guru_role FOR SELECT TO authenticated USING (true);
CREATE POLICY "Modifikasi guru_role" ON public.guru_role FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

-- ── enrollment ──
CREATE POLICY "Akses enrollment" ON public.enrollment
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket')
    OR nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
  );
CREATE POLICY "Modifikasi enrollment" ON public.enrollment
  FOR ALL TO authenticated
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' )
  WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

-- ── foto ──
CREATE POLICY "Akses foto" ON public.foto
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket')
    OR nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
  );
CREATE POLICY "Modifikasi foto" ON public.foto
  FOR ALL TO authenticated
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket') )
  WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket') );

-- ── nilai_siswa ──
CREATE POLICY "Akses nilai_siswa" ON public.nilai_siswa
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
    OR siswa_nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
  );
CREATE POLICY "Modifikasi nilai_siswa" ON public.nilai_siswa
  FOR ALL TO authenticated
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') )
  WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') );

-- ── presensi_harian ──
CREATE POLICY "Akses presensi_harian" ON public.presensi_harian
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket')
    OR siswa_nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
  );
CREATE POLICY "Modifikasi presensi_harian" ON public.presensi_harian
  FOR ALL TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket')
    OR (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'murid'
      AND siswa_nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
    )
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket')
    OR (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'murid'
      AND siswa_nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
    )
  );

-- ── sesi_presensi ──
CREATE POLICY "Akses sesi_presensi" ON public.sesi_presensi
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Modifikasi sesi_presensi" ON public.sesi_presensi
  FOR ALL TO authenticated
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket') )
  WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket') );

-- ── qr_tokens ──
CREATE POLICY "Akses qr_tokens" ON public.qr_tokens
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Modifikasi qr_tokens" ON public.qr_tokens
  FOR ALL TO authenticated
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket') )
  WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket') );

-- ── impersonate_tokens ──
CREATE POLICY "Akses impersonate_tokens" ON public.impersonate_tokens
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Modifikasi impersonate_tokens" ON public.impersonate_tokens
  FOR ALL TO authenticated
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' )
  WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

-- ── nilai_komponen, nilai_akhir_config ──
CREATE POLICY "Akses nilai_komponen" ON public.nilai_komponen FOR SELECT TO authenticated USING (true);
CREATE POLICY "Modifikasi nilai_komponen" ON public.nilai_komponen FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') );

CREATE POLICY "Akses nilai_akhir_config" ON public.nilai_akhir_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Modifikasi nilai_akhir_config" ON public.nilai_akhir_config FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') );

-- ── student_points, point_records ──
CREATE POLICY "Akses student_points" ON public.student_points
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
    OR nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
  );
CREATE POLICY "Modifikasi student_points" ON public.student_points
  FOR ALL TO authenticated
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') )
  WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') );

CREATE POLICY "Akses point_records" ON public.point_records
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
    OR nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
  );
CREATE POLICY "Modifikasi point_records" ON public.point_records
  FOR ALL TO authenticated
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') )
  WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') );

-- ── point_catalog, guidance_stages, kumpulan_dokumen ──
CREATE POLICY "Akses point_catalog" ON public.point_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY "Modifikasi point_catalog" ON public.point_catalog FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') );

CREATE POLICY "Akses guidance_stages" ON public.guidance_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Modifikasi guidance_stages" ON public.guidance_stages FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') );

CREATE POLICY "Akses kumpulan_dokumen" ON public.kumpulan_dokumen
  FOR SELECT TO authenticated
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket') );
CREATE POLICY "Modifikasi kumpulan_dokumen" ON public.kumpulan_dokumen FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket') ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket') );

-- ── guidance_logs ──
CREATE POLICY "Akses guidance_logs" ON public.guidance_logs
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
    OR nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
  );
CREATE POLICY "Modifikasi guidance_logs" ON public.guidance_logs
  FOR ALL TO authenticated
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') )
  WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') );

-- ── notifikasi, notifikasi_read ──
CREATE POLICY "Akses notifikasi" ON public.notifikasi
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket')
    OR (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'murid'
      AND (target_nisn IS NULL OR target_nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id'))
      AND (target_kelas IS NULL OR target_kelas IN (
        SELECT kelas FROM public.enrollment 
        WHERE nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
      ))
    )
    OR (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'orang_tua'
      AND (target_nisn IS NULL OR target_nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id'))
      AND (target_kelas IS NULL OR target_kelas IN (
        SELECT kelas FROM public.enrollment 
        WHERE nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
      ))
    )
  );
CREATE POLICY "Modifikasi notifikasi" ON public.notifikasi FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket') ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket') );

CREATE POLICY "Akses notifikasi_read" ON public.notifikasi_read
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Modifikasi notifikasi_read" ON public.notifikasi_read
  FOR ALL TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket')
    OR nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket')
    OR nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
  );

-- ── push_subscriptions, push_subscriptions_ortu ──
CREATE POLICY "Akses push_subscriptions" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket')
    OR nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket')
    OR nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
  );

CREATE POLICY "Akses push_subscriptions_ortu" ON public.push_subscriptions_ortu
  FOR ALL TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket')
    OR username_ortu = (SELECT username FROM public.akun_pengguna WHERE id = auth.uid())
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket')
    OR username_ortu = (SELECT username FROM public.akun_pengguna WHERE id = auth.uid())
  );

-- ── dokumen ──
CREATE POLICY "Akses dokumen" ON public.dokumen
  FOR SELECT TO authenticated
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket') );
CREATE POLICY "Modifikasi dokumen" ON public.dokumen FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket') ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket') );

-- ── berkas_pengumuman ──
CREATE POLICY "Akses berkas_pengumuman" ON public.berkas_pengumuman
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket')
    OR kode_siswa = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
    OR kode_siswa IN (
      SELECT kode FROM enrollment 
      WHERE nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
    )
  );
CREATE POLICY "Modifikasi berkas_pengumuman" ON public.berkas_pengumuman
  FOR ALL TO authenticated
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket') )
  WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket') );

-- ── activity_log (SELECT Dibatasi, INSERT Boleh) ──
CREATE POLICY "Akses activity_log" ON public.activity_log
  FOR SELECT TO authenticated
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket') );
CREATE POLICY "Simpan activity_log" ON public.activity_log
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- ── pengaturan ──
CREATE POLICY "Akses pengaturan" ON public.pengaturan FOR SELECT TO authenticated USING (true);
CREATE POLICY "Modifikasi pengaturan" ON public.pengaturan FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

-- ── pengaturan_sekolah (Paling Krusial: Sembunyikan default pin register & cancel pin!) ──
CREATE POLICY "Akses pengaturan_sekolah" ON public.pengaturan_sekolah 
  FOR SELECT TO authenticated 
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff', 'piket')
    OR setting_key IN (
      'tema_warna',
      'pengumuman_teks',
      'show_profile_foto',
      'show_profile_kelas',
      'show_profile_nisn',
      'show_profile_nipd',
      'show_profile_tahun_ajaran',
      'show_feature_presensi',
      'show_feature_nilai',
      'show_feature_poin',
      'link_grup_ortu',
      'countdown_label',
      'countdown_date',
      'poin_default_siswa',
      'jam_batas_hadir',
      'presensi_qr_aktif',
      'selfie_required',
      'geofence_lng',
      'geofence_lat',
      'geofence_aktif',
      'geofence_radius_meter',
      'qr_interval_detik'
    )
  );
CREATE POLICY "Modifikasi pengaturan_sekolah" ON public.pengaturan_sekolah 
  FOR ALL TO authenticated 
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ) 
  WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

-- ── DATA PUBLIK / SEMI-PUBLIK (Edit hanya Admin) ──
CREATE POLICY "Akses public_tahun_ajaran" ON public.tahun_ajaran FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Modifikasi public_tahun_ajaran" ON public.tahun_ajaran FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

CREATE POLICY "Akses public_semester" ON public.semester FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Modifikasi public_semester" ON public.semester FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

CREATE POLICY "Akses public_roles" ON public.roles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Modifikasi public_roles" ON public.roles FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

CREATE POLICY "Akses public_role_fitur" ON public.role_fitur FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Modifikasi public_role_fitur" ON public.role_fitur FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

CREATE POLICY "Akses public_mata_pelajaran" ON public.mata_pelajaran FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Modifikasi public_mata_pelajaran" ON public.mata_pelajaran FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

CREATE POLICY "Akses public_dokumen_type" ON public.dokumen_type FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Modifikasi public_dokumen_type" ON public.dokumen_type FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

CREATE POLICY "Akses public_jenis_pengumuman" ON public.jenis_pengumuman FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Modifikasi public_jenis_pengumuman" ON public.jenis_pengumuman FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

CREATE POLICY "Akses public_berita" ON public.berita_sekolah FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Modifikasi public_berita" ON public.berita_sekolah FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

CREATE POLICY "Akses public_school_regulations" ON public.school_regulations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Modifikasi public_school_regulations" ON public.school_regulations FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

COMMIT;
