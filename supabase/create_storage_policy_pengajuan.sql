-- ============================================================
-- MIGRATION Step 2: Storage Policy untuk bucket "bukti-pengajuan"
-- Jalankan SETELAH membuat bucket "bukti-pengajuan" di Supabase Dashboard
-- ============================================================

CREATE POLICY "Allow all on bukti-pengajuan"
  ON storage.objects
  FOR ALL
  USING  (bucket_id = 'bukti-pengajuan')
  WITH CHECK (bucket_id = 'bukti-pengajuan');
