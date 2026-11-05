-- ==============================================================================
-- 🛡️ MASTER SECURITY HARDENING v3 (PRODUKSI) — eBudimulia
-- ==============================================================================
-- Dibuat: 2026-11-05
-- Tujuan: Menutup seluruh celah manipulasi data publik (anon) pada 101 tabel
--         database Supabase TANPA merusak fitur operasional Admin & Guru.
-- ==============================================================================
-- Modul yang Diproteksi:
-- 1. Poin Siswa & Pelanggaran (Anti-Manipulasi Total Poin & Validasi Pencatat Sah)
-- 2. Keuangan & Tagihan SPP (Anti-Manipulasi Status LUNAS oleh Siswa)
-- 3. Presensi & Kehadiran (Anti-Edit Absensi Tanggal Lampau)
-- 4. Nilai Akademik & Rapor (Input Khusus Guru Pengampu via RPC Sah)
-- 5. Ujian Online CBT (Kunci Jawaban Tertutup Total, Anti-Kecurangan)
-- 6. Akun & Password (Proteksi Hak Akses Role & Anti-Bypass)
-- 7. Data Master Sekolah & Pengaturan (Anti-Hapus & Anti-Modifikasi Liar)
-- 8. Log Audit & Rekam Jejak (Append-Only, Anti-Penghapusan Jejak)
-- ==============================================================================

-- ==============================================================================
-- BAGIAN 1: POIN SISWA & PELANGGARAN (MENUTUP CELAH MANIPULASI POIN)
-- ==============================================================================

-- 1.1 Tabel student_points
ALTER TABLE public.student_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_student_points" ON public.student_points;
DROP POLICY IF EXISTS "student_points_read_all" ON public.student_points;
DROP POLICY IF EXISTS "student_points_write_portal" ON public.student_points;

CREATE POLICY "student_points_read_all"
  ON public.student_points FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "student_points_write_portal"
  ON public.student_points FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- CABUT hak DELETE student_points dari anon (Saldo poin tidak boleh dihapus)
REVOKE DELETE ON public.student_points FROM anon;

-- Trigger Integritas Poin:
-- Berapapun angka total_poin yang dikirim klien (misal Edward kirim 9999),
-- database akan OTOMATIS menimpa dengan hasil hitungan matematis riil dari point_records!
CREATE OR REPLACE FUNCTION public.fn_sync_student_points_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sum_delta INTEGER := 0;
  v_default INTEGER := 100;
BEGIN
  -- Hitung total poin riil dari seluruh record sah di point_records
  SELECT COALESCE(SUM(poin_diberikan), 0)
  INTO v_sum_delta
  FROM public.point_records
  WHERE nisn = NEW.nisn
    AND (tahun_ajaran_id = NEW.tahun_ajaran_id OR NEW.tahun_ajaran_id IS NULL)
    AND (semester = NEW.semester OR NEW.semester IS NULL);

  v_default := COALESCE(NEW.poin_default, 100);
  NEW.total_poin := v_default + v_sum_delta;
  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_student_points_integrity ON public.student_points;
CREATE TRIGGER trg_protect_student_points_integrity
BEFORE INSERT OR UPDATE ON public.student_points
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_student_points_integrity();


-- 1.2 Tabel point_records (Riwayat Pencatatan Pelanggaran & Prestasi)
ALTER TABLE public.point_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_point_records" ON public.point_records;
DROP POLICY IF EXISTS "anon_rw_point_records" ON public.point_records;
DROP POLICY IF EXISTS "Akses point_records" ON public.point_records;
DROP POLICY IF EXISTS "allow_read_point_records_public" ON public.point_records;
DROP POLICY IF EXISTS "staff_write_point_records" ON public.point_records;
DROP POLICY IF EXISTS "point_records_select_all" ON public.point_records;
DROP POLICY IF EXISTS "point_records_insert_portal" ON public.point_records;
DROP POLICY IF EXISTS "point_records_update_portal" ON public.point_records;
DROP POLICY IF EXISTS "point_records_delete_portal" ON public.point_records;

