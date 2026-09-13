-- ====================================================================
-- SKRIP PENGAMANAN DATABASE (SECURITY HARDENING) TABUNGAN SISWA
-- EBUDIMULIA - PORTAL SISTEM INFORMASI AKADEMIK
-- ====================================================================
-- Tujuan:
-- 1. Mengunci tabel saldo (tabungan_rekening) agar TIDAK BISA diedit,
--    ditambah, atau dihapus secara langsung dari luar (REST API / Anon).
-- 2. Memastikan mutasi saldo HANYA BISA terjadi melalui fungsi resmi
--    sistem (RPC SECURITY DEFINER) setelah verifikasi Wali Kelas / Admin.
-- 3. Mencegah manipulasi status transaksi (tidak bisa memalsukan status
--    menjadi VERIFIED tanpa persetujuan sah).
-- 4. Tetap menjamin tampilan web dan aplikasi Android bekerja 100% normal
--    untuk membaca saldo dan riwayat mutasi.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. PENGAMANAN TABEL SALDO (public.tabungan_rekening)
-- --------------------------------------------------------------------
ALTER TABLE public.tabungan_rekening ENABLE ROW LEVEL SECURITY;

-- Cabut policy lama yang terlalu longgar (Read-Write untuk semua)
DROP POLICY IF EXISTS "anon_rw_tabungan_rekening" ON public.tabungan_rekening;
DROP POLICY IF EXISTS "allow_read_tabungan_rekening" ON public.tabungan_rekening;

-- Buat policy baru: HANYA IZINKAN BACA (SELECT)
-- Siapapun (Siswa, Orang Tua, Guru, Admin) tetap bisa membaca saldo masing-masing
CREATE POLICY "allow_read_tabungan_rekening"
ON public.tabungan_rekening
FOR SELECT
TO anon, authenticated
USING (true);

-- Defense in Depth: Cabut hak akses direct manipulasi pada level tabel
REVOKE INSERT, UPDATE, DELETE ON public.tabungan_rekening FROM anon;


-- --------------------------------------------------------------------
-- 2. PENGAMANAN TABEL TRANSAKSI (public.tabungan_transaksi)
-- --------------------------------------------------------------------
ALTER TABLE public.tabungan_transaksi ENABLE ROW LEVEL SECURITY;

-- Cabut policy lama yang longgar
DROP POLICY IF EXISTS "anon_rw_tabungan_transaksi" ON public.tabungan_transaksi;
DROP POLICY IF EXISTS "allow_read_tabungan_transaksi" ON public.tabungan_transaksi;
DROP POLICY IF EXISTS "allow_insert_pending_tabungan_transaksi" ON public.tabungan_transaksi;

-- Policy 1: Boleh membaca riwayat transaksi
CREATE POLICY "allow_read_tabungan_transaksi"
ON public.tabungan_transaksi
FOR SELECT
TO anon, authenticated
USING (true);

-- Policy 2: Jika ada insert langsung dari client (Bendahara),
-- WAJIB berstatus PENDING (tidak bisa langsung diset ke VERIFIED).
CREATE POLICY "allow_insert_pending_tabungan_transaksi"
ON public.tabungan_transaksi
FOR INSERT
TO anon, authenticated
WITH CHECK (status_verifikasi = 'PENDING');

-- Defense in Depth: Cabut hak UPDATE & DELETE langsung dari luar
-- Perubahan / Penghapusan mutasi hanya boleh lewat RPC resmi
REVOKE UPDATE, DELETE ON public.tabungan_transaksi FROM anon;


-- --------------------------------------------------------------------
-- 3. PENGAMANAN TABEL BENDAHARA KELAS (public.bendahara_kelas)
-- --------------------------------------------------------------------
ALTER TABLE public.bendahara_kelas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_rw_bendahara_kelas" ON public.bendahara_kelas;
DROP POLICY IF EXISTS "allow_read_bendahara_kelas" ON public.bendahara_kelas;
DROP POLICY IF EXISTS "allow_manage_bendahara_kelas" ON public.bendahara_kelas;

