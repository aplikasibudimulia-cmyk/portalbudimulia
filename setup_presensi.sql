-- ========== TABEL PRESENSI HARIAN ==========
CREATE TABLE IF NOT EXISTS presensi_harian (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tanggal DATE NOT NULL,
    tahun_ajaran_id UUID REFERENCES tahun_ajaran(id) ON DELETE CASCADE,
    kelas TEXT NOT NULL,
    siswa_nisn TEXT NOT NULL,
    status TEXT NOT NULL, -- H, T, S, I, A, P
    waktu TIME, -- Opsional, diisi khusus untuk T (Terlambat) dan P (Pulang)
    keterangan TEXT,
    diinput_oleh UUID REFERENCES guru(id),
    diedit_oleh UUID REFERENCES guru(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tanggal, siswa_nisn) -- Satu siswa hanya memiliki 1 catatan per hari
);

-- ========== RLS POLICIES ==========
ALTER TABLE presensi_harian ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON presensi_harian FOR ALL USING (true) WITH CHECK (true);

-- ========== MENAMBAHKAN ROLE PIKET & FITURNYA ==========
DO $$
DECLARE
    piket_role_id UUID;
BEGIN
    -- Cek apakah role Piket sudah ada, jika belum insert
    SELECT id INTO piket_role_id FROM roles WHERE nama = 'Piket';
    
    IF NOT FOUND THEN
        INSERT INTO roles (nama, deskripsi) 
        VALUES ('Piket', 'Guru piket harian yang memvalidasi absensi sekolah')
        RETURNING id INTO piket_role_id;
    END IF;

    -- Berikan fitur kelola_presensi_sekolah ke role Piket
    IF NOT EXISTS (SELECT 1 FROM role_fitur WHERE role_id = piket_role_id AND fitur = 'kelola_presensi_sekolah') THEN
        INSERT INTO role_fitur (role_id, fitur) VALUES (piket_role_id, 'kelola_presensi_sekolah');
    END IF;
END $$;
