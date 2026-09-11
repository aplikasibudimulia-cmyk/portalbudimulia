-- ==============================================================================
-- Migration: Fix Update RLS and provide helper function for No HP Orang Tua
-- ==============================================================================

-- 1. Berikan policy UPDATE pada tabel siswa_permanent untuk anon dan authenticated
ALTER TABLE IF EXISTS public.siswa_permanent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_update_siswa_permanent" ON public.siswa_permanent;
CREATE POLICY "allow_update_siswa_permanent" 
ON public.siswa_permanent 
FOR UPDATE 
TO anon, authenticated 
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_siswa_permanent" ON public.siswa_permanent;
CREATE POLICY "allow_all_siswa_permanent" 
ON public.siswa_permanent 
FOR ALL 
TO anon, authenticated 
USING (true)
WITH CHECK (true);

-- 2. Fungsi update_no_hp_ortu_siswa (SECURITY DEFINER) agar update selalu berhasil
CREATE OR REPLACE FUNCTION public.update_no_hp_ortu_siswa(
  p_nisn TEXT,
  p_no_hp TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cleaned TEXT;
BEGIN
  IF p_nisn IS NULL OR p_nisn = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'NISN tidak valid');
  END IF;

  v_cleaned := regexp_replace(COALESCE(p_no_hp, ''), '\D', '', 'g');
  IF v_cleaned LIKE '08%' THEN
    v_cleaned := '628' || substring(v_cleaned from 3);
  ELSIF v_cleaned LIKE '8%' THEN
    v_cleaned := '628' || substring(v_cleaned from 2);
  END IF;

  UPDATE public.siswa_permanent
  SET 
    no_hp_ortu = NULLIF(v_cleaned, ''),
    no_whatsapp = NULLIF(v_cleaned, '')
  WHERE nisn::text = p_nisn::text;

  RETURN jsonb_build_object(
    'success', true, 
    'nisn', p_nisn, 
    'no_hp_ortu', NULLIF(v_cleaned, '')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_no_hp_ortu_siswa(TEXT, TEXT) TO anon, authenticated;
