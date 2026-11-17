-- ==============================================================================
-- OPTIMASI EGRESS & PENGAMANAN TOKEN RAHASIA PADA TABEL pengaturan_sekolah
-- 1. Mengganti gambar base64 raksasa (~5,86 MB) pada kartu_cap_url, kartu_ttd_url,
--    dan kartu_ujian_settings menjadi URL Supabase Storage yang ringan (~90 byte),
--    sehingga HP siswa versi lama sekalipun langsung hemat egress 98% & login instan.
-- 2. Menyembunyikan token rahasia (LINE & Telegram) dari akses publik/siswa/ortu
--    tanpa mengganggu Edge Functions (service_role) maupun menu Admin.
-- ==============================================================================

BEGIN;

-- 1. Update kartu_cap_url & kartu_ttd_url ke URL Supabase Storage yang sudah dioptimasi
UPDATE public.pengaturan_sekolah
SET setting_value = 'https://ngdepacckohoxemlauhd.supabase.co/storage/v1/object/public/tp_lampiran/school_assets/cap_sekolah.png'
WHERE setting_key = 'kartu_cap_url'
  AND setting_value LIKE 'data:image%';

UPDATE public.pengaturan_sekolah
SET setting_value = 'https://ngdepacckohoxemlauhd.supabase.co/storage/v1/object/public/tp_lampiran/school_assets/ttd_kepsek.png'
WHERE setting_key = 'kartu_ttd_url'
  AND setting_value LIKE 'data:image%';

-- 2. Bersihkan base64 capUrl & ttdUrl di dalam JSON kartu_ujian_settings (3,9 MB -> 3 KB)
DO $$
DECLARE
  v_raw TEXT;
  v_json JSONB;
  v_cap_url TEXT := 'https://ngdepacckohoxemlauhd.supabase.co/storage/v1/object/public/tp_lampiran/school_assets/cap_sekolah.png';
  v_ttd_url TEXT := 'https://ngdepacckohoxemlauhd.supabase.co/storage/v1/object/public/tp_lampiran/school_assets/ttd_kepsek.png';
BEGIN
  SELECT setting_value INTO v_raw
  FROM public.pengaturan_sekolah
  WHERE setting_key = 'kartu_ujian_settings';

  IF v_raw IS NOT NULL AND v_raw LIKE '{%' THEN
    v_json := v_raw::jsonb;

    IF COALESCE(v_json->>'capUrl', '') LIKE 'data:image%' THEN
      v_json := jsonb_set(v_json, '{capUrl}', to_jsonb(v_cap_url));
    END IF;
    IF COALESCE(v_json->>'kartu_cap_url', '') LIKE 'data:image%' THEN
      v_json := jsonb_set(v_json, '{kartu_cap_url}', to_jsonb(v_cap_url));
    END IF;
    IF COALESCE(v_json->>'ttdUrl', '') LIKE 'data:image%' THEN
      v_json := jsonb_set(v_json, '{ttdUrl}', to_jsonb(v_ttd_url));
    END IF;
    IF COALESCE(v_json->>'kartu_ttd_url', '') LIKE 'data:image%' THEN
      v_json := jsonb_set(v_json, '{kartu_ttd_url}', to_jsonb(v_ttd_url));
    END IF;

    UPDATE public.pengaturan_sekolah
    SET setting_value = v_json::text
    WHERE setting_key = 'kartu_ujian_settings';
  END IF;
END $$;

-- 3. Amankan token rahasia (LINE & Telegram) agar tidak bisa dibaca oleh anon / siswa / orang tua
DROP POLICY IF EXISTS "Public read pengaturan_sekolah" ON public.pengaturan_sekolah;
CREATE POLICY "Public read pengaturan_sekolah"
  ON public.pengaturan_sekolah
  FOR SELECT TO anon
  USING (
    setting_key NOT IN ('line_channel_access_token', 'line_channel_secret', 'telegram_bot_token')
    OR public.fn_is_authorized_staff()
  );

DROP POLICY IF EXISTS "Akses pengaturan_sekolah" ON public.pengaturan_sekolah;
CREATE POLICY "Akses pengaturan_sekolah"
  ON public.pengaturan_sekolah
  FOR SELECT TO authenticated
  USING (
    setting_key NOT IN ('line_channel_access_token', 'line_channel_secret', 'telegram_bot_token')
    OR public.fn_is_authorized_staff()
  );

COMMIT;

-- Verifikasi ukuran data pengaturan_sekolah setelah dioptimasi:
SELECT
  COUNT(*) AS total_baris,
  pg_size_pretty(SUM(OCTET_LENGTH(COALESCE(setting_value, '')))::bigint) AS ukuran_total_sekarang
FROM public.pengaturan_sekolah;
