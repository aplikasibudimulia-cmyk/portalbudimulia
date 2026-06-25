-- Mengupdate view siswa_lengkap untuk mencakup SEMUA kolom dari siswa_permanent
-- (termasuk no_whatsapp, email_aktif, nipd, dsb) yang sebelumnya terlewat

DROP VIEW IF EXISTS public.siswa_lengkap;

CREATE VIEW public.siswa_lengkap AS
SELECT 
    sp.*, -- Ambil semua biodata (termasuk no_whatsapp)
    e.kelas,
    e.kode as kode, 
    ta.id as tahun_ajaran_id,
    ta.nama as tahun_ajaran,
    ta.is_aktif as is_aktif
FROM 
    public.siswa_permanent sp
LEFT JOIN 
    public.enrollment e ON sp.nisn = e.nisn
LEFT JOIN 
    public.tahun_ajaran ta ON e.tahun_ajaran_id = ta.id;
