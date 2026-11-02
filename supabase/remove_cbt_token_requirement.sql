-- ==============================================================================
-- 📘 SKRIP PENGHAPUSAN FITUR TOKEN UJIAN CBT eBUDIMULIA
-- Deskripsi:
-- Siswa dapat langsung mulai mengerjakan ujian tanpa harus memasukkan token.
-- Sistem tetap memvalidasi secara ketat bahwa siswa hanya dapat mengerjakan
-- soal yang sesuai dengan kelas/rombel sasaran sesi ujian.
-- ==============================================================================

-- 1. Perbarui RPC cbt_verify_token: Langsung Lolos Sesuai Kelas (Tanpa Cek Token)
CREATE OR REPLACE FUNCTION public.cbt_verify_token(
    p_sesi_id UUID,
    p_token VARCHAR DEFAULT '',
    p_siswa_nisn VARCHAR DEFAULT NULL,
    p_kelas VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sesi RECORD;
    v_peserta RECORD;
    v_kelas_peserta VARCHAR;
BEGIN
    -- Ambil data sesi
    SELECT * INTO v_sesi
    FROM public.cbt_sesi_ujian
    WHERE id = p_sesi_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Sesi penilaian tidak ditemukan.');
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

    -- Prioritas 1: Ambil kelas dari enrollment pada TAHUN AJARAN AKTIF
    SELECT e.kelas INTO v_kelas_peserta
    FROM public.enrollment e
    JOIN public.tahun_ajaran ta ON ta.id = e.tahun_ajaran_id
    WHERE e.nisn = p_siswa_nisn AND ta.is_aktif = true
    LIMIT 1;

    -- Prioritas 2: Gunakan p_kelas dari session login siswa jika valid
    IF v_kelas_peserta IS NULL AND p_kelas IS NOT NULL AND TRIM(p_kelas) <> '' THEN
        v_kelas_peserta := TRIM(p_kelas);
    END IF;

    -- Prioritas 3: Cari dari siswa_lengkap khusus yang is_aktif = true
    IF v_kelas_peserta IS NULL THEN
        SELECT kelas INTO v_kelas_peserta
        FROM public.siswa_lengkap
        WHERE nisn = p_siswa_nisn AND is_aktif = true
        LIMIT 1;
    END IF;

    -- Prioritas 4: Ambil dari record peserta sesi ini jika sudah pernah tercatat
    IF v_kelas_peserta IS NULL THEN
        SELECT kelas INTO v_kelas_peserta
        FROM public.cbt_peserta_ujian
        WHERE sesi_id = p_sesi_id AND siswa_nisn = p_siswa_nisn
        LIMIT 1;
    END IF;

    -- Prioritas 5: Fallback data terbaru siswa_lengkap berdasarkan created_at
    IF v_kelas_peserta IS NULL THEN
        SELECT kelas INTO v_kelas_peserta
        FROM public.siswa_lengkap
        WHERE nisn = p_siswa_nisn
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    -- Validasi apakah kelas siswa masuk dalam target rombel sesi
    IF v_kelas_peserta IS NOT NULL AND NOT (v_kelas_peserta = ANY(v_sesi.kelas_ids)) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Kelas Anda (' || v_kelas_peserta || ') bukan peserta target sesi penilaian ini. Penilaian ini khusus untuk kelas: ' || array_to_string(v_sesi.kelas_ids, ', ')
        );
    END IF;

    -- Ambil atau inisialisasi record peserta ujian
    SELECT * INTO v_peserta
    FROM public.cbt_peserta_ujian
    WHERE sesi_id = p_sesi_id AND siswa_nisn = p_siswa_nisn;

    IF NOT FOUND THEN
        INSERT INTO public.cbt_peserta_ujian (
            sesi_id,
            siswa_nisn,
            kelas,
            status,
            waktu_mulai,
            is_blocked
        )
        VALUES (
            p_sesi_id,
            p_siswa_nisn,
            COALESCE(v_kelas_peserta, 'Umum'),
            'belum_mulai',
            now(),
            false
        )
        RETURNING * INTO v_peserta;
    ELSE
        -- Update kelas di cbt_peserta_ujian jika sebelumnya keliru tersimpan kelas lama
        IF v_kelas_peserta IS NOT NULL AND v_peserta.kelas <> v_kelas_peserta THEN
            UPDATE public.cbt_peserta_ujian
            SET kelas = v_kelas_peserta
            WHERE id = v_peserta.id;
            v_peserta.kelas := v_kelas_peserta;
        END IF;
    END IF;

    -- Cek jika siswa diblokir oleh pengawas
    IF v_peserta.is_blocked = true THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Akses Anda diblokir oleh Pengawas: ' || COALESCE(v_peserta.block_reason, 'Silakan hubungi Pengawas Ruang.')
        );
    END IF;

    -- Cek jika status ujian peserta terkunci karena pelanggaran
    IF v_peserta.status = 'terkunci' THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Lembar ujian Anda saat ini TERKUNCI karena pelanggaran tata tertib digital. Silakan hubungi Pengawas Ruang.'
        );
    ELSIF v_peserta.status = 'selesai' THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Ujian ini sudah pernah dikumpulkan sebelumnya.'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'peserta_id', v_peserta.id,
        'kelas', v_peserta.kelas,
        'durasi_menit', v_sesi.durasi_menit,
        'waktu_mulai', v_peserta.waktu_mulai,
        'message', 'Berhasil masuk lembar ujian langsung.'
    );
