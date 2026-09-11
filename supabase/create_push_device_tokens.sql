-- ====================================================================
-- TABEL & PENYIMPANAN FCM PUSH DEVICE TOKENS (EBUDIMULIA)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.push_device_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT UNIQUE NOT NULL,
    nisn VARCHAR(50) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'Siswa', -- 'Siswa' | 'Orang Tua' | 'Guru' | 'Admin'
    platform VARCHAR(50) NOT NULL DEFAULT 'android',
    device_info TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_device_tokens_nisn ON public.push_device_tokens(nisn);
CREATE INDEX IF NOT EXISTS idx_push_device_tokens_role ON public.push_device_tokens(role);

-- Enable RLS
ALTER TABLE public.push_device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_rw_push_device_tokens" ON public.push_device_tokens;
CREATE POLICY "anon_rw_push_device_tokens" ON public.push_device_tokens 
    FOR ALL TO anon, authenticated 
    USING (true) 
    WITH CHECK (true);
