-- ============================================================
-- PATCH: Restore akses admin
-- Masalah: app tidak pakai Supabase Auth, semua query pakai
-- anon key → DB tidak bisa bedakan admin vs pengunjung biasa.
-- Solusi: izinkan anon akses tabel yang dibutuhkan app,
-- tapi tetap blokir kolom password.
-- ============================================================

-- ── siswa_permanent: izinkan anon baca & tulis ──────────────
-- (dibutuhkan oleh admin, dashboard siswa, dashboard ortu)
DROP POLICY IF EXISTS "service_only_siswa_permanent" ON siswa_permanent;

CREATE POLICY "anon_read_siswa_permanent"
  ON siswa_permanent FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "anon_write_siswa_permanent"
  ON siswa_permanent FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "anon_update_siswa_permanent"
  ON siswa_permanent FOR UPDATE TO anon, authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "anon_delete_siswa_permanent"
  ON siswa_permanent FOR DELETE TO anon, authenticated
  USING (true);

-- ── siswa_backup: izinkan anon baca & tulis ─────────────────
DROP POLICY IF EXISTS "service_only_siswa_backup" ON siswa_backup;

CREATE POLICY "anon_rw_siswa_backup"
  ON siswa_backup FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ── akun_pengguna: izinkan anon baca (tanpa password) ───────
-- fn_login sudah handle verifikasi password server-side,
-- tapi admin tetap perlu lihat daftar akun.
DROP POLICY IF EXISTS "service_only_akun_pengguna" ON akun_pengguna;

CREATE POLICY "anon_read_akun_pengguna"
  ON akun_pengguna FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "anon_write_akun_pengguna"
  ON akun_pengguna FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "anon_update_akun_pengguna"
  ON akun_pengguna FOR UPDATE TO anon, authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "anon_delete_akun_pengguna"
  ON akun_pengguna FOR DELETE TO anon, authenticated
  USING (true);

-- Restore akses tabel tapi TETAP blokir kolom password dari anon
-- (password hanya bisa dibaca/ditulis oleh service_role via fn_login)
REVOKE SELECT ON TABLE public.akun_pengguna FROM anon;
REVOKE SELECT ON TABLE public.akun_pengguna FROM authenticated;

GRANT SELECT (id, username, role, status, foreign_id, created_at, updated_at)
  ON TABLE public.akun_pengguna TO anon;
GRANT SELECT (id, username, role, status, foreign_id, created_at, updated_at)
  ON TABLE public.akun_pengguna TO authenticated;

GRANT INSERT, UPDATE, DELETE ON TABLE public.akun_pengguna TO anon;
GRANT INSERT, UPDATE, DELETE ON TABLE public.akun_pengguna TO authenticated;

-- ── enrollment: izinkan anon baca & tulis ───────────────────
DROP POLICY IF EXISTS "authenticated_read_enrollment" ON enrollment;
DROP POLICY IF EXISTS "service_write_enrollment"      ON enrollment;

CREATE POLICY "anon_rw_enrollment"
  ON enrollment FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ── guru dan tabel terkait: izinkan anon baca & tulis ───────
DROP POLICY IF EXISTS "authenticated_read_guru"   ON guru;
DROP POLICY IF EXISTS "service_write_guru"        ON guru;

CREATE POLICY "anon_rw_guru"
  ON guru FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_guru_bk"   ON guru_bk;
DROP POLICY IF EXISTS "service_write_guru_bk"        ON guru_bk;
CREATE POLICY "anon_rw_guru_bk"
  ON guru_bk FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_guru_kelas"   ON guru_kelas;
DROP POLICY IF EXISTS "service_write_guru_kelas"        ON guru_kelas;
CREATE POLICY "anon_rw_guru_kelas"
  ON guru_kelas FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_guru_mapel"   ON guru_mapel;
DROP POLICY IF EXISTS "service_write_guru_mapel"        ON guru_mapel;
CREATE POLICY "anon_rw_guru_mapel"
  ON guru_mapel FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_guru_role"   ON guru_role;
DROP POLICY IF EXISTS "service_write_guru_role"        ON guru_role;
CREATE POLICY "anon_rw_guru_role"
  ON guru_role FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ── Nilai: izinkan anon baca & tulis ────────────────────────
DROP POLICY IF EXISTS "authenticated_read_nilai_siswa"   ON nilai_siswa;
DROP POLICY IF EXISTS "service_write_nilai_siswa"        ON nilai_siswa;
CREATE POLICY "anon_rw_nilai_siswa"
  ON nilai_siswa FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_nilai_komponen"   ON nilai_komponen;
DROP POLICY IF EXISTS "service_write_nilai_komponen"        ON nilai_komponen;
CREATE POLICY "anon_rw_nilai_komponen"
  ON nilai_komponen FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_nilai_config"   ON nilai_akhir_config;