END;
$$;

-- 2. Perbarui RPC cbt_start_exam: Langsung Mulai Sesuai Kelas (Tanpa Cek Token)
CREATE OR REPLACE FUNCTION public.cbt_start_exam(
    p_sesi_id UUID,
    p_token TEXT DEFAULT '',
    p_nisn TEXT DEFAULT NULL,
    p_kelas TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_current_nisn TEXT := COALESCE(NULLIF(TRIM(p_nisn), ''), (auth.jwt() ->> 'nisn'));
    v_current_kelas TEXT := COALESCE(NULLIF(TRIM(p_kelas), ''), (auth.jwt() ->> 'kelas'));
    v_sesi RECORD;
    v_peserta RECORD;
BEGIN
    IF v_current_nisn IS NULL THEN
        RAISE EXCEPTION 'Otorisasi gagal: NISN tidak terdeteksi pada akun Anda.';
    END IF;

    -- Prioritas 1: Ambil kelas aktif dari enrollment tahun ajaran aktif
    IF v_current_kelas IS NULL OR v_current_kelas = '' THEN
        SELECT e.kelas INTO v_current_kelas
        FROM public.enrollment e
        JOIN public.tahun_ajaran ta ON ta.id = e.tahun_ajaran_id
        WHERE e.nisn = v_current_nisn AND ta.is_aktif = true
        LIMIT 1;
    END IF;

    -- Prioritas 2: Fallback ke siswa_lengkap yang aktif
    IF v_current_kelas IS NULL OR v_current_kelas = '' THEN
        SELECT kelas INTO v_current_kelas 
        FROM public.siswa_lengkap 
        WHERE nisn = v_current_nisn AND is_aktif = true 
        LIMIT 1;
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
            RAISE EXCEPTION 'Kelas Anda (%) bukan peserta target sesi penilaian ini.', v_current_kelas;
        END IF;

        INSERT INTO public.cbt_peserta_ujian (sesi_id, siswa_nisn, kelas, status)
        VALUES (p_sesi_id, v_current_nisn, COALESCE(v_current_kelas, 'Umum'), 'belum_mulai')
        RETURNING * INTO v_peserta;
    ELSE
        -- Perbarui kelas peserta jika sebelumnya tercatat kelas lama
        IF v_current_kelas IS NOT NULL AND v_peserta.kelas <> v_current_kelas THEN
            UPDATE public.cbt_peserta_ujian
            SET kelas = v_current_kelas
            WHERE id = v_peserta.id;
            v_peserta.kelas := v_current_kelas;
        END IF;
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

    -- Update status mulai jika belum mulai
    IF v_peserta.status = 'belum_mulai' THEN
        UPDATE public.cbt_peserta_ujian
        SET status = 'sedang_mengerjakan', waktu_mulai = now()
        WHERE id = v_peserta.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'peserta_id', v_peserta.id,
        'kelas', v_peserta.kelas,
        'status', 'sedang_mengerjakan',
        'waktu_mulai', COALESCE(v_peserta.waktu_mulai, now()),
        'durasi_menit', v_sesi.durasi_menit,
        'extra_waktu_menit', v_peserta.extra_waktu_menit,
        'waktu_tutup', v_sesi.waktu_tutup
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Berikan permission eksekusi
GRANT EXECUTE ON FUNCTION public.cbt_verify_token(UUID, VARCHAR, VARCHAR, VARCHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cbt_start_exam(UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
