-- ============================================================
-- FIX REALTIME MONITORING & REPLICA IDENTITY CBT
-- Menjamin pembaruan status ujian siswa muncul secara realtime (<50ms)
-- di layar pengawas/guru tanpa perlu refresh halaman manual.
-- ============================================================

-- 1. Pastikan tabel cbt_peserta_ujian dan cbt_sesi_ujian masuk publikasi supabase_realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'cbt_peserta_ujian'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cbt_peserta_ujian;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'cbt_sesi_ujian'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cbt_sesi_ujian;
  END IF;
END $$;

-- 2. Set REPLICA IDENTITY FULL agar seluruh kolom (sesi_id, siswa_nisn, status) dikirim di payload realtime
ALTER TABLE public.cbt_peserta_ujian REPLICA IDENTITY FULL;
ALTER TABLE public.cbt_sesi_ujian REPLICA IDENTITY FULL;

-- 3. Bersihkan seluruh sesi kadaluarsa / tersisa dari hari sebelumnya yang masih 'sedang_mengerjakan'
UPDATE public.cbt_peserta_ujian p
SET status = 'selesai',
    waktu_selesai = p.waktu_mulai + ((COALESCE(s.durasi_menit, 90) + COALESCE(p.extra_waktu_menit, 0)) * interval '1 minute'),
    is_blocked = false,
    nilai_akhir = COALESCE(p.nilai_akhir, 0)
FROM public.cbt_sesi_ujian s
WHERE p.sesi_id = s.id
  AND p.status IN ('sedang_mengerjakan', 'terkunci')
  AND p.waktu_mulai IS NOT NULL
  AND (p.waktu_mulai + ((COALESCE(s.durasi_menit, 90) + COALESCE(p.extra_waktu_menit, 0)) * interval '1 minute')) < now();

-- 4. Berikan izin akses penuh ke anon, authenticated, dan service_role
GRANT ALL ON public.cbt_peserta_ujian TO anon, authenticated, service_role;
GRANT ALL ON public.cbt_sesi_ujian TO anon, authenticated, service_role;
