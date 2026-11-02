-- ==============================================================================
-- 🛡️ ANTI-MANIPULATION SECURITY PATCH: TABUNGAN SISWA SMP BUDI MULIA
-- Mengunci Celah Direct API (Curl / Python / Google Colab "Manipulator 3000")
-- ==============================================================================
-- Analisis Temuan:
-- Siswa menggunakan apikey publik (anon key) dan menembak langsung endpoint:
-- POST https://ngdepacckohoxemlsuhd.supabase.co/rest/v1/tabungan_transaksi
-- dengan status_verifikasi = 'VERIFIED' dan payload manipulatif.
--
-- Penyebab:
-- Policy RLS pada public.tabungan_transaksi & public.tabungan_rekening sebelumnya
-- membuka izin FOR ALL TO anon dengan WITH CHECK (true), sehingga siapapun bisa
-- memodifikasi database secara langsung tanpa melalui verifikasi server/guru.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. KUNCI TOTAL TABEL TABUNGAN_TRANSAKSI (CABUT HAK INSERT/UPDATE/DELETE DARI ANON)
-- ------------------------------------------------------------------------------
ALTER TABLE public.tabungan_transaksi ENABLE ROW LEVEL SECURITY;

-- Cabut izin direct manipulasi dari role publik (anon)
REVOKE INSERT, UPDATE, DELETE ON public.tabungan_transaksi FROM anon;

-- Pastikan anon dan authenticated HANYA punya izin SELECT (baca riwayat & realtime)
GRANT SELECT ON public.tabungan_transaksi TO anon, authenticated;
GRANT ALL ON public.tabungan_transaksi TO service_role;

-- Bersihkan policy lama yang bolong
DROP POLICY IF EXISTS "allow_all_tabungan_transaksi" ON public.tabungan_transaksi;
DROP POLICY IF EXISTS "anon_rw_tabungan_transaksi" ON public.tabungan_transaksi;
DROP POLICY IF EXISTS "staff_all_tabungan_transaksi" ON public.tabungan_transaksi;
DROP POLICY IF EXISTS "allow_read_tabungan_transaksi" ON public.tabungan_transaksi;
DROP POLICY IF EXISTS "allow_insert_pending_tabungan_transaksi" ON public.tabungan_transaksi;

-- Policy Baru: HANYA BOLEH BACA (SELECT)
CREATE POLICY "tabungan_transaksi_read_policy"
ON public.tabungan_transaksi
FOR SELECT
TO anon, authenticated
USING (true);

-- Policy Khusus Service Role / Backend
CREATE POLICY "tabungan_transaksi_service_policy"
ON public.tabungan_transaksi
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- ------------------------------------------------------------------------------
-- 2. KUNCI TOTAL TABEL TABUNGAN_REKENING (SALDO SISWA ANTI-MANIPULASI)
-- ------------------------------------------------------------------------------
ALTER TABLE public.tabungan_rekening ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.tabungan_rekening FROM anon;

GRANT SELECT ON public.tabungan_rekening TO anon, authenticated;
GRANT ALL ON public.tabungan_rekening TO service_role;

DROP POLICY IF EXISTS "allow_all_tabungan_rekening" ON public.tabungan_rekening;
DROP POLICY IF EXISTS "anon_rw_tabungan_rekening" ON public.tabungan_rekening;
DROP POLICY IF EXISTS "staff_all_tabungan_rekening" ON public.tabungan_rekening;
DROP POLICY IF EXISTS "allow_read_tabungan_rekening" ON public.tabungan_rekening;

-- Policy Baru: HANYA BOLEH BACA (SELECT)
CREATE POLICY "tabungan_rekening_read_policy"
ON public.tabungan_rekening
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "tabungan_rekening_service_policy"
ON public.tabungan_rekening
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- ------------------------------------------------------------------------------
-- 3. KUNCI TABEL BENDAHARA_KELAS
-- ------------------------------------------------------------------------------
ALTER TABLE public.bendahara_kelas ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.bendahara_kelas FROM anon;
GRANT SELECT ON public.bendahara_kelas TO anon, authenticated;
GRANT ALL ON public.bendahara_kelas TO service_role;

