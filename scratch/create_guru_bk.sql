-- Buat tabel guru_bk untuk penugasan guru BK per kelas per tahun ajaran
CREATE TABLE IF NOT EXISTS public.guru_bk (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  guru_id     uuid NOT NULL REFERENCES public.guru(id) ON DELETE CASCADE,
  kelas       text NOT NULL,
  tahun_ajaran_id uuid NOT NULL REFERENCES public.tahun_ajaran(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now()
);

-- Index untuk query guru_id
CREATE INDEX IF NOT EXISTS idx_guru_bk_guru_id ON public.guru_bk(guru_id);

-- RLS
ALTER TABLE public.guru_bk ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON public.guru_bk
  FOR ALL USING (true);
