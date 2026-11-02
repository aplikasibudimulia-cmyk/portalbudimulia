-- ==============================================================================
-- MIGRATION: UPDATE CBT FLOW V3.1 (SMP BUDI MULIA)
-- Menambahkan dukungan Instruksi Berkop Resmi, Saklar Anti-Curang,
-- Pemetaan Ruang Ujian oleh Admin, serta Fitur Blokir Siswa pada Monitoring
-- ==============================================================================

-- 1. Tambahkan kolom pendukung di cbt_sesi_ujian
ALTER TABLE public.cbt_sesi_ujian 
ADD COLUMN IF NOT EXISTS instruksi TEXT;

ALTER TABLE public.cbt_sesi_ujian 
ADD COLUMN IF NOT EXISTS anti_curang BOOLEAN DEFAULT true NOT NULL;

ALTER TABLE public.cbt_sesi_ujian 
ADD COLUMN IF NOT EXISTS ruang_mapping JSONB DEFAULT '{}'::jsonb NOT NULL;

-- Perbarui CHECK constraint status agar mendukung 4 siklus resmi: draft, mendatang, berlangsung, selesai, serta kompatibilitas beku
ALTER TABLE public.cbt_sesi_ujian 
DROP CONSTRAINT IF EXISTS cbt_sesi_ujian_status_check;

ALTER TABLE public.cbt_sesi_ujian 
ADD CONSTRAINT cbt_sesi_ujian_status_check 
CHECK (status IN ('draft', 'mendatang', 'terjadwal', 'berlangsung', 'aktif', 'selesai', 'beku'));

-- 2. Tambahkan kolom pendukung di cbt_peserta_ujian
ALTER TABLE public.cbt_peserta_ujian 
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false NOT NULL;

ALTER TABLE public.cbt_peserta_ujian 
ADD COLUMN IF NOT EXISTS block_reason VARCHAR(255);