DROP POLICY IF EXISTS "allow_all_bendahara_kelas" ON public.bendahara_kelas;
DROP POLICY IF EXISTS "anon_rw_bendahara_kelas" ON public.bendahara_kelas;
DROP POLICY IF EXISTS "allow_read_bendahara_kelas" ON public.bendahara_kelas;
DROP POLICY IF EXISTS "allow_manage_bendahara_kelas" ON public.bendahara_kelas;

CREATE POLICY "bendahara_kelas_read_policy"
ON public.bendahara_kelas
FOR SELECT
TO anon, authenticated
USING (true);


-- ------------------------------------------------------------------------------
-- 4. HARDENING RPC: PROSES TRANSAKSI TABUNGAN (SERVER-SIDE INTEGRITY ENFORCEMENT)
-- Mencegah bypass status 'VERIFIED' dari luar sistem
-- ------------------------------------------------------------------------------
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
    v_saldo_curr NUMERIC(14,2) := 0.00;
    v_saldo_baru NUMERIC(14,2) := 0.00;
    v_rekening_id UUID;
    v_transaksi_id UUID;
    v_is_staff BOOLEAN := FALSE;
    v_final_status VARCHAR := 'PENDING';
BEGIN
    -- Validasi tipe
    IF p_tipe NOT IN ('SETOR', 'TARIK') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Tipe transaksi tidak valid! Harus SETOR atau TARIK.');
    END IF;

    -- Validasi jumlah positif
    IF p_jumlah IS NULL OR p_jumlah <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Nominal transaksi harus lebih besar dari 0!');
    END IF;

    -- CEK OTORISASI: Apakah penginput adalah Guru / Staff sah?
    IF p_diinput_oleh_user_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.guru WHERE id = p_diinput_oleh_user_id
            UNION
            SELECT 1 FROM public.akun_pengguna WHERE id = p_diinput_oleh_user_id AND role IN ('guru','admin','staff','staf')
        ) INTO v_is_staff;
    END IF;

    -- CEK OTORISASI MUTLAK:
    -- Hanya ada 2 pihak yang diizinkan mencatat transaksi tabungan:
    -- 1. Guru / Staff (p_diinput_oleh_user_id sah) -> Boleh status VERIFIED atau PENDING
    -- 2. Bendahara Kelas Resmi (p_diinput_oleh_nisn sah & terdaftar di bendahara_kelas) -> WAJIB status PENDING
    -- Jika BUKAN keduanya (siswa biasa / program luar / tanpa hak akses) -> TOLAK TOTAL!
    IF v_is_staff THEN
        v_final_status := COALESCE(p_status_verifikasi, 'VERIFIED');
    ELSIF p_diinput_oleh_nisn IS NOT NULL THEN
        -- Pastikan NISN penginput terdaftar sebagai bendahara sah untuk kelas tersebut
        IF NOT EXISTS (
            SELECT 1 FROM public.bendahara_kelas
            WHERE siswa_nisn = p_diinput_oleh_nisn
              AND UPPER(REPLACE(kelas, ' ', '')) = UPPER(REPLACE(p_kelas, ' ', ''))
        ) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Akses ditolak: Anda bukan bendahara resmi untuk kelas ini!');
        END IF;

        -- Bendahara kelas hanya boleh menginput dengan status PENDING
        v_final_status := 'PENDING';
    ELSE
        -- Bukan staf dan bukan bendahara (misal: bot luar / siswa biasa menembak RPC)
        RETURN jsonb_build_object('success', false, 'message', 'Akses ditolak: Anda tidak memiliki wewenang untuk mencatat transaksi tabungan!');
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

    -- Update saldo rekening HANYA jika status adalah VERIFIED (oleh Guru/Admin)
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
        p_diinput_oleh_nisn,
        p_diinput_oleh_user_id,
        CASE WHEN v_final_status = 'VERIFIED' THEN p_diinput_oleh_user_id ELSE NULL END,
        p_keterangan,
        COALESCE(p_created_at, NOW())
    ) RETURNING id INTO v_transaksi_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', CASE WHEN v_final_status = 'VERIFIED' 
                        THEN 'Transaksi berhasil diproses & saldo telah bertambah.' 
                        ELSE 'Setoran berhasil dicatat dan menunggu verifikasi Wali Kelas.' END,
        'transaksi_id', v_transaksi_id,
        'status', v_final_status,
        'saldo_sekarang', CASE WHEN v_final_status = 'VERIFIED' THEN v_saldo_baru ELSE v_saldo_curr END
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.proses_transaksi_tabungan TO anon, authenticated;


