-- ==============================================================================
-- MIGRATION: PERBAIKAN OTORISASI NISN CBT (SMP BUDI MULIA)
-- Mengatasi issue: "Otorisasi gagal: NISN tidak terdeteksi"
-- Siswa menggunakan sesi login mandiri (non-JWT Supabase Auth).
-- Function kini menerima parameter p_nisn dan p_kelas secara eksplisit,
-- dengan fallback ke auth.jwt() bila tersedia.
-- ==============================================================================

-- 1. DROP fungsi lama agar parameter baru tidak bentrok overload
DROP FUNCTION IF EXISTS public.cbt_start_exam(UUID, TEXT);
DROP FUNCTION IF EXISTS public.cbt_start_exam(UUID, TEXT, TEXT, TEXT);

-- 2. Buat ulang cbt_start_exam yang mendukung p_nisn & p_kelas
CREATE OR REPLACE FUNCTION public.cbt_start_exam(
    p_sesi_id UUID,
    p_token TEXT,
    p_nisn TEXT DEFAULT NULL,
    p_kelas TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_current_nisn TEXT := COALESCE(NULLIF(TRIM(p_nisn), ''), (auth.jwt() ->> 'nisn'));
    v_current_kelas TEXT := COALESCE(NULLIF(TRIM(p_kelas), ''), (auth.jwt() ->> 'kelas'));
    v_sesi RECORD;
    v_peserta RECORD;
    v_expected_token TEXT;
    v_token_bersih TEXT;
    v_token_valid BOOLEAN := false;
    v_ruang_key TEXT;
    v_ruang_val JSONB;
BEGIN
    IF v_current_nisn IS NULL THEN
        RAISE EXCEPTION 'Otorisasi gagal: NISN tidak terdeteksi pada akun Anda.';
    END IF;

    -- Ambil kelas dari database siswa jika belum ada
    IF v_current_kelas IS NULL OR v_current_kelas = '' THEN
        SELECT kelas INTO v_current_kelas FROM public.siswa_lengkap WHERE nisn = v_current_nisn LIMIT 1;
    END IF;

    -- Ambil data sesi ujian
    SELECT * INTO v_sesi FROM public.cbt_sesi_ujian WHERE id = p_sesi_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sesi ujian tidak ditemukan.';
    END IF;

    IF v_sesi.status NOT IN ('aktif', 'berlangsung') THEN
        IF v_sesi.status = 'beku' THEN
            RAISE EXCEPTION 'Sesi ujian sedang dijeda darurat oleh Pengawas/Admin.';
        ELSIF v_sesi.status IN ('mendatang', 'terjadwal', 'draft') THEN
            RAISE EXCEPTION 'Sesi ujian belum dibuka.';
        ELSE
            RAISE EXCEPTION 'Sesi ujian telah selesai ditutup.';
        END IF;
    END IF;

    -- Ambil atau inisialisasi peserta
    SELECT * INTO v_peserta FROM public.cbt_peserta_ujian 
    WHERE sesi_id = p_sesi_id AND siswa_nisn = v_current_nisn;

    IF NOT FOUND THEN
        -- Pastikan kelas siswa terdaftar pada sesi ini
        IF v_current_kelas IS NOT NULL AND NOT (v_current_kelas = ANY(v_sesi.kelas_ids)) THEN
            RAISE EXCEPTION 'Kelas Anda (%) bukan peserta target sesi ujian ini.', v_current_kelas;
        END IF;

        INSERT INTO public.cbt_peserta_ujian (sesi_id, siswa_nisn, kelas, status)
        VALUES (p_sesi_id, v_current_nisn, COALESCE(v_current_kelas, 'Umum'), 'belum_mulai')
        RETURNING * INTO v_peserta;
    END IF;

    -- Validasi status peserta
    IF v_peserta.is_blocked = true THEN
        RAISE EXCEPTION 'Akses ujian Anda diblokir oleh Pengawas/Admin: %', COALESCE(v_peserta.block_reason, 'Silakan lapor ke meja pengawas.');
    END IF;

    IF v_peserta.status = 'terkunci' THEN
        RAISE EXCEPTION 'Ujian Anda saat ini TERKUNCI karena pelanggaran anti-curang. Silakan hubungi Pengawas Ruang.';
    ELSIF v_peserta.status = 'selesai' THEN
        RAISE EXCEPTION 'Ujian ini sudah pernah dikumpulkan sebelumnya.';
    END IF;

    -- Verifikasi Token Ruang/Scoped
    v_token_bersih := UPPER(TRIM(p_token));

    -- A. Cek Ruang Mapping Admin jika ada
    IF v_sesi.ruang_mapping IS NOT NULL AND v_sesi.ruang_mapping <> '{}'::jsonb THEN
        FOR v_ruang_key, v_ruang_val IN SELECT * FROM jsonb_each(v_sesi.ruang_mapping) LOOP
            IF UPPER(v_ruang_val->>'token') = v_token_bersih THEN
                IF v_ruang_val->'kelas' ? v_peserta.kelas THEN
                    v_token_valid := true;
                    EXIT;
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- B. Cek Scoped Token Rombel
    IF NOT v_token_valid AND v_sesi.scoped_tokens IS NOT NULL THEN
        IF v_sesi.scoped_tokens ? v_peserta.kelas THEN
            IF UPPER(v_sesi.scoped_tokens->>v_peserta.kelas) = v_token_bersih THEN
                v_token_valid := true;
            END IF;
        END IF;
    END IF;

    -- C. Fallback sembarang token di scoped_tokens
    IF NOT v_token_valid AND v_sesi.scoped_tokens IS NOT NULL THEN
        FOR v_ruang_key, v_ruang_val IN SELECT * FROM jsonb_each(v_sesi.scoped_tokens) LOOP
            IF UPPER(v_ruang_val#>>'{}') = v_token_bersih THEN
                v_token_valid := true;
                EXIT;
            END IF;
        END LOOP;
    END IF;

    IF NOT v_token_valid THEN
        RAISE EXCEPTION 'Token ujian salah untuk kelas Anda.';
    END IF;

    -- Update status mulai jika belum mulai
    IF v_peserta.status = 'belum_mulai' THEN
        UPDATE public.cbt_peserta_ujian
        SET status = 'sedang_mengerjakan', waktu_mulai = now()
        WHERE id = v_peserta.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'peserta_id', v_peserta.id,
        'status', 'sedang_mengerjakan',
        'waktu_mulai', COALESCE(v_peserta.waktu_mulai, now()),
        'durasi_menit', v_sesi.durasi_menit,
        'extra_waktu_menit', v_peserta.extra_waktu_menit,
        'waktu_tutup', v_sesi.waktu_tutup
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. DROP cbt_submit_exam lama
DROP FUNCTION IF EXISTS public.cbt_submit_exam(UUID);
DROP FUNCTION IF EXISTS public.cbt_submit_exam(UUID, TEXT);

-- 4. Buat ulang cbt_submit_exam yang mendukung p_nisn
CREATE OR REPLACE FUNCTION public.cbt_submit_exam(
    p_peserta_id UUID,
    p_nisn TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_current_nisn TEXT := COALESCE(NULLIF(TRIM(p_nisn), ''), (auth.jwt() ->> 'nisn'));
    v_peserta RECORD;
    v_total_skor NUMERIC(5,2);
BEGIN
    SELECT p.*, s.tampilkan_nilai INTO v_peserta
    FROM public.cbt_peserta_ujian p
    JOIN public.cbt_sesi_ujian s ON s.id = p.sesi_id
    WHERE p.id = p_peserta_id 
      AND (v_current_nisn IS NULL OR p.siswa_nisn = v_current_nisn);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Data peserta tidak valid atau bukan milik akun Anda.';
    END IF;

    IF v_peserta.status <> 'sedang_mengerjakan' THEN
        IF v_peserta.status = 'terkunci' THEN
            RAISE EXCEPTION 'Ujian tidak dapat dikumpulkan: lembar ujian Anda sedang TERKUNCI. Silakan hubungi Pengawas Ruang.';
        ELSIF v_peserta.status = 'selesai' THEN
            RAISE EXCEPTION 'Ujian ini sudah pernah dikumpulkan sebelumnya.';
        ELSE
            RAISE EXCEPTION 'Status peserta tidak valid untuk mengumpulkan ujian.';
        END IF;
    END IF;

    -- Kunci status peserta menjadi selesai
    UPDATE public.cbt_peserta_ujian
    SET status = 'selesai', waktu_selesai = now()
    WHERE id = p_peserta_id;

    -- Jalankan penskoran otomatis server-side
    v_total_skor := public.cbt_internal_score_submission(p_peserta_id);

    -- Sinkronisasi visibilitas nilai
    IF v_peserta.tampilkan_nilai = 'instan' THEN
        UPDATE public.cbt_peserta_ujian SET is_nilai_shared = true WHERE id = p_peserta_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'selesai',
        'waktu_selesai', now(),
        'total_skor_sementara', CASE WHEN v_peserta.tampilkan_nilai = 'instan' THEN v_total_skor ELSE NULL END,
        'is_nilai_shared', (v_peserta.tampilkan_nilai = 'instan')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Berikan izin eksekusi ke anon dan authenticated
GRANT EXECUTE ON FUNCTION public.cbt_start_exam(UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cbt_submit_exam(UUID, TEXT) TO anon, authenticated, service_role;
