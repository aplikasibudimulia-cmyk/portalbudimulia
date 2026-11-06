-- ==============================================================================
-- FIX: Koreksi Presensi Lampau & Error function pg_catalog.btrim(uuid) does not exist
-- ==============================================================================
-- Masalah:
-- 1. Pada trigger fn_guard_presensi_harian(), pemanggilan TRIM(NEW.diedit_oleh)
--    menimbulkan error "function pg_catalog.btrim(uuid) does not exist" karena
--    kolom diedit_oleh bertipe data UUID.
-- 2. Guru/Staff/Admin yang sah (seperti Pak Pria Trinugroho) harus diizinkan
--    mengoreksi absensi lampau siswa, sedangkan perubahan tanpa identitas guru
--    (percobaan manipulasi oleh siswa) tetap diblokir.
-- ==============================================================================

-- 1. Perbarui fungsi trigger penjaga presensi harian
CREATE OR REPLACE FUNCTION public.fn_guard_presensi_harian()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_editor_id UUID;
  v_is_authorized BOOLEAN := FALSE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Hanya periksa jika status berubah pada tanggal lampau (kemarin atau sebelumnya)
    IF OLD.tanggal < (CURRENT_DATE - INTERVAL '1 day') AND (NEW.status IS DISTINCT FROM OLD.status) THEN
      
      -- Tentukan siapa yang melakukan perubahan (diedit_oleh atau diinput_oleh)
      v_editor_id := COALESCE(NEW.diedit_oleh, NEW.diinput_oleh);
      
      -- Validasi apakah editor adalah Guru, Admin, Staff, atau Piket resmi
      IF v_editor_id IS NOT NULL THEN
        SELECT EXISTS (
          SELECT 1 FROM public.guru WHERE id = v_editor_id
          UNION
          SELECT 1 FROM public.akun_pengguna WHERE id = v_editor_id AND LOWER(role) IN ('guru', 'admin', 'staff', 'staf', 'piket')
        ) INTO v_is_authorized;
      END IF;

      -- Jika TIDAK diubah oleh guru/admin/staf resmi (misal ditembak langsung oleh siswa):
      IF NOT v_is_authorized THEN
        BEGIN
          INSERT INTO public.activity_log (user_id, user_role, action, details, created_at)
          VALUES (
            NEW.siswa_nisn,
            'SUSPECT_HACKER',
            '🚨 Percobaan Manipulasi Absensi Lampau Terdeteksi',
            'Percobaan tanpa hak mengubah status absensi tanggal ' || OLD.tanggal || ' dari ' || OLD.status || ' menjadi ' || NEW.status || ' untuk siswa NISN ' || COALESCE(NEW.siswa_nisn, '-') || '. Aksi dinetralisir.',
            NOW()
          );
        EXCEPTION WHEN OTHERS THEN
        END;

        -- Kembalikan ke status asli jika tidak berwenang
        NEW.status := OLD.status;
        NEW.waktu := OLD.waktu;
        RETURN NEW;
      END IF;

      -- Jika sah diubah oleh guru/staf, pastikan diedit_oleh terisi
      IF NEW.diedit_oleh IS NULL THEN
        NEW.diedit_oleh := v_editor_id;
      END IF;

    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- 2. Pastikan trigger terpasang pada presensi_harian
DROP TRIGGER IF EXISTS trg_guard_presensi_harian ON public.presensi_harian;
CREATE TRIGGER trg_guard_presensi_harian
BEFORE UPDATE ON public.presensi_harian
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_presensi_harian();


-- 3. Eksekusi Koreksi Presensi Lionel Lorenzo (7D) tanggal 2 Oktober 2026:
--    Ubah status dari 'T' (Terlambat) ke 'H' (Hadir) sesuai verifikasi Pak Pria Trinugroho
UPDATE public.presensi_harian
SET 
  status = 'H',
  keterangan = 'Koreksi hadir BMLJ oleh Guru (Pria Trinugroho)',
  diedit_oleh = '0bcd35a9-173f-43af-8cfc-6d25c4541c29', -- ID Pak Pria Trinugroho di tabel guru
  updated_at = NOW()
WHERE siswa_nisn = '0141059508'
  AND tanggal = '2026-10-02'
  AND tipe = 'masuk';
