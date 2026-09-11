-- Migration: Tambah kolom rt_rw pada tabel siswa_permanent (Opsional)
-- Jalankan sekali di Supabase Dashboard > SQL Editor jika ingin menyimpan RT/RW di kolom terpisah

ALTER TABLE public.siswa_permanent
  ADD COLUMN IF NOT EXISTS rt_rw text;

-- Catatan:
-- Aplikasi eBudimulia saat ini secara otomatis dan aman menggabungkan RT/RW
-- ke dalam kolom alamat lengkap ("Jl. Contoh No. 1, RT 01/RW 02") agar kartu pelajar
-- langsung tercetak sempurna tanpa harus bergantung pada perubahan skema database.
