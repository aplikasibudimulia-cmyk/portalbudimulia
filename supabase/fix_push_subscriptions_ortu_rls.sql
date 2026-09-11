-- ====================================================================
-- FIX RLS PUSH_SUBSCRIPTIONS_ORTU (WEBPUSH / IPHONE PWA)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions_ortu (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nisn_anak VARCHAR(50) NOT NULL,
    username_ortu VARCHAR(100),
    subscription JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_push_subscriptions_ortu_nisn UNIQUE (nisn_anak)
);

CREATE INDEX IF NOT EXISTS idx_push_sub_ortu_nisn ON public.push_subscriptions_ortu(nisn_anak);

ALTER TABLE public.push_subscriptions_ortu ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_rw_push_subscriptions_ortu" ON public.push_subscriptions_ortu;
CREATE POLICY "anon_rw_push_subscriptions_ortu" ON public.push_subscriptions_ortu 
    FOR ALL TO anon, authenticated 
    USING (true) 
    WITH CHECK (true);
