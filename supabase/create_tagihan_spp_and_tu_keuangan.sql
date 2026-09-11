-- =========================================================================
-- MIGRASI DATABASE: TAGIHAN SPP, TARIF SISWA, LOG BCA, & ROLE TU KEUANGAN
-- =========================================================================

-- 1. Insert Role 'TU Keuangan' jika belum ada
DO $$
DECLARE
    v_tu_role_id UUID;
    v_admin_role_id UUID;
    v_kepsek_role_id UUID;
BEGIN
    SELECT id INTO v_tu_role_id FROM roles WHERE LOWER(nama) = 'tu keuangan' LIMIT 1;
    IF v_tu_role_id IS NULL THEN
        INSERT INTO roles (nama, deskripsi)
        VALUES ('TU Keuangan', 'Staf Tata Usaha pengelola keuangan sekolah, tagihan SPP, dan rekonsiliasi mutasi BCA')
        RETURNING id INTO v_tu_role_id;
    END IF;

    -- Dapatkan role Admin & Kepsek
    SELECT id INTO v_admin_role_id FROM roles WHERE LOWER(nama) = 'admin' LIMIT 1;
    SELECT id INTO v_kepsek_role_id FROM roles WHERE LOWER(nama) = 'kepala sekolah' LIMIT 1;

    -- Berikan permission fitur ke TU Keuangan
    IF v_tu_role_id IS NOT NULL THEN
        INSERT INTO role_fitur (role_id, fitur, akses_level)
        VALUES 
            (v_tu_role_id, 'kelola_tagihan_spp', 'edit'),
            (v_tu_role_id, 'lihat_laporan_keuangan_spp', 'read'),
            (v_tu_role_id, 'upload_mutasi_bca', 'edit')
        ON CONFLICT (role_id, fitur) DO UPDATE SET akses_level = EXCLUDED.akses_level;
    END IF;

    -- Berikan permission juga ke Admin
    IF v_admin_role_id IS NOT NULL THEN
        INSERT INTO role_fitur (role_id, fitur, akses_level)
        VALUES 
            (v_admin_role_id, 'kelola_tagihan_spp', 'edit'),
            (v_admin_role_id, 'lihat_laporan_keuangan_spp', 'edit'),
            (v_admin_role_id, 'upload_mutasi_bca', 'edit')
        ON CONFLICT (role_id, fitur) DO UPDATE SET akses_level = EXCLUDED.akses_level;
    END IF;

    -- Berikan permission laporan ke Kepala Sekolah
    IF v_kepsek_role_id IS NOT NULL THEN
        INSERT INTO role_fitur (role_id, fitur, akses_level)
        VALUES 
            (v_kepsek_role_id, 'lihat_laporan_keuangan_spp', 'read')
        ON CONFLICT (role_id, fitur) DO UPDATE SET akses_level = EXCLUDED.akses_level;
    END IF;
END $$;

-- 2. Tabel Tarif SPP Khusus Siswa
CREATE TABLE IF NOT EXISTS tarif_spp_siswa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    siswa_nisn VARCHAR NOT NULL UNIQUE,
    nominal_spp NUMERIC NOT NULL DEFAULT 800000,
    nomor_va_bca VARCHAR,
    keterangan TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Index tarif siswa
CREATE INDEX IF NOT EXISTS idx_tarif_spp_siswa_nisn ON tarif_spp_siswa(siswa_nisn);

-- 3. Tabel Tagihan SPP Bulanan
CREATE TABLE IF NOT EXISTS tagihan_spp (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tahun_ajaran_id UUID REFERENCES tahun_ajaran(id) ON DELETE CASCADE,
    siswa_nisn VARCHAR NOT NULL,
    kelas VARCHAR,
    bulan INT NOT NULL CHECK (bulan BETWEEN 1 AND 12), -- 1=Juli, 2=Agustus, ..., 12=Juni
    tahun INT NOT NULL,
    nominal_tagihan NUMERIC NOT NULL DEFAULT 0,
    nominal_dibayar NUMERIC NOT NULL DEFAULT 0,
    status VARCHAR NOT NULL DEFAULT 'belum_lunas' CHECK (status IN ('lunas', 'belum_lunas', 'kurang_bayar')),
    tanggal_bayar TIMESTAMP WITH TIME ZONE,
    metode_pembayaran VARCHAR, -- 'transfer_bca', 'tunai', 'beasiswa'
    no_referensi_bank VARCHAR,
    dicatat_oleh VARCHAR,
    keterangan TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_tagihan_spp_siswa_bulan UNIQUE (tahun_ajaran_id, siswa_nisn, bulan, tahun)
);

-- Index tagihan
CREATE INDEX IF NOT EXISTS idx_tagihan_spp_lookup ON tagihan_spp(tahun_ajaran_id, siswa_nisn, bulan, tahun);
CREATE INDEX IF NOT EXISTS idx_tagihan_spp_kelas ON tagihan_spp(kelas, bulan, tahun);
CREATE INDEX IF NOT EXISTS idx_tagihan_spp_status ON tagihan_spp(status);

-- 4. Tabel Transaksi BCA Log (Anti-Duplikasi Idempotency Key)
CREATE TABLE IF NOT EXISTS transaksi_bca_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    no_referensi VARCHAR UNIQUE NOT NULL,
    nomor_va VARCHAR,
    siswa_nisn VARCHAR,
    nama_transaksi VARCHAR,
    nominal NUMERIC NOT NULL,
    tanggal_transaksi TIMESTAMP WITH TIME ZONE,
    status_reconcile VARCHAR DEFAULT 'matched',
    raw_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_transaksi_bca_ref ON transaksi_bca_log(no_referensi);
CREATE INDEX IF NOT EXISTS idx_transaksi_bca_nisn ON transaksi_bca_log(siswa_nisn);

-- Enable RLS & Allow public read/write through app
ALTER TABLE tarif_spp_siswa ENABLE ROW LEVEL SECURITY;
ALTER TABLE tagihan_spp ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaksi_bca_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow public all on tarif_spp_siswa" ON tarif_spp_siswa;
    CREATE POLICY "Allow public all on tarif_spp_siswa" ON tarif_spp_siswa FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public all on tagihan_spp" ON tagihan_spp;
    CREATE POLICY "Allow public all on tagihan_spp" ON tagihan_spp FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public all on transaksi_bca_log" ON transaksi_bca_log;
    CREATE POLICY "Allow public all on transaksi_bca_log" ON transaksi_bca_log FOR ALL USING (true) WITH CHECK (true);
END $$;
