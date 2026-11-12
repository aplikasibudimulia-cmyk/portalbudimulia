-- ==============================================================================
-- 🛠️ FIX TRIGGER PENGAJUAN POIN: record "new" has no field "poin"
-- ==============================================================================
-- Masalah:
-- Fungsi trigger fn_guard_pengajuan_poin_status() pada tabel pengajuan_poin_positif
-- merujuk ke kolom NEW.poin dan OLD.poin, padahal nama kolom aslinya di tabel
-- adalah poin_diajukan. Akibatnya saat Admin/Guru menekan Setujui (Approve),
-- Postgres melemparkan error: "record 'new' has no field 'poin'".
--
-- Solusi:
-- Update fungsi trigger fn_guard_pengajuan_poin_status() dengan nama kolom
-- yang tepat (poin_diajukan).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_guard_pengajuan_poin_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.fn_is_authorized_staff() THEN
      NEW.status := 'pending';
    END IF;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Gunakan nama kolom yang benar: poin_diajukan
    IF (NEW.status IS DISTINCT FROM OLD.status OR NEW.poin_diajukan IS DISTINCT FROM OLD.poin_diajukan)
       AND NOT public.fn_is_authorized_staff() THEN
      BEGIN
        INSERT INTO public.activity_log (aktor, aksi, detail, created_at)
        VALUES (
          'SUSPECT_HACKER (NISN: ' || COALESCE(NEW.nisn, 'unknown') || ')',
          '🚨 Percobaan Approve Poin Sendiri Diblokir',
          'Siswa (NISN: ' || COALESCE(NEW.nisn, '-') || ') mencoba mengubah status pengajuan poin dari ' || COALESCE(OLD.status, '-') || ' menjadi ' || COALESCE(NEW.status, '-') || '. Aksi dinetralisir.',
          NOW()
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
      NEW.status := OLD.status;
      NEW.poin_diajukan := OLD.poin_diajukan;
      NEW.reviewed_by := OLD.reviewed_by;
      NEW.reviewed_at := OLD.reviewed_at;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF NOT public.fn_is_authorized_staff() THEN
      RAISE EXCEPTION 'Akses ditolak: Hanya Guru / Admin yang dapat menghapus data pengajuan poin.';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

-- Pastikan trigger terpasang dengan benar pada tabel pengajuan_poin_positif
DROP TRIGGER IF EXISTS trg_guard_pengajuan_poin_status ON public.pengajuan_poin_positif;
CREATE TRIGGER trg_guard_pengajuan_poin_status
  BEFORE INSERT OR UPDATE OR DELETE ON public.pengajuan_poin_positif
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_pengajuan_poin_status();