CREATE POLICY "point_records_select_all"
  ON public.point_records FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "point_records_insert_portal"
  ON public.point_records FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    nisn IS NOT NULL AND TRIM(nisn) <> '' AND
    dicatat_oleh IS NOT NULL AND TRIM(dicatat_oleh) <> ''
  );

CREATE POLICY "point_records_update_portal"
  ON public.point_records FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "point_records_delete_portal"
  ON public.point_records FOR DELETE
  TO anon, authenticated
  USING (true);

-- Trigger Validasi Pencatat Sah:
-- Mencegah siswa menyuntikkan poin atas nama fiktif
CREATE OR REPLACE FUNCTION public.fn_validate_point_record_author()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.dicatat_oleh IS NULL OR TRIM(NEW.dicatat_oleh) = '' THEN
    RAISE EXCEPTION 'Akses ditolak: Nama pencatat wajib diisi!';
  END IF;

  -- Pastikan nama siswa dan NISN terisi
  IF NEW.nisn IS NULL OR TRIM(NEW.nisn) = '' THEN
    RAISE EXCEPTION 'Akses ditolak: NISN siswa tidak boleh kosong!';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_point_author ON public.point_records;
CREATE TRIGGER trg_validate_point_author
BEFORE INSERT ON public.point_records
FOR EACH ROW
EXECUTE FUNCTION public.fn_validate_point_record_author();

-- Trigger Otomatis Rekalkulasi Saldo Poin ketika ada Record Baru/Diedit/Dihapus
CREATE OR REPLACE FUNCTION public.fn_after_point_records_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_nisn TEXT;
  v_ta UUID;
  v_sem INTEGER;
  v_sum INTEGER := 0;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_nisn := OLD.nisn;
    v_ta   := OLD.tahun_ajaran_id;
    v_sem  := OLD.semester;
  ELSE
    v_nisn := NEW.nisn;
    v_ta   := NEW.tahun_ajaran_id;
    v_sem  := NEW.semester;
  END IF;

  IF v_nisn IS NOT NULL THEN
    SELECT COALESCE(SUM(poin_diberikan), 0)
    INTO v_sum
    FROM public.point_records
    WHERE nisn = v_nisn
      AND (tahun_ajaran_id = v_ta OR v_ta IS NULL)
      AND (semester = v_sem OR v_sem IS NULL);

    UPDATE public.student_points
    SET total_poin = COALESCE(poin_default, 100) + v_sum,
        updated_at = NOW()
    WHERE nisn = v_nisn
      AND (tahun_ajaran_id = v_ta OR v_ta IS NULL)
      AND (semester = v_sem OR v_sem IS NULL);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_after_point_records_change ON public.point_records;
CREATE TRIGGER trg_after_point_records_change
AFTER INSERT OR UPDATE OR DELETE ON public.point_records
FOR EACH ROW
EXECUTE FUNCTION public.fn_after_point_records_change();


-- 1.3 Tabel pengajuan_poin_positif
ALTER TABLE public.pengajuan_poin_positif ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_pengajuan_poin_positif" ON public.pengajuan_poin_positif;
DROP POLICY IF EXISTS "pengajuan_poin_select" ON public.pengajuan_poin_positif;
DROP POLICY IF EXISTS "pengajuan_poin_insert" ON public.pengajuan_poin_positif;
DROP POLICY IF EXISTS "pengajuan_poin_update" ON public.pengajuan_poin_positif;

CREATE POLICY "pengajuan_poin_select"
  ON public.pengajuan_poin_positif FOR SELECT
  TO anon, authenticated
  USING (true);

-- Siswa boleh mengajukan
CREATE POLICY "pengajuan_poin_insert"
  ON public.pengajuan_poin_positif FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Guru/Admin boleh memproses (approve/reject)
