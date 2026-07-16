-- ============================================================
-- SQL MIGRATION V3 FINAL: FITUR JADWAL PELAJARAN LENGKAP
-- Jalankan skrip ini di Supabase SQL Editor
-- ============================================================

BEGIN;

-- 1. Modifikasi tabel jadwal_pelajaran yang sudah ada
ALTER TABLE public.jadwal_pelajaran 
  ADD COLUMN IF NOT EXISTS semester INTEGER DEFAULT 1 CHECK (semester IN (1, 2));

-- 2. BARU: Konfigurasi Slot Waktu Harian (struktur jam per hari, drag-drop)
CREATE TABLE IF NOT EXISTS public.jadwal_slot_waktu (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tahun_ajaran_id UUID NOT NULL REFERENCES public.tahun_ajaran(id) ON DELETE CASCADE,
  semester INTEGER NOT NULL DEFAULT 1 CHECK (semester IN (1, 2)),
  hari TEXT NOT NULL,
  urutan INTEGER NOT NULL,
  jam_ke INTEGER,
  label TEXT NOT NULL,
  tipe TEXT NOT NULL DEFAULT 'pelajaran',
  keterangan_blok TEXT,
  waktu_mulai TIME NOT NULL,
  durasi_menit INTEGER NOT NULL DEFAULT 40,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tahun_ajaran_id, semester, hari, urutan)
);

-- 3. Beban Mengajar
CREATE TABLE IF NOT EXISTS public.jadwal_beban_mengajar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tahun_ajaran_id UUID NOT NULL REFERENCES public.tahun_ajaran(id) ON DELETE CASCADE,
  semester INTEGER NOT NULL DEFAULT 1 CHECK (semester IN (1, 2)),
  guru_id UUID NOT NULL REFERENCES public.guru(id) ON DELETE CASCADE,
  mata_pelajaran_id UUID NOT NULL REFERENCES public.mata_pelajaran(id) ON DELETE CASCADE,
  kelas TEXT NOT NULL,
  jam_per_minggu INTEGER NOT NULL DEFAULT 2,
  maks_jam_per_hari INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_beban_mengajar UNIQUE(tahun_ajaran_id, semester, guru_id, mata_pelajaran_id, kelas)
);

-- 4. Guru Piket per Hari
CREATE TABLE IF NOT EXISTS public.jadwal_piket (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tahun_ajaran_id UUID NOT NULL REFERENCES public.tahun_ajaran(id) ON DELETE CASCADE,
  semester INTEGER NOT NULL DEFAULT 1 CHECK (semester IN (1, 2)),
  hari TEXT NOT NULL,
  guru_id UUID NOT NULL REFERENCES public.guru(id) ON DELETE CASCADE,
  urutan INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT uq_piket UNIQUE(tahun_ajaran_id, semester, hari, guru_id)
);

-- 5. Catatan Kurikulum
CREATE TABLE IF NOT EXISTS public.jadwal_catatan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tahun_ajaran_id UUID NOT NULL REFERENCES public.tahun_ajaran(id) ON DELETE CASCADE,
  semester INTEGER NOT NULL DEFAULT 1 CHECK (semester IN (1, 2)),
  isi_catatan TEXT NOT NULL,
  urutan INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Ekskul
CREATE TABLE IF NOT EXISTS public.jadwal_ekskul (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tahun_ajaran_id UUID NOT NULL REFERENCES public.tahun_ajaran(id) ON DELETE CASCADE,
  semester INTEGER NOT NULL DEFAULT 1 CHECK (semester IN (1, 2)),
  nama TEXT NOT NULL,
  hari TEXT,
  waktu TEXT,
  pembina TEXT,
  urutan INTEGER DEFAULT 0
);

-- RLS
ALTER TABLE public.jadwal_slot_waktu ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jadwal_beban_mengajar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jadwal_piket ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jadwal_catatan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jadwal_ekskul ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Baca slot_waktu" ON public.jadwal_slot_waktu;
DROP POLICY IF EXISTS "Tulis slot_waktu" ON public.jadwal_slot_waktu;
DROP POLICY IF EXISTS "Akses Baca beban" ON public.jadwal_beban_mengajar;
DROP POLICY IF EXISTS "Modifikasi beban" ON public.jadwal_beban_mengajar;
DROP POLICY IF EXISTS "Akses Baca piket" ON public.jadwal_piket;
DROP POLICY IF EXISTS "Modifikasi piket" ON public.jadwal_piket;
DROP POLICY IF EXISTS "Akses Baca catatan" ON public.jadwal_catatan;
DROP POLICY IF EXISTS "Modifikasi catatan" ON public.jadwal_catatan;
DROP POLICY IF EXISTS "Akses Baca ekskul" ON public.jadwal_ekskul;
DROP POLICY IF EXISTS "Modifikasi ekskul" ON public.jadwal_ekskul;

CREATE POLICY "Baca slot_waktu" ON public.jadwal_slot_waktu FOR SELECT TO authenticated USING (true);
CREATE POLICY "Akses Baca beban" ON public.jadwal_beban_mengajar FOR SELECT TO authenticated USING (true);
CREATE POLICY "Akses Baca piket" ON public.jadwal_piket FOR SELECT TO authenticated USING (true);
CREATE POLICY "Akses Baca catatan" ON public.jadwal_catatan FOR SELECT TO authenticated USING (true);
CREATE POLICY "Akses Baca ekskul" ON public.jadwal_ekskul FOR SELECT TO authenticated USING (true);

CREATE POLICY "Tulis slot_waktu" ON public.jadwal_slot_waktu FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Modifikasi beban" ON public.jadwal_beban_mengajar FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Modifikasi piket" ON public.jadwal_piket FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Modifikasi catatan" ON public.jadwal_catatan FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Modifikasi ekskul" ON public.jadwal_ekskul FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jadwal_slot_waktu TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jadwal_beban_mengajar TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jadwal_piket TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jadwal_catatan TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jadwal_ekskul TO authenticated, service_role;

COMMIT;
