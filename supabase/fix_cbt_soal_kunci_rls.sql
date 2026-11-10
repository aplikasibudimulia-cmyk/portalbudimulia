-- ==============================================================================
-- FIX RLS POLICY FOR CBT SOAL KUNCI (SMP BUDI MULIA)
-- Mengisolasi tabel cbt_soal_kunci agar HANYA Guru / Pengawas / Admin & RPC Server
-- yang dapat membaca dan menulis kunci jawaban (mencegah kebocoran ke akun siswa).
-- ==============================================================================

ALTER TABLE public.cbt_soal_kunci ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cbt_soal_kunci TO authenticated, anon, service_role;

DROP POLICY IF EXISTS "allow_all_cbt_soal_kunci" ON public.cbt_soal_kunci;
DROP POLICY IF EXISTS "cbt_soal_kunci_staff_only" ON public.cbt_soal_kunci;
CREATE POLICY "cbt_soal_kunci_staff_only" ON public.cbt_soal_kunci
FOR ALL TO anon, authenticated
USING (public.fn_is_authorized_staff())
WITH CHECK (public.fn_is_authorized_staff());
