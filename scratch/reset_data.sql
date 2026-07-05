-- =========================================================================
-- SCRIPT SQL UNTUK RESET DATA TESTING (TRANSAKSIONAL) SUPABASE
-- =========================================================================
-- Jalankan perintah ini di Menu "SQL Editor" pada Dashboard Supabase Anda 
-- untuk membersihkan semua data ujicoba sebelum rilis resmi ke sekolah.
-- -------------------------------------------------------------------------

-- 1. Hapus semua riwayat kehadiran siswa
TRUNCATE TABLE presensi_harian RESTART IDENTITY CASCADE;

-- 2. Hapus sesi pembukaan presensi harian
TRUNCATE TABLE sesi_presensi RESTART IDENTITY CASCADE;

-- 3. Hapus token QR Code TV
TRUNCATE TABLE qr_tokens RESTART IDENTITY CASCADE;

-- 4. Hapus log aktivitas audit
TRUNCATE TABLE activity_log RESTART IDENTITY CASCADE;

-- 5. Hapus riwayat berkas/laporan pengumuman (Opsional)
-- TRUNCATE TABLE berkas_pengumuman RESTART IDENTITY CASCADE;

-- 6. Hapus notifikasi & data baca notifikasi (Opsional)
-- TRUNCATE TABLE notifikasi RESTART IDENTITY CASCADE;
-- TRUNCATE TABLE notifikasi_read RESTART IDENTITY CASCADE;

-- 7. Hapus langganan push notification orang tua (Opsional)
-- TRUNCATE TABLE push_subscriptions_ortu RESTART IDENTITY CASCADE;

-- =========================================================================
-- Catatan Keamanan:
-- Perintah di atas HANYA menghapus data hasil presensi/aktivitas testing.
-- Data Master (seperti Akun Pengguna, Data Siswa Permanent, Data Guru, 
-- Kelas, Mata Pelajaran, dan Pengaturan Sekolah) tetap UTUH & AMAN.
-- =========================================================================
