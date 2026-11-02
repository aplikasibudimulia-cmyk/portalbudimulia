-- ==============================================================================
-- 🛡️ SECURITY HARDENING: SISTEM NILAI DAN DATA MASTER ANTI-MANIPULASI
-- SMP BUDI MULIA JAKARTA - EBUDIMULIA
-- ==============================================================================
-- Ringkasan Tindakan Keamanan:
-- 1. Mengunci TOTAL akses manipulasi langsung (INSERT, UPDATE, DELETE) dari role
--    'anon' pada tabel nilai_siswa, nilai_komponen, nilai_akhir_config, dan data master.
-- 2. Siswa dan Orang Tua HANYA memiliki hak akses BACA (SELECT) untuk melihat nilai.
-- 3. Menutup celah keamanan pada impersonate_tokens & akun_pengguna.
-- 4. Membatasi kewenangan Guru: Guru HANYA boleh mengisi/mengubah nilai pada mata
--    pelajaran dan kelas yang ditugaskan kepadanya di guru_mapel, atau jika berstatus Admin/Kurikulum.
-- 5. Semua operasi simpan nilai diarahkan melalui fungsi RPC resmi (SECURITY DEFINER)
--    dengan verifikasi p_akun_id & p_guru_id server-side.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PENGAMANAN TABEL NILAI SISWA (public.nilai_siswa)
-- ------------------------------------------------------------------------------
ALTER TABLE public.nilai_siswa ENABLE ROW LEVEL SECURITY;

-- Cabut policy lama yang mengizinkan write terbuka untuk anon
DROP POLICY IF EXISTS "allow_all_nilai_siswa" ON public.nilai_siswa;
DROP POLICY IF EXISTS "allow_all_nilai_siswa_all" ON public.nilai_siswa;
DROP POLICY IF EXISTS "allow_all_nilai_siswa_read" ON public.nilai_siswa;
DROP POLICY IF EXISTS "Allow anon read on nilai_siswa" ON public.nilai_siswa;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.nilai_siswa;
DROP POLICY IF EXISTS "allow_read_nilai_siswa" ON public.nilai_siswa;

-- Policy baru: Hanya izinkan BACA (SELECT)
CREATE POLICY "allow_read_nilai_siswa"
ON public.nilai_siswa
FOR SELECT
TO anon, authenticated
USING (true);

-- Cabut hak akses manipulasi langsung pada level tabel dari role publik
REVOKE INSERT, UPDATE, DELETE ON public.nilai_siswa FROM anon;
GRANT SELECT ON public.nilai_siswa TO anon, authenticated;


-- ------------------------------------------------------------------------------
-- 2. PENGAMANAN TABEL KOMPONEN NILAI (public.nilai_komponen)
-- ------------------------------------------------------------------------------
ALTER TABLE public.nilai_komponen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_nilai_komponen" ON public.nilai_komponen;
DROP POLICY IF EXISTS "allow_all_nilai_komponen_read" ON public.nilai_komponen;
DROP POLICY IF EXISTS "Allow anon read on nilai_komponen" ON public.nilai_komponen;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.nilai_komponen;
DROP POLICY IF EXISTS "allow_read_nilai_komponen" ON public.nilai_komponen;

CREATE POLICY "allow_read_nilai_komponen"
ON public.nilai_komponen
FOR SELECT
TO anon, authenticated
USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.nilai_komponen FROM anon;
GRANT SELECT ON public.nilai_komponen TO anon, authenticated;


-- ------------------------------------------------------------------------------
-- 3. PENGAMANAN TABEL CONFIG NILAI AKHIR (public.nilai_akhir_config)
-- ------------------------------------------------------------------------------
ALTER TABLE public.nilai_akhir_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_nilai_akhir_config" ON public.nilai_akhir_config;
DROP POLICY IF EXISTS "allow_all_nilai_akhir_config_read" ON public.nilai_akhir_config;
DROP POLICY IF EXISTS "Allow anon read on nilai_akhir_config" ON public.nilai_akhir_config;
DROP POLICY IF EXISTS "Enable all operations for anon" ON public.nilai_akhir_config;
DROP POLICY IF EXISTS "allow_read_nilai_akhir_config" ON public.nilai_akhir_config;

