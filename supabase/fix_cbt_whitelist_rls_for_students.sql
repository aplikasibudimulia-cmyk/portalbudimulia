-- ==============================================================================
-- FIX: Izinkan Siswa Membaca Status Whitelist CBT & Tambah Helper RPC
-- 
-- Masalah:
-- Sebelumnya cbt_whitelist_user hanya memiliki policy "cbt_whitelist_staff_all" 
-- yang membatasi akses SELECT hanya untuk staf (admin/guru).
-- Akibatnya, saat akun Siswa memeriksa apakah dirinya terdaftar sebagai penguji,
-- query mengembalikan [] (kosong) karena tertahan Row Level Security (RLS).
-- ==============================================================================

-- 1. Perbaiki RLS Policy pada cbt_whitelist_user
DROP POLICY IF EXISTS "allow_all_cbt_whitelist_user" ON public.cbt_whitelist_user;
DROP POLICY IF EXISTS "cbt_whitelist_staff_all" ON public.cbt_whitelist_user;
DROP POLICY IF EXISTS "cbt_whitelist_read" ON public.cbt_whitelist_user;
DROP POLICY IF EXISTS "cbt_whitelist_read_all" ON public.cbt_whitelist_user;
DROP POLICY IF EXISTS "cbt_whitelist_staff_write" ON public.cbt_whitelist_user;

-- Siapapun yang terautentikasi / anonim boleh membaca status whitelist CBT
CREATE POLICY "cbt_whitelist_read"
  ON public.cbt_whitelist_user
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- HANYA Staf / Admin yang boleh menambah, mengubah, atau menghapus penguji
CREATE POLICY "cbt_whitelist_staff_write"
  ON public.cbt_whitelist_user
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

GRANT SELECT ON public.cbt_whitelist_user TO anon, authenticated;
GRANT ALL ON public.cbt_whitelist_user TO service_role;

-- 2. Fungsi Helper SECURITY DEFINER untuk Verifikasi Akses Menu CBT Siswa
-- Berfungsi sebagai jaminan akses instan tanpa terhalang RLS apapun di masa depan
CREATE OR REPLACE FUNCTION public.fn_is_cbt_accessible_for_student(p_nisn text, p_kelas text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_active boolean;
  v_is_whitelisted boolean;
BEGIN
  -- 1. Cek Saklar Mode Rilis Publik di cbt_pengaturan
  SELECT is_cbt_active INTO v_is_active 
  FROM public.cbt_pengaturan 
  WHERE id = 1 
  LIMIT 1;

  IF v_is_active = true THEN
    RETURN true;
  END IF;

  -- 2. Cek apakah NISN siswa terdaftar di whitelist penguji
  IF p_nisn IS NOT NULL AND TRIM(p_nisn) <> '' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.cbt_whitelist_user 
      WHERE TRIM(nisn) = TRIM(p_nisn) AND role = 'siswa'
    ) INTO v_is_whitelisted;
    
    IF v_is_whitelisted = true THEN
      RETURN true;
    END IF;
  END IF;

  -- 3. Cek apakah kelas siswa memiliki Sesi Ujian aktif / mendatang
  IF p_kelas IS NOT NULL AND TRIM(p_kelas) <> '' THEN
    IF EXISTS (
      SELECT 1 FROM public.cbt_sesi_ujian
      WHERE status <> 'draft'
        AND (
          kelas_ids @> ARRAY[TRIM(p_kelas)]
          OR kelas_ids @> ARRAY[REGEXP_REPLACE(TRIM(p_kelas), '^kelas\s*', '', 'i')]
          OR kelas_ids @> ARRAY['Kelas ' || REGEXP_REPLACE(TRIM(p_kelas), '^kelas\s*', '', 'i')]
        )
    ) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_is_cbt_accessible_for_student(text, text) TO anon, authenticated;

-- 3. Update fn_cbt_get_student_review agar menyertakan kunci_jawaban untuk siswa yang telah menyelesaikan ujian
CREATE OR REPLACE FUNCTION public.fn_cbt_get_student_review(
  p_peserta_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_peserta RECORD;
  v_sesi RECORD;
  v_result JSONB;
BEGIN
  SELECT * INTO v_peserta FROM public.cbt_peserta_ujian WHERE id = p_peserta_id;
  IF NOT FOUND THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT * INTO v_sesi FROM public.cbt_sesi_ujian WHERE id = v_peserta.sesi_id;
  IF NOT FOUND THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Hanya berikan pembahasan jika peserta sudah selesai (atau pengawas/staf resmi)
  IF v_peserta.status <> 'selesai' AND NOT public.fn_is_authorized_staff() THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', so.id,
      'nomor_urut', so.nomor_urut,
      'tipe_soal', so.tipe_soal,
      'pertanyaan', so.pertanyaan,
      'opsi', so.opsi,
      'bobot', so.bobot,
      'kunci_jawaban', k.kunci_jawaban,
      'pembahasan', k.pembahasan,
      'jawaban_siswa', j.jawaban_terpilih,
      'is_correct', pj.is_correct,
      'skor', COALESCE(pj.skor, 0)
    ) ORDER BY so.nomor_urut ASC
  ), '[]'::jsonb)
  INTO v_result
  FROM public.cbt_soal so
  LEFT JOIN public.cbt_soal_kunci k ON k.soal_id = so.id
  LEFT JOIN public.cbt_jawaban_siswa j ON j.soal_id = so.id AND j.peserta_id = p_peserta_id
  LEFT JOIN public.cbt_penilaian_jawaban pj ON pj.jawaban_id = j.id
  WHERE so.bank_soal_id = v_sesi.bank_soal_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_cbt_get_student_review(UUID) TO anon, authenticated, service_role;

