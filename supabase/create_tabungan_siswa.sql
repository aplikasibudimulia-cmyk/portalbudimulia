-- ====================================================================
-- MIGRASI FITUR TABUNGAN SISWA & BENDAHARA KELAS (EBUDIMULIA)
-- ====================================================================

-- 1. TABEL TABUNGAN REKENING (Saldo teragregasi per siswa)
CREATE TABLE IF NOT EXISTS public.tabungan_rekening (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    siswa_nisn VARCHAR(50) UNIQUE NOT NULL,
    saldo NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (saldo >= 0),
    is_aktif BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index untuk pencarian cepat berdasarkan NISN
CREATE INDEX IF NOT EXISTS idx_tabungan_rekening_nisn ON public.tabungan_rekening(siswa_nisn);

-- 2. TABEL TABUNGAN TRANSAKSI (Riwayat Mutasi Setor / Tarik)
CREATE TABLE IF NOT EXISTS public.tabungan_transaksi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    siswa_nisn VARCHAR(50) NOT NULL,
    kelas VARCHAR(50),
    tipe VARCHAR(10) NOT NULL CHECK (tipe IN ('SETOR', 'TARIK')),
    jumlah NUMERIC(14,2) NOT NULL CHECK (jumlah > 0),
    saldo_awal NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    saldo_akhir NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    status_verifikasi VARCHAR(20) NOT NULL DEFAULT 'VERIFIED' CHECK (status_verifikasi IN ('PENDING', 'VERIFIED', 'REJECTED')),
    diinput_oleh_nisn VARCHAR(50), -- Diisi NISN jika diinput oleh Bendahara Kelas (Siswa)
    diinput_oleh_user_id UUID, -- Diisi Auth User ID jika diinput oleh Guru/Wali Kelas/Admin
    diverifikasi_oleh_user_id UUID, -- Auth User ID Wali Kelas/Admin yang menyetujui
    keterangan TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pencarian transaksi
CREATE INDEX IF NOT EXISTS idx_tabungan_transaksi_nisn ON public.tabungan_transaksi(siswa_nisn);
CREATE INDEX IF NOT EXISTS idx_tabungan_transaksi_kelas ON public.tabungan_transaksi(kelas);
CREATE INDEX IF NOT EXISTS idx_tabungan_transaksi_status ON public.tabungan_transaksi(status_verifikasi);
CREATE INDEX IF NOT EXISTS idx_tabungan_transaksi_created ON public.tabungan_transaksi(created_at DESC);

-- 3. TABEL BENDAHARA KELAS (Penunjukan Siswa Penanggung Jawab oleh Wali Kelas)
CREATE TABLE IF NOT EXISTS public.bendahara_kelas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kelas VARCHAR(50) NOT NULL,
    siswa_nisn VARCHAR(50) NOT NULL,
    tahun_ajaran_id VARCHAR(100),
    ditunjuk_oleh UUID, -- ID Auth Wali Kelas
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_bendahara_kelas UNIQUE(kelas, tahun_ajaran_id)
);

-- Penyesuaian tipe data jika kolom tahun_ajaran_id sebelumnya dibuat sebagai BIGINT
ALTER TABLE public.bendahara_kelas ALTER COLUMN tahun_ajaran_id TYPE VARCHAR(100) USING tahun_ajaran_id::VARCHAR;

CREATE INDEX IF NOT EXISTS idx_bendahara_kelas_nisn ON public.bendahara_kelas(siswa_nisn);
CREATE INDEX IF NOT EXISTS idx_bendahara_kelas_kelas ON public.bendahara_kelas(kelas);

-- 4. ENABLE RLS (Row Level Security)
ALTER TABLE public.tabungan_rekening ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tabungan_transaksi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bendahara_kelas ENABLE ROW LEVEL SECURITY;

