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

-- Create policies to allow direct read/write for authenticated/anon clients (matching the app's SPA client pattern)
CREATE POLICY "anon_rw_guru_document_requirements"
  ON public.guru_document_requirements FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "anon_rw_guru_document_uploads"
  ON public.guru_document_uploads FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