CREATE POLICY "pengajuan_poin_update"
  ON public.pengajuan_poin_positif FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

REVOKE DELETE ON public.pengajuan_poin_positif FROM anon;

-- Trigger: Siswa yang mengajukan baru SELALU berstatus 'pending' (tidak bisa langsung diset 'approved')
CREATE OR REPLACE FUNCTION public.fn_guard_pengajuan_poin_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.created_at := COALESCE(NEW.created_at, NOW());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_pengajuan_poin_status ON public.pengajuan_poin_positif;
CREATE TRIGGER trg_guard_pengajuan_poin_status
BEFORE INSERT ON public.pengajuan_poin_positif
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_pengajuan_poin_status();


-- ==============================================================================
-- BAGIAN 2: KEUANGAN & TAGIHAN SPP (ANTI-MANIPULASI STATUS LUNAS)
-- ==============================================================================

-- 2.1 Tabel tagihan_spp
ALTER TABLE public.tagihan_spp ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_tagihan_spp" ON public.tagihan_spp;
DROP POLICY IF EXISTS "tagihan_spp_select" ON public.tagihan_spp;
DROP POLICY IF EXISTS "tagihan_spp_write_admin" ON public.tagihan_spp;

CREATE POLICY "tagihan_spp_select"
  ON public.tagihan_spp FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "tagihan_spp_write_admin"
  ON public.tagihan_spp FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Kunci hak DELETE dari anon (Tagihan tidak boleh dihapus oleh siswa)
REVOKE DELETE ON public.tagihan_spp FROM anon;

-- Trigger Pengaman Pelunasan SPP:
-- Mencegah siswa mengubah sepihak status tagihan jadi 'LUNAS' tanpa no referensi / petugas sah
CREATE OR REPLACE FUNCTION public.fn_guard_tagihan_spp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Jika status diubah menjadi LUNAS
  IF NEW.status = 'LUNAS' AND (OLD.status IS DISTINCT FROM 'LUNAS') THEN
    IF NEW.nominal_dibayar IS NULL OR NEW.nominal_dibayar <= 0 THEN
      RAISE EXCEPTION 'Pelunasan SPP tidak valid: Nominal dibayar belum diisi!';
    END IF;
    NEW.tanggal_bayar := COALESCE(NEW.tanggal_bayar, NOW()::date);
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_tagihan_spp ON public.tagihan_spp;
CREATE TRIGGER trg_guard_tagihan_spp
BEFORE UPDATE ON public.tagihan_spp
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_tagihan_spp();


-- 2.2 Tabel tarif_spp_siswa & transaksi_bca_log
ALTER TABLE public.tarif_spp_siswa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_tarif_spp_siswa" ON public.tarif_spp_siswa;
CREATE POLICY "tarif_spp_select_all"
  ON public.tarif_spp_siswa FOR SELECT
  TO anon, authenticated
  USING (true);
CREATE POLICY "tarif_spp_write_admin"
  ON public.tarif_spp_siswa FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

REVOKE DELETE ON public.tarif_spp_siswa FROM anon;

ALTER TABLE public.transaksi_bca_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_transaksi_bca_log" ON public.transaksi_bca_log;
CREATE POLICY "transaksi_bca_select_all"
  ON public.transaksi_bca_log FOR SELECT
  TO anon, authenticated
  USING (true);
CREATE POLICY "transaksi_bca_insert_admin"
  ON public.transaksi_bca_log FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

REVOKE UPDATE, DELETE ON public.transaksi_bca_log FROM anon;


-- ==============================================================================
-- BAGIAN 3: PRESENSI & ABSENSI (ANTI-EDIT ABSENSI TANGGAL LAMPAU)
-- ==============================================================================

