-- ============================================================
-- MIGRATION (Clean): Sistem Pengajuan Poin Positif
-- Drop & recreate untuk pastikan bersih dari run sebelumnya
-- ============================================================

-- Drop tabel lama jika ada (urutan terbalik dari dependency)
DROP TABLE IF EXISTS pengajuan_poin_ban CASCADE;
DROP TABLE IF EXISTS pengajuan_poin_positif CASCADE;

-- 1. Tabel utama pengajuan poin positif
CREATE TABLE pengajuan_poin_positif (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nisn             TEXT        NOT NULL,
  nama_siswa       TEXT        NOT NULL,
  kelas            TEXT,
  tahun_ajaran_id  UUID        REFERENCES tahun_ajaran(id) ON DELETE CASCADE,
  semester         INT         NOT NULL DEFAULT 1,
  catalog_id       UUID        REFERENCES point_catalog(id) ON DELETE SET NULL,
  kode_katalog     TEXT,
  jenis            TEXT        NOT NULL,
  kategori         TEXT,
  poin_diajukan    INT         NOT NULL,
  alasan           TEXT        NOT NULL,
  bukti_files      JSONB       NOT NULL DEFAULT '[]',
  status           TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'disetujui', 'ditolak')),
  catatan_reviewer TEXT,
  reviewed_by      TEXT,
  reviewed_at      TIMESTAMPTZ,
  is_spam          BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pengajuan_poin_nisn   ON pengajuan_poin_positif(nisn);
CREATE INDEX idx_pengajuan_poin_status ON pengajuan_poin_positif(status);
CREATE INDEX idx_pengajuan_poin_ta     ON pengajuan_poin_positif(tahun_ajaran_id);

-- 2. Tabel ban siswa
CREATE TABLE pengajuan_poin_ban (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nisn         TEXT        NOT NULL UNIQUE,
  nama_siswa   TEXT,
  alasan       TEXT,
  banned_by    TEXT,
  banned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  banned_until TIMESTAMPTZ,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  spam_count   INT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pengajuan_ban_nisn   ON pengajuan_poin_ban(nisn);
CREATE INDEX idx_pengajuan_ban_active ON pengajuan_poin_ban(is_active);

-- 3. Settings spam threshold
INSERT INTO pengaturan_sekolah (setting_key, setting_value)
VALUES
  ('spam_threshold_pengajuan_poin', '3'),
  ('spam_ban_days_pengajuan_poin',  '30')
ON CONFLICT (setting_key) DO NOTHING;

-- 4. Row Level Security
ALTER TABLE pengajuan_poin_positif ENABLE ROW LEVEL SECURITY;
ALTER TABLE pengajuan_poin_ban     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all pengajuan_poin_positif" ON pengajuan_poin_positif
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all pengajuan_poin_ban" ON pengajuan_poin_ban
  FOR ALL USING (true) WITH CHECK (true);

-- Verifikasi
SELECT 'pengajuan_poin_positif OK' AS status WHERE EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'pengajuan_poin_positif')
UNION ALL
SELECT 'pengajuan_poin_ban OK' WHERE EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'pengajuan_poin_ban');
