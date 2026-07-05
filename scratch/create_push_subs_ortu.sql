-- Tabel untuk menyimpan Web Push subscription milik Orang Tua
-- Dijalankan sekali di Supabase SQL Editor

CREATE TABLE IF NOT EXISTS push_subscriptions_ortu (
  id SERIAL PRIMARY KEY,
  nisn_anak TEXT NOT NULL,        -- NISN anak yang diikuti
  username_ortu TEXT,             -- username orang tua (opsional, untuk info)
  subscription JSONB NOT NULL,    -- Web Push subscription object
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT push_subscriptions_ortu_nisn_anak_key UNIQUE (nisn_anak)
);

-- Enable RLS
ALTER TABLE push_subscriptions_ortu ENABLE ROW LEVEL SECURITY;

-- Policy: semua role service bisa baca/tulis (untuk edge function)
CREATE POLICY "Service role full access" ON push_subscriptions_ortu
  FOR ALL USING (true) WITH CHECK (true);

-- Index untuk query cepat
CREATE INDEX IF NOT EXISTS idx_push_subs_ortu_nisn ON push_subscriptions_ortu(nisn_anak);