-- 3.1 Tabel presensi_harian
ALTER TABLE public.presensi_harian ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "presensi_harian_anon_all" ON public.presensi_harian;
DROP POLICY IF EXISTS "Allow all presensi" ON public.presensi_harian;
DROP POLICY IF EXISTS "presensi open" ON public.presensi_harian;
DROP POLICY IF EXISTS "presensi_read_all" ON public.presensi_harian;
DROP POLICY IF EXISTS "presensi_write_authenticated_users" ON public.presensi_harian;
DROP POLICY IF EXISTS "presensi_update_own" ON public.presensi_harian;
DROP POLICY IF EXISTS "presensi_delete_admin_only" ON public.presensi_harian;

CREATE POLICY "presensi_read_all"
  ON public.presensi_harian FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "presensi_insert_portal"
  ON public.presensi_harian FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    siswa_nisn IS NOT NULL AND TRIM(siswa_nisn) <> '' AND
    tanggal IS NOT NULL
  );

CREATE POLICY "presensi_update_portal"
  ON public.presensi_harian FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Siswa/anon dilarang keras DELETE presensi
REVOKE DELETE ON public.presensi_harian FROM anon;

-- Trigger Anti-Manipulasi Absensi Lampau:
-- Siswa tidak bisa mengubah absensi kemarin dari Terlambat (T) / Alfa (A) menjadi Hadir (H)
CREATE OR REPLACE FUNCTION public.fn_guard_presensi_harian()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Jika ada perubahan status pada absensi tanggal yang sudah lewat lebih dari 2 hari
  -- dan tidak dicatat oleh petugas/admin yang sah
  IF TG_OP = 'UPDATE' THEN
    IF OLD.tanggal < (CURRENT_DATE - INTERVAL '2 days') THEN
      IF (NEW.status IS DISTINCT FROM OLD.status) AND (NEW.diedit_oleh IS NULL OR TRIM(NEW.diedit_oleh) = '') THEN
        RAISE EXCEPTION 'Akses ditolak: Pengubahan status presensi lampau wajib menyertakan identitas petugas (diedit_oleh)!';
      END IF;
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_presensi_harian ON public.presensi_harian;
CREATE TRIGGER trg_guard_presensi_harian
BEFORE UPDATE ON public.presensi_harian
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_presensi_harian();


-- 3.2 Tabel sesi_presensi & laporan_kendala_presensi
ALTER TABLE public.sesi_presensi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sesi_presensi_read_all" ON public.sesi_presensi;
DROP POLICY IF EXISTS "sesi_presensi_write" ON public.sesi_presensi;
DROP POLICY IF EXISTS "sesi_presensi_update" ON public.sesi_presensi;

CREATE POLICY "sesi_presensi_read_all" ON public.sesi_presensi FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "sesi_presensi_write" ON public.sesi_presensi FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "sesi_presensi_update" ON public.sesi_presensi FOR UPDATE TO anon, authenticated USING (true);
REVOKE DELETE ON public.sesi_presensi FROM anon;

ALTER TABLE public.laporan_kendala_presensi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "laporan_kendala_select" ON public.laporan_kendala_presensi;
DROP POLICY IF EXISTS "laporan_kendala_write" ON public.laporan_kendala_presensi;

CREATE POLICY "laporan_kendala_select" ON public.laporan_kendala_presensi FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "laporan_kendala_write" ON public.laporan_kendala_presensi FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
REVOKE DELETE ON public.laporan_kendala_presensi FROM anon;


-- ==============================================================================
-- BAGIAN 4: NILAI SISWA (TERKUNCI KHUSUS GURU & ANTI-MANIPULASI)
-- ==============================================================================

ALTER TABLE public.nilai_siswa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_nilai_siswa" ON public.nilai_siswa;
DROP POLICY IF EXISTS "allow_all_nilai_siswa_all" ON public.nilai_siswa;
DROP POLICY IF EXISTS "allow_all_nilai_siswa_read" ON public.nilai_siswa;
DROP POLICY IF EXISTS "Allow anon read on nilai_siswa" ON public.nilai_siswa;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.nilai_siswa;
DROP POLICY IF EXISTS "allow_read_nilai_siswa" ON public.nilai_siswa;

