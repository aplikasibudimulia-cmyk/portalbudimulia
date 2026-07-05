-- 1. Hapus job lama jika ada
SELECT cron.unschedule('invoke-presensi-reminder');

-- 2. Buat jadwal baru (Setiap 1 menit agar bisa memproses interval pengingat dinamis)
-- Format Cron: menit jam hari_bulan bulan hari_minggu
-- Waktu di cron menggunakan zona waktu UTC atau Asia/Jakarta tergantung konfigurasi pg_cron Anda.
-- Berjalan setiap menit dari Senin-Jumat: '* * * * 1-5'
SELECT cron.schedule(
    'invoke-presensi-reminder',
    '* * * * 1-5', 
    $$
    SELECT net.http_post(
        url := 'https://ngdepacckohoxemlauhd.supabase.co/functions/v1/presensi-reminder',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nZGVwYWNja29ob3hlbWxhdWhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MDc2MDMsImV4cCI6MjA5NTI4MzYwM30.mF_IUtRel7YjUHEq3oKKFOczDkGDa1ZTgyBVp8sKsmc"}'::jsonb,
        body := '{}'::jsonb
    ) AS request_id;
    $$
);
