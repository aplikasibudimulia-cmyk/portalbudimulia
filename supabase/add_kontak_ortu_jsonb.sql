-- ==============================================================================
-- Migration: Tambah kolom kontak_ortu (JSONB) pada siswa_permanent
-- Memungkinkan penyimpanan banyak kontak (Ayah, Ibu, Wali, Orangtua)
-- ==============================================================================

ALTER TABLE public.siswa_permanent 
ADD COLUMN IF NOT EXISTS kontak_ortu JSONB DEFAULT '[]'::jsonb;

-- Fungsi RPC untuk menyimpan daftar kontak orang tua
CREATE OR REPLACE FUNCTION public.update_kontak_ortu_siswa(
  p_nisn TEXT,
  p_kontak_list JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_first_phone TEXT := '';
  v_first_name TEXT := '';
  v_item JSONB;
  v_phone TEXT;
BEGIN
  IF p_nisn IS NULL OR p_nisn = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'NISN tidak valid');
  END IF;

  -- Ambil nomor utama pertama untuk sinkronisasi backward-compatibility kolom no_hp_ortu
  IF jsonb_array_length(p_kontak_list) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_kontak_list)
    LOOP
      v_phone := regexp_replace(COALESCE(v_item->>'nomor', ''), '\D', '', 'g');
      IF v_phone LIKE '08%' THEN
        v_phone := '628' || substring(v_phone from 3);
      ELSIF v_phone LIKE '8%' THEN
        v_phone := '628' || substring(v_phone from 2);
      END IF;

      IF v_first_phone = '' AND v_phone <> '' THEN
        v_first_phone := v_phone;
        v_first_name := COALESCE(v_item->>'nama', '');
      END IF;
    END LOOP;
  END IF;

  UPDATE public.siswa_permanent
  SET 
    kontak_ortu = p_kontak_list,
    no_hp_ortu = CASE WHEN v_first_phone <> '' THEN v_first_phone ELSE no_hp_ortu END,
    nama_ortu = CASE WHEN v_first_name <> '' THEN v_first_name ELSE nama_ortu END
  WHERE nisn::text = p_nisn::text;

  RETURN jsonb_build_object(
    'success', true, 
    'nisn', p_nisn, 
    'kontak_ortu', p_kontak_list,
    'primary_phone', v_first_phone
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_kontak_ortu_siswa(TEXT, JSONB) TO anon, authenticated;
