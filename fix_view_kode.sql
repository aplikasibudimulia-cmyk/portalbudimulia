-- 1. Pastikan view siswa_lengkap mencakup kolom telegram_ortu dan alias is_aktif yang benar
DROP VIEW IF EXISTS public.siswa_lengkap;

CREATE VIEW public.siswa_lengkap AS
SELECT 
    sp.nisn,
    sp.nama_lengkap,
    sp.kode_akses,
    sp.telegram_ortu, -- Kolom baru dimasukkan ke view
    e.kelas,
    e.kode as kode, -- KEMBALIKAN KE ALIAS "kode" BUKAN "enrollment_kode" AGAR APLIKASI TIDAK ERROR
    ta.id as tahun_ajaran_id,
    ta.nama as tahun_ajaran,
    ta.is_aktif as is_aktif -- Ini yang dipakai aplikasi untuk memfilter TA aktif
FROM 
    public.siswa_permanent sp
LEFT JOIN 
    public.enrollment e ON sp.nisn = e.nisn
LEFT JOIN 
    public.tahun_ajaran ta ON e.tahun_ajaran_id = ta.id;
