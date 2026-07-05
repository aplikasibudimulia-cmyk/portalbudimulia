BEGIN;

-- 1. Fix Jason Leonard Guntur (NISN: 0123411735, Enrollment: 8B202026_2027)
-- Set all prerequisites to met on the row containing the PDF URL
UPDATE berkas_pengumuman
SET persyaratan_terpenuhi = '{"req_1782380454395": true, "req_1782380484804": true}'::jsonb
WHERE kode_siswa = '8B202026_2027' AND kode_jenis = 'PK2026';

-- Delete the empty duplicate NISN row
DELETE FROM berkas_pengumuman
WHERE kode_siswa = '0123411735' AND kode_jenis = 'PK2026';

-- 2. Fix Baginta Bukit (NISN: 0101103074, Enrollment: 9C42026_2027)
-- Delete the duplicate NISN row (Enrollment row already has the PDF and all prerequisites met)
DELETE FROM berkas_pengumuman
WHERE kode_siswa = '0101103074' AND kode_jenis = 'PK2026';

-- 3. Fix Anugrah Putra Davianastasia (NISN: 0122182654, Enrollment: 9B_0122182654_2026_2027)
-- Delete the duplicate NISN row
DELETE FROM berkas_pengumuman
WHERE kode_siswa = '0122182654' AND kode_jenis = 'PK2026';

COMMIT;