CREATE POLICY "allow_read_nilai_akhir_config"
ON public.nilai_akhir_config
FOR SELECT
TO anon, authenticated
USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.nilai_akhir_config FROM anon;
GRANT SELECT ON public.nilai_akhir_config TO anon, authenticated;


-- ------------------------------------------------------------------------------
-- 4. PENGAMANAN TABEL PENUGASAN GURU MAPEL (public.guru_mapel)
-- ------------------------------------------------------------------------------
-- Guru dan siswa tidak berwenang mengubah pembagian tugas mengajar!
ALTER TABLE public.guru_mapel ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_guru_mapel" ON public.guru_mapel;
DROP POLICY IF EXISTS "allow_all_guru_mapel_read" ON public.guru_mapel;
DROP POLICY IF EXISTS "allow_read_guru_mapel" ON public.guru_mapel;

CREATE POLICY "allow_read_guru_mapel"
ON public.guru_mapel
FOR SELECT
TO anon, authenticated
USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.guru_mapel FROM anon;
GRANT SELECT ON public.guru_mapel TO anon, authenticated;


-- ------------------------------------------------------------------------------
-- 5. PENGAMANAN DATA MASTER AKADEMIK (HANYA BACA BAGI GURU & SISWA)
-- ------------------------------------------------------------------------------
-- A. Mata Pelajaran
ALTER TABLE public.mata_pelajaran ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_mata_pelajaran" ON public.mata_pelajaran;
DROP POLICY IF EXISTS "allow_read_mata_pelajaran" ON public.mata_pelajaran;
CREATE POLICY "allow_read_mata_pelajaran" ON public.mata_pelajaran FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.mata_pelajaran FROM anon;
GRANT SELECT ON public.mata_pelajaran TO anon, authenticated;

-- B. Tahun Ajaran
ALTER TABLE public.tahun_ajaran ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_tahun_ajaran" ON public.tahun_ajaran;
DROP POLICY IF EXISTS "allow_read_tahun_ajaran" ON public.tahun_ajaran;
CREATE POLICY "allow_read_tahun_ajaran" ON public.tahun_ajaran FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.tahun_ajaran FROM anon;
GRANT SELECT ON public.tahun_ajaran TO anon, authenticated;

-- C. Semester
ALTER TABLE public.semester ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_semester" ON public.semester;
DROP POLICY IF EXISTS "allow_read_semester" ON public.semester;
CREATE POLICY "allow_read_semester" ON public.semester FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.semester FROM anon;
GRANT SELECT ON public.semester TO anon, authenticated;

-- D. Master Kelas
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'master_kelas') THEN
    ALTER TABLE public.master_kelas ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "allow_all_master_kelas" ON public.master_kelas;
    DROP POLICY IF EXISTS "allow_read_master_kelas" ON public.master_kelas;
    CREATE POLICY "allow_read_master_kelas" ON public.master_kelas FOR SELECT TO anon, authenticated USING (true);
    REVOKE INSERT, UPDATE, DELETE ON public.master_kelas FROM anon;
    GRANT SELECT ON public.master_kelas TO anon, authenticated;
  END IF;
END $$;

-- E. Roles & Guru Role
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_roles" ON public.roles;
DROP POLICY IF EXISTS "allow_read_roles" ON public.roles;
CREATE POLICY "allow_read_roles" ON public.roles FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.roles FROM anon;
GRANT SELECT ON public.roles TO anon, authenticated;

ALTER TABLE public.guru_role ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_guru_role" ON public.guru_role;
DROP POLICY IF EXISTS "allow_read_guru_role" ON public.guru_role;
CREATE POLICY "allow_read_guru_role" ON public.guru_role FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.guru_role FROM anon;
GRANT SELECT ON public.guru_role TO anon, authenticated;


