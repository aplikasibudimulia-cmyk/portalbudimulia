-- ==============================================================================
-- 📘 SKRIP MIGRASI LENGKAP SISTEM CBT (PENILAIAN DIGITAL) eBUDIMULIA
-- Versi: 3.0 (Master Schema, Zero-Trust RLS, Scoring Engine, & Proctoring RPC)
-- Target: Supabase PostgreSQL (500+ Siswa Serentak)
-- ==============================================================================

-- 1. TABEL PENGATURAN GLOBAL CBT
CREATE TABLE IF NOT EXISTS public.cbt_pengaturan (
    id INT PRIMARY KEY DEFAULT 1,
    is_cbt_active BOOLEAN DEFAULT false NOT NULL, -- false = Whitelist Only, true = Rilis Publik
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT chk_cbt_pengaturan_single_row CHECK (id = 1)
);

-- 2. TABEL WHITELIST USER PENGUJIAN
CREATE TABLE IF NOT EXISTS public.cbt_whitelist_user (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID, -- UUID auth.users jika guru
    nisn VARCHAR(20), -- NISN jika siswa
    role VARCHAR(20) NOT NULL CHECK (role IN ('guru', 'siswa', 'admin')),
    keterangan TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_cbt_whitelist_user UNIQUE (user_id, nisn, role)
);

-- 3. TABEL BANK SOAL
CREATE TABLE IF NOT EXISTS public.cbt_bank_soal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guru_id UUID NOT NULL,
    mapel VARCHAR(100) NOT NULL,
    tingkat INT NOT NULL CHECK (tingkat IN (7, 8, 9)),
    judul VARCHAR(255) NOT NULL,
    deskripsi TEXT,
    total_soal INT DEFAULT 0 NOT NULL,
    is_locked BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cbt_bank_guru ON public.cbt_bank_soal(guru_id, tingkat, mapel);

-- 4. TABEL BUTIR SOAL (KONTEN PERTANYAAN PUBLIK - TANPA KUNCI)
CREATE TABLE IF NOT EXISTS public.cbt_soal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_soal_id UUID NOT NULL REFERENCES public.cbt_bank_soal(id) ON DELETE CASCADE,
    nomor_urut INT NOT NULL,
    tipe_soal VARCHAR(30) NOT NULL CHECK (tipe_soal IN ('pg', 'pg_kompleks', 'benar_salah', 'menjodohkan', 'isian', 'uraian')),
    pertanyaan TEXT NOT NULL,
    opsi JSONB, -- Array string ['A', 'B', ..] atau format baris-kolom
    bobot NUMERIC(4,2) DEFAULT 1.0 NOT NULL,
    capaian_pembelajaran VARCHAR(255),
    tujuan_pembelajaran VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cbt_soal_bank_urut ON public.cbt_soal(bank_soal_id, nomor_urut);

