-- ========================================================
-- MIGRATION: Membuat Tabel Master Jadwal & Booking Konsultasi BK
-- Jalankan script ini di Supabase SQL Editor
-- ========================================================

-- Drop tabel lama jika ada agar skema baru bersih
DROP TABLE IF EXISTS public.bk_konsultasi_booking CASCADE;
DROP TABLE IF EXISTS public.bk_konsultasi_jadwal CASCADE;

-- 1. Tabel Master Jadwal Ketersediaan Guru BK (Per Hari & Jam Berulang)
CREATE TABLE public.bk_konsultasi_jadwal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guru_id UUID NOT NULL REFERENCES public.guru(id) ON DELETE CASCADE,
  hari TEXT NOT NULL CHECK (hari IN ('Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu')),
  jam_mulai TIME NOT NULL,
  jam_selesai TIME NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(guru_id, hari, jam_mulai, jam_selesai)
);

-- 2. Tabel Booking Sesi oleh Siswa (Spesifik Tanggal & Alur Persetujuan & Hasil Selesai)
CREATE TABLE public.bk_konsultasi_booking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jadwal_id UUID NOT NULL REFERENCES public.bk_konsultasi_jadwal(id) ON DELETE CASCADE,
  tanggal DATE NOT NULL,
  siswa_nisn TEXT REFERENCES public.siswa_permanent(nisn) ON DELETE SET NULL,
  siswa_nama TEXT NOT NULL,
  catatan TEXT, -- Pesan/alasan dari siswa
  status TEXT NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu', 'disetujui', 'ditolak', 'selesai')),
  balasan_guru TEXT, -- Balasan/pesan dari guru BK saat terima/tolak
  catatan_hasil TEXT, -- Catatan hasil konsultasi setelah selesai
  tampilkan_hasil_ke_siswa BOOLEAN NOT NULL DEFAULT FALSE, -- Apakah hasil ditampilkan ke siswa
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Mengaktifkan Row Level Security (RLS)
ALTER TABLE public.bk_konsultasi_jadwal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bk_konsultasi_booking ENABLE ROW LEVEL SECURITY;

-- Membuat policy RLS agar semua user terotentikasi bisa mengelola data
CREATE POLICY "Allow all actions on jadwal for authenticated users" 
ON public.bk_konsultasi_jadwal FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all actions on booking for authenticated users" 
ON public.bk_konsultasi_booking FOR ALL USING (true) WITH CHECK (true);

-- Partial Unique Index: Hanya boleh ada 1 booking aktif ('menunggu' atau 'disetujui') per jadwal pada tanggal tersebut.
-- Jika booking ditolak ('ditolak') atau selesai ('selesai'), slot tersebut bebas untuk dibooking kembali.
CREATE UNIQUE INDEX idx_unique_active_booking 
ON public.bk_konsultasi_booking (jadwal_id, tanggal) 
WHERE status IN ('menunggu', 'disetujui');

-- Menambahkan indeks untuk performa pencarian
CREATE INDEX IF NOT EXISTS idx_bk_jadwal_guru ON public.bk_konsultasi_jadwal(guru_id);
CREATE INDEX IF NOT EXISTS idx_bk_booking_tanggal ON public.bk_konsultasi_booking(tanggal);
CREATE INDEX IF NOT EXISTS idx_bk_booking_siswa ON public.bk_konsultasi_booking(siswa_nisn);
CREATE INDEX IF NOT EXISTS idx_bk_booking_status ON public.bk_konsultasi_booking(status);
