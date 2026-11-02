-- ==============================================================================
-- PENGATURAN VERSI APLIKASI ANDROID & GOOGLE PLAY STORE
-- ==============================================================================
-- File ini menyisipkan konfigurasi versi aplikasi ke tabel `pengaturan_sekolah`.
-- Setiap kali ada rilis baru di Play Store (misal APK/AAB baru):
-- Admin dapat mengubah `app_latest_version` atau mengaktifkan `app_force_update`.
-- ==============================================================================

-- 1. Insert/Upsert setting versi aplikasi default
INSERT INTO public.pengaturan_sekolah (setting_key, setting_value)
VALUES
  ('app_latest_version', '1.8.3'),
  ('app_latest_build', '13'),
  ('app_min_version', '1.8.2'),
  ('app_force_update', 'false'),
  ('app_playstore_url', 'https://play.google.com/store/apps/details?id=com.ebudimulia.portal'),
  ('app_update_title', 'Pembaruan Aplikasi Tersedia 🚀'),
  ('app_update_notes', 'Peningkatan performa dan kestabilan sistem.')
ON CONFLICT (setting_key) 
DO UPDATE SET setting_value = EXCLUDED.setting_value;

-- 2. Pastikan izin baca (SELECT) terbuka untuk semua pengguna (anon & authenticated)
-- agar siswa yang baru membuka aplikasi (bahkan sebelum login) langsung mendapat notifikasi update
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'pengaturan_sekolah' 
      AND policyname = 'Public read pengaturan_sekolah'
  ) THEN
    CREATE POLICY "Public read pengaturan_sekolah" 
      ON public.pengaturan_sekolah 
      FOR SELECT TO anon 
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'pengaturan_sekolah' 
      AND policyname = 'Akses pengaturan_sekolah'
  ) THEN
    CREATE POLICY "Akses pengaturan_sekolah" 
      ON public.pengaturan_sekolah 
      FOR SELECT TO authenticated 
      USING (true);
  END IF;
END $$;
