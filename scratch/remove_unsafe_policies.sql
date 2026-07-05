-- ============================================================
-- CLEANUP: Hapus Policy Bocor & Terapkan Penguncian RLS Ketat
-- Jalankan ini di Supabase SQL Editor.
--
-- Masalah: Ditemukan policy lama bernama "anon_read_akun_pengguna" 
-- dan sejenisnya yang bernilai "USING (true)" (akses tanpa batas)
-- untuk anon/authenticated. Policy longgar ini menimpa policy aman kita.
--
-- Solusi: 
-- 1. Hapus seluruh policy lama/longgar pada tabel utama.
-- 2. Terapkan RLS ketat untuk tabel 'guru' juga.
-- ============================================================

-- 1. Hapus semua policy selain policy "Akses ..." yang aman
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT schemaname, tablename, policyname 
    FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename IN ('siswa_permanent', 'akun_pengguna', 'nilai_siswa', 'presensi_harian', 'guidance_logs', 'student_points', 'point_records', 'guru')
      AND policyname NOT IN (
        'Akses siswa_permanent', 
        'Akses akun_pengguna', 
        'Akses nilai_siswa', 
        'Akses presensi_harian', 
        'Akses guidance_logs', 
        'Akses student_points', 
        'Akses point_records'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;


-- 2. Pastikan RLS aktif di tabel 'guru'
ALTER TABLE public.guru ENABLE ROW LEVEL SECURITY;

-- 3. Buat policy aman untuk tabel 'guru'
DROP POLICY IF EXISTS "Akses guru" ON public.guru;
DROP POLICY IF EXISTS "Modifikasi guru" ON public.guru;

-- Membaca data guru boleh dilakukan oleh siapa saja yang login (authenticated)
CREATE POLICY "Akses guru" ON public.guru
  FOR SELECT
  TO authenticated
  USING (true);

-- Menambah/mengedit/menghapus data guru hanya boleh dilakukan oleh Admin
CREATE POLICY "Modifikasi guru" ON public.guru
  FOR ALL
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );
