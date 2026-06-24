-- LANGKAH 1 — Buat tabel tahun_ajaran
-- Menyimpan daftar tahun ajaran dan status aktifnya
CREATE TABLE public.tahun_ajaran (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nama TEXT UNIQUE NOT NULL,
    is_aktif BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT now()
);

-- Insert data awal tahun ajaran
INSERT INTO public.tahun_ajaran (nama, is_aktif) VALUES ('2025/2026', true);

-- LANGKAH 2 — Buat tabel dokumen_type
-- Menyimpan jenis-jenis dokumen yang bisa diupload
CREATE TABLE public.dokumen_type (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    kode TEXT UNIQUE NOT NULL,
    nama TEXT NOT NULL
);

-- Insert data awal jenis dokumen
INSERT INTO public.dokumen_type (kode, nama) VALUES
    ('SKL', 'Surat Keterangan Lulus'),
    ('NILAI', 'Daftar Nilai'),
    ('RAPORT', 'Raport');

-- LANGKAH 3 — Buat tabel siswa_permanent
-- Menyimpan identitas siswa yang tidak berubah per tahun ajaran
CREATE TABLE public.siswa_permanent (
    nisn TEXT PRIMARY KEY,
    nipd VARCHAR,
    nama_lengkap TEXT,
    email_aktif TEXT,
    no_whatsapp TEXT,
    kode_akses TEXT,
    tahun_lulus TEXT,
    created_at TIMESTAMP DEFAULT now()
);

-- LANGKAH 4 — Buat tabel enrollment
-- Menyimpan riwayat pendaftaran/kelas siswa di setiap tahun ajaran
CREATE TABLE public.enrollment (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    kode TEXT UNIQUE NOT NULL,
    nisn TEXT REFERENCES public.siswa_permanent(nisn) ON DELETE CASCADE,
    kelas TEXT,
    tahun_ajaran_id UUID REFERENCES public.tahun_ajaran(id),
    created_at TIMESTAMP DEFAULT now()
);

-- LANGKAH 5 — Buat tabel dokumen
-- Menyimpan dokumen per siswa per tahun ajaran per jenis dokumen
CREATE TABLE public.dokumen (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nisn TEXT REFERENCES public.siswa_permanent(nisn) ON DELETE CASCADE,
    tahun_ajaran_id UUID REFERENCES public.tahun_ajaran(id),
    dokumen_type_id UUID REFERENCES public.dokumen_type(id),
    cloudinary_url TEXT,
    cloudinary_public_id TEXT,
    uploaded_at TIMESTAMP DEFAULT now(),
    UNIQUE (nisn, tahun_ajaran_id, dokumen_type_id)
);

-- LANGKAH 6 — Buat tabel foto
-- Menyimpan link foto siswa per tahun ajaran
CREATE TABLE public.foto (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nisn TEXT REFERENCES public.siswa_permanent(nisn) ON DELETE CASCADE,
    tahun_ajaran_id UUID REFERENCES public.tahun_ajaran(id),
    cloudinary_url TEXT,
    cloudinary_public_id TEXT,
    uploaded_at TIMESTAMP DEFAULT now(),
    UNIQUE (nisn, tahun_ajaran_id)
);

-- LANGKAH 7 — Migrasi data dari tabel siswa lama
-- 7a. Isi siswa_permanent (mengambil data unik per NISN, ambil prioritas data kelas tertinggi)
INSERT INTO public.siswa_permanent (nisn, nipd, nama_lengkap, email_aktif, no_whatsapp, kode_akses, tahun_lulus)
SELECT DISTINCT ON (nisn) nisn, nipd, nama_lengkap, email_aktif, no_whatsapp, kode_akses, tahun_lulus
FROM public.siswa
WHERE NULLIF(TRIM(nisn), '') IS NOT NULL
ORDER BY nisn, kelas DESC;

-- 7b. Isi enrollment (mengaitkan siswa dengan tahun ajaran '2025/2026')
INSERT INTO public.enrollment (kode, nisn, kelas, tahun_ajaran_id)
SELECT s.kode, s.nisn, s.kelas, ta.id
FROM public.siswa s
JOIN public.tahun_ajaran ta ON ta.nama = '2025/2026'
WHERE NULLIF(TRIM(s.nisn), '') IS NOT NULL;

-- LANGKAH 8 — Rename tabel lama
-- Menyimpan tabel lama sebagai backup
ALTER TABLE public.siswa RENAME TO siswa_backup;

-- LANGKAH 9 — Buat VIEW untuk kemudahan query di React
-- View ini akan menggabungkan identitas, enrollment, dan tahun ajaran
CREATE VIEW public.siswa_lengkap AS
SELECT 
    p.nisn,
    p.nipd,
    p.nama_lengkap,
    p.email_aktif,
    p.no_whatsapp,
    p.kode_akses,
    p.tahun_lulus,
    e.kode,
    e.kelas,
    ta.nama AS tahun_ajaran,
    ta.is_aktif
FROM public.siswa_permanent p
JOIN public.enrollment e ON p.nisn = e.nisn
JOIN public.tahun_ajaran ta ON e.tahun_ajaran_id = ta.id;
