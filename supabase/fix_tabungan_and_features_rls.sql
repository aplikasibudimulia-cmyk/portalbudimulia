-- ==============================================================================
-- 💰 RESTORE AKSES TABUNGAN, BENDAHARA, DAN FITUR APLIKASI
-- Memulihkan akses data tabungan rekening & riwayat transaksi agar dapat
-- dibaca dan dikelola oleh Guru, Bendahara Siswa, dan Orang Tua.
-- ==============================================================================

-- 1. TABUNGAN REKENING (SALDO SISWA)
ALTER TABLE public.tabungan_rekening ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.tabungan_rekening TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "allow_all_tabungan_rekening" ON public.tabungan_rekening;
DROP POLICY IF EXISTS "staff_all_tabungan_rekening" ON public.tabungan_rekening;

CREATE POLICY "allow_all_tabungan_rekening"
ON public.tabungan_rekening
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);


-- 2. TABUNGAN TRANSAKSI (RIWAYAT SETORAN & PENARIKAN)
ALTER TABLE public.tabungan_transaksi ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.tabungan_transaksi TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "allow_all_tabungan_transaksi" ON public.tabungan_transaksi;
DROP POLICY IF EXISTS "staff_all_tabungan_transaksi" ON public.tabungan_transaksi;

CREATE POLICY "allow_all_tabungan_transaksi"
ON public.tabungan_transaksi
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);


-- 3. BENDAHARA KELAS (PENUNJUKAN SISWA SEBAGAI BENDAHARA)
ALTER TABLE public.bendahara_kelas ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.bendahara_kelas TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "allow_all_bendahara_kelas" ON public.bendahara_kelas;
DROP POLICY IF EXISTS "staff_all_bendahara_kelas" ON public.bendahara_kelas;

CREATE POLICY "allow_all_bendahara_kelas"
ON public.bendahara_kelas
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);


-- 4. PUSH SUBSCRIPTIONS ORTU (NOTIFIKASI HP ORANG TUA)
ALTER TABLE public.push_subscriptions_ortu ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.push_subscriptions_ortu TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "allow_all_push_subscriptions_ortu" ON public.push_subscriptions_ortu;
DROP POLICY IF EXISTS "staff_all_push_subscriptions_ortu" ON public.push_subscriptions_ortu;

CREATE POLICY "allow_all_push_subscriptions_ortu"
ON public.push_subscriptions_ortu
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);


-- 5. IMPERSONATE TOKENS (LOGIN CEPAT DARI ADMIN)
ALTER TABLE public.impersonate_tokens ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.impersonate_tokens TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "allow_all_impersonate_tokens" ON public.impersonate_tokens;
DROP POLICY IF EXISTS "staff_all_impersonate_tokens" ON public.impersonate_tokens;
DROP POLICY IF EXISTS "anon_read_valid_token" ON public.impersonate_tokens;

CREATE POLICY "allow_all_impersonate_tokens"
ON public.impersonate_tokens
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);


-- 6. RELOAD SCHEMA CACHE SUPABASE
NOTIFY pgrst, 'reload schema';
