-- =====================================================================
-- SKRIP OPTIMALISASI KINERJA DATABASE SUPABASE (11 SEPTEMBER 2026)
-- Mengatasi:
-- 1. Lonjakan 248.000+ query presensi_harian yang memakan CPU hingga 97%
-- 2. Query notifikasi & tabungan tanpa index
-- 3. Query pencarian siswa per tanggal presensi
-- =====================================================================

-- 1. Index spesifik untuk query presensi_harian (Composite Index)
-- Query yang tadi memakan 15.5% CPU dan 248.000 calls:
-- WHERE (tipe = 'masuk' OR tipe IS NULL) AND (tahun_ajaran_id = ... OR tahun_ajaran_id IS NULL)
-- ORDER BY tanggal DESC, siswa_nisn ASC
CREATE INDEX IF NOT EXISTS idx_presensi_harian_perf 
ON presensi_harian (tahun_ajaran_id, tipe, tanggal DESC, siswa_nisn ASC);

CREATE INDEX IF NOT EXISTS idx_presensi_harian_tgl_tipe 
ON presensi_harian (tanggal, tipe);

-- 2. Index untuk tabel notifikasi & read status
CREATE INDEX IF NOT EXISTS idx_notifikasi_target_nisn 
ON notifikasi (target_nisn);

CREATE INDEX IF NOT EXISTS idx_notifikasi_created_at 
ON notifikasi (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifikasi_read_composite 
ON notifikasi_read (nisn, notifikasi_id);

-- 3. Index untuk tabel tabungan & SPP
CREATE INDEX IF NOT EXISTS idx_tabungan_transaksi_nisn 
ON tabungan_transaksi (siswa_nisn);

CREATE INDEX IF NOT EXISTS idx_tabungan_transaksi_created 
ON tabungan_transaksi (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tagihan_spp_nisn 
ON tagihan_spp (siswa_nisn);

-- 4. Analisis ulang statistik tabel agar query planner Postgres menggunakan index baru secara optimal
ANALYZE presensi_harian;
ANALYZE notifikasi;
ANALYZE notifikasi_read;
ANALYZE tabungan_transaksi;
ANALYZE tagihan_spp;