-- Policy RLS Permissive untuk Anon & Authenticated (sesuai arsitektur eBudimulia)
DROP POLICY IF EXISTS "anon_rw_tabungan_rekening" ON public.tabungan_rekening;
CREATE POLICY "anon_rw_tabungan_rekening" ON public.tabungan_rekening FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_rw_tabungan_transaksi" ON public.tabungan_transaksi;
CREATE POLICY "anon_rw_tabungan_transaksi" ON public.tabungan_transaksi FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_rw_bendahara_kelas" ON public.bendahara_kelas;
CREATE POLICY "anon_rw_bendahara_kelas" ON public.bendahara_kelas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 5. FUNCTION ATOMIK: PROSES TRANSAKSI TABUNGAN
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
    p_keterangan TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_saldo_curr NUMERIC(14,2) := 0.00;
    v_saldo_baru NUMERIC(14,2) := 0.00;
    v_rekening_id UUID;
    v_transaksi_id UUID;
BEGIN
    -- Validasi tipe
    IF p_tipe NOT IN ('SETOR', 'TARIK') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Tipe transaksi harus SETOR atau TARIK');
    END IF;

    IF p_jumlah <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Jumlah transaksi harus lebih dari 0');
    END IF;

    -- Ambil atau buat rekening tabungan siswa
    SELECT id, saldo INTO v_rekening_id, v_saldo_curr
    FROM public.tabungan_rekening
    WHERE siswa_nisn = p_siswa_nisn
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.tabungan_rekening (siswa_nisn, saldo)
        VALUES (p_siswa_nisn, 0.00)
        RETURNING id, saldo INTO v_rekening_id, v_saldo_curr;
    END IF;

    -- Hitung saldo baru (HANYA update saldo rekening jika status_verifikasi = 'VERIFIED')
    IF p_status_verifikasi = 'VERIFIED' THEN
        IF p_tipe = 'SETOR' THEN
            v_saldo_baru := v_saldo_curr + p_jumlah;
        ELSIF p_tipe = 'TARIK' THEN
            IF v_saldo_curr < p_jumlah THEN
                RETURN jsonb_build_object('success', false, 'message', 'Saldo tidak mencukupi untuk melakukan penarikan!');
            END IF;
            v_saldo_baru := v_saldo_curr - p_jumlah;
        END IF;

        -- Update saldo rekening
        UPDATE public.tabungan_rekening
        SET saldo = v_saldo_baru, updated_at = NOW()
        WHERE id = v_rekening_id;
    ELSE
        -- Jika status PENDING (misal diinput Bendahara Kelas), saldo awal dan akhir dicatat estimasi
        IF p_tipe = 'SETOR' THEN
            v_saldo_baru := v_saldo_curr + p_jumlah;
        ELSIF p_tipe = 'TARIK' THEN
            IF v_saldo_curr < p_jumlah THEN
                RETURN jsonb_build_object('success', false, 'message', 'Saldo tidak mencukupi!');
            END IF;
            v_saldo_baru := v_saldo_curr - p_jumlah;
        END IF;
    END IF;

    -- Insert riwayat mutasi transaksi
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