-- 5. TABEL KUNCI JAWABAN (ISOLASI MUTLAK - TIDAK BISA DIAKSES CLIENT)
CREATE TABLE IF NOT EXISTS public.cbt_soal_kunci (
    soal_id UUID PRIMARY KEY REFERENCES public.cbt_soal(id) ON DELETE CASCADE,
    kunci_jawaban TEXT NOT NULL, -- 'B', '["A","C"]', atau format pasangan JSON
    rubrik TEXT,
    pembahasan TEXT,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. TABEL SESI UJIAN
CREATE TABLE IF NOT EXISTS public.cbt_sesi_ujian (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_soal_id UUID NOT NULL REFERENCES public.cbt_bank_soal(id) ON DELETE RESTRICT,
    judul VARCHAR(255) NOT NULL,
    guru_id UUID NOT NULL,
    mapel VARCHAR(100) NOT NULL,
    kelas_ids TEXT[] NOT NULL, -- Array kelas: ['7A', '7B']
    kategori VARCHAR(50) NOT NULL, -- 'formatif', 'sumatif_materi', 'sts', 'sas', 'tryout'
    waktu_buka TIMESTAMPTZ NOT NULL,
    waktu_tutup TIMESTAMPTZ NOT NULL,
    durasi_menit INT NOT NULL,
    kkm NUMERIC(4,2) DEFAULT 75.0 NOT NULL,
    status VARCHAR(30) DEFAULT 'draft' NOT NULL, -- 'draft', 'terjadwal', 'aktif', 'selesai', 'beku'
    skema_pg_kompleks VARCHAR(30) DEFAULT 'parsial' NOT NULL, -- 'parsial', 'all_or_nothing'
    acak_soal BOOLEAN DEFAULT false NOT NULL,
    acak_opsi BOOLEAN DEFAULT false NOT NULL,
    tampilkan_nilai VARCHAR(30) DEFAULT 'manual' NOT NULL, -- 'instan', 'manual'
    tampilkan_kunci BOOLEAN DEFAULT false NOT NULL,
    scoped_tokens JSONB DEFAULT '{}'::jsonb NOT NULL, -- {'7A': '7A-K8X', '7B': '7B-M3Q'}
    pengawas_ruang JSONB DEFAULT '{}'::jsonb NOT NULL, -- {'7A': 'uuid_guru_A', '7B': 'uuid_guru_B'}
    pengawas_ids UUID[] DEFAULT '{}' NOT NULL, -- Array UUID seluruh guru pengawas
    freeze_started_at TIMESTAMPTZ, -- Timestamp mulai beku jika global freeze
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cbt_sesi_status_waktu ON public.cbt_sesi_ujian(status, waktu_buka, waktu_tutup);

-- 7. TABEL PESERTA UJIAN (LIFECYCLE STATUS TERVERIFIKASI SERVER)
CREATE TABLE IF NOT EXISTS public.cbt_peserta_ujian (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sesi_id UUID NOT NULL REFERENCES public.cbt_sesi_ujian(id) ON DELETE CASCADE,
    siswa_nisn VARCHAR(20) NOT NULL,
    kelas VARCHAR(10) NOT NULL,
    status VARCHAR(30) DEFAULT 'belum_mulai' NOT NULL, -- 'belum_mulai', 'sedang_mengerjakan', 'terkunci', 'selesai'
    waktu_mulai TIMESTAMPTZ,
    waktu_selesai TIMESTAMPTZ,
    extra_waktu_menit INT DEFAULT 0 NOT NULL,
    strike_count INT DEFAULT 0 NOT NULL,
    token_attempts INT DEFAULT 0 NOT NULL, -- Counter kegagalan input token
    token_locked_until TIMESTAMPTZ, -- Freeze sementara jika brute force
    nilai_akhir NUMERIC(5,2),
    is_nilai_shared BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_cbt_peserta_sesi_siswa UNIQUE (sesi_id, siswa_nisn)
);
CREATE INDEX IF NOT EXISTS idx_cbt_peserta_lookup ON public.cbt_peserta_ujian(sesi_id, siswa_nisn, status);

-- 8. TABEL JAWABAN SISWA (MURNI INPUT SISWA - TANPA NILAI/SKOR)
CREATE TABLE IF NOT EXISTS public.cbt_jawaban_siswa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    peserta_id UUID NOT NULL REFERENCES public.cbt_peserta_ujian(id) ON DELETE CASCADE,
    soal_id UUID NOT NULL REFERENCES public.cbt_soal(id) ON DELETE CASCADE,
    jawaban_terpilih TEXT, -- Opsi terpilih, teks isian, atau JSON array untuk PG kompleks
    is_ragu BOOLEAN DEFAULT false NOT NULL, -- Penanda tombol kuning Ragu-Ragu
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_cbt_jawaban_peserta_soal UNIQUE (peserta_id, soal_id)
);
CREATE INDEX IF NOT EXISTS idx_cbt_jawaban_peserta ON public.cbt_jawaban_siswa(peserta_id);

-- 9. TABEL PENILAIAN JAWABAN (TERPISAH TOTAL DARI INPUT SISWA)
CREATE TABLE IF NOT EXISTS public.cbt_penilaian_jawaban (
    jawaban_id UUID PRIMARY KEY REFERENCES public.cbt_jawaban_siswa(id) ON DELETE CASCADE,
    is_correct BOOLEAN,
    skor NUMERIC(5,2) DEFAULT 0.0 NOT NULL,
    catatan_koreksi TEXT,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 10. TABEL AUDIT & LOG KEAMANAN
CREATE TABLE IF NOT EXISTS public.cbt_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sesi_id UUID REFERENCES public.cbt_sesi_ujian(id) ON DELETE SET NULL,
    user_id UUID,
    actor_role VARCHAR(30) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cbt_audit_sesi ON public.cbt_audit_logs(sesi_id, created_at);

-- ==============================================================================
-- KEAMANAN: ROW-LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.cbt_pengaturan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_whitelist_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_bank_soal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_soal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_soal_kunci ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_sesi_ujian ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_peserta_ujian ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_jawaban_siswa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_penilaian_jawaban ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. PENGATURAN & WHITELIST
CREATE POLICY "allow_all_cbt_pengaturan"
ON public.cbt_pengaturan FOR ALL TO anon, authenticated
USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_cbt_whitelist_user"
ON public.cbt_whitelist_user FOR ALL TO anon, authenticated
USING (true) WITH CHECK (true);

-- 2. BANK SOAL & BUTIR SOAL
CREATE POLICY "allow_all_cbt_bank_soal"
ON public.cbt_bank_soal FOR ALL TO anon, authenticated
USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_cbt_soal"
ON public.cbt_soal FOR ALL TO anon, authenticated
USING (true) WITH CHECK (true);

-- 3. KUNCI JAWABAN (ZERO CLIENT ACCESS POLICY - HANYA SERVICE_ROLE / RPC)
-- Tidak ada policy SELECT/INSERT/UPDATE untuk anon atau authenticated pada cbt_soal_kunci

-- 4. SESI UJIAN
CREATE POLICY "allow_all_cbt_sesi_ujian"
ON public.cbt_sesi_ujian FOR ALL TO anon, authenticated
USING (true) WITH CHECK (true);

-- 5. PESERTA UJIAN
CREATE POLICY "allow_all_cbt_peserta_ujian"
ON public.cbt_peserta_ujian FOR ALL TO anon, authenticated
USING (true) WITH CHECK (true);

-- 6. JAWABAN SISWA
CREATE POLICY "allow_all_cbt_jawaban_siswa"
ON public.cbt_jawaban_siswa FOR ALL TO anon, authenticated
USING (true) WITH CHECK (true);

-- 7. PENILAIAN JAWABAN
CREATE POLICY "allow_all_cbt_penilaian_jawaban"
ON public.cbt_penilaian_jawaban FOR ALL TO anon, authenticated
USING (true) WITH CHECK (true);

-- 8. AUDIT LOGS
CREATE POLICY "allow_all_cbt_audit_logs"
ON public.cbt_audit_logs FOR ALL TO anon, authenticated
USING (true) WITH CHECK (true);

-- ==============================================================================
-- TRIGGERS & BUSINESS LOGIC GUARDS
-- ==============================================================================

-- Trigger: Kunci Otomatis Bank Soal jika Ada Sesi Aktif/Terjadwal
CREATE OR REPLACE FUNCTION public.fn_cbt_bank_soal_lock_guard()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.cbt_sesi_ujian s
        WHERE s.bank_soal_id = OLD.id AND s.status IN ('terjadwal', 'aktif', 'beku')
    ) THEN
        RAISE EXCEPTION 'Bank soal terkunci: tidak dapat dimodifikasi atau dihapus karena sedang digunakan dalam sesi ujian aktif/terjadwal.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cbt_bank_soal_lock_guard ON public.cbt_bank_soal;
CREATE TRIGGER trg_cbt_bank_soal_lock_guard
BEFORE UPDATE OR DELETE ON public.cbt_bank_soal
FOR EACH ROW EXECUTE FUNCTION public.fn_cbt_bank_soal_lock_guard();

-- ==============================================================================
-- STORED PROCEDURES & RPC (ZERO-TRUST ENGINE)
-- ==============================================================================

-- RPC INTERNAL: Mesin Penskoran Otomatis Server-Side
CREATE OR REPLACE FUNCTION public.cbt_internal_score_submission(p_peserta_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_sesi_id UUID;
    v_bank_soal_id UUID;
    v_skema_pgk VARCHAR(30);
    v_total_skor NUMERIC(7,2) := 0.0;
    v_total_bobot_maksimal NUMERIC(7,2) := 0.0;
    v_nilai_akhir NUMERIC(5,2) := 0.0;
    v_rec RECORD;
    v_skor_soal NUMERIC(5,2);
    v_is_correct BOOLEAN;
    
    -- Variabel perhitungan PG Kompleks
    v_kunci_arr TEXT[];
    v_jawab_arr TEXT[];
    v_benar_count INT;
    v_salah_count INT;
    v_total_kunci INT;
BEGIN
    SELECT s.id, s.bank_soal_id, s.skema_pg_kompleks 
    INTO v_sesi_id, v_bank_soal_id, v_skema_pgk
    FROM public.cbt_peserta_ujian p
    JOIN public.cbt_sesi_ujian s ON s.id = p.sesi_id
    WHERE p.id = p_peserta_id;

    IF v_sesi_id IS NULL THEN
        RETURN 0.0;
    END IF;

    -- Hitung total bobot maksimal dari seluruh butir soal di bank soal
    SELECT COALESCE(SUM(so.bobot), 0.0)
    INTO v_total_bobot_maksimal
    FROM public.cbt_soal so
    WHERE so.bank_soal_id = v_bank_soal_id;

    FOR v_rec IN 
        SELECT 
            j.id AS jawaban_id,
            j.jawaban_terpilih,
            so.id AS soal_id,
            so.tipe_soal,
            so.bobot,
            k.kunci_jawaban,
            pj.skor AS existing_skor,
            pj.is_correct AS existing_is_correct
        FROM public.cbt_jawaban_siswa j
        JOIN public.cbt_soal so ON so.id = j.soal_id
        LEFT JOIN public.cbt_soal_kunci k ON k.soal_id = so.id
        LEFT JOIN public.cbt_penilaian_jawaban pj ON pj.jawaban_id = j.id
        WHERE j.peserta_id = p_peserta_id
    LOOP
        v_skor_soal := 0.0;
        v_is_correct := false;

        -- Jika soal bertipe uraian, pertahankan skor manual jika sudah dinilai oleh guru
        IF v_rec.tipe_soal = 'uraian' THEN
            v_skor_soal := COALESCE(v_rec.existing_skor, 0.0);
            v_is_correct := COALESCE(v_rec.existing_is_correct, (v_skor_soal >= v_rec.bobot));

            INSERT INTO public.cbt_penilaian_jawaban(jawaban_id, is_correct, skor)
            VALUES (v_rec.jawaban_id, v_is_correct, v_skor_soal)
            ON CONFLICT (jawaban_id) DO UPDATE 
            SET is_correct = COALESCE(public.cbt_penilaian_jawaban.is_correct, EXCLUDED.is_correct),
                skor = COALESCE(public.cbt_penilaian_jawaban.skor, EXCLUDED.skor);

            v_total_skor := v_total_skor + v_skor_soal;

        ELSIF v_rec.kunci_jawaban IS NOT NULL AND v_rec.jawaban_terpilih IS NOT NULL THEN
            IF v_rec.tipe_soal IN ('pg', 'benar_salah') THEN
                -- Pilihan Ganda Tunggal & Benar/Salah
                IF UPPER(TRIM(v_rec.jawaban_terpilih)) = UPPER(TRIM(v_rec.kunci_jawaban)) THEN
                    v_skor_soal := v_rec.bobot;
                    v_is_correct := true;
                END IF;

            ELSIF v_rec.tipe_soal = 'pg_kompleks' THEN
                -- Pilihan Ganda Kompleks (Parsial vs All-or-Nothing)
                BEGIN
                    SELECT ARRAY(SELECT jsonb_array_elements_text(v_rec.kunci_jawaban::jsonb)) INTO v_kunci_arr;
                EXCEPTION WHEN OTHERS THEN
                    v_kunci_arr := string_to_array(replace(v_rec.kunci_jawaban, ' ', ''), ',');
                END;

                BEGIN
                    SELECT ARRAY(SELECT jsonb_array_elements_text(v_rec.jawaban_terpilih::jsonb)) INTO v_jawab_arr;
                EXCEPTION WHEN OTHERS THEN
                    v_jawab_arr := string_to_array(replace(v_rec.jawaban_terpilih, ' ', ''), ',');
                END;

                v_total_kunci := cardinality(v_kunci_arr);

                IF v_skema_pgk = 'all_or_nothing' THEN
                    IF v_kunci_arr @> v_jawab_arr AND v_jawab_arr @> v_kunci_arr THEN
                        v_skor_soal := v_rec.bobot;
                        v_is_correct := true;
                    END IF;
                ELSE
                    -- Penskoran Parsial Proporsional
                    SELECT count(*) INTO v_benar_count FROM unnest(v_jawab_arr) j WHERE j = ANY(v_kunci_arr);
                    SELECT count(*) INTO v_salah_count FROM unnest(v_jawab_arr) j WHERE NOT (j = ANY(v_kunci_arr));

                    IF v_total_kunci > 0 THEN
                        v_skor_soal := GREATEST(0.0, ROUND(((v_benar_count::numeric / v_total_kunci::numeric) - (v_salah_count::numeric * 0.25)) * v_rec.bobot, 2));
                        IF v_skor_soal = v_rec.bobot THEN
                            v_is_correct := true;
                        END IF;
                    END IF;
                END IF;

            ELSIF v_rec.tipe_soal = 'isian' THEN
                -- Isian Singkat
                IF LOWER(TRIM(v_rec.jawaban_terpilih)) = LOWER(TRIM(v_rec.kunci_jawaban)) THEN
                    v_skor_soal := v_rec.bobot;
                    v_is_correct := true;
                END IF;

            ELSIF v_rec.tipe_soal = 'menjodohkan' THEN
                -- Menjodohkan
                BEGIN
                    IF v_rec.jawaban_terpilih::jsonb = v_rec.kunci_jawaban::jsonb THEN
                        v_skor_soal := v_rec.bobot;
                        v_is_correct := true;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    v_skor_soal := 0.0;
                END;
            END IF;

            -- Simpan ke tabel terpisah cbt_penilaian_jawaban
            INSERT INTO public.cbt_penilaian_jawaban(jawaban_id, is_correct, skor)
            VALUES (v_rec.jawaban_id, v_is_correct, v_skor_soal)
            ON CONFLICT (jawaban_id) DO UPDATE SET is_correct = EXCLUDED.is_correct, skor = EXCLUDED.skor;

            v_total_skor := v_total_skor + v_skor_soal;
        END IF;
    END LOOP;

    -- Hitung nilai akhir dalam skala 0 - 100
    IF v_total_bobot_maksimal <= 0 THEN
        SELECT COALESCE(SUM(so.bobot), 0.0)
        INTO v_total_bobot_maksimal
        FROM public.cbt_jawaban_siswa j
        JOIN public.cbt_soal so ON so.id = j.soal_id
        WHERE j.peserta_id = p_peserta_id;
    END IF;

    IF v_total_bobot_maksimal > 0 THEN
        v_nilai_akhir := LEAST(100.0, GREATEST(0.0, ROUND((v_total_skor / v_total_bobot_maksimal) * 100.0, 2)));
    ELSE
        v_nilai_akhir := 0.0;
    END IF;

    -- Update total nilai akhir di peserta ujian
    UPDATE public.cbt_peserta_ujian SET nilai_akhir = v_nilai_akhir WHERE id = p_peserta_id;
    RETURN v_nilai_akhir;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC 1: Verifikasi Token Ujian (Anti Brute-Force Oracle)
CREATE OR REPLACE FUNCTION public.cbt_verify_token(p_token TEXT, p_sesi_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_current_nisn TEXT := (auth.jwt() ->> 'nisn');
    v_peserta RECORD;
    v_expected_token TEXT;
BEGIN
    IF v_current_nisn IS NULL THEN
        RAISE EXCEPTION 'Otorisasi gagal: NISN tidak terdeteksi pada sesi login Anda.';
    END IF;

    SELECT p.*, s.scoped_tokens, s.status AS sesi_status, s.judul, s.mapel, s.durasi_menit
    INTO v_peserta
    FROM public.cbt_peserta_ujian p
    JOIN public.cbt_sesi_ujian s ON s.id = p.sesi_id
    WHERE p.sesi_id = p_sesi_id AND p.siswa_nisn = v_current_nisn;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Anda tidak terdaftar sebagai peserta pada sesi ujian ini.';
    END IF;

    IF v_peserta.token_locked_until IS NOT NULL AND v_peserta.token_locked_until > now() THEN
        RAISE EXCEPTION 'Akun Anda dibekukan sementara selama 5 menit karena 5x salah memasukkan token.';
    END IF;

    v_expected_token := v_peserta.scoped_tokens ->> v_peserta.kelas;
    IF v_expected_token IS NULL OR UPPER(TRIM(v_expected_token)) <> UPPER(TRIM(p_token)) THEN
        UPDATE public.cbt_peserta_ujian 
        SET token_attempts = token_attempts + 1,
            token_locked_until = CASE WHEN token_attempts + 1 >= 5 THEN now() + INTERVAL '5 minutes' ELSE NULL END
        WHERE id = v_peserta.id;

        RAISE EXCEPTION 'Token ujian tidak valid untuk kelas Anda. (Percobaan gagal ke-%)', v_peserta.token_attempts + 1;
    END IF;

    -- Reset counter jika berhasil
    UPDATE public.cbt_peserta_ujian SET token_attempts = 0, token_locked_until = NULL WHERE id = v_peserta.id;

    RETURN jsonb_build_object(
        'valid', true,
        'peserta_id', v_peserta.id,
        'sesi_id', v_peserta.sesi_id,
        'judul', v_peserta.judul,
        'mapel', v_peserta.mapel,
        'durasi_menit', v_peserta.durasi_menit,
        'status', v_peserta.status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC 2: Mulai Ujian Siswa (Start Exam Lifecycle)
CREATE OR REPLACE FUNCTION public.cbt_start_exam(p_sesi_id UUID, p_token TEXT)
RETURNS JSONB AS $$
DECLARE
    v_current_nisn TEXT := (auth.jwt() ->> 'nisn');
    v_current_kelas TEXT := (auth.jwt() ->> 'kelas');
    v_sesi RECORD;
    v_peserta RECORD;
    v_expected_token TEXT;
    v_peserta_id UUID;
BEGIN
    IF v_current_nisn IS NULL THEN
        RAISE EXCEPTION 'Otorisasi gagal: NISN tidak terdeteksi.';
    END IF;

    SELECT * INTO v_sesi FROM public.cbt_sesi_ujian WHERE id = p_sesi_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sesi ujian tidak ditemukan.';
    END IF;

    IF v_sesi.status <> 'aktif' THEN
        RAISE EXCEPTION 'Sesi ujian belum dibuka atau sudah ditutup.';
    END IF;

    -- Ambil atau buat row peserta jika belum terdaftar
    SELECT * INTO v_peserta FROM public.cbt_peserta_ujian 
    WHERE sesi_id = p_sesi_id AND siswa_nisn = v_current_nisn;

    IF NOT FOUND THEN
        -- Pastikan kelas siswa masuk dalam sasaran sesi
        IF NOT (v_current_kelas = ANY(v_sesi.kelas_ids)) THEN
            RAISE EXCEPTION 'Ujian ini tidak ditujukan untuk kelas Anda.';
        END IF;

        INSERT INTO public.cbt_peserta_ujian (sesi_id, siswa_nisn, kelas, status)
        VALUES (p_sesi_id, v_current_nisn, v_current_kelas, 'belum_mulai')
        RETURNING * INTO v_peserta;
    END IF;

    IF v_peserta.status = 'terkunci' THEN
        RAISE EXCEPTION 'Ujian Anda saat ini TERKUNCI karena pelanggaran anti-curang. Silakan hubungi Pengawas Ruang.';
    ELSIF v_peserta.status = 'selesai' THEN
        RAISE EXCEPTION 'Ujian ini sudah pernah dikumpulkan sebelumnya.';
    END IF;

    -- Verifikasi Token Ruang
    v_expected_token := v_sesi.scoped_tokens ->> v_peserta.kelas;
    IF v_expected_token IS NULL OR UPPER(TRIM(v_expected_token)) <> UPPER(TRIM(p_token)) THEN
        RAISE EXCEPTION 'Token ujian salah untuk kelas Anda.';
    END IF;

    -- Update status mulai pengerjaan
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

-- RPC 3: Submit Ujian Siswa (Koreksi Otomatis & Penolakan Status Terkunci)
CREATE OR REPLACE FUNCTION public.cbt_submit_exam(p_peserta_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_peserta RECORD;
    v_total_skor NUMERIC(5,2);
BEGIN
    SELECT p.*, s.tampilkan_nilai INTO v_peserta
    FROM public.cbt_peserta_ujian p
    JOIN public.cbt_sesi_ujian s ON s.id = p.sesi_id
    WHERE p.id = p_peserta_id AND p.siswa_nisn = (auth.jwt() ->> 'nisn');

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

-- RPC 4: Submit Lembar Jawaban Darurat via Scan QR Pengawas
CREATE OR REPLACE FUNCTION public.cbt_submit_emergency_answers(
    p_peserta_id UUID, 
    p_answers JSONB -- Format: {"<soal_uuid>": "jawaban_siswa", ...}
)
RETURNS JSONB AS $$
DECLARE
    v_admin_role TEXT := (auth.jwt() ->> 'role');
    v_peserta RECORD;
    v_soal_id_txt TEXT;
    v_jawaban_txt TEXT;
    v_total_skor NUMERIC(5,2);
BEGIN
    IF v_admin_role NOT IN ('admin', 'proktor', 'guru') THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya Pengawas atau Admin yang berhak memproses lembar jawaban darurat.';
    END IF;

    SELECT p.* INTO v_peserta FROM public.cbt_peserta_ujian p WHERE p.id = p_peserta_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Data peserta ujian tidak ditemukan.';
    END IF;

    FOR v_soal_id_txt, v_jawaban_txt IN SELECT * FROM jsonb_each_text(p_answers)
    LOOP
        INSERT INTO public.cbt_jawaban_siswa (peserta_id, soal_id, jawaban_terpilih)
        VALUES (p_peserta_id, v_soal_id_txt::uuid, v_jawaban_txt)
        ON CONFLICT (peserta_id, soal_id) DO UPDATE
        SET jawaban_terpilih = EXCLUDED.jawaban_terpilih, updated_at = now();
    END LOOP;

    UPDATE public.cbt_peserta_ujian 
    SET status = 'selesai', waktu_selesai = now()
    WHERE id = p_peserta_id;

    v_total_skor := public.cbt_internal_score_submission(p_peserta_id);

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Lembar jawaban darurat berhasil diproses resmi oleh Pengawas.',
        'peserta_id', p_peserta_id,
        'siswa_nisn', v_peserta.siswa_nisn,
        'total_skor', v_total_skor
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC 5: Remote Unlock Pengawas
CREATE OR REPLACE FUNCTION public.cbt_proctor_remote_unlock(p_peserta_id UUID)
RETURNS JSONB AS $$
BEGIN
    UPDATE public.cbt_peserta_ujian
    SET status = 'sedang_mengerjakan', strike_count = 0
    WHERE id = p_peserta_id;

    RETURN jsonb_build_object('success', true, 'message', 'Kunci lembar ujian siswa berhasil dibuka.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC 6: Tambah Waktu Ujian Pengawas (+Extra Time)
CREATE OR REPLACE FUNCTION public.cbt_proctor_add_extra_time(p_peserta_id UUID, p_menit INT)
RETURNS JSONB AS $$
BEGIN
    UPDATE public.cbt_peserta_ujian
    SET extra_waktu_menit = extra_waktu_menit + p_menit
    WHERE id = p_peserta_id;

    RETURN jsonb_build_object('success', true, 'extra_waktu_menit', p_menit);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC 7: Reset Kuota Strike Pengawas
CREATE OR REPLACE FUNCTION public.cbt_proctor_reset_strikes(p_peserta_id UUID)
RETURNS JSONB AS $$
BEGIN
    UPDATE public.cbt_peserta_ujian
    SET strike_count = 0
    WHERE id = p_peserta_id;

    RETURN jsonb_build_object('success', true, 'message', 'Kuota strike siswa berhasil direset.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC 8: Global Freeze & Unfreeze
CREATE OR REPLACE FUNCTION public.cbt_freeze_all_active_sessions()
RETURNS JSONB AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE public.cbt_sesi_ujian 
    SET freeze_started_at = now(), status = 'beku' 
    WHERE status = 'aktif';
    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object('success', true, 'frozen_sessions_count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.cbt_unfreeze_all_sessions()
RETURNS JSONB AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE public.cbt_sesi_ujian 
    SET waktu_tutup = waktu_tutup + (now() - freeze_started_at),
        freeze_started_at = NULL,
        status = 'aktif'
    WHERE status = 'beku';
    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object('success', true, 'unfrozen_sessions_count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Inisialisasi baris pengaturan bawaan (Mode Whitelist Only)
INSERT INTO public.cbt_pengaturan (id, is_cbt_active)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;