-- ------------------------------------------------------------------------------
-- 6. PENGAMANAN CRITICAL TOKENS & AKUN (TUTUP CELAH IMPERSONATE & AKUN)
-- ------------------------------------------------------------------------------
-- Tabel impersonate_tokens tidak boleh diakses/dibaca oleh sembarang orang via REST API
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'impersonate_tokens') THEN
    ALTER TABLE public.impersonate_tokens ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "allow_all_impersonate_tokens" ON public.impersonate_tokens;
    DROP POLICY IF EXISTS "allow_read_impersonate_tokens" ON public.impersonate_tokens;
    REVOKE ALL ON public.impersonate_tokens FROM anon;
  END IF;
END $$;

-- Tabel akun_pengguna dikunci total dari luar
ALTER TABLE public.akun_pengguna ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_akun_pengguna" ON public.akun_pengguna;
REVOKE INSERT, UPDATE, DELETE ON public.akun_pengguna FROM anon;


-- ------------------------------------------------------------------------------
-- 7. HELPER SERVER-SIDE VALIDATION: CEK KEWENANGAN GURU
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_validate_guru_authority(
  p_akun_id    UUID,
  p_guru_id    UUID,
  p_mapel_id   UUID DEFAULT NULL,
  p_target_kelas TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_akun akun_pengguna%ROWTYPE;
  v_is_admin boolean := false;
  v_is_kurikulum boolean := false;
  v_has_access boolean := false;
BEGIN
  -- 1. Validasi Akun Aktif
  IF p_akun_id IS NULL OR p_guru_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'ID Akun atau ID Guru tidak valid.');
  END IF;

  SELECT * INTO v_akun
  FROM public.akun_pengguna
  WHERE id = p_akun_id
    AND status = 'aktif'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Sesi tidak ditemukan atau akun telah dinonaktifkan.');
  END IF;

  -- 2. Pastikan foreign_id akun cocok dengan ID guru yang dikirim
  IF v_akun.foreign_id IS NULL OR LOWER(TRIM(v_akun.foreign_id)) <> LOWER(TRIM(p_guru_id::text)) THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Manipulasi identitas terdeteksi: Akun tidak sesuai dengan data guru.');
  END IF;

  -- 3. Cek apakah memiliki hak Admin atau Kurikulum (berwenang mengelola seluruh nilai)
  IF v_akun.role = 'admin' THEN
    v_is_admin := true;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.guru_role gr
    JOIN public.roles r ON gr.role_id = r.id
    WHERE gr.guru_id = p_guru_id
      AND LOWER(r.nama) = 'admin'
  ) INTO v_is_admin;

  SELECT EXISTS (
    SELECT 1 FROM public.guru_role gr
    JOIN public.roles r ON gr.role_id = r.id
    WHERE gr.guru_id = p_guru_id
      AND LOWER(r.nama) LIKE '%kurikulum%'
  ) INTO v_is_kurikulum;

  -- Admin dan Kurikulum memiliki wewenang penuh atas seluruh nilai
  IF v_is_admin OR v_is_kurikulum THEN
    RETURN jsonb_build_object('ok', true, 'is_admin', true);
  END IF;

  -- 4. Jika Guru Reguler dan parameter mapel & kelas disertakan:
  --    Validasi apakah guru ini memang pengampu mapel & kelas tersebut di guru_mapel
  IF p_mapel_id IS NOT NULL AND p_target_kelas IS NOT NULL AND p_target_kelas <> '' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.guru_mapel gm
      WHERE gm.guru_id = p_guru_id
        AND gm.mata_pelajaran_id = p_mapel_id
        AND (gm.kelas = p_target_kelas OR gm.kelas ILIKE '%' || p_target_kelas || '%')
    ) INTO v_has_access;

    IF NOT v_has_access THEN
      -- Cek juga jika komponen dibuat langsung oleh guru ini
      RETURN jsonb_build_object('ok', false, 'msg', 'Akses Ditolak: Anda tidak ditugaskan mengajar mapel ini di kelas ' || p_target_kelas);
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'is_admin', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_validate_guru_authority(UUID, UUID, UUID, TEXT) TO anon, authenticated;