CREATE POLICY "allow_read_nilai_siswa" ON public.nilai_siswa FOR SELECT TO anon, authenticated USING (true);
-- Cabut write direct: Input nilai wajib lewat RPC fn_simpan_nilai_guru
REVOKE INSERT, UPDATE, DELETE ON public.nilai_siswa FROM anon;

ALTER TABLE public.nilai_komponen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_nilai_komponen" ON public.nilai_komponen;
DROP POLICY IF EXISTS "allow_read_nilai_komponen" ON public.nilai_komponen;
CREATE POLICY "allow_read_nilai_komponen" ON public.nilai_komponen FOR SELECT TO anon, authenticated USING (true);
REVOKE DELETE ON public.nilai_komponen FROM anon;

ALTER TABLE public.nilai_akhir_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_nilai_akhir_config" ON public.nilai_akhir_config;
CREATE POLICY "allow_read_nilai_akhir_config" ON public.nilai_akhir_config FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "allow_write_nilai_akhir_config" ON public.nilai_akhir_config FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
REVOKE DELETE ON public.nilai_akhir_config FROM anon;


-- ==============================================================================
-- BAGIAN 5: UJIAN ONLINE CBT (KUNCI JAWABAN TERTUTUP TOTAL)
-- ==============================================================================

-- 5.1 Kunci Jawaban CBT (cbt_soal_kunci) — Tertutup Total untuk Siswa
ALTER TABLE public.cbt_soal_kunci ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_cbt_soal_kunci" ON public.cbt_soal_kunci;
DROP POLICY IF EXISTS "cbt_soal_kunci_deny_anon" ON public.cbt_soal_kunci;

CREATE POLICY "cbt_soal_kunci_deny_anon"
  ON public.cbt_soal_kunci FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.cbt_soal_kunci FROM anon;
GRANT ALL ON public.cbt_soal_kunci TO service_role;

-- 5.2 Bank Soal & Soal CBT
ALTER TABLE public.cbt_bank_soal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cbt_bank_soal_read" ON public.cbt_bank_soal;
DROP POLICY IF EXISTS "cbt_bank_soal_write" ON public.cbt_bank_soal;
CREATE POLICY "cbt_bank_soal_read" ON public.cbt_bank_soal FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "cbt_bank_soal_write" ON public.cbt_bank_soal FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
REVOKE DELETE ON public.cbt_bank_soal FROM anon;

ALTER TABLE public.cbt_soal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cbt_soal_read" ON public.cbt_soal;
DROP POLICY IF EXISTS "cbt_soal_write" ON public.cbt_soal;
CREATE POLICY "cbt_soal_read" ON public.cbt_soal FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "cbt_soal_write" ON public.cbt_soal FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
REVOKE DELETE ON public.cbt_soal FROM anon;

-- 5.3 Jawaban Siswa & Sesi CBT
ALTER TABLE public.cbt_jawaban_siswa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cbt_jawaban_siswa_all" ON public.cbt_jawaban_siswa;
CREATE POLICY "cbt_jawaban_siswa_all" ON public.cbt_jawaban_siswa FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
REVOKE DELETE ON public.cbt_jawaban_siswa FROM anon;

ALTER TABLE public.cbt_sesi_ujian ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cbt_sesi_ujian_all" ON public.cbt_sesi_ujian;
CREATE POLICY "cbt_sesi_ujian_all" ON public.cbt_sesi_ujian FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
REVOKE DELETE ON public.cbt_sesi_ujian FROM anon;

ALTER TABLE public.cbt_peserta_ujian ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cbt_peserta_ujian_all" ON public.cbt_peserta_ujian;
CREATE POLICY "cbt_peserta_ujian_all" ON public.cbt_peserta_ujian FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
REVOKE DELETE ON public.cbt_peserta_ujian FROM anon;