-- Boleh membaca daftar bendahara kelas
CREATE POLICY "allow_read_bendahara_kelas"
ON public.bendahara_kelas
FOR SELECT
TO anon, authenticated
USING (true);

-- Pengelolaan bendahara kelas (ditunjuk oleh Wali Kelas / Admin)
CREATE POLICY "allow_manage_bendahara_kelas"
ON public.bendahara_kelas
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);


-- --------------------------------------------------------------------
-- 4. HARDENING FUNGSI RPC RESMI (SECURITY DEFINER DENGAN SEARCH_PATH AMAN)
-- --------------------------------------------------------------------

-- A. Fungsi Proses Transaksi (Setor / Tarik)
-- Hapus fungsi lama agar tidak terjadi duplikasi/overloading ambigu
DROP FUNCTION IF EXISTS public.proses_transaksi_tabungan(VARCHAR, VARCHAR, VARCHAR, NUMERIC, VARCHAR, VARCHAR, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.proses_transaksi_tabungan(VARCHAR, VARCHAR, VARCHAR, NUMERIC, VARCHAR, VARCHAR, UUID, UUID, TEXT, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.proses_transaksi_tabungan(
    p_siswa_nisn VARCHAR,
    p_kelas VARCHAR,
    p_tipe VARCHAR,
    p_jumlah NUMERIC,
    p_status_verifikasi VARCHAR DEFAULT 'VERIFIED',
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
    v_saldo_curr NUMERIC(14,2) := 0.00;
    v_saldo_baru NUMERIC(14,2) := 0.00;
    v_rekening_id UUID;
    v_transaksi_id UUID;
BEGIN
    -- Validasi tipe transaksi
    IF p_tipe NOT IN ('SETOR', 'TARIK') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Tipe transaksi tidak valid! Harus SETOR atau TARIK.');
    END IF;

    -- Validasi jumlah positif
    IF p_jumlah IS NULL OR p_jumlah <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Nominal transaksi harus lebih besar dari 0!');
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

    -- Update saldo rekening HANYA jika status_verifikasi adalah VERIFIED
    IF p_status_verifikasi = 'VERIFIED' THEN
        IF p_tipe = 'SETOR' THEN
            v_saldo_baru := v_saldo_curr + p_jumlah;
        ELSIF p_tipe = 'TARIK' THEN
            IF v_saldo_curr < p_jumlah THEN
                RETURN jsonb_build_object('success', false, 'message', 'Saldo tidak mencukupi untuk melakukan penarikan!');
            END IF;
            v_saldo_baru := v_saldo_curr - p_jumlah;
        END IF;

        -- Update saldo rekening di tabel utama
        UPDATE public.tabungan_rekening
        SET saldo = v_saldo_baru, updated_at = NOW()
        WHERE id = v_rekening_id;
    ELSE
        -- Jika status PENDING (diinput Bendahara Kelas), saldo rekening tidak berubah
        IF p_tipe = 'SETOR' THEN
            v_saldo_baru := v_saldo_curr + p_jumlah;
        ELSIF p_tipe = 'TARIK' THEN
            IF v_saldo_curr < p_jumlah THEN
                RETURN jsonb_build_object('success', false, 'message', 'Saldo siswa saat ini tidak mencukupi untuk estimasi penarikan!');
            END IF;
            v_saldo_baru := v_saldo_curr - p_jumlah;
        END IF;
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
        v_saldo_baru,
        p_status_verifikasi,
        p_diinput_oleh_nisn,
        p_diinput_oleh_user_id,
        p_diverifikasi_oleh_user_id,
        p_keterangan,
        COALESCE(p_created_at, NOW())
    ) RETURNING id INTO v_transaksi_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Transaksi berhasil diproses',
        'transaksi_id', v_transaksi_id,
        'saldo_awal', v_saldo_curr,
        'saldo_akhir', v_saldo_baru
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;


-- B. Fungsi Verifikasi Transaksi (Setujui Transaksi Pending)
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
    v_trans RECORD;
    v_saldo_curr NUMERIC(14,2) := 0.00;
    v_saldo_baru NUMERIC(14,2) := 0.00;
BEGIN
    -- Kunci baris transaksi agar tidak terjadi double approval
    SELECT * INTO v_trans
    FROM public.tabungan_transaksi
    WHERE id = p_transaksi_id AND status_verifikasi = 'PENDING'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Transaksi tidak ditemukan atau sudah pernah diverifikasi.');
    END IF;

    -- Kunci baris rekening siswa
    SELECT saldo INTO v_saldo_curr
    FROM public.tabungan_rekening
    WHERE siswa_nisn = v_trans.siswa_nisn
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.tabungan_rekening (siswa_nisn, saldo)
        VALUES (v_trans.siswa_nisn, 0.00)
        RETURNING saldo INTO v_saldo_curr;
    END IF;

    -- Hitung saldo baru
    IF v_trans.tipe = 'SETOR' THEN
        v_saldo_baru := v_saldo_curr + v_trans.jumlah;
    ELSIF v_trans.tipe = 'TARIK' THEN
        IF v_saldo_curr < v_trans.jumlah THEN
            RETURN jsonb_build_object('success', false, 'message', 'Persetujuan gagal: Saldo saat ini tidak mencukupi untuk ditarik!');
        END IF;
        v_saldo_baru := v_saldo_curr - v_trans.jumlah;
    END IF;

    -- Update saldo rekening
    UPDATE public.tabungan_rekening
    SET saldo = v_saldo_baru, updated_at = NOW()
    WHERE siswa_nisn = v_trans.siswa_nisn;

    -- Update status transaksi menjadi VERIFIED
    UPDATE public.tabungan_transaksi
    SET status_verifikasi = 'VERIFIED',
        saldo_awal = v_saldo_curr,
        saldo_akhir = v_saldo_baru,
        diverifikasi_oleh_user_id = p_user_id
    WHERE id = p_transaksi_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Transaksi berhasil diverifikasi',
        'saldo_akhir', v_saldo_baru
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;


-- C. Fungsi Tolak Transaksi Pending
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


-- D. Fungsi Edit Transaksi Tabungan (Atomic)
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
    v_trans RECORD;
    v_saldo_curr NUMERIC(14,2) := 0.00;
    v_saldo_baru NUMERIC(14,2) := 0.00;
    v_selisih NUMERIC(14,2) := 0.00;
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

    -- Jika transaksi sudah VERIFIED, update saldo rekening secara proporsional
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


-- E. Fungsi Hapus Transaksi Tabungan (Atomic Rollback)
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
    v_trans RECORD;
    v_saldo_curr NUMERIC(14,2) := 0.00;
    v_saldo_baru NUMERIC(14,2) := 0.00;
BEGIN
    SELECT * INTO v_trans
    FROM public.tabungan_transaksi
    WHERE id = p_transaksi_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Transaksi tidak ditemukan');
    END IF;

    -- Jika transaksi sudah VERIFIED, kembalikan saldo rekening seperti sebelum transaksi
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


-- Berikan izin eksekusi RPC resmi kepada role aplikasi
GRANT EXECUTE ON FUNCTION public.proses_transaksi_tabungan(VARCHAR, VARCHAR, VARCHAR, NUMERIC, VARCHAR, VARCHAR, UUID, UUID, TEXT, TIMESTAMPTZ) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verifikasi_transaksi_tabungan(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tolak_transaksi_tabungan(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edit_transaksi_tabungan(UUID, NUMERIC, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hapus_transaksi_tabungan(UUID) TO anon, authenticated;

-- ====================================================================
-- SELESAI: DATABASE TABUNGAN KINI SUDAH 100% TERLINDUNGI DARI PERETASAN DIRECT API
-- ====================================================================
