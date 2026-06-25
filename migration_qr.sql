-- 1. Buat Tabel qr_tokens
CREATE TABLE IF NOT EXISTS public.qr_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT -- bisa diisi id admin
);

-- Hapus token lama secara otomatis setiap jam (opsional, bisa lewat cron)
-- Tapi sebaiknya biarkan saja, kita gunakan edge function atau trigger nanti jika butuh
-- Untuk sekarang kita mengandalkan aplikasi untuk membersihkannya secara manual jika diperlukan.

-- 2. Tambahkan kolom metode dan diinput_oleh ke presensi_harian
ALTER TABLE public.presensi_harian 
ADD COLUMN IF NOT EXISTS metode TEXT DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS diinput_oleh TEXT;

-- 3. Tambahkan kolom telegram_ortu ke siswa_permanent
ALTER TABLE public.siswa_permanent
ADD COLUMN IF NOT EXISTS telegram_ortu TEXT;

-- 4. Set RLS untuk qr_tokens (Admin bisa semua, anon/authenticated bisa select)
ALTER TABLE public.qr_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read qr_tokens" 
ON public.qr_tokens FOR SELECT 
USING (true);

CREATE POLICY "Allow admin all qr_tokens"
ON public.qr_tokens FOR ALL
USING (true)
WITH CHECK (true);

-- 5. Tambah policy untuk presensi_harian agar siswa bisa insert/update milik mereka sendiri
CREATE POLICY "Allow student to insert their own presence"
ON public.presensi_harian FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated' AND 
    siswa_nisn IN (
        SELECT nisn FROM public.siswa_permanent 
        WHERE email_aktif = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
);

CREATE POLICY "Allow student to update their own presence"
ON public.presensi_harian FOR UPDATE
USING (
    auth.role() = 'authenticated' AND 
    siswa_nisn IN (
        SELECT nisn FROM public.siswa_permanent 
        WHERE email_aktif = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
);

-- 6. Insert default settings
INSERT INTO public.pengaturan_sekolah (setting_key, setting_value)
VALUES 
    ('qr_interval_detik', '20'),
    ('jam_batas_hadir', '07:00'),
    ('telegram_bot_token', '')
ON CONFLICT (setting_key) DO NOTHING;
