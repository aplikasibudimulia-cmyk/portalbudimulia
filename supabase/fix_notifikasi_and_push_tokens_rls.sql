-- ====================================================================
-- FIX RLS NOTIFIKASI & PUSH DEVICE TOKENS (EBUDIMULIA)
-- ====================================================================

-- 1. TABEL PUSH DEVICE TOKENS
CREATE TABLE IF NOT EXISTS public.push_device_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT UNIQUE NOT NULL,
    nisn VARCHAR(50) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'Siswa',
    platform VARCHAR(50) NOT NULL DEFAULT 'android',
    device_info TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_device_tokens_nisn ON public.push_device_tokens(nisn);
CREATE INDEX IF NOT EXISTS idx_push_device_tokens_role ON public.push_device_tokens(role);

ALTER TABLE public.push_device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_rw_push_device_tokens" ON public.push_device_tokens;
CREATE POLICY "anon_rw_push_device_tokens" ON public.push_device_tokens 
    FOR ALL TO anon, authenticated 
    USING (true) 
    WITH CHECK (true);

-- 2. TABEL NOTIFIKASI (Perbaiki agar Siswa & Ortu bisa INSERT/SELECT tanpa 403 Forbidden)
ALTER TABLE public.notifikasi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_rw_notifikasi" ON public.notifikasi;
CREATE POLICY "anon_rw_notifikasi" ON public.notifikasi 
    FOR ALL TO anon, authenticated 
    USING (true) 
    WITH CHECK (true);

DROP POLICY IF EXISTS "anon_rw_notifikasi_read" ON public.notifikasi_read;
CREATE POLICY "anon_rw_notifikasi_read" ON public.notifikasi_read 
    FOR ALL TO anon, authenticated 
    USING (true) 
    WITH CHECK (true);
