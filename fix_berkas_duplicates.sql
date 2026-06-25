-- 1. Hapus duplikat di berkas_pengumuman, sisakan 1 data terbaru (berdasarkan id maksimum atau ctid)
DELETE FROM public.berkas_pengumuman
WHERE ctid NOT IN (
    SELECT MAX(ctid)
    FROM public.berkas_pengumuman
    GROUP BY kode_siswa, kode_jenis
);

-- 2. Tambahkan constraint UNIQUE agar Supabase upsert tidak membuat baris ganda lagi
ALTER TABLE public.berkas_pengumuman DROP CONSTRAINT IF EXISTS berkas_pengumuman_kode_siswa_kode_jenis_key;
ALTER TABLE public.berkas_pengumuman ADD CONSTRAINT berkas_pengumuman_kode_siswa_kode_jenis_key UNIQUE (kode_siswa, kode_jenis);
