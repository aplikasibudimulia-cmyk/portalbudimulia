-- Buat tabel push_subscriptions
CREATE TABLE public.push_subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nisn TEXT NOT NULL,
    subscription JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(nisn)
);

-- RLS untuk tabel push_subscriptions
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Izinkan semua user yang terautentikasi (Siswa) untuk melakukan Insert & Update data mereka sendiri
CREATE POLICY "Allow public upsert for subscriptions" ON public.push_subscriptions
FOR ALL TO public
USING (true) WITH CHECK (true);
