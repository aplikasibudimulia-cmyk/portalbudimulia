-- Pastikan ekstensi pg_net dan pg_cron sudah diaktifkan di Supabase Dashboard -> Database -> Extensions

-- 1. Hapus job lama jika ada
SELECT cron.unschedule('invoke-presensi-reminder');

-- 2. Buat jadwal baru (Setiap Senin-Jumat jam 07:05)
-- Format Cron: menit jam hari_bulan bulan hari_minggu
-- Waktu di cron menggunakan zona waktu UTC, jadi jika Indonesia (WIB = UTC+7), jam 07:05 WIB = jam 00:05 UTC.
-- Pastikan Anda sudah menyetel setting timezone pg_cron ke 'Asia/Jakarta' atau gunakan jam 00:05 di cron jika masih UTC.
-- Untuk amannya, mari kita asumsikan zona waktu pg_cron Anda sudah di-set ke Asia/Jakarta atau kita jadwalkan dengan jam WIB: '05 07 * * 1-5'

SELECT cron.schedule(
    'invoke-presensi-reminder',
    '*/5 * * * 1-5', 
    $$
    SELECT net.http_post(
        url := 'https://ngdepacckohoxemlauhd.supabase.co/functions/v1/presensi-reminder',
        headers := '{"Content-Type": "application/json", "Authorization": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nZGVwYWNja29ob3hlbWxhdWhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MDc2MDMsImV4cCI6MjA5NTI4MzYwM30.mF_IUtRel7YjUHEq3oKKFOczDkGDa1ZTgyBVp8sKsmc"}'::jsonb,
        body := '{}'::jsonb
    ) AS request_id;
    $$
);

-- Note: Jangan lupa ganti YOUR_SUPABASE_ANON_KEY dengan anon key Supabase Anda!
