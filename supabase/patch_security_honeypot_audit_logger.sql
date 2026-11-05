-- ==============================================================================
-- 🍯 SECURITY HONEYPOT & TAMPER AUDIT LOGGING — eBudimulia
-- ==============================================================================
-- Fitur: Menangkap setiap percobaan peretasan / manipulasi data (walaupun gagal),
--        menetralisir perubahan ilegal, dan mencatat identitas pelaku ke activity_log.
-- ==============================================================================

-- 1. HONEYPOT POIN SISWA (student_points)
-- Jika siswa mencoba tembak API mengubah total_poin (misal diubah jadi 9999):
-- Angka dinetralisir kembali ke hitungan sah DAN dicatat ke log peretasan.
CREATE OR REPLACE FUNCTION public.fn_sync_student_points_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sum_delta INTEGER := 0;
  v_default INTEGER := 100;
  v_calculated INTEGER := 100;
BEGIN
  -- Hitung total poin riil dari seluruh record resmi di point_records
  SELECT COALESCE(SUM(poin_diberikan), 0)
  INTO v_sum_delta
  FROM public.point_records
  WHERE nisn = NEW.nisn
    AND (tahun_ajaran_id = NEW.tahun_ajaran_id OR NEW.tahun_ajaran_id IS NULL)
    AND (semester = NEW.semester OR NEW.semester IS NULL);

  v_default := COALESCE(NEW.poin_default, 100);
  v_calculated := v_default + v_sum_delta;

  -- DETEKSI MANIPULASI: Jika klien mencoba mengirim angka yang berbeda dari kalkulasi riil
  IF TG_OP = 'UPDATE' AND NEW.total_poin IS DISTINCT FROM v_calculated THEN
    -- Catat rekam jejak percobaan peretasan ke activity_log
    BEGIN
      INSERT INTO public.activity_log (user_id, user_role, action, details, created_at)
      VALUES (
        NEW.nisn,
        'SUSPECT_HACKER',
        '🚨 Percobaan Manipulasi Poin Terdeteksi',
        'Siswa (NISN: ' || COALESCE(NEW.nisn, '-') || ') mencoba mengubah total_poin dari ' || COALESCE(OLD.total_poin, 100) || ' menjadi ' || NEW.total_poin || '. Nilai berhasil dinetralisir kembali ke kalkulasi sah (' || v_calculated || ').',
        NOW()
      );
    EXCEPTION WHEN OTHERS THEN
      -- Abaikan error log agar transaksi database utama tidak gagal
    END;
  END IF;

  -- Kunci angka total_poin agar selalu kembali ke kalkulasi riil
  NEW.total_poin := v_calculated;
  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_student_points_integrity ON public.student_points;
CREATE TRIGGER trg_protect_student_points_integrity
BEFORE INSERT OR UPDATE ON public.student_points
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_student_points_integrity();


-- 2. HONEYPOT TAGIHAN SPP (tagihan_spp)
-- Jika siswa mencoba mengubah status tagihan jadi 'LUNAS' tanpa pembayaran sah:
-- Status dinetralisir kembali DAN dicatat ke log peretasan.
CREATE OR REPLACE FUNCTION public.fn_guard_tagihan_spp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Jika status dicoba diubah menjadi LUNAS tanpa nominal dibayar sah
  IF NEW.status = 'LUNAS' AND (OLD.status IS DISTINCT FROM 'LUNAS') AND (NEW.nominal_dibayar IS NULL OR NEW.nominal_dibayar <= 0) THEN
    BEGIN
      INSERT INTO public.activity_log (user_id, user_role, action, details, created_at)
      VALUES (
        NEW.siswa_nisn,
        'SUSPECT_HACKER',
        '🚨 Percobaan Manipulasi SPP Terdeteksi',
        'Percobaan mengubah status tagihan SPP ' || COALESCE(NEW.bulan, '-') || '/' || COALESCE(NEW.tahun, 0) || ' (NISN: ' || COALESCE(NEW.siswa_nisn, '-') || ') menjadi LUNAS tanpa bukti bayar sah. Aksi dinetralisir.',
        NOW()
      );
    EXCEPTION WHEN OTHERS THEN
    END;

    -- Netralisir kembali ke status lama
    NEW.status := OLD.status;
    NEW.nominal_dibayar := OLD.nominal_dibayar;
    NEW.tanggal_bayar := OLD.tanggal_bayar;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_tagihan_spp ON public.tagihan_spp;
CREATE TRIGGER trg_guard_tagihan_spp
BEFORE UPDATE ON public.tagihan_spp
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_tagihan_spp();


-- 3. HONEYPOT PRESENSI LAMPAU (presensi_harian)
-- Jika siswa mencoba mengedit absensi tanggal yang sudah lewat menjadi Hadir:
-- Status dinetralisir kembali DAN dicatat ke log peretasan.
CREATE OR REPLACE FUNCTION public.fn_guard_presensi_harian()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.tanggal < (CURRENT_DATE - INTERVAL '1 day') THEN
      IF (NEW.status IS DISTINCT FROM OLD.status) AND (NEW.diedit_oleh IS NULL OR TRIM(NEW.diedit_oleh) = '') THEN
        BEGIN
          INSERT INTO public.activity_log (user_id, user_role, action, details, created_at)
          VALUES (
            NEW.siswa_nisn,
            'SUSPECT_HACKER',
            '🚨 Percobaan Manipulasi Absensi Lampau Terdeteksi',
            'Siswa (NISN: ' || COALESCE(NEW.siswa_nisn, '-') || ') mencoba mengubah status absensi tanggal ' || OLD.tanggal || ' dari ' || OLD.status || ' menjadi ' || NEW.status || '. Aksi dinetralisir kembali.',
            NOW()
          );
        EXCEPTION WHEN OTHERS THEN
        END;

        -- Kembalikan ke status asli
        NEW.status := OLD.status;
        NEW.waktu := OLD.waktu;
      END IF;
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_presensi_harian ON public.presensi_harian;
CREATE TRIGGER trg_guard_presensi_harian
BEFORE UPDATE ON public.presensi_harian
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_presensi_harian();


-- 4. HONEYPOT AKUN ROLE (akun_pengguna)
-- Jika pengguna biasa mencoba menaikkan rolenya menjadi 'admin' via REST API:
-- Role dinetralisir DAN dicatat ke log peretasan.
CREATE OR REPLACE FUNCTION public.fn_guard_akun_role_tamper()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.role IN ('admin', 'staff', 'guru') AND OLD.role NOT IN ('admin', 'staff', 'guru') THEN
      BEGIN
        INSERT INTO public.activity_log (user_id, user_role, action, details, created_at)
        VALUES (
          NEW.username,
          'SUSPECT_HACKER',
          '🚨 Percobaan Pembajakan Hak Akses Admin Terdeteksi',
          'Akun (' || COALESCE(NEW.username, '-') || ') mencoba menaikkan role dari ' || OLD.role || ' menjadi ' || NEW.role || '. Aksi dibatalkan dan dinetralisir.',
          NOW()
        );
      EXCEPTION WHEN OTHERS THEN
      END;

      -- Netralisir kembali ke role asal
      NEW.role := OLD.role;
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_akun_role_tamper ON public.akun_pengguna;
CREATE TRIGGER trg_guard_akun_role_tamper
BEFORE UPDATE ON public.akun_pengguna
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_akun_role_tamper();

NOTIFY pgrst, 'reload schema';
