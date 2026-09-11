-- ============================================================
-- FIX: Pindahkan data presensi PULANG → MASUK untuk hari ini
-- Tanggal: 2026-08-19
-- ============================================================
-- Hanya update siswa yang BELUM punya record 'masuk' hari ini
-- (agar tidak bentrok dengan constraint UNIQUE tanggal+nisn+tipe)
-- ============================================================

-- 1. Preview dulu: Lihat siapa saja yang terdampak
SELECT 
  ph.siswa_nisn, 
  ph.tanggal, 
  ph.tipe, 
  ph.status, 
  ph.waktu, 
  ph.selfie_url,
  ph.metode
FROM presensi_harian ph
WHERE ph.tanggal = '2026-08-19'
  AND ph.tipe = 'pulang'
  AND NOT EXISTS (
    SELECT 1 FROM presensi_harian pm 
    WHERE pm.tanggal = ph.tanggal 
      AND pm.siswa_nisn = ph.siswa_nisn 
      AND pm.tipe = 'masuk'
  )
ORDER BY ph.waktu;

-- 2. JALANKAN INI untuk memindahkan data dari pulang → masuk
UPDATE presensi_harian
SET tipe = 'masuk'
WHERE tanggal = '2026-08-19'
  AND tipe = 'pulang'
  AND NOT EXISTS (
    SELECT 1 FROM presensi_harian pm 
    WHERE pm.tanggal = presensi_harian.tanggal 
      AND pm.siswa_nisn = presensi_harian.siswa_nisn 
      AND pm.tipe = 'masuk'
  );

-- 3. Verifikasi: Cek hasilnya
SELECT 
  tipe, 
  COUNT(*) as jumlah 
FROM presensi_harian 
WHERE tanggal = '2026-08-19' 
GROUP BY tipe;
