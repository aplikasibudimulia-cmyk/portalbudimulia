-- ==============================================================================
-- 🚨 LOCKDOWN TABEL TOKEN PUSH NOTIFICATION (push_device_tokens, push_subscriptions,
--    push_subscriptions_ortu)
-- Tanggal : 2026-11-17     Prioritas : KRITIS
--
-- MASALAH (dilaporkan siswa via WhatsApp 17 Nov 2026 19.01):
--   Policy lama "anon_rw_push_device_tokens" = FOR ALL USING (true) → siapa pun yang
--   memegang kunci publik aplikasi bisa `select=*` seluruh token FCM (812 baris) dan
--   endpoint push (264 baris), lalu mengirim notifikasi palsu ke siapa saja bersama
--   kunci Firebase yang bocor.
--
-- SOLUSI:
--   • Baca / ubah / hapus / tambah baris HANYA boleh:
--       - oleh staf terverifikasi (fn_is_authorized_staff), ATAU
--       - oleh pemilik baris, dibuktikan dengan sesi server (ebm_token di app_sessions
--         yang foreign_id-nya sama dengan nisn pada baris tsb).
--   • Edge Function memakai service_role → tidak terpengaruh RLS.
--
-- AMAN DIJALANKAN ULANG (idempotent). Rollback ada di bagian paling bawah.
-- ==============================================================================

BEGIN;

-- 1. Fungsi pembuktian kepemilikan baris (tidak bergantung header yang bisa dipalsukan)
CREATE OR REPLACE FUNCTION public.fn_is_token_owner(p_nisn TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  IF p_nisn IS NULL OR BTRIM(p_nisn) = '' THEN
    RETURN FALSE;
  END IF;

  IF public.fn_is_authorized_staff() THEN
    RETURN TRUE;
  END IF;

  v_token := COALESCE(public.fn_get_client_header_part('ebm_token'), '');
  IF v_token = '' THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.app_sessions s
    WHERE s.session_token = v_token
      AND s.expires_at > now()
      AND s.foreign_id = p_nisn
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_is_token_owner(TEXT) TO anon, authenticated, service_role;

-- 2. Hapus SEMUA policy lama pada ketiga tabel (nama policy bisa bermacam-macam)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('push_device_tokens', 'push_subscriptions', 'push_subscriptions_ortu')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

ALTER TABLE public.push_device_tokens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions_ortu ENABLE ROW LEVEL SECURITY;

-- 3. Policy baru: pemilik / staf saja
CREATE POLICY "push_tokens_owner_all"
  ON public.push_device_tokens
  FOR ALL TO anon, authenticated
  USING (public.fn_is_token_owner(nisn))
  WITH CHECK (public.fn_is_token_owner(nisn));

CREATE POLICY "push_subs_owner_all"
  ON public.push_subscriptions
  FOR ALL TO anon, authenticated
  USING (public.fn_is_token_owner(nisn))
  WITH CHECK (public.fn_is_token_owner(nisn));

CREATE POLICY "push_subs_ortu_owner_all"
  ON public.push_subscriptions_ortu
  FOR ALL TO anon, authenticated
  USING (public.fn_is_token_owner(nisn_anak))
  WITH CHECK (public.fn_is_token_owner(nisn_anak));

COMMIT;

-- 4. Verifikasi: jalankan dari SQL Editor (service) → harus menampilkan 1 policy per tabel
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('push_device_tokens', 'push_subscriptions', 'push_subscriptions_ortu')
ORDER BY tablename;

-- ==============================================================================
-- UJI DARI LUAR (di terminal, seharusnya hasilnya [] atau 401, BUKAN daftar token):
--   curl -s "$VITE_SUPABASE_URL/rest/v1/push_device_tokens?select=token&limit=1" \
--     -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"
-- ==============================================================================

-- ==============================================================================
-- ROLLBACK DARURAT (hanya jika notifikasi berhenti total; jalankan lalu hubungi saya):
-- DROP POLICY IF EXISTS "push_tokens_owner_all" ON public.push_device_tokens;
-- CREATE POLICY "anon_rw_push_device_tokens" ON public.push_device_tokens
--   FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
-- ==============================================================================
