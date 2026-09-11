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

-- 4. Index untuk Kecepatan LOGIN (fn_login) & Auth (Siswa, Orang Tua, Guru)
-- Memastikan pencarian username saat login berjalan dalam < 3ms
CREATE INDEX IF NOT EXISTS idx_akun_pengguna_lower_username 
ON akun_pengguna (LOWER(TRIM(username)));

CREATE INDEX IF NOT EXISTS idx_akun_pengguna_prefix_username 
ON akun_pengguna (LOWER(SPLIT_PART(username, '@', 1)));

CREATE INDEX IF NOT EXISTS idx_akun_pengguna_status 
ON akun_pengguna (status);

CREATE INDEX IF NOT EXISTS idx_siswa_permanent_nisn 
ON siswa_permanent (nisn);

CREATE INDEX IF NOT EXISTS idx_enrollment_nisn_ta 
ON enrollment (nisn, tahun_ajaran_id);

CREATE INDEX IF NOT EXISTS idx_guru_role_guru_id 
ON guru_role (guru_id);

CREATE INDEX IF NOT EXISTS idx_foto_nisn_ta 
ON foto (nisn, tahun_ajaran_id);

-- 5. Batas timeout statement agar tidak ada query yang macet membakar CPU
ALTER DATABASE postgres SET statement_timeout = '15s';

-- 6. Analisis ulang statistik tabel agar query planner Postgres menggunakan index baru secara optimal
ANALYZE presensi_harian;
ANALYZE notifikasi;
ANALYZE notifikasi_read;
ANALYZE tabungan_transaksi;
ANALYZE tagihan_spp;
ANALYZE akun_pengguna;
ANALYZE siswa_permanent;
ANALYZE enrollment;
ANALYZE foto;

