-- ==============================================================================
-- JURNAL MENGAJAR GURU (mengikuti jadwal_pelajaran)
-- Jalankan sekali di Supabase SQL Editor.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.jurnal_mengajar (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tahun_ajaran_id     UUID REFERENCES public.tahun_ajaran(id) ON DELETE CASCADE,
  semester            INTEGER NOT NULL DEFAULT 1,
  guru_id             UUID NOT NULL REFERENCES public.guru(id) ON DELETE CASCADE,
  jadwal_id           UUID REFERENCES public.jadwal_pelajaran(id) ON DELETE SET NULL,
  tanggal             DATE NOT NULL,
  hari                TEXT,
  kelas               TEXT NOT NULL,
  mata_pelajaran_id   UUID REFERENCES public.mata_pelajaran(id) ON DELETE SET NULL,
  jam_ke_awal         INTEGER,
  jam_ke_akhir        INTEGER,
  waktu_mulai         TIME,
  waktu_selesai       TIME,
  status              TEXT NOT NULL DEFAULT 'terlaksana'
                      CHECK (status IN ('terlaksana', 'tidak_terlaksana')),
  materi              TEXT,
  kegiatan            TEXT,
  siswa_tidak_hadir   TEXT,
  catatan             TEXT,
  alasan              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_jurnal_guru_jadwal_tanggal UNIQUE (guru_id, jadwal_id, tanggal)
);

CREATE INDEX IF NOT EXISTS idx_jurnal_guru_tanggal ON public.jurnal_mengajar (guru_id, tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_jurnal_tanggal ON public.jurnal_mengajar (tanggal);

ALTER TABLE public.jurnal_mengajar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jurnal_mengajar_staff_all" ON public.jurnal_mengajar;
CREATE POLICY "jurnal_mengajar_staff_all"
  ON public.jurnal_mengajar
  FOR ALL TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

REVOKE ALL ON public.jurnal_mengajar FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jurnal_mengajar TO anon, authenticated, service_role;

-- Trigger pelindung (siswa/ortu ditolak walau lolos policy) + updated_at otomatis
DROP TRIGGER IF EXISTS trg_guard_staff_jurnal_mengajar ON public.jurnal_mengajar;
CREATE TRIGGER trg_guard_staff_jurnal_mengajar
  BEFORE INSERT OR UPDATE OR DELETE ON public.jurnal_mengajar
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

CREATE OR REPLACE FUNCTION public.fn_jurnal_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jurnal_touch_updated_at ON public.jurnal_mengajar;
CREATE TRIGGER trg_jurnal_touch_updated_at
  BEFORE UPDATE ON public.jurnal_mengajar
  FOR EACH ROW EXECUTE FUNCTION public.fn_jurnal_touch_updated_at();
