-- Table: guru_document_requirements
CREATE TABLE IF NOT EXISTS public.guru_document_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_dokumen TEXT NOT NULL,
    deskripsi TEXT,
    tahun_ajaran_id UUID REFERENCES public.tahun_ajaran(id) ON DELETE CASCADE,
    is_wajib BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Table: guru_document_uploads
CREATE TABLE IF NOT EXISTS public.guru_document_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requirement_id UUID REFERENCES public.guru_document_requirements(id) ON DELETE CASCADE,
    guru_id UUID REFERENCES public.guru(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    cloudinary_public_id TEXT,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(requirement_id, guru_id)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.guru_document_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guru_document_uploads ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "anon_rw_guru_document_requirements" ON public.guru_document_requirements;
DROP POLICY IF EXISTS "anon_rw_guru_document_uploads" ON public.guru_document_uploads;

-- READ: Hanya Guru/Admin yang bisa melihat daftar syarat dokumen & uploads
CREATE POLICY "guru_doc_req_staff_read"
  ON public.guru_document_requirements FOR SELECT TO anon, authenticated
  USING (public.fn_is_authorized_staff());

CREATE POLICY "guru_doc_req_staff_write"
  ON public.guru_document_requirements FOR ALL TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

CREATE POLICY "guru_doc_uploads_staff_read"
  ON public.guru_document_uploads FOR SELECT TO anon, authenticated
  USING (public.fn_is_authorized_staff());

CREATE POLICY "guru_doc_uploads_staff_write"
  ON public.guru_document_uploads FOR ALL TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

-- Trigger Guard: hanya staff yang bisa menulis
DROP TRIGGER IF EXISTS trg_guard_staff_guru_doc_req ON public.guru_document_requirements;
CREATE TRIGGER trg_guard_staff_guru_doc_req
  BEFORE INSERT OR UPDATE OR DELETE ON public.guru_document_requirements
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

DROP TRIGGER IF EXISTS trg_guard_staff_guru_doc_uploads ON public.guru_document_uploads;
CREATE TRIGGER trg_guard_staff_guru_doc_uploads
  BEFORE INSERT OR UPDATE OR DELETE ON public.guru_document_uploads
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();