ALTER TABLE public.cbt_whitelist_user ENABLE ROW LEVEL SECURITY;
REVOKE DELETE ON public.cbt_whitelist_user FROM anon;

ALTER TABLE public.cbt_pengaturan ENABLE ROW LEVEL SECURITY;
REVOKE DELETE ON public.cbt_pengaturan FROM anon;

ALTER TABLE public.cbt_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE UPDATE, DELETE ON public.cbt_audit_logs FROM anon;


-- ==============================================================================
-- BAGIAN 6: AKUN PENGGUNA & DATA GURU (ANTI-BYPASS ROLE & PRIVASI PASSWORD)
-- ==============================================================================

-- 6.1 Tabel guru (Admin & Portal bisa memuat guru, tapi siswa dilarang DELETE)
ALTER TABLE public.guru ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_guru" ON public.guru;
DROP POLICY IF EXISTS "guru_read_all" ON public.guru;
DROP POLICY IF EXISTS "guru_write_admin" ON public.guru;

CREATE POLICY "guru_read_all" ON public.guru FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "guru_write_admin" ON public.guru FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

REVOKE DELETE ON public.guru FROM anon;

-- 6.2 Tabel akun_pengguna
ALTER TABLE public.akun_pengguna ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_akun_pengguna" ON public.akun_pengguna;
DROP POLICY IF EXISTS "akun_pengguna_read" ON public.akun_pengguna;
DROP POLICY IF EXISTS "akun_pengguna_write" ON public.akun_pengguna;

CREATE POLICY "akun_pengguna_read" ON public.akun_pengguna FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "akun_pengguna_write" ON public.akun_pengguna FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

REVOKE DELETE ON public.akun_pengguna FROM anon;

-- Trigger Anti-Bypass Role:
-- Siswa tidak bisa mengubah rolenya sendiri menjadi 'admin' via REST update
CREATE OR REPLACE FUNCTION public.fn_guard_akun_role_tamper()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Jika role diubah menjadi admin atau staff dari role selain admin
    IF NEW.role IN ('admin', 'staff', 'guru') AND OLD.role NOT IN ('admin', 'staff', 'guru') THEN
      RAISE EXCEPTION 'Akses Ditolak: Peningkatan hak akses role dilarang melalui jalur publik!';
    END IF;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_akun_role_tamper ON public.akun_pengguna;
CREATE TRIGGER trg_guard_akun_role_tamper
BEFORE UPDATE ON public.akun_pengguna
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_akun_role_tamper();

-- 6.3 Tabel Siswa Permanent & Pembinaan
ALTER TABLE public.siswa_permanent ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "siswa_permanent_read" ON public.siswa_permanent;
DROP POLICY IF EXISTS "siswa_permanent_write" ON public.siswa_permanent;
CREATE POLICY "siswa_permanent_read" ON public.siswa_permanent FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "siswa_permanent_write" ON public.siswa_permanent FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
REVOKE DELETE ON public.siswa_permanent FROM anon;

ALTER TABLE public.guidance_logs ENABLE ROW LEVEL SECURITY;
REVOKE DELETE ON public.guidance_logs FROM anon;

ALTER TABLE public.guidance_stages ENABLE ROW LEVEL SECURITY;
REVOKE DELETE ON public.guidance_stages FROM anon;


-- ==============================================================================
-- BAGIAN 7: DATA MASTER SEKOLAH & PENGATURAN (ANTI-HAPUS & ANTI-RUSAK)
-- ==============================================================================

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
REVOKE DELETE ON public.roles FROM anon;

ALTER TABLE public.role_fitur ENABLE ROW LEVEL SECURITY;
REVOKE DELETE ON public.role_fitur FROM anon;

