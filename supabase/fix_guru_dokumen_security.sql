-- ==============================================================================
-- 🛡️ FIX KEAMANAN: guru_document_requirements & guru_document_uploads
-- ==============================================================================
-- Masalah: RLS policy lama menggunakan USING(true) WITH CHECK(true) untuk
-- role anon & authenticated → Siswa bisa SELECT, INSERT, UPDATE, DELETE
-- semua dokumen guru. Siswa melaporkan bisa melihat tabel guru_document_uploads.
-- ==============================================================================

-- 1. Bersihkan data sampah/tes (guru_id = NULL)
DELETE FROM public.guru_document_uploads WHERE guru_id IS NULL;

-- ==============================================================================
-- 2. FIX RLS: guru_document_requirements (Daftar kategori dokumen wajib)
-- ==============================================================================
-- Hapus policy lama yang terbuka
DROP POLICY IF EXISTS "anon_rw_guru_document_requirements" ON public.guru_document_requirements;

-- SELECT: Guru/Admin saja yang bisa melihat daftar syarat dokumen
CREATE POLICY "guru_doc_req_staff_read"
  ON public.guru_document_requirements
  FOR SELECT TO anon, authenticated
  USING (public.fn_is_authorized_staff());

-- INSERT/UPDATE/DELETE: Hanya staff yang terotorisasi
CREATE POLICY "guru_doc_req_staff_write"
  ON public.guru_document_requirements
  FOR ALL TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

-- ==============================================================================
-- 3. FIX RLS: guru_document_uploads (File dokumen yang diupload guru)
-- ==============================================================================
-- Hapus policy lama yang terbuka
DROP POLICY IF EXISTS "anon_rw_guru_document_uploads" ON public.guru_document_uploads;

-- SELECT: Guru/Admin saja
CREATE POLICY "guru_doc_uploads_staff_read"
  ON public.guru_document_uploads
  FOR SELECT TO anon, authenticated
  USING (public.fn_is_authorized_staff());

-- INSERT/UPDATE/DELETE: Hanya staff yang terotorisasi
CREATE POLICY "guru_doc_uploads_staff_write"
  ON public.guru_document_uploads
  FOR ALL TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

-- ==============================================================================
-- 4. PASANG TRIGGER GUARD (seperti tabel lain yang sudah dilindungi)
-- ==============================================================================

-- 4a. Trigger pada guru_document_requirements
DROP TRIGGER IF EXISTS trg_guard_staff_guru_doc_req ON public.guru_document_requirements;
CREATE TRIGGER trg_guard_staff_guru_doc_req
  BEFORE INSERT OR UPDATE OR DELETE ON public.guru_document_requirements
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

-- 4b. Trigger pada guru_document_uploads
DROP TRIGGER IF EXISTS trg_guard_staff_guru_doc_uploads ON public.guru_document_uploads;
CREATE TRIGGER trg_guard_staff_guru_doc_uploads
  BEFORE INSERT OR UPDATE OR DELETE ON public.guru_document_uploads
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

-- ==============================================================================
-- 5. VERIFIKASI
-- ==============================================================================
-- Pastikan policies sudah terpasang dengan benar
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE tablename IN ('guru_document_requirements', 'guru_document_uploads')
    AND qual = 'true';
  
  IF v_count > 0 THEN
    RAISE EXCEPTION 'GAGAL: Masih ada % policy USING(true) pada tabel guru_document!', v_count;
  END IF;

  RAISE NOTICE '✅ Semua celah guru_document_requirements & guru_document_uploads berhasil ditutup.';
END $$;
