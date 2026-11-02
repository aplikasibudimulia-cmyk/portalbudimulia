-- ============================================================
-- AKTIFKAN SUPABASE REALTIME UNTUK CBT
-- Menjamin event database cbt_peserta_ujian (Extra Waktu, Block, Unlock)
-- otomatis terkirim secara instan ke layar siswa melalui WebSocket
-- ============================================================

DO $$
BEGIN
  -- 1. Tambahkan tabel cbt_peserta_ujian ke publication realtime
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'cbt_peserta_ujian'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cbt_peserta_ujian;
  END IF;

  -- Pastikan REPLICA IDENTITY FULL agar payload.new dan payload.old dikirim lengkap
  ALTER TABLE public.cbt_peserta_ujian REPLICA IDENTITY FULL;

  -- 2. Tambahkan tabel cbt_sesi_ujian ke publication realtime
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'cbt_sesi_ujian'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cbt_sesi_ujian;
  END IF;

  ALTER TABLE public.cbt_sesi_ujian REPLICA IDENTITY FULL;
END $$;
