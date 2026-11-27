-- ==============================================================================
-- 🚨 EMERGENCY SECURITY LOCKDOWN: RPC TABUNGAN, NILAI GURU & DAFTAR GURU
-- ==============================================================================
-- Tanggal   : 2026-11-27
-- Prioritas : KRITIS (ZERO BREAKING CHANGES)
--
-- AKAR MASALAH (Dilaporkan Siswa 2026-11-27):
-- 1. RPC `proses_transaksi_tabungan` & `verifikasi_transaksi_tabungan` sebelumnya
--    hanya mengecek apakah parameter `p_diinput_oleh_user_id` / `p_user_id` ada
--    di tabel `guru` atau `akun_pengguna`, TANPA memverifikasi sesi server asli
--    (`public.fn_is_authorized_staff()`). Akibatnya, siswa yang mengambil UUID
--    guru dari `localStorage` (`ebudimulia_guru_list`) dapat memalsukan
--    identitas guru dan langsung menyuntikkan transaksi berstatus VERIFIED.
-- 2. RPC `tolak_transaksi_tabungan`, `edit_transaksi_tabungan`, dan
--    `hapus_transaksi_tabungan` sebelumnya tidak memiliki pengecekan otorisasi.
-- 3. RPC Nilai Guru (`fn_validate_guru_authority`, `fn_simpan_nilai_guru`,
--    `fn_hapus_nilai_komponen_guru`) juga belum mengecek `fn_is_authorized_staff()`.
-- 4. RPC `fn_get_guru_list()` masih mengembalikan daftar UUID guru ke `anon`.
--
-- SOLUSI:
-- • Seluruh hak akses Staf/Guru WAJIB lolos `public.fn_is_authorized_staff()`
--   (tiket kriptografis server `ebm_token` di `app_sessions` atau JWT Admin).
-- • Hak akses Bendahara Kelas (Siswa) WAJIB lolos `public.fn_get_verified_student_nisn()`
--   dari `app_sessions` — parameter NISN dari client tidak lagi dipercaya mentah-mentah.
-- • Percobaan pemalsuan UUID guru otomatis ditolak & dicatat ke `activity_log`.
-- • TIDAK mengubah RLS tabel lain yang sudah berjalan stabil.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. HELPER SERVER-SIDE: AMBIL NISN SISWA ASLI DARI TIKET SESI SERVER
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_verified_student_nisn()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_token TEXT;
    v_nisn  TEXT;
BEGIN
    v_token := COALESCE(public.fn_get_client_header_part('ebm_token'), '');
    IF v_token = '' THEN
        RETURN NULL;
    END IF;

    SELECT TRIM(s.foreign_id) INTO v_nisn
    FROM public.app_sessions s
    WHERE s.session_token = v_token
      AND s.expires_at > now()
      AND LOWER(s.role) IN ('murid', 'siswa')
    LIMIT 1;

    RETURN NULLIF(v_nisn, '');
END;
$$;