-- 3. Stored Procedure: Admin/Pengawas Memblokir Siswa Bermasalah
CREATE OR REPLACE FUNCTION public.cbt_proctor_block_student(
    p_peserta_id UUID,
    p_reason VARCHAR DEFAULT 'Diblokir oleh Pengawas/Admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.cbt_peserta_ujian
    SET 
        is_blocked = true,
        block_reason = p_reason
    WHERE id = p_peserta_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Peserta ujian tidak ditemukan.');
    END IF;

    -- Catat log audit
    INSERT INTO public.cbt_audit_logs (peserta_id, event_type, payload)
    VALUES (p_peserta_id, 'BLOCKED_BY_PROCTOR', jsonb_build_object('reason', p_reason, 'timestamp', now()));

    RETURN jsonb_build_object('success', true, 'message', 'Siswa berhasil diblokir dari ujian.');
END;
$$;

-- 4. Stored Procedure: Admin/Pengawas Membuka Blokir Siswa
CREATE OR REPLACE FUNCTION public.cbt_proctor_unblock_student(
    p_peserta_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.cbt_peserta_ujian
    SET 
        is_blocked = false,
        block_reason = NULL
    WHERE id = p_peserta_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Peserta ujian tidak ditemukan.');
    END IF;

    -- Catat log audit
    INSERT INTO public.cbt_audit_logs (peserta_id, event_type, payload)
    VALUES (p_peserta_id, 'UNBLOCKED_BY_PROCTOR', jsonb_build_object('timestamp', now()));

    RETURN jsonb_build_object('success', true, 'message', 'Blokir siswa berhasil dibuka.');
END;
$$;

-- 5. Perbarui cbt_verify_token agar menolak siswa yang diblokir
CREATE OR REPLACE FUNCTION public.cbt_verify_token(
    p_sesi_id UUID,
    p_token VARCHAR,
    p_siswa_nisn VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sesi RECORD;
    v_peserta RECORD;
    v_token_bersih VARCHAR;
    v_token_valid BOOLEAN := false;
    v_kelas_peserta VARCHAR;
    v_ruang_key TEXT;
    v_ruang_val JSONB;
BEGIN
    v_token_bersih := UPPER(TRIM(p_token));

    -- Ambil data sesi
    SELECT * INTO v_sesi
    FROM public.cbt_sesi_ujian
    WHERE id = p_sesi_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Sesi ujian tidak ditemukan.');
    END IF;

    -- Periksa status sesi
    IF v_sesi.status NOT IN ('berlangsung', 'aktif') THEN
        IF v_sesi.status = 'beku' THEN
            RETURN jsonb_build_object('success', false, 'message', 'Sesi ujian sedang dijeda darurat oleh Admin sekolah.');
        ELSIF v_sesi.status IN ('mendatang', 'terjadwal', 'draft') THEN
            RETURN jsonb_build_object('success', false, 'message', 'Sesi ujian belum dibuka.');
        ELSE
            RETURN jsonb_build_object('success', false, 'message', 'Sesi ujian telah selesai ditutup.');
        END IF;
    END IF;

    -- Ambil kelas siswa dari siswa_lengkap atau siswa_permanent
    SELECT kelas INTO v_kelas_peserta FROM public.siswa_lengkap WHERE nisn = p_siswa_nisn LIMIT 1;
    IF v_kelas_peserta IS NULL THEN
        SELECT kelas INTO v_kelas_peserta FROM public.cbt_peserta_ujian WHERE sesi_id = p_sesi_id AND siswa_nisn = p_siswa_nisn LIMIT 1;
    END IF;

    -- Validasi apakah kelas siswa masuk dalam target rombel sesi
    IF v_kelas_peserta IS NOT NULL AND NOT (v_kelas_peserta = ANY(v_sesi.kelas_ids)) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Kelas Anda (' || v_kelas_peserta || ') bukan peserta target sesi penilaian ini.');
    END IF;

    -- 1. Cek Token Ruang Admin (ruang_mapping) jika ada
    IF v_sesi.ruang_mapping IS NOT NULL AND v_sesi.ruang_mapping <> '{}'::jsonb THEN
        FOR v_ruang_key, v_ruang_val IN SELECT * FROM jsonb_each(v_sesi.ruang_mapping) LOOP
            IF UPPER(v_ruang_val->>'token') = v_token_bersih THEN
                -- Periksa apakah kelas siswa terdaftar di ruang ini
                IF v_ruang_val->'kelas' ? v_kelas_peserta THEN
                    v_token_valid := true;
                    EXIT;
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- 2. Fallback cek Scoped Token per rombel
    IF NOT v_token_valid THEN
        IF v_sesi.scoped_tokens ? v_kelas_peserta THEN
            IF UPPER(v_sesi.scoped_tokens->>v_kelas_peserta) = v_token_bersih THEN
                v_token_valid := true;
            END IF;
        END IF;
    END IF;

    -- 3. Fallback toleransi jika token cocok dengan salah satu token di sesi
    IF NOT v_token_valid THEN
        FOR v_ruang_key, v_ruang_val IN SELECT * FROM jsonb_each(v_sesi.scoped_tokens) LOOP
            IF UPPER(v_ruang_val#>>'{}') = v_token_bersih THEN
                v_token_valid := true;
                EXIT;
            END IF;
        END LOOP;
    END IF;

    IF NOT v_token_valid THEN
        RETURN jsonb_build_object('success', false, 'message', 'Token ujian tidak cocok atau salah ruang.');
    END IF;

    -- Ambil atau inisialisasi record peserta ujian
    SELECT * INTO v_peserta
    FROM public.cbt_peserta_ujian
    WHERE sesi_id = p_sesi_id AND siswa_nisn = p_siswa_nisn;

    IF NOT FOUND THEN
        INSERT INTO public.cbt_peserta_ujian (sesi_id, siswa_nisn, kelas, status)
        VALUES (p_sesi_id, p_siswa_nisn, COALESCE(v_kelas_peserta, 'Umum'), 'belum_mulai')
        RETURNING * INTO v_peserta;
    END IF;

    -- Cek jika siswa diblokir oleh admin/pengawas
    IF v_peserta.is_blocked = true THEN
        RETURN jsonb_build_object(
            'success', false, 
            'message', 'Akses ujian Anda diblokir oleh Pengawas/Admin: ' || COALESCE(v_peserta.block_reason, 'Silakan lapor ke meja pengawas.')
        );
    END IF;

    IF v_peserta.status = 'selesai' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Anda telah menyelesaikan dan mengumpulkan ujian ini.');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'peserta_id', v_peserta.id,
        'status', v_peserta.status,
        'message', 'Token valid. Siap memulai ujian.'
    );
END;
$$;