-- 6. FUNCTION ATOMIK: VERIFIKASI / APPROVE TRANSAKSI PENDING
CREATE OR REPLACE FUNCTION public.verifikasi_transaksi_tabungan(
    p_transaksi_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_trans RECORD;
    v_saldo_curr NUMERIC(14,2) := 0.00;
    v_saldo_baru NUMERIC(14,2) := 0.00;
BEGIN
    SELECT * INTO v_trans
    FROM public.tabungan_transaksi
    WHERE id = p_transaksi_id AND status_verifikasi = 'PENDING'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Transaksi tidak ditemukan atau sudah diverifikasi.');
    END IF;

    -- Lock & ambil saldo terkini
    SELECT saldo INTO v_saldo_curr
    FROM public.tabungan_rekening
    WHERE siswa_nisn = v_trans.siswa_nisn
    FOR UPDATE;

    IF v_trans.tipe = 'SETOR' THEN
        v_saldo_baru := v_saldo_curr + v_trans.jumlah;
    ELSIF v_trans.tipe = 'TARIK' THEN
        IF v_saldo_curr < v_trans.jumlah THEN
            RETURN jsonb_build_object('success', false, 'message', 'Saldo tidak mencukupi untuk disetujui!');
        END IF;
        v_saldo_baru := v_saldo_curr - v_trans.jumlah;
    END IF;

    -- Update saldo rekening
    UPDATE public.tabungan_rekening
    SET saldo = v_saldo_baru, updated_at = NOW()
    WHERE siswa_nisn = v_trans.siswa_nisn;

    -- Update status transaksi
    UPDATE public.tabungan_transaksi
    SET status_verifikasi = 'VERIFIED',
        saldo_awal = v_saldo_curr,
        saldo_akhir = v_saldo_baru,
        diverifikasi_oleh_user_id = p_user_id
    WHERE id = p_transaksi_id;

    RETURN jsonb_build_object('success', true, 'message', 'Transaksi berhasil diverifikasi', 'saldo_akhir', v_saldo_baru);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- 7. FUNCTION ATOMIK: EDIT TRANSAKSI TABUNGAN
CREATE OR REPLACE FUNCTION public.edit_transaksi_tabungan(
    p_transaksi_id UUID,
    p_jumlah_baru NUMERIC,
    p_keterangan_baru TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_trans RECORD;
    v_saldo_curr NUMERIC(14,2) := 0.00;
    v_saldo_baru NUMERIC(14,2) := 0.00;
    v_selisih NUMERIC(14,2) := 0.00;
BEGIN
    IF p_jumlah_baru <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Jumlah transaksi harus lebih dari 0');
    END IF;

    -- Lock transaksi
    SELECT * INTO v_trans
    FROM public.tabungan_transaksi
    WHERE id = p_transaksi_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Transaksi tidak ditemukan');
    END IF;

    -- Jika transaksi sudah VERIFIED, update saldo rekening secara atomik
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
            RETURN jsonb_build_object('success', false, 'message', 'Perubahan transaksi gagal: Saldo tidak boleh negatif!');
        END IF;

        UPDATE public.tabungan_rekening
        SET saldo = v_saldo_baru, updated_at = NOW()
        WHERE siswa_nisn = v_trans.siswa_nisn;
    ELSE
        v_saldo_baru := v_trans.saldo_akhir;
    END IF;

    -- Update transaksi
    UPDATE public.tabungan_transaksi
    SET jumlah = p_jumlah_baru,
        keterangan = COALESCE(p_keterangan_baru, keterangan),
        saldo_akhir = CASE WHEN v_trans.status_verifikasi = 'VERIFIED' THEN v_saldo_baru ELSE saldo_akhir END
    WHERE id = p_transaksi_id;

    RETURN jsonb_build_object('success', true, 'message', 'Transaksi berhasil diperbarui', 'saldo_akhir', v_saldo_baru);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- 8. FUNCTION ATOMIK: HAPUS TRANSAKSI TABUNGAN
CREATE OR REPLACE FUNCTION public.hapus_transaksi_tabungan(
    p_transaksi_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_trans RECORD;
    v_saldo_curr NUMERIC(14,2) := 0.00;
    v_saldo_baru NUMERIC(14,2) := 0.00;
BEGIN
    -- Lock transaksi
    SELECT * INTO v_trans
    FROM public.tabungan_transaksi
    WHERE id = p_transaksi_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Transaksi tidak ditemukan');
    END IF;

    -- Jika transaksi sudah VERIFIED, kembalikan saldo rekening secara atomik
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
            RETURN jsonb_build_object('success', false, 'message', 'Penghapusan transaksi gagal: Saldo tidak boleh negatif!');
        END IF;

        UPDATE public.tabungan_rekening
        SET saldo = v_saldo_baru, updated_at = NOW()
        WHERE siswa_nisn = v_trans.siswa_nisn;
    END IF;

    -- Hapus record transaksi
    DELETE FROM public.tabungan_transaksi WHERE id = p_transaksi_id;

    RETURN jsonb_build_object('success', true, 'message', 'Transaksi berhasil dihapus');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- 9. FUNCTION ATOMIK: TOLAK TRANSAKSI TABUNGAN
CREATE OR REPLACE FUNCTION public.tolak_transaksi_tabungan(
    p_transaksi_id UUID,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.tabungan_transaksi
    SET status_verifikasi = 'REJECTED',
        diverifikasi_oleh_user_id = p_user_id
    WHERE id = p_transaksi_id AND status_verifikasi = 'PENDING';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Transaksi tidak ditemukan atau sudah diproses.');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Setoran berhasil ditolak.');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- Enable Realtime publication for tabungan and settings tables
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tabungan_transaksi;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tabungan_rekening;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bendahara_kelas;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pengaturan_sekolah;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Table might already be in publication, ignore error
  NULL;
END $$;
