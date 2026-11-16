-- ==============================================================================
-- CLEANUP: Poin Reward Disiplin Bulanan (POS-PKET-1) ganda
-- Jalankan di Supabase SQL Editor. LANGKAH 1 dulu (hanya melihat), baru LANGKAH 2.
-- ==============================================================================

-- LANGKAH 1: Lihat siswa yang mendapat POS-PKET-1 lebih dari 1x dalam bulan yang sama
SELECT
  nisn,
  MAX(nama_siswa)                          AS nama_siswa,
  MAX(kelas)                               AS kelas,
  to_char(tanggal::date, 'YYYY-MM')        AS bulan,
  COUNT(*)                                 AS jumlah_record,
  SUM(poin_diberikan)                      AS total_poin_didapat
FROM public.point_records
WHERE kode_katalog = 'POS-PKET-1'
GROUP BY nisn, to_char(tanggal::date, 'YYYY-MM')
HAVING COUNT(*) > 1
ORDER BY bulan, kelas, nama_siswa;

-- LANGKAH 2 (opsional): Hapus duplikat, sisakan 1 record paling awal per siswa per bulan.
-- Total poin di student_points dihitung ulang otomatis oleh trigger trg_after_point_records_change.
-- Hapus tanda komentar (/* ... */) di bawah ini setelah hasil Langkah 1 Anda cek.
/*
DELETE FROM public.point_records pr
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY nisn, to_char(tanggal::date, 'YYYY-MM')
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.point_records
  WHERE kode_katalog = 'POS-PKET-1'
) d
WHERE pr.id = d.id
  AND d.rn > 1;
*/