-- ------------------------------------------------------------------------------
-- 5. HARDENING RPC: VERIFIKASI TRANSAKSI OLEH GURU / WALI KELAS
-- ------------------------------------------------------------------------------
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
    v_is_staff BOOLEAN := FALSE;
BEGIN
    -- Validasi bahwa yang memverifikasi adalah akun Guru / Staff
    IF p_user_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.guru WHERE id = p_user_id
            UNION
            SELECT 1 FROM public.akun_pengguna WHERE id = p_user_id AND role IN ('guru','admin','staff','staf')
        ) INTO v_is_staff;
    END IF;

    IF NOT v_is_staff THEN
        RETURN jsonb_build_object('success', false, 'message', 'Akses ditolak: Hanya Guru atau Wali Kelas yang dapat memverifikasi setoran!');
    END IF;

    -- Kunci baris transaksi agar aman dari race condition
    SELECT * INTO v_trans
    FROM public.tabungan_transaksi
    WHERE id = p_transaksi_id AND status_verifikasi = 'PENDING'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Transaksi tidak ditemukan atau sudah pernah diverifikasi.');
    END IF;

    -- Kunci baris saldo rekening siswa
    SELECT saldo INTO v_saldo_curr
    FROM public.tabungan_rekening
    WHERE siswa_nisn = v_trans.siswa_nisn
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.tabungan_rekening (siswa_nisn, saldo)
        VALUES (v_trans.siswa_nisn, 0.00)
        RETURNING saldo INTO v_saldo_curr;
    END IF;

    -- Hitung saldo sah baru
    IF v_trans.tipe = 'SETOR' THEN
        v_saldo_baru := v_saldo_curr + v_trans.jumlah;
    ELSIF v_trans.tipe = 'TARIK' THEN
        IF v_saldo_curr < v_trans.jumlah THEN
            RETURN jsonb_build_object('success', false, 'message', 'Gagal verifikasi: Saldo siswa saat ini tidak mencukupi penarikan!');
        END IF;
        v_saldo_baru := v_saldo_curr - v_trans.jumlah;
    END IF;

    -- Update saldo rekening siswa di tabel utama
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
        'message', 'Setoran berhasil diverifikasi dan saldo siswa telah diupdate.',
        'saldo_baru', v_saldo_baru
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.verifikasi_transaksi_tabungan TO anon, authenticated;


-- ------------------------------------------------------------------------------
-- 6. PEMBERSIHAN DATA FIKTIF YANG DISUNTIKKAN OLEH SISWA (AUDIT & REKALKULASI)
-- ------------------------------------------------------------------------------
-- Hapus transaksi uji coba ilegal siswa (seperti yang ada di screenshot Colab)
DELETE FROM public.tabungan_transaksi 
WHERE (siswa_nisn = '1231231231' AND keterangan = 'tes')
   OR (keterangan = 'tes' AND diinput_oleh_user_id IS NULL AND diinput_oleh_nisn IS NULL);

-- Rekalkulasi ulang saldo rekening seluruh siswa agar 100% konsisten dengan mutasi yang SAH
UPDATE public.tabungan_rekening tr
SET saldo = COALESCE((
    SELECT SUM(
        CASE 
            WHEN tt.tipe = 'SETOR' THEN tt.jumlah 
            WHEN tt.tipe = 'TARIK' THEN -tt.jumlah 
            ELSE 0 
        END
    )
    FROM public.tabungan_transaksi tt
    WHERE tt.siswa_nisn = tr.siswa_nisn 
      AND tt.status_verifikasi = 'VERIFIED'
), 0.00),
updated_at = NOW();


-- ------------------------------------------------------------------------------
-- 7. REFRESH SCHEMA CACHE POSTGREST
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