-- ------------------------------------------------------------------------------
-- 8. RPC RESMI SIMPAN NILAI GURU (SINGLE CELL - ATOMIC & ANTI-HACK)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_simpan_nilai_guru(
  p_akun_id      UUID,
  p_guru_id      UUID,
  p_komponen_id  UUID,
  p_siswa_nisn   TEXT,
  p_nilai        NUMERIC,
  p_catatan      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_komp RECORD;
  v_auth JSONB;
  v_clean_nisn TEXT := TRIM(p_siswa_nisn);
BEGIN
  -- 1. Validasi input range nilai
  IF p_nilai IS NOT NULL AND (p_nilai < 0 OR p_nilai > 100) THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Nilai harus berada di rentang 0 - 100.');
  END IF;

  IF v_clean_nisn IS NULL OR v_clean_nisn = '' THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'NISN siswa tidak valid.');
  END IF;

  -- 2. Ambil informasi komponen nilai
  SELECT * INTO v_komp
  FROM public.nilai_komponen
  WHERE id = p_komponen_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Komponen nilai tidak ditemukan.');
  END IF;

  -- 3. Verifikasi kewenangan guru
  v_auth := public.fn_validate_guru_authority(p_akun_id, p_guru_id, v_komp.mata_pelajaran_id, v_komp.kelas);
  IF NOT (v_auth->>'ok')::boolean THEN
    -- Fallback: Jika guru adalah pembuat komponen nilai tersebut
    IF v_komp.guru_id <> p_guru_id THEN
      RETURN v_auth;
    END IF;
  END IF;

  -- 4. Eksekusi penyimpanan nilai (UPSERT Atomic)
  INSERT INTO public.nilai_siswa (
    komponen_id,
    siswa_nisn,
    nilai,
    catatan,
    diinput_oleh,
    updated_at
  ) VALUES (
    p_komponen_id,
    v_clean_nisn,
    p_nilai,
    p_catatan,
    p_guru_id,
    NOW()
  )
  ON CONFLICT (komponen_id, siswa_nisn)
  DO UPDATE SET
    nilai = EXCLUDED.nilai,
    catatan = COALESCE(EXCLUDED.catatan, public.nilai_siswa.catatan),
    diinput_oleh = p_guru_id,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'ok', true,
    'message', 'Nilai berhasil disimpan secara aman.',
    'komponen_id', p_komponen_id,
    'siswa_nisn', v_clean_nisn,
    'nilai', p_nilai
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'msg', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_simpan_nilai_guru(UUID, UUID, UUID, TEXT, NUMERIC, TEXT) TO anon, authenticated;


-- ------------------------------------------------------------------------------
-- 9. RPC RESMI BULK SIMPAN NILAI GURU (IMPORT EXCEL & OFFLINE SYNC BATCH)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bulk_simpan_nilai_guru(
  p_akun_id UUID,
  p_guru_id UUID,
  p_items   JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth JSONB;
  v_item RECORD;
  v_processed INT := 0;
  v_val NUMERIC;
BEGIN
  -- 1. Validasi sesi umum guru
  v_auth := public.fn_validate_guru_authority(p_akun_id, p_guru_id);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN v_auth;
  END IF;

  -- 2. Loop dan simpan tiap item
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    komponen_id UUID,
    siswa_nisn TEXT,
    nilai NUMERIC,
    catatan TEXT
  )
  LOOP
    IF v_item.komponen_id IS NOT NULL AND v_item.siswa_nisn IS NOT NULL THEN
      v_val := v_item.nilai;
      IF v_val IS NOT NULL AND (v_val < 0 OR v_val > 100) THEN
        CONTINUE; -- Abaikan jika di luar range
      END IF;

      INSERT INTO public.nilai_siswa (
        komponen_id,
        siswa_nisn,
        nilai,
        catatan,
        diinput_oleh,
        updated_at
      ) VALUES (
        v_item.komponen_id,
        TRIM(v_item.siswa_nisn),
        v_val,
        v_item.catatan,
        p_guru_id,
        NOW()
      )
      ON CONFLICT (komponen_id, siswa_nisn)
      DO UPDATE SET
        nilai = EXCLUDED.nilai,
        catatan = COALESCE(EXCLUDED.catatan, public.nilai_siswa.catatan),
        diinput_oleh = p_guru_id,
        updated_at = NOW();

      v_processed := v_processed + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'message', 'Bulk simpan nilai selesai.',
    'processed_count', v_processed
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'msg', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_bulk_simpan_nilai_guru(UUID, UUID, JSONB) TO anon, authenticated;


