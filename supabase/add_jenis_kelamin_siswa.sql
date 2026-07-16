-- Migration: Tambah kolom jenis_kelamin pada tabel siswa_permanent
-- Jalankan sekali di Supabase Dashboard > SQL Editor

ALTER TABLE public.siswa_permanent
  ADD COLUMN IF NOT EXISTS jenis_kelamin text;

-- Kolom ini menyimpan jenis kelamin siswa.
-- Nilai yang valid: 'L' (Laki-laki) atau 'P' (Perempuan), atau NULL jika belum diisi.
-- Dapat diisi melalui Import Excel di halaman Manajemen Akun (Admin).
