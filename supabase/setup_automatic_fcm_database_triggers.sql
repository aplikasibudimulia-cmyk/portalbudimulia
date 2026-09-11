-- ====================================================================
-- AUTOMATIC DATABASE TRIGGERS FOR FCM PUSH NOTIFICATIONS
-- Mengirim push notification ke HP Orang Tua & Siswa secara otomatis dari database
-- ====================================================================

-- 1. Pastikan ekstensi pg_net aktif (Ekstensi bawaan Supabase untuk HTTP request)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. FUNCTION TRIGGER UNTUK PRESENSI HARIAN
CREATE OR REPLACE FUNCTION public.trigger_fcm_presensi_harian()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_supabase_url TEXT;
    v_anon_key TEXT;
    v_nama TEXT := 'Siswa';
    v_tipe_label TEXT := 'Masuk';
    v_status_label TEXT := 'Hadir';
BEGIN
    -- Ambil nama lengkap siswa dari master_siswa
    SELECT COALESCE(nama_lengkap, nama, 'Siswa') INTO v_nama
    FROM public.master_siswa
    WHERE nisn = NEW.siswa_nisn
    LIMIT 1;

    IF NEW.tipe = 'pulang' THEN
        v_tipe_label := 'Pulang';
    ELSE
        v_tipe_label := 'Masuk';
    END IF;

    IF NEW.status = 'H' THEN
        v_status_label := 'Hadir';
    ELSIF NEW.status = 'T' THEN
        v_status_label := 'Terlambat';
    ELSIF NEW.status = 'P' THEN
        v_status_label := 'Selesai KBM';
    ELSE
        v_status_label := NEW.status;
    END IF;

    -- Kirim HTTP POST ke Edge Function notify-ortu secara asynchronous
    PERFORM extensions.http_post(
        url := 'https://ngdepacckohoxemlauhd.supabase.co/functions/v1/notify-ortu',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nZGVwYWNja29ob3hlbWxhdWhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1MDk3ODMsImV4cCI6MjA1NDA4NTc4M30.vG_fJ8q54x-Q_mD3c4Z9Gk2o9r-M_v_k2l_v'
        ),
        body := jsonb_build_object(
            'nisn', NEW.siswa_nisn,
            'namaLengkap', v_nama,
            'statusLabel', v_status_label,
            'waktu', NEW.waktu,
            'tipeLabel', v_tipe_label,
            'lokasi', NEW.keterangan,
            'selfieUrl', NEW.selfie_url
        )
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Jangan gagalkan transaksi presensi jika trigger notifikasi error
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fcm_presensi_harian ON public.presensi_harian;
CREATE TRIGGER trg_fcm_presensi_harian
    AFTER INSERT ON public.presensi_harian
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_fcm_presensi_harian();


-- 3. FUNCTION TRIGGER UNTUK TRANSAKSI TABUNGAN
CREATE OR REPLACE FUNCTION public.trigger_fcm_tabungan_transaksi()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_nama TEXT := 'Siswa';
BEGIN
    -- Hanya kirim notifikasi jika status_verifikasi adalah VERIFIED
    IF NEW.status_verifikasi = 'VERIFIED' AND (OLD IS NULL OR OLD.status_verifikasi <> 'VERIFIED') THEN
        -- Ambil nama siswa
        SELECT COALESCE(nama_lengkap, nama, 'Siswa') INTO v_nama
        FROM public.master_siswa
        WHERE nisn = NEW.siswa_nisn
        LIMIT 1;

        PERFORM extensions.http_post(
            url := 'https://ngdepacckohoxemlauhd.supabase.co/functions/v1/notify-tabungan',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nZGVwYWNja29ob3hlbWxhdWhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1MDk3ODMsImV4cCI6MjA1NDA4NTc4M30.vG_fJ8q54x-Q_mD3c4Z9Gk2o9r-M_v_k2l_v'
            ),
            body := jsonb_build_object(
                'nisn', NEW.siswa_nisn,
                'namaSiswa', v_nama,
                'nominal', NEW.jumlah,
                'totalSaldo', NEW.saldo_akhir,
                'tipe', NEW.tipe
            )
        );
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fcm_tabungan_transaksi ON public.tabungan_transaksi;
CREATE TRIGGER trg_fcm_tabungan_transaksi
    AFTER INSERT OR UPDATE OF status_verifikasi ON public.tabungan_transaksi
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_fcm_tabungan_transaksi();