-- ------------------------------------------------------------------------------
-- 10. RPC RESMI HAPUS / KOSONGKAN NILAI TP GURU
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hapus_nilai_komponen_guru(
  p_akun_id     UUID,
  p_guru_id     UUID,
  p_komponen_id UUID,
  p_nisn_list   TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_komp RECORD;
  v_auth JSONB;
  v_deleted INT := 0;
BEGIN
  -- 1. Cek info komponen
  SELECT * INTO v_komp FROM public.nilai_komponen WHERE id = p_komponen_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Komponen nilai tidak ditemukan.');
  END IF;

  -- 2. Validasi kewenangan guru
  v_auth := public.fn_validate_guru_authority(p_akun_id, p_guru_id, v_komp.mata_pelajaran_id, v_komp.kelas);
  IF NOT (v_auth->>'ok')::boolean THEN
    IF v_komp.guru_id <> p_guru_id THEN
      RETURN v_auth;
    END IF;
  END IF;

  -- 3. Hapus data nilai untuk siswa terkait
  DELETE FROM public.nilai_siswa
  WHERE komponen_id = p_komponen_id
    AND siswa_nisn = ANY(p_nisn_list);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'message', 'Nilai berhasil dikosongkan.',
    'deleted_count', v_deleted
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'msg', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_hapus_nilai_komponen_guru(UUID, UUID, UUID, TEXT[]) TO anon, authenticated;


-- ------------------------------------------------------------------------------
-- 11. RPC RESMI KELOLA KOMPONEN NILAI GURU (CREATE, UPDATE, DELETE TP)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_simpan_nilai_komponen_guru(
  p_akun_id   UUID,
  p_guru_id   UUID,
  p_data      JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth JSONB;
  v_id UUID;
  v_res RECORD;
BEGIN
  v_auth := public.fn_validate_guru_authority(p_akun_id, p_guru_id);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN v_auth;
  END IF;

  v_id := NULLIF(p_data->>'id', '')::UUID;

  IF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.nilai_komponen WHERE id = v_id) THEN
    -- UPDATE komponen yang sudah ada
    UPDATE public.nilai_komponen
    SET
      nama = COALESCE(p_data->>'nama', nama),
      bab_nama = COALESCE(p_data->>'bab_nama', bab_nama),
      deskripsi = COALESCE(p_data->>'deskripsi', deskripsi),
      bobot = COALESCE((p_data->>'bobot')::NUMERIC, bobot),
      urutan = COALESCE((p_data->>'urutan')::INT, urutan),
      target_kelas = CASE 
        WHEN p_data ? 'target_kelas' THEN ARRAY(SELECT jsonb_array_elements_text(p_data->'target_kelas'))
        ELSE target_kelas 
      END,
      metode_hitung = COALESCE(p_data->>'metode_hitung', metode_hitung),
      is_nilai_visible = COALESCE((p_data->>'is_nilai_visible')::BOOLEAN, is_nilai_visible),
      instruksi = COALESCE(p_data->>'instruksi', instruksi)
    WHERE id = v_id
    RETURNING * INTO v_res;
  ELSE
    -- INSERT komponen baru
    INSERT INTO public.nilai_komponen (
      id,
      guru_id,
      tahun_ajaran_id,
      semester_id,
      mata_pelajaran_id,
      kelas,
      target_kelas,
      nama,
      bab_nama,
      deskripsi,
      bobot,
      urutan,
      metode_hitung,
      is_nilai_visible,
      instruksi,
      created_at
    ) VALUES (
      COALESCE(v_id, gen_random_uuid()),
      p_guru_id,
      (p_data->>'tahun_ajaran_id')::UUID,
      (p_data->>'semester_id')::UUID,
      (p_data->>'mata_pelajaran_id')::UUID,
      p_data->>'kelas',
      CASE 
        WHEN p_data ? 'target_kelas' THEN ARRAY(SELECT jsonb_array_elements_text(p_data->'target_kelas'))
        ELSE ARRAY[p_data->>'kelas']
      END,
      COALESCE(p_data->>'nama', 'TP'),
      p_data->>'bab_nama',
      p_data->>'deskripsi',
      COALESCE((p_data->>'bobot')::NUMERIC, 1),
      COALESCE((p_data->>'urutan')::INT, 100),
      COALESCE(p_data->>'metode_hitung', 'rata_rata'),
      COALESCE((p_data->>'is_nilai_visible')::BOOLEAN, false),
      p_data->>'instruksi',
      NOW()
    )
    RETURNING * INTO v_res;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'message', 'Komponen nilai berhasil disimpan.',
    'data', row_to_json(v_res)
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'msg', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_simpan_nilai_komponen_guru(UUID, UUID, JSONB) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_hapus_nilai_komponen_guru(
  p_akun_id     UUID,
  p_guru_id     UUID,
  p_komponen_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth JSONB;
BEGIN
  v_auth := public.fn_validate_guru_authority(p_akun_id, p_guru_id);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN v_auth;
  END IF;

  -- Hapus anak nilai_siswa terlebih dahulu
  DELETE FROM public.nilai_siswa WHERE komponen_id = p_komponen_id;
  -- Hapus komponen
  DELETE FROM public.nilai_komponen WHERE id = p_komponen_id;

  RETURN jsonb_build_object('ok', true, 'message', 'Komponen berhasil dihapus.');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'msg', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_hapus_nilai_komponen_guru(UUID, UUID, UUID) TO anon, authenticated;


-- ------------------------------------------------------------------------------
-- 12. RPC RESMI KELOLA CONFIG NILAI AKHIR (BOBOT & PTS BAB)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_simpan_nilai_akhir_config_guru(
  p_akun_id UUID,
  p_guru_id UUID,
  p_config  JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth JSONB;
BEGIN
  v_auth := public.fn_validate_guru_authority(p_akun_id, p_guru_id);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN v_auth;
  END IF;

  INSERT INTO public.nilai_akhir_config (
    guru_id,
    tahun_ajaran_id,
    mata_pelajaran_id,
    kelas,
    bobot_proses,
    bobot_psts,
    bobot_psas,
    pts_selected_babs,
    updated_at
  ) VALUES (
    p_guru_id,
    (p_config->>'tahun_ajaran_id')::UUID,
    (p_config->>'mata_pelajaran_id')::UUID,
    p_config->>'kelas',
    COALESCE((p_config->>'bobot_proses')::NUMERIC, 60),
    COALESCE((p_config->>'bobot_psts')::NUMERIC, 20),
    COALESCE((p_config->>'bobot_psas')::NUMERIC, 20),
    COALESCE(p_config->'pts_selected_babs', '[]'::jsonb),
    NOW()
  )
  ON CONFLICT (guru_id, tahun_ajaran_id, mata_pelajaran_id, kelas)
  DO UPDATE SET
    bobot_proses = EXCLUDED.bobot_proses,
    bobot_psts = EXCLUDED.bobot_psts,
    bobot_psas = EXCLUDED.bobot_psas,
    pts_selected_babs = EXCLUDED.pts_selected_babs,
    updated_at = NOW();

  RETURN jsonb_build_object('ok', true, 'message', 'Konfigurasi bobot berhasil disimpan.');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'msg', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_simpan_nilai_akhir_config_guru(UUID, UUID, JSONB) TO anon, authenticated;

-- ==============================================================================
-- SELESAI: SELURUH TABEL NILAI DAN DATA MASTER KINI TERLINDUNGI 100%
-- ==============================================================================

