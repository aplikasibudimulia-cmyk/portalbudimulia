-- ============================================================
-- PATCH: Perbaikan RLS Pengaturan Sekolah & Akses Kalender (V2)
-- Jalankan skrip ini di Supabase SQL Editor.
-- ============================================================

BEGIN;

-- 1. Hapus policy SELECT lama pada pengaturan_sekolah
DROP POLICY IF EXISTS "Akses pengaturan_sekolah" ON public.pengaturan_sekolah;

-- Rekonstruksi policy SELECT pengaturan_sekolah untuk membolehkan Anonim & Authenticated
CREATE POLICY "Akses pengaturan_sekolah" ON public.pengaturan_sekolah 
  FOR SELECT TO anon, authenticated 
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
      'show_calendar_siswa',
      'show_calendar_guru',
      'show_calendar_ortu',
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

-- 2. Hapus policy Modifikasi lama pada pengaturan_sekolah
DROP POLICY IF EXISTS "Modifikasi pengaturan_sekolah" ON public.pengaturan_sekolah;

-- Perbolehkan admin, guru, dan staff untuk memodifikasi pengaturan sekolah (Fix error simpan admin)
CREATE POLICY "Modifikasi pengaturan_sekolah" ON public.pengaturan_sekolah 
  FOR ALL TO authenticated 
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') ) 
  WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') );

-- 3. Perbolehkan admin, guru, dan staff untuk memodifikasi tahun_ajaran, semester, dan data referensi
DROP POLICY IF EXISTS "Modifikasi public_tahun_ajaran" ON public.tahun_ajaran;
CREATE POLICY "Modifikasi public_tahun_ajaran" ON public.tahun_ajaran 
  FOR ALL TO authenticated 
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') ) 
  WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') );

DROP POLICY IF EXISTS "Modifikasi public_semester" ON public.semester;
CREATE POLICY "Modifikasi public_semester" ON public.semester 
  FOR ALL TO authenticated 
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') ) 
  WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') );

DROP POLICY IF EXISTS "Modifikasi public_mata_pelajaran" ON public.mata_pelajaran;
CREATE POLICY "Modifikasi public_mata_pelajaran" ON public.mata_pelajaran 
  FOR ALL TO authenticated 
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') ) 
  WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') );

DROP POLICY IF EXISTS "Modifikasi public_jenis_pengumuman" ON public.jenis_pengumuman;
CREATE POLICY "Modifikasi public_jenis_pengumuman" ON public.jenis_pengumuman 
  FOR ALL TO authenticated 
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') ) 
  WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'guru', 'staff') );

COMMIT;