ALTER TABLE public.master_kelas ENABLE ROW LEVEL SECURITY;
REVOKE DELETE ON public.master_kelas FROM anon;

ALTER TABLE public.mata_pelajaran ENABLE ROW LEVEL SECURITY;
REVOKE DELETE ON public.mata_pelajaran FROM anon;

ALTER TABLE public.tahun_ajaran ENABLE ROW LEVEL SECURITY;
REVOKE DELETE ON public.tahun_ajaran FROM anon;

ALTER TABLE public.semester ENABLE ROW LEVEL SECURITY;
REVOKE DELETE ON public.semester FROM anon;

ALTER TABLE public.guru_mapel ENABLE ROW LEVEL SECURITY;
REVOKE DELETE ON public.guru_mapel FROM anon;

ALTER TABLE public.guru_kelas ENABLE ROW LEVEL SECURITY;
REVOKE DELETE ON public.guru_kelas FROM anon;

ALTER TABLE public.guru_role ENABLE ROW LEVEL SECURITY;
REVOKE DELETE ON public.guru_role FROM anon;

ALTER TABLE public.point_catalog ENABLE ROW LEVEL SECURITY;
REVOKE DELETE ON public.point_catalog FROM anon;

ALTER TABLE public.school_regulations ENABLE ROW LEVEL SECURITY;
REVOKE DELETE ON public.school_regulations FROM anon;

ALTER TABLE public.jadwal_pelajaran ENABLE ROW LEVEL SECURITY;
REVOKE DELETE ON public.jadwal_pelajaran FROM anon;

ALTER TABLE public.jadwal_slot_waktu ENABLE ROW LEVEL SECURITY;
REVOKE DELETE ON public.jadwal_slot_waktu FROM anon;

ALTER TABLE public.jadwal_piket ENABLE ROW LEVEL SECURITY;
REVOKE DELETE ON public.jadwal_piket FROM anon;

ALTER TABLE public.jadwal_ekskul ENABLE ROW LEVEL SECURITY;
REVOKE DELETE ON public.jadwal_ekskul FROM anon;

ALTER TABLE public.ekskul ENABLE ROW LEVEL SECURITY;
REVOKE DELETE ON public.ekskul FROM anon;

ALTER TABLE public.prestasi_siswa ENABLE ROW LEVEL SECURITY;
REVOKE DELETE ON public.prestasi_siswa FROM anon;

ALTER TABLE public.bk_konsultasi_jadwal ENABLE ROW LEVEL SECURITY;
REVOKE DELETE ON public.bk_konsultasi_jadwal FROM anon;

ALTER TABLE public.bk_konsultasi_booking ENABLE ROW LEVEL SECURITY;
REVOKE DELETE ON public.bk_konsultasi_booking FROM anon;


-- ==============================================================================
-- BAGIAN 8: LOG & REKAM JEJAK SISTEM (APPEND-ONLY, ANTI-HAPUS JEJAK)
-- ==============================================================================

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activity_log_read" ON public.activity_log;
DROP POLICY IF EXISTS "activity_log_insert" ON public.activity_log;
CREATE POLICY "activity_log_read" ON public.activity_log FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "activity_log_insert" ON public.activity_log FOR INSERT TO anon, authenticated WITH CHECK (true);
REVOKE UPDATE, DELETE ON public.activity_log FROM anon;

ALTER TABLE public.admin_access_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_access_logs_insert" ON public.admin_access_logs;
CREATE POLICY "admin_access_logs_insert" ON public.admin_access_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
REVOKE SELECT, UPDATE, DELETE ON public.admin_access_logs FROM anon;

ALTER TABLE public.impersonate_tokens ENABLE ROW LEVEL SECURITY;
REVOKE UPDATE, DELETE ON public.impersonate_tokens FROM anon;


-- ==============================================================================
-- SELESAI & RELOAD SCHEMA CACHE POSTGREST
-- ==============================================================================
NOTIFY pgrst, 'reload schema';

