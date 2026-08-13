-- Script Optimalisasi Kinerja Database (Indexes)
-- Jalankan skrip ini di Supabase Dashboard -> SQL Editor
-- Untuk mengatasi error PGRST083 (Timed out acquiring connection from connection pool)

-- 1. Index untuk tabel enrollment (Dashboard Siswa & Orang Tua)
CREATE INDEX IF NOT EXISTS idx_enrollment_nisn ON enrollment(nisn);
CREATE INDEX IF NOT EXISTS idx_enrollment_kode ON enrollment(kode);
CREATE INDEX IF NOT EXISTS idx_enrollment_ta_id ON enrollment(tahun_ajaran_id);

-- 2. Index untuk tabel presensi_harian (Presensi Pagi & Realtime TV)
CREATE INDEX IF NOT EXISTS idx_presensi_harian_tanggal ON presensi_harian(tanggal);
CREATE INDEX IF NOT EXISTS idx_presensi_harian_tanggal_nisn ON presensi_harian(tanggal, siswa_nisn);
CREATE INDEX IF NOT EXISTS idx_presensi_harian_nisn ON presensi_harian(siswa_nisn);

-- 3. Index untuk tabel siswa_permanent & guru
CREATE INDEX IF NOT EXISTS idx_siswa_permanent_nisn ON siswa_permanent(nisn);
CREATE INDEX IF NOT EXISTS idx_guru_kode ON guru(kode);

-- 4. Index untuk tabel akun_pengguna (Kecepatan Login & Auth)
CREATE INDEX IF NOT EXISTS idx_akun_pengguna_username ON akun_pengguna(username);
CREATE INDEX IF NOT EXISTS idx_akun_pengguna_foreign_id ON akun_pengguna(foreign_id);
