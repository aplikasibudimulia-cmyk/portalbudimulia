-- ============================================================
-- ⚠️  FINAL STRICT SECURITY PATCH — RUN IN SUPABASE SQL EDITOR
-- ============================================================
-- Membersihkan seluruh policy lama/longgar dan menerapkan
-- Row Level Security (RLS) ketat berbasis app_metadata (JWT).
-- ============================================================

BEGIN;

-- ============================================================
-- TAHAP 1: MIGRASI METADATA USER DARI user_metadata -> app_metadata
-- ============================================================
-- Mengamankan klaim 'role' dan 'foreign_id' agar tidak bisa diubah
-- secara mandiri oleh user dari client-side browser.

UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
  'role', COALESCE(raw_user_meta_data ->> 'role', 'murid'),
  'foreign_id', raw_user_meta_data ->> 'foreign_id'
);


-- ============================================================
-- TAHAP 2: UPDATE FUNGSI PEMBUATAN & PENGELOLAAN USER (SECURITY DEFINER)
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_username   TEXT,
  p_password   TEXT,
  p_role       TEXT,
  p_foreign_id TEXT,
  p_status     TEXT DEFAULT 'aktif'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_new_uuid      UUID;
  v_email         TEXT;
  v_hash          TEXT;
  v_raw_app_meta  JSONB;
  v_raw_user_meta JSONB;
BEGIN
  v_new_uuid := gen_random_uuid();
  
  IF p_username LIKE '%@%' THEN
    v_email := LOWER(TRIM(p_username));
  ELSE
    v_email := LOWER(TRIM(p_username)) || '@ebudimulia.local';
  END IF;

  v_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
  
  -- Simpan role & foreign_id di raw_app_meta_data (aman dari client-side edit)
  v_raw_app_meta := jsonb_build_object(
    'provider', 'email', 
    'providers', jsonb_build_array('email'),
    'role', p_role,
    'foreign_id', p_foreign_id
  );
  v_raw_user_meta := jsonb_build_object('role', p_role, 'foreign_id', p_foreign_id);

  -- Insert ke auth.users
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000', v_new_uuid, 'authenticated', 'authenticated', 
    v_email, v_hash, now(), v_raw_app_meta, v_raw_user_meta, now(), now()
  );

  -- Insert ke auth.identities
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  )
  VALUES (
    v_new_uuid, v_new_uuid, 
    jsonb_build_object('sub', v_new_uuid::text, 'email', v_email, 'email_verified', true),
    'email', v_email, now(), now(), now()
  );

  -- Insert ke public.akun_pengguna
  INSERT INTO public.akun_pengguna (
    id, username, password, role, foreign_id, status, created_at, updated_at
  )
  VALUES (
    v_new_uuid, p_username, v_hash, p_role, p_foreign_id, p_status, now(), now()
  );

  RETURN json_build_object('ok', true, 'id', v_new_uuid, 'username', p_username);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'msg', SQLERRM);
END;
$$;


-- ============================================================
-- TAHAP 3: BERSIHKAN TOTAL SELURUH POLICY LAMA
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
-- TAHAP 4: AKTIFKAN RLS DI SEMUA TABEL
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
-- TAHAP 5: TERAPKAN POLICY RLS BARU YANG KETAT & AMAN
-- ============================================================

-- ── siswa_permanent ──
CREATE POLICY "Akses siswa_permanent" ON public.siswa_permanent
  FOR ALL TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
    OR
    (
      (auth.jwt() -> 'app_metadata' ->> 'role') IN ('murid', 'orang_tua')
      AND nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
    )
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
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
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
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
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
    OR nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
  );
CREATE POLICY "Modifikasi foto" ON public.foto
  FOR ALL TO authenticated
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') )
  WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') );

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
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
    OR siswa_nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
  );
CREATE POLICY "Modifikasi presensi_harian" ON public.presensi_harian
  FOR ALL TO authenticated
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
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
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') )
  WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') );

-- ── qr_tokens ──
CREATE POLICY "Akses qr_tokens" ON public.qr_tokens
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Modifikasi qr_tokens" ON public.qr_tokens
  FOR ALL TO authenticated
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') )
  WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') );

-- ── impersonate_tokens (Admin/Service Only) ──
CREATE POLICY "Akses impersonate_tokens" ON public.impersonate_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

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

CREATE POLICY "Akses kumpulan_dokumen" ON public.kumpulan_dokumen FOR SELECT TO authenticated USING (true);
CREATE POLICY "Modifikasi kumpulan_dokumen" ON public.kumpulan_dokumen FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') );

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
CREATE POLICY "Akses notifikasi" ON public.notifikasi FOR SELECT TO authenticated USING (true);
CREATE POLICY "Modifikasi notifikasi" ON public.notifikasi FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') );

CREATE POLICY "Akses notifikasi_read" ON public.notifikasi_read
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Modifikasi notifikasi_read" ON public.notifikasi_read
  FOR ALL TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
    OR nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
    OR nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
  );

-- ── push_subscriptions, push_subscriptions_ortu ──
CREATE POLICY "Akses push_subscriptions" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
    OR nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
    OR nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
  );

CREATE POLICY "Akses push_subscriptions_ortu" ON public.push_subscriptions_ortu
  FOR ALL TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
    OR username_ortu = (SELECT username FROM public.akun_pengguna WHERE id = auth.uid())
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
    OR username_ortu = (SELECT username FROM public.akun_pengguna WHERE id = auth.uid())
  );

-- ── dokumen ──
CREATE POLICY "Akses dokumen" ON public.dokumen FOR SELECT TO authenticated USING (true);
CREATE POLICY "Modifikasi dokumen" ON public.dokumen FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') );

-- ── berkas_pengumuman ──
CREATE POLICY "Akses berkas_pengumuman" ON public.berkas_pengumuman
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff')
    OR kode_siswa = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
    OR kode_siswa IN (
      SELECT kode FROM enrollment 
      WHERE nisn = (auth.jwt() -> 'app_metadata' ->> 'foreign_id')
    )
  );
CREATE POLICY "Modifikasi berkas_pengumuman" ON public.berkas_pengumuman
  FOR ALL TO authenticated
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') )
  WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') );

-- ── activity_log ──
CREATE POLICY "Akses activity_log" ON public.activity_log
  FOR SELECT TO authenticated
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') );
CREATE POLICY "Simpan activity_log" ON public.activity_log
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- ── pengaturan, pengaturan_sekolah ──
CREATE POLICY "Akses pengaturan" ON public.pengaturan FOR SELECT TO authenticated USING (true);
CREATE POLICY "Modifikasi pengaturan" ON public.pengaturan FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

CREATE POLICY "Akses pengaturan_sekolah" ON public.pengaturan_sekolah FOR SELECT TO authenticated USING (true);
CREATE POLICY "Modifikasi pengaturan_sekolah" ON public.pengaturan_sekolah FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );

-- ── DATA PUBLIK / SEMI-PUBLIK (Boleh dibaca anonim, edit hanya admin) ──
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