REVOKE ALL ON FUNCTION public.fn_get_verified_student_nisn() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_get_verified_student_nisn() TO anon, authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 2. LOCKDOWN RPC: proses_transaksi_tabungan
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.proses_transaksi_tabungan(VARCHAR, VARCHAR, VARCHAR, NUMERIC, VARCHAR, VARCHAR, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.proses_transaksi_tabungan(VARCHAR, VARCHAR, VARCHAR, NUMERIC, VARCHAR, VARCHAR, UUID, UUID, TEXT, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.proses_transaksi_tabungan(
    p_siswa_nisn VARCHAR,
    p_kelas VARCHAR,
    p_tipe VARCHAR,
    p_jumlah NUMERIC,
    p_status_verifikasi VARCHAR DEFAULT 'PENDING',
    p_diinput_oleh_nisn VARCHAR DEFAULT NULL,
    p_diinput_oleh_user_id UUID DEFAULT NULL,
    p_diverifikasi_oleh_user_id UUID DEFAULT NULL,
    p_keterangan TEXT DEFAULT NULL,
    p_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_saldo_curr     NUMERIC(14,2) := 0.00;
    v_saldo_baru     NUMERIC(14,2) := 0.00;
    v_rekening_id    UUID;
    v_transaksi_id   UUID;
    v_is_staff       BOOLEAN := FALSE;
    v_verified_nisn  TEXT := NULL;
    v_final_status   VARCHAR := 'PENDING';
    v_final_nisn_in  VARCHAR := NULL;
    v_final_user_in  UUID := NULL;
    v_final_user_ver UUID := NULL;
BEGIN
    -- Validasi tipe transaksi
    IF p_tipe NOT IN ('SETOR', 'TARIK') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Tipe transaksi tidak valid! Harus SETOR atau TARIK.');
    END IF;

    -- Validasi nominal positif
    IF p_jumlah IS NULL OR p_jumlah <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Nominal transaksi harus lebih besar dari 0!');
    END IF;

    -- 1. CEK OTORISASI STAF ASLI VIA SESI SERVER / JWT (ANTI-SPOOFING UUID GURU!)
    v_is_staff := public.fn_is_authorized_staff();

    IF v_is_staff THEN
        -- Staf / Guru / Admin resmi terverifikasi server
        v_final_status := CASE
            WHEN UPPER(COALESCE(p_status_verifikasi, 'VERIFIED')) IN ('VERIFIED', 'PENDING')
            THEN UPPER(COALESCE(p_status_verifikasi, 'VERIFIED'))
            ELSE 'VERIFIED'
        END;
        v_final_nisn_in  := p_diinput_oleh_nisn;
        v_final_user_in  := p_diinput_oleh_user_id;
        v_final_user_ver := CASE
            WHEN v_final_status = 'VERIFIED' THEN COALESCE(p_diverifikasi_oleh_user_id, p_diinput_oleh_user_id)
            ELSE NULL
        END;
    ELSE
        -- BUKAN STAF! Jika mencoba mengirim p_diinput_oleh_user_id / p_diverifikasi_oleh_user_id -> SPOOFING!
        IF p_diinput_oleh_user_id IS NOT NULL OR p_diverifikasi_oleh_user_id IS NOT NULL THEN
            BEGIN
                INSERT INTO public.activity_log (user_id, user_role, action, details, created_at)
                VALUES (
                    COALESCE(public.fn_get_verified_student_nisn(), p_siswa_nisn, 'ANON'),
                    'SUSPECT_HACKER',
                    '🚨 Percobaan Spoofing UUID Guru pada Tabungan Diblokir',
                    'Percobaan memanggil proses_transaksi_tabungan dengan spoofed user_id=' || COALESCE(p_diinput_oleh_user_id::text, p_diverifikasi_oleh_user_id::text, '-') || ' untuk target NISN=' || COALESCE(p_siswa_nisn, '-') || ' nominal=' || COALESCE(p_jumlah::text, '0'),
                    NOW()
                );
            EXCEPTION WHEN OTHERS THEN NULL;
            END;

            RETURN jsonb_build_object('success', false, 'message', 'Akses ditolak: Sesi staf terverifikasi tidak ditemukan.');
        END IF;

        -- 2. JALUR BENDAHARA KELAS: Verifikasi NISN ASLI dari sesi server (app_sessions)
        v_verified_nisn := public.fn_get_verified_student_nisn();

        IF v_verified_nisn IS NULL THEN
            RETURN jsonb_build_object('success', false, 'message', 'Akses ditolak: Anda harus login dengan sesi resmi.');
        END IF;

        -- Pastikan pemanggil benar-benar Bendahara Kelas resmi untuk kelas tersebut
        IF NOT EXISTS (
            SELECT 1 FROM public.bendahara_kelas
            WHERE TRIM(siswa_nisn) = v_verified_nisn
              AND UPPER(REPLACE(kelas, ' ', '')) = UPPER(REPLACE(COALESCE(p_kelas, ''), ' ', ''))
        ) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Akses ditolak: Anda bukan bendahara resmi untuk kelas ini!');
        END IF;

        -- Bendahara kelas HANYA boleh mencatat SETOR dengan status WAJIB PENDING
        IF p_tipe <> 'SETOR' THEN
            RETURN jsonb_build_object('success', false, 'message', 'Akses ditolak: Bendahara kelas hanya dapat mencatat setoran (SETOR).');
        END IF;

        v_final_status   := 'PENDING';
        v_final_nisn_in  := v_verified_nisn;
        v_final_user_in  := NULL;
        v_final_user_ver := NULL;
    END IF;

    -- Ambil atau buat rekening tabungan siswa (Atomic Lock)
    SELECT id, saldo INTO v_rekening_id, v_saldo_curr
    FROM public.tabungan_rekening
    WHERE siswa_nisn = p_siswa_nisn
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.tabungan_rekening (siswa_nisn, saldo)
        VALUES (p_siswa_nisn, 0.00)
        RETURNING id, saldo INTO v_rekening_id, v_saldo_curr;
    END IF;

    -- Hitung saldo baru
    IF p_tipe = 'SETOR' THEN
        v_saldo_baru := v_saldo_curr + p_jumlah;
    ELSIF p_tipe = 'TARIK' THEN
        IF v_saldo_curr < p_jumlah THEN
            RETURN jsonb_build_object('success', false, 'message', 'Saldo tidak mencukupi untuk melakukan penarikan!');
        END IF;
        v_saldo_baru := v_saldo_curr - p_jumlah;
    END IF;

    -- Update saldo rekening HANYA jika status adalah VERIFIED (khusus Staf resmi)
    IF v_final_status = 'VERIFIED' THEN
        UPDATE public.tabungan_rekening
        SET saldo = v_saldo_baru, updated_at = NOW()
        WHERE id = v_rekening_id;
    END IF;

    -- Catat riwayat mutasi transaksi
    INSERT INTO public.tabungan_transaksi (
        siswa_nisn,
        kelas,
        tipe,
        jumlah,
        saldo_awal,
        saldo_akhir,
        status_verifikasi,
        diinput_oleh_nisn,
        diinput_oleh_user_id,
        diverifikasi_oleh_user_id,
        keterangan,
        created_at
    ) VALUES (
        p_siswa_nisn,
        p_kelas,
        p_tipe,
        p_jumlah,
        v_saldo_curr,
        CASE WHEN v_final_status = 'VERIFIED' THEN v_saldo_baru ELSE v_saldo_curr END,
        v_final_status,
        v_final_nisn_in,
        v_final_user_in,
        v_final_user_ver,
        p_keterangan,
        COALESCE(p_created_at, NOW())
    ) RETURNING id INTO v_transaksi_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', CASE WHEN v_final_status = 'VERIFIED'
                        THEN 'Transaksi berhasil diproses & saldo telah diperbarui.'
                        ELSE 'Setoran berhasil dicatat dan menunggu verifikasi Wali Kelas.' END,
        'transaksi_id', v_transaksi_id,
        'status', v_final_status,
        'saldo_awal', v_saldo_curr,
        'saldo_akhir', CASE WHEN v_final_status = 'VERIFIED' THEN v_saldo_baru ELSE v_saldo_curr END,
        'saldo_sekarang', CASE WHEN v_final_status = 'VERIFIED' THEN v_saldo_baru ELSE v_saldo_curr END
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.proses_transaksi_tabungan(VARCHAR, VARCHAR, VARCHAR, NUMERIC, VARCHAR, VARCHAR, UUID, UUID, TEXT, TIMESTAMPTZ) TO anon, authenticated;


-- ------------------------------------------------------------------------------
-- 3. LOCKDOWN RPC: verifikasi_transaksi_tabungan (KHUSUS STAF TERVERIFIKASI)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.verifikasi_transaksi_tabungan(UUID);
DROP FUNCTION IF EXISTS public.verifikasi_transaksi_tabungan(UUID, UUID);

CREATE OR REPLACE FUNCTION public.verifikasi_transaksi_tabungan(
    p_transaksi_id UUID,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trans      RECORD;
    v_saldo_curr NUMERIC(14,2) := 0.00;
    v_saldo_baru NUMERIC(14,2) := 0.00;
BEGIN
    IF NOT public.fn_is_authorized_staff() THEN
        BEGIN
            INSERT INTO public.activity_log (user_id, user_role, action, details, created_at)
            VALUES (
                COALESCE(public.fn_get_verified_student_nisn(), 'ANON'),
                'SUSPECT_HACKER',
                '🚨 Percobaan Bypass verifikasi_transaksi_tabungan Diblokir',
                'Target transaksi_id=' || COALESCE(p_transaksi_id::text, '-') || ' spoofed p_user_id=' || COALESCE(p_user_id::text, '-'),
                NOW()
            );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
        RETURN jsonb_build_object('success', false, 'message', 'Akses ditolak: Hanya Guru atau Wali Kelas terverifikasi yang dapat memverifikasi setoran!');
    END IF;

    SELECT * INTO v_trans
    FROM public.tabungan_transaksi
    WHERE id = p_transaksi_id AND status_verifikasi = 'PENDING'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Transaksi tidak ditemukan atau sudah pernah diverifikasi.');
    END IF;

    SELECT saldo INTO v_saldo_curr
    FROM public.tabungan_rekening
    WHERE siswa_nisn = v_trans.siswa_nisn
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.tabungan_rekening (siswa_nisn, saldo)
        VALUES (v_trans.siswa_nisn, 0.00)
        RETURNING saldo INTO v_saldo_curr;
    END IF;

    IF v_trans.tipe = 'SETOR' THEN
        v_saldo_baru := v_saldo_curr + v_trans.jumlah;
    ELSIF v_trans.tipe = 'TARIK' THEN
        IF v_saldo_curr < v_trans.jumlah THEN
            RETURN jsonb_build_object('success', false, 'message', 'Gagal verifikasi: Saldo siswa saat ini tidak mencukupi penarikan!');
        END IF;
        v_saldo_baru := v_saldo_curr - v_trans.jumlah;
    END IF;

    UPDATE public.tabungan_rekening
    SET saldo = v_saldo_baru, updated_at = NOW()
    WHERE siswa_nisn = v_trans.siswa_nisn;

    UPDATE public.tabungan_transaksi
    SET status_verifikasi = 'VERIFIED',
        saldo_awal = v_saldo_curr,
        saldo_akhir = v_saldo_baru,
        diverifikasi_oleh_user_id = p_user_id
    WHERE id = p_transaksi_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Setoran berhasil diverifikasi dan saldo siswa telah diupdate.',
        'saldo_akhir', v_saldo_baru,
        'saldo_baru', v_saldo_baru
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.verifikasi_transaksi_tabungan(UUID, UUID) TO anon, authenticated;


-- ------------------------------------------------------------------------------
-- 4. LOCKDOWN RPC: tolak_transaksi_tabungan (KHUSUS STAF TERVERIFIKASI)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tolak_transaksi_tabungan(UUID);
DROP FUNCTION IF EXISTS public.tolak_transaksi_tabungan(UUID, UUID);

CREATE OR REPLACE FUNCTION public.tolak_transaksi_tabungan(
    p_transaksi_id UUID,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.fn_is_authorized_staff() THEN
        RETURN jsonb_build_object('success', false, 'message', 'Akses ditolak: Hanya Guru atau Wali Kelas terverifikasi yang dapat menolak setoran!');
    END IF;

    UPDATE public.tabungan_transaksi
    SET status_verifikasi = 'REJECTED',
        diverifikasi_oleh_user_id = p_user_id
    WHERE id = p_transaksi_id AND status_verifikasi = 'PENDING';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Transaksi tidak ditemukan atau sudah diproses.');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Transaksi setoran berhasil ditolak.');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.tolak_transaksi_tabungan(UUID, UUID) TO anon, authenticated;


-- ------------------------------------------------------------------------------
-- 5. LOCKDOWN RPC: edit_transaksi_tabungan (STAF ATAU BENDAHARA KHUSUS PENDING)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.edit_transaksi_tabungan(UUID, NUMERIC);
DROP FUNCTION IF EXISTS public.edit_transaksi_tabungan(UUID, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.edit_transaksi_tabungan(
    p_transaksi_id UUID,
    p_jumlah_baru NUMERIC,
    p_keterangan_baru TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trans         RECORD;
    v_saldo_curr    NUMERIC(14,2) := 0.00;
    v_saldo_baru    NUMERIC(14,2) := 0.00;
    v_selisih       NUMERIC(14,2) := 0.00;
    v_is_staff      BOOLEAN := FALSE;
    v_verified_nisn TEXT := NULL;
BEGIN
    IF p_jumlah_baru IS NULL OR p_jumlah_baru <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Jumlah transaksi baru harus lebih dari 0');
    END IF;

    SELECT * INTO v_trans
    FROM public.tabungan_transaksi
    WHERE id = p_transaksi_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Transaksi tidak ditemukan');
    END IF;

    v_is_staff := public.fn_is_authorized_staff();

    IF NOT v_is_staff THEN
        v_verified_nisn := public.fn_get_verified_student_nisn();
        IF v_verified_nisn IS NULL
           OR v_trans.status_verifikasi <> 'PENDING'
           OR NOT EXISTS (
               SELECT 1 FROM public.bendahara_kelas
               WHERE TRIM(siswa_nisn) = v_verified_nisn
                 AND UPPER(REPLACE(kelas, ' ', '')) = UPPER(REPLACE(COALESCE(v_trans.kelas, ''), ' ', ''))
           )
        THEN
            RETURN jsonb_build_object('success', false, 'message', 'Akses ditolak: Anda tidak berwenang mengubah transaksi ini.');
        END IF;
    END IF;

    IF v_trans.status_verifikasi = 'VERIFIED' THEN
        SELECT saldo INTO v_saldo_curr
        FROM public.tabungan_rekening
        WHERE siswa_nisn = v_trans.siswa_nisn
        FOR UPDATE;

        IF v_trans.tipe = 'SETOR' THEN
            v_selisih := p_jumlah_baru - v_trans.jumlah;
            v_saldo_baru := v_saldo_curr + v_selisih;
        ELSIF v_trans.tipe = 'TARIK' THEN
            v_selisih := p_jumlah_baru - v_trans.jumlah;
            v_saldo_baru := v_saldo_curr - v_selisih;
        END IF;

        IF v_saldo_baru < 0 THEN
            RETURN jsonb_build_object('success', false, 'message', 'Perubahan transaksi ditolak: Saldo tidak boleh negatif!');
        END IF;

        UPDATE public.tabungan_rekening
        SET saldo = v_saldo_baru, updated_at = NOW()
        WHERE siswa_nisn = v_trans.siswa_nisn;
    ELSE
        v_saldo_baru := v_trans.saldo_akhir;
    END IF;

    UPDATE public.tabungan_transaksi
    SET jumlah = p_jumlah_baru,
        keterangan = COALESCE(p_keterangan_baru, keterangan),
        saldo_akhir = CASE WHEN v_trans.status_verifikasi = 'VERIFIED' THEN v_saldo_baru ELSE saldo_akhir END
    WHERE id = p_transaksi_id;

    RETURN jsonb_build_object('success', true, 'message', 'Nominal transaksi berhasil diperbarui', 'saldo_akhir', v_saldo_baru);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.edit_transaksi_tabungan(UUID, NUMERIC, TEXT) TO anon, authenticated;


-- ------------------------------------------------------------------------------
-- 6. LOCKDOWN RPC: hapus_transaksi_tabungan (STAF ATAU BENDAHARA KHUSUS PENDING)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.hapus_transaksi_tabungan(UUID);

CREATE OR REPLACE FUNCTION public.hapus_transaksi_tabungan(
    p_transaksi_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trans         RECORD;
    v_saldo_curr    NUMERIC(14,2) := 0.00;
    v_saldo_baru    NUMERIC(14,2) := 0.00;
    v_is_staff      BOOLEAN := FALSE;
    v_verified_nisn TEXT := NULL;
BEGIN
    SELECT * INTO v_trans
    FROM public.tabungan_transaksi
    WHERE id = p_transaksi_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Transaksi tidak ditemukan');
    END IF;

    v_is_staff := public.fn_is_authorized_staff();

    IF NOT v_is_staff THEN
        v_verified_nisn := public.fn_get_verified_student_nisn();
        IF v_verified_nisn IS NULL
           OR v_trans.status_verifikasi <> 'PENDING'
           OR NOT EXISTS (
               SELECT 1 FROM public.bendahara_kelas
               WHERE TRIM(siswa_nisn) = v_verified_nisn
                 AND UPPER(REPLACE(kelas, ' ', '')) = UPPER(REPLACE(COALESCE(v_trans.kelas, ''), ' ', ''))
           )
        THEN
            RETURN jsonb_build_object('success', false, 'message', 'Akses ditolak: Anda tidak berwenang menghapus transaksi ini.');
        END IF;
    END IF;

    IF v_trans.status_verifikasi = 'VERIFIED' THEN
        SELECT saldo INTO v_saldo_curr
        FROM public.tabungan_rekening
        WHERE siswa_nisn = v_trans.siswa_nisn
        FOR UPDATE;

        IF v_trans.tipe = 'SETOR' THEN
            v_saldo_baru := v_saldo_curr - v_trans.jumlah;
        ELSIF v_trans.tipe = 'TARIK' THEN
            v_saldo_baru := v_saldo_curr + v_trans.jumlah;
        END IF;

        IF v_saldo_baru < 0 THEN
            RETURN jsonb_build_object('success', false, 'message', 'Penghapusan ditolak: Saldo siswa menjadi negatif!');
        END IF;

        UPDATE public.tabungan_rekening
        SET saldo = v_saldo_baru, updated_at = NOW()
        WHERE siswa_nisn = v_trans.siswa_nisn;
    END IF;

    DELETE FROM public.tabungan_transaksi WHERE id = p_transaksi_id;

    RETURN jsonb_build_object('success', true, 'message', 'Transaksi berhasil dihapus.');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.hapus_transaksi_tabungan(UUID) TO anon, authenticated;


-- ------------------------------------------------------------------------------
-- 7. LOCKDOWN CELAH KEMBAR PADA RPC NILAI GURU (ANTI-SPOOFING UUID GURU)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_validate_guru_authority(
  p_akun_id      UUID,
  p_guru_id      UUID,
  p_mapel_id     UUID DEFAULT NULL,
  p_target_kelas TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_akun         akun_pengguna%ROWTYPE;
  v_is_admin     boolean := false;
  v_is_kurikulum boolean := false;
  v_has_access   boolean := false;
BEGIN
  -- 0. GERBANG MUTLAK: Wajib sesi staf terverifikasi server (anti-spoofing UUID guru)
  IF NOT public.fn_is_authorized_staff() THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Akses Ditolak: Sesi staf terverifikasi tidak ditemukan.');
  END IF;

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

  -- 3. Cek apakah memiliki hak Admin atau Kurikulum
  IF v_akun.role = 'admin' THEN
    v_is_admin := true;
  END IF;

  IF NOT v_is_admin THEN
    SELECT EXISTS (
      SELECT 1 FROM public.guru_role gr
      JOIN public.roles r ON gr.role_id = r.id
      WHERE gr.guru_id = p_guru_id
        AND LOWER(r.nama) = 'admin'
    ) INTO v_is_admin;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.guru_role gr
    JOIN public.roles r ON gr.role_id = r.id
    WHERE gr.guru_id = p_guru_id
      AND LOWER(r.nama) LIKE '%kurikulum%'
  ) INTO v_is_kurikulum;

  IF v_is_admin OR v_is_kurikulum THEN
    RETURN jsonb_build_object('ok', true, 'is_admin', true);
  END IF;

  -- 4. Validasi guru pengampu mapel & kelas
  IF p_mapel_id IS NOT NULL AND p_target_kelas IS NOT NULL AND p_target_kelas <> '' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.guru_mapel gm
      WHERE gm.guru_id = p_guru_id
        AND gm.mata_pelajaran_id = p_mapel_id
        AND (gm.kelas = p_target_kelas OR gm.kelas ILIKE '%' || p_target_kelas || '%')
    ) INTO v_has_access;

    IF NOT v_has_access THEN
      RETURN jsonb_build_object('ok', false, 'msg', 'Akses Ditolak: Anda tidak ditugaskan mengajar mapel ini di kelas ' || p_target_kelas);
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'is_admin', false);
END;
$$;

-- Perketat fn_simpan_nilai_guru agar fallback v_komp.guru_id tidak bisa di-bypass tanpa sesi staf
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
  v_komp       RECORD;
  v_auth       JSONB;
  v_clean_nisn TEXT := TRIM(p_siswa_nisn);
BEGIN
  IF NOT public.fn_is_authorized_staff() THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Akses Ditolak: Sesi staf terverifikasi tidak ditemukan.');
  END IF;

  IF p_nilai IS NOT NULL AND (p_nilai < 0 OR p_nilai > 100) THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Nilai harus berada di rentang 0 - 100.');
  END IF;

  IF v_clean_nisn IS NULL OR v_clean_nisn = '' THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'NISN siswa tidak valid.');
  END IF;

  SELECT * INTO v_komp FROM public.nilai_komponen WHERE id = p_komponen_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Komponen nilai tidak ditemukan.');
  END IF;

  v_auth := public.fn_validate_guru_authority(p_akun_id, p_guru_id, v_komp.mata_pelajaran_id, v_komp.kelas);
  IF NOT (v_auth->>'ok')::boolean THEN
    IF v_komp.guru_id <> p_guru_id THEN
      RETURN v_auth;
    END IF;
  END IF;

  INSERT INTO public.nilai_siswa (
    komponen_id, siswa_nisn, nilai, catatan, diinput_oleh, updated_at
  ) VALUES (
    p_komponen_id, v_clean_nisn, p_nilai, p_catatan, p_guru_id, NOW()
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

-- Perketat fn_hapus_nilai_komponen_guru (4 parameter)
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
  v_komp    RECORD;
  v_auth    JSONB;
  v_deleted INT := 0;
BEGIN
  IF NOT public.fn_is_authorized_staff() THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Akses Ditolak: Sesi staf terverifikasi tidak ditemukan.');
  END IF;

  SELECT * INTO v_komp FROM public.nilai_komponen WHERE id = p_komponen_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'Komponen nilai tidak ditemukan.');
  END IF;

  v_auth := public.fn_validate_guru_authority(p_akun_id, p_guru_id, v_komp.mata_pelajaran_id, v_komp.kelas);
  IF NOT (v_auth->>'ok')::boolean THEN
    IF v_komp.guru_id <> p_guru_id THEN
      RETURN v_auth;
    END IF;
  END IF;

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


-- ------------------------------------------------------------------------------
-- 8. LOCKDOWN RPC: fn_get_guru_list (HANYA UNTUK STAF TERVERIFIKASI)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_guru_list()
RETURNS TABLE (
  id UUID,
  nama_guru TEXT,
  kode TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id, nama_guru, kode
  FROM public.guru
  WHERE public.fn_is_authorized_staff()
  ORDER BY nama_guru ASC;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_guru_list() TO anon, authenticated;

COMMIT;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