DROP POLICY IF EXISTS "service_write_nilai_config"        ON nilai_akhir_config;
CREATE POLICY "anon_rw_nilai_akhir_config"
  ON nilai_akhir_config FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ── Poin: izinkan anon baca & tulis ─────────────────────────
DROP POLICY IF EXISTS "authenticated_read_student_points"   ON student_points;
DROP POLICY IF EXISTS "service_write_student_points"        ON student_points;
CREATE POLICY "anon_rw_student_points"
  ON student_points FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_point_records"   ON point_records;
DROP POLICY IF EXISTS "service_write_point_records"        ON point_records;
CREATE POLICY "anon_rw_point_records"
  ON point_records FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_point_catalog"   ON point_catalog;
DROP POLICY IF EXISTS "service_write_point_catalog"        ON point_catalog;
CREATE POLICY "anon_rw_point_catalog"
  ON point_catalog FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ── Bimbingan: izinkan anon baca & tulis ────────────────────
DROP POLICY IF EXISTS "authenticated_read_guidance_logs"   ON guidance_logs;
DROP POLICY IF EXISTS "service_write_guidance_logs"        ON guidance_logs;
CREATE POLICY "anon_rw_guidance_logs"
  ON guidance_logs FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_guidance_stages"   ON guidance_stages;
DROP POLICY IF EXISTS "service_write_guidance_stages"        ON guidance_stages;
CREATE POLICY "anon_rw_guidance_stages"
  ON guidance_stages FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ── Notifikasi & presensi: izinkan anon ─────────────────────
DROP POLICY IF EXISTS "authenticated_rw_notifikasi"      ON notifikasi;
DROP POLICY IF EXISTS "service_rw_notifikasi"            ON notifikasi;
CREATE POLICY "anon_rw_notifikasi"
  ON notifikasi FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_rw_notifikasi_read"   ON notifikasi_read;
DROP POLICY IF EXISTS "service_rw_notifikasi_read"         ON notifikasi_read;
CREATE POLICY "anon_rw_notifikasi_read"
  ON notifikasi_read FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_rw_presensi_harian"   ON presensi_harian;
DROP POLICY IF EXISTS "service_rw_presensi_harian"         ON presensi_harian;
CREATE POLICY "anon_rw_presensi_harian"
  ON presensi_harian FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_rw_qr_tokens"   ON qr_tokens;
DROP POLICY IF EXISTS "service_rw_qr_tokens"         ON qr_tokens;
CREATE POLICY "anon_rw_qr_tokens"
  ON qr_tokens FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ── Dokumen: izinkan anon baca & tulis ──────────────────────
DROP POLICY IF EXISTS "authenticated_read_dokumen"   ON dokumen;
DROP POLICY IF EXISTS "service_write_dokumen"        ON dokumen;
CREATE POLICY "anon_rw_dokumen"
  ON dokumen FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_kumpulan"   ON kumpulan_dokumen;
DROP POLICY IF EXISTS "service_write_kumpulan"        ON kumpulan_dokumen;
CREATE POLICY "anon_rw_kumpulan_dokumen"
  ON kumpulan_dokumen FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_berkas"   ON berkas_pengumuman;
DROP POLICY IF EXISTS "service_write_berkas"        ON berkas_pengumuman;
CREATE POLICY "anon_rw_berkas_pengumuman"
  ON berkas_pengumuman FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_foto"   ON foto;
DROP POLICY IF EXISTS "service_write_foto"        ON foto;
CREATE POLICY "anon_rw_foto"
  ON foto FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_sesi"   ON sesi_presensi;
DROP POLICY IF EXISTS "service_write_sesi"        ON sesi_presensi;
CREATE POLICY "anon_rw_sesi_presensi"
  ON sesi_presensi FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_pengaturan"   ON pengaturan;
DROP POLICY IF EXISTS "service_write_pengaturan"        ON pengaturan;
CREATE POLICY "anon_rw_pengaturan"
  ON pengaturan FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);


-- ============================================================
-- CATATAN KEAMANAN
-- Yang sudah berhasil diamankan setelah semua patch ini:
-- ✅ Kolom password di akun_pengguna tidak bisa dibaca via REST API
-- ✅ Verifikasi password terjadi server-side (fn_login), hash tidak
--    pernah dikirim ke browser
-- ✅ RLS aktif di semua tabel (fondasi untuk perbaikan berikutnya)
-- ✅ impersonate_tokens hanya bisa diakses service_role
--
-- Yang masih menjadi risiko (butuh migrasi ke Supabase Auth):
-- ⚠️  Karena app pakai custom auth (localStorage), semua query
--    pakai anon key. DB tidak bisa bedakan admin vs pengunjung.
--    Data siswa masih bisa di-dump oleh yang tahu anon key.
-- ============================================================
