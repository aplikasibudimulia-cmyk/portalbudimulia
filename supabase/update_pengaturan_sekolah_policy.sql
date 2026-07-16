-- Drop the existing SELECT policy on pengaturan_sekolah
DROP POLICY IF EXISTS "Akses pengaturan_sekolah" ON public.pengaturan_sekolah;

-- Re-create the SELECT policy with all required setting keys whitelisted for siswa and ortu roles
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
      'show_poin_total',
      'show_poin_negatif',
      'show_poin_positif',
      'show_poin_leaderboard',
      'show_poin_tata_tertib',
      'show_poin_katalog',
      'show_calendar_siswa',
      'show_calendar_ortu',
      'show_jadwal_siswa',
      'show_jadwal_ortu',
      'jadwal_semester_aktif',
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
