-- Hapus data duplikat dengan menyisakan 1 data terbaru untuk setiap (tanggal, siswa_nisn)
DELETE FROM public.presensi_harian
WHERE ctid NOT IN (
    SELECT max(ctid)
    FROM public.presensi_harian
    GROUP BY tanggal, siswa_nisn
);

-- Tambahkan kembali aturan unique constraint
ALTER TABLE public.presensi_harian ADD CONSTRAINT presensi_harian_tanggal_siswa_nisn_key UNIQUE (tanggal, siswa_nisn);
