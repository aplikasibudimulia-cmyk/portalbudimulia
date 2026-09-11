-- ============================================================
-- AKTIFKAN REALTIME UNTUK PENGAJUAN POIN & CATATAN POIN
-- Menjamin event database (Disetujui/Revisi/Tolak) otomatis
-- terkirim secara instan ke HP Android siswa melalui WebSocket
-- ============================================================

DO $$
BEGIN
  -- Tambahkan tabel pengajuan_poin_positif ke publication realtime
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'pengajuan_poin_positif'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pengajuan_poin_positif;
  END IF;

  -- Tambahkan tabel point_records ke publication realtime
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'point_records'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.point_records;
  END IF;

  -- Tambahkan tabel presensi_harian ke publication realtime
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'presensi_harian'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.presensi_harian;
  END IF;
END $$;
