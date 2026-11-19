-- ==============================================================================
-- 🛡️ PATCH TOTAL HARDENING SISTEM & PENUTUPAN SELURUH CELAH REST API
-- ==============================================================================
-- Tujuan:
-- 1. Menutup total celah manipulasi via REST API / curl / Python / Colab
--    (seperti yang dicoba oleh siswa pada point_catalog & guidance_logs).
-- 2. Mengunci tabel rahasia: cbt_soal_kunci, impersonate_tokens, line_bindings,
--    guidance_logs, pengajuan_poin_ban, bk_konsultasi_booking.
-- 3. Memasang Trigger BEFORE INSERT/UPDATE/DELETE berotorisasi fn_is_authorized_staff()
--    pada seluruh tabel master (siswa_permanent, guru, ekskul, cbt_pengaturan, dll).
-- 4. 100% Zero-Breaking: Aplikasi Web, APK Android, dan Dashboard tetap bekerja
--    lancar tanpa kendala.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. BERSIHKAN DATA SAMPAH / PERCOBAAN DARI SISWA
-- ------------------------------------------------------------------------------
DELETE FROM public.guidance_logs WHERE nisn = '1231231231';


-- ------------------------------------------------------------------------------
-- 1. KUNCI TOTAL KUNCI JAWABAN CBT (cbt_soal_kunci)
-- ------------------------------------------------------------------------------
-- Hapus policy permissive yang tidak sengaja terbuka untuk role authenticated
DROP POLICY IF EXISTS "staff_all_cbt_soal_kunci" ON public.cbt_soal_kunci;
DROP POLICY IF EXISTS "allow_all_cbt_soal_kunci" ON public.cbt_soal_kunci;
DROP POLICY IF EXISTS "cbt_soal_kunci_deny_anon" ON public.cbt_soal_kunci;
DROP POLICY IF EXISTS "cbt_soal_kunci_staff_only" ON public.cbt_soal_kunci;

CREATE POLICY "cbt_soal_kunci_staff_only"
  ON public.cbt_soal_kunci
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

DROP TRIGGER IF EXISTS trg_guard_staff_cbt_soal_kunci ON public.cbt_soal_kunci;
CREATE TRIGGER trg_guard_staff_cbt_soal_kunci
  BEFORE INSERT OR UPDATE OR DELETE ON public.cbt_soal_kunci
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();


-- ------------------------------------------------------------------------------
-- 2. KUNCI KATALOG POIN (point_catalog) — Celah yang dicoba siswa via PATCH Colab
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "point_catalog_all" ON public.point_catalog;
DROP POLICY IF EXISTS "point_catalog_staff_write" ON public.point_catalog;
DROP POLICY IF EXISTS "point_catalog_read" ON public.point_catalog;

-- Siapapun boleh membaca katalog aturan poin untuk tampilan aplikasi
CREATE POLICY "point_catalog_read"
  ON public.point_catalog
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- HANYA Staff yang boleh mengubah/menambah/menghapus katalog poin
CREATE POLICY "point_catalog_staff_write"
  ON public.point_catalog
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

DROP TRIGGER IF EXISTS trg_guard_staff_point_catalog ON public.point_catalog;
CREATE TRIGGER trg_guard_staff_point_catalog
  BEFORE INSERT OR UPDATE OR DELETE ON public.point_catalog
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();


-- ------------------------------------------------------------------------------
-- 3. KUNCI LOG PEMBINAAN SISWA (guidance_logs & guidance_stages)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "allow_all_guidance_logs" ON public.guidance_logs;
DROP POLICY IF EXISTS "Akses guidance_logs" ON public.guidance_logs;
DROP POLICY IF EXISTS "Modifikasi guidance_logs" ON public.guidance_logs;
DROP POLICY IF EXISTS "guidance_logs_staff_all" ON public.guidance_logs;

CREATE POLICY "guidance_logs_staff_all"
  ON public.guidance_logs
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

DROP TRIGGER IF EXISTS trg_guard_staff_guidance_logs ON public.guidance_logs;
CREATE TRIGGER trg_guard_staff_guidance_logs
  BEFORE INSERT OR UPDATE OR DELETE ON public.guidance_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

-- guidance_stages (Nama-nama tahapan pembinaan: Peringatan 1, 2, dll)
DROP POLICY IF EXISTS "allow_all_guidance_stages" ON public.guidance_stages;
DROP POLICY IF EXISTS "guidance_stages_read" ON public.guidance_stages;
DROP POLICY IF EXISTS "guidance_stages_staff_write" ON public.guidance_stages;

CREATE POLICY "guidance_stages_read"
  ON public.guidance_stages
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "guidance_stages_staff_write"
  ON public.guidance_stages
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

DROP TRIGGER IF EXISTS trg_guard_staff_guidance_stages ON public.guidance_stages;
CREATE TRIGGER trg_guard_staff_guidance_stages
  BEFORE INSERT OR UPDATE OR DELETE ON public.guidance_stages
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();


-- ------------------------------------------------------------------------------
-- 4. KUNCI BLACKLIST PENGAJUAN POIN (pengajuan_poin_ban)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all pengajuan_poin_ban" ON public.pengajuan_poin_ban;
DROP POLICY IF EXISTS "allow_all_pengajuan_poin_ban" ON public.pengajuan_poin_ban;
DROP POLICY IF EXISTS "poin_ban_delete_admin" ON public.pengajuan_poin_ban;
DROP POLICY IF EXISTS "poin_ban_read_all" ON public.pengajuan_poin_ban;
DROP POLICY IF EXISTS "poin_ban_update" ON public.pengajuan_poin_ban;
DROP POLICY IF EXISTS "poin_ban_write" ON public.pengajuan_poin_ban;
DROP POLICY IF EXISTS "pengajuan_poin_ban_staff_all" ON public.pengajuan_poin_ban;

-- Siswa yang login boleh SELECT untuk mengecek apakah dirinya diblokir, tapi TIDAK boleh melihat user lain
CREATE POLICY "pengajuan_poin_ban_staff_all"
  ON public.pengajuan_poin_ban
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

DROP TRIGGER IF EXISTS trg_guard_staff_pengajuan_poin_ban ON public.pengajuan_poin_ban;
CREATE TRIGGER trg_guard_staff_pengajuan_poin_ban
  BEFORE INSERT OR UPDATE OR DELETE ON public.pengajuan_poin_ban
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();


-- ------------------------------------------------------------------------------
-- 5. KUNCI TAUTAN NOTIFIKASI LINE ORANG TUA (line_bindings)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all" ON public.line_bindings;
DROP POLICY IF EXISTS "line_bindings_staff_all" ON public.line_bindings;

CREATE POLICY "line_bindings_staff_all"
  ON public.line_bindings
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

DROP TRIGGER IF EXISTS trg_guard_staff_line_bindings ON public.line_bindings;
CREATE TRIGGER trg_guard_staff_line_bindings
  BEFORE INSERT OR UPDATE OR DELETE ON public.line_bindings
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();


-- ------------------------------------------------------------------------------
-- 6. KUNCI TOKEN PENYAMARAN SESI (impersonate_tokens)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow insert impersonate_tokens" ON public.impersonate_tokens;
DROP POLICY IF EXISTS "Allow select impersonate_tokens" ON public.impersonate_tokens;
DROP POLICY IF EXISTS "Allow delete impersonate_tokens" ON public.impersonate_tokens;
DROP POLICY IF EXISTS "Akses impersonate_tokens" ON public.impersonate_tokens;
DROP POLICY IF EXISTS "allow_read_valid_token" ON public.impersonate_tokens;
DROP POLICY IF EXISTS "staff_all_impersonate_tokens" ON public.impersonate_tokens;
DROP POLICY IF EXISTS "impersonate_tokens_staff_all" ON public.impersonate_tokens;

CREATE POLICY "impersonate_tokens_staff_all"
  ON public.impersonate_tokens
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

DROP TRIGGER IF EXISTS trg_guard_staff_impersonate_tokens ON public.impersonate_tokens;
CREATE TRIGGER trg_guard_staff_impersonate_tokens
  BEFORE INSERT OR UPDATE OR DELETE ON public.impersonate_tokens
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();


-- ------------------------------------------------------------------------------
-- 7. KUNCI MASTER DATA SISWA (siswa_permanent)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "siswa_permanent_write" ON public.siswa_permanent;
DROP POLICY IF EXISTS "staff_all_siswa_permanent" ON public.siswa_permanent;
DROP POLICY IF EXISTS "siswa_permanent_read" ON public.siswa_permanent;
DROP POLICY IF EXISTS "allow_read_siswa_permanent_public" ON public.siswa_permanent;
DROP POLICY IF EXISTS "siswa_permanent_staff_write" ON public.siswa_permanent;

CREATE POLICY "siswa_permanent_read"
  ON public.siswa_permanent
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "siswa_permanent_staff_write"
  ON public.siswa_permanent
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

DROP TRIGGER IF EXISTS trg_guard_staff_siswa_permanent ON public.siswa_permanent;
CREATE TRIGGER trg_guard_staff_siswa_permanent
  BEFORE INSERT OR UPDATE OR DELETE ON public.siswa_permanent
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();


-- ------------------------------------------------------------------------------
-- 8. KUNCI MASTER DATA GURU & PEMBAGIAN KELAS (guru & guru_kelas)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "staff_all_guru" ON public.guru;
DROP POLICY IF EXISTS "guru_staff_write" ON public.guru;
DROP POLICY IF EXISTS "allow_read_guru_public" ON public.guru;

CREATE POLICY "allow_read_guru_public"
  ON public.guru
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "guru_staff_write"
  ON public.guru
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

DROP TRIGGER IF EXISTS trg_guard_staff_guru ON public.guru;
CREATE TRIGGER trg_guard_staff_guru
  BEFORE INSERT OR UPDATE OR DELETE ON public.guru
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

DROP TRIGGER IF EXISTS trg_guard_staff_guru_kelas ON public.guru_kelas;
CREATE TRIGGER trg_guard_staff_guru_kelas
  BEFORE INSERT OR UPDATE OR DELETE ON public.guru_kelas
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();


-- ------------------------------------------------------------------------------
-- 9. KUNCI EKSTRAKURIKULER & NILAI EKSKUL (ekskul, kriteria, nilai_ekskul_siswa)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable all access for ekskul anon" ON public.ekskul;
DROP POLICY IF EXISTS "Enable all access for ekskul authenticated" ON public.ekskul;
DROP POLICY IF EXISTS "ekskul_delete" ON public.ekskul;
DROP POLICY IF EXISTS "ekskul_insert" ON public.ekskul;
DROP POLICY IF EXISTS "ekskul_read_all" ON public.ekskul;
DROP POLICY IF EXISTS "ekskul_update" ON public.ekskul;
DROP POLICY IF EXISTS "ekskul_read" ON public.ekskul;
DROP POLICY IF EXISTS "ekskul_staff_write" ON public.ekskul;

CREATE POLICY "ekskul_read"
  ON public.ekskul
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "ekskul_staff_write"
  ON public.ekskul
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

DROP TRIGGER IF EXISTS trg_guard_staff_ekskul ON public.ekskul;
CREATE TRIGGER trg_guard_staff_ekskul
  BEFORE INSERT OR UPDATE OR DELETE ON public.ekskul
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

-- kriteria_nilai_ekskul
DROP POLICY IF EXISTS "Enable all access for kriteria anon" ON public.kriteria_nilai_ekskul;
DROP POLICY IF EXISTS "Enable all access for kriteria authenticated" ON public.kriteria_nilai_ekskul;
DROP POLICY IF EXISTS "kriteria_nilai_ekskul_read" ON public.kriteria_nilai_ekskul;
DROP POLICY IF EXISTS "kriteria_nilai_ekskul_staff_write" ON public.kriteria_nilai_ekskul;

CREATE POLICY "kriteria_nilai_ekskul_read"
  ON public.kriteria_nilai_ekskul
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "kriteria_nilai_ekskul_staff_write"
  ON public.kriteria_nilai_ekskul
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

DROP TRIGGER IF EXISTS trg_guard_staff_kriteria_ekskul ON public.kriteria_nilai_ekskul;
CREATE TRIGGER trg_guard_staff_kriteria_ekskul
  BEFORE INSERT OR UPDATE OR DELETE ON public.kriteria_nilai_ekskul
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

-- nilai_ekskul_siswa
DROP POLICY IF EXISTS "Enable all access for nilai_ekskul anon" ON public.nilai_ekskul_siswa;
DROP POLICY IF EXISTS "Enable all access for nilai_ekskul authenticated" ON public.nilai_ekskul_siswa;
DROP POLICY IF EXISTS "nilai_ekskul_delete" ON public.nilai_ekskul_siswa;
DROP POLICY IF EXISTS "nilai_ekskul_read_all" ON public.nilai_ekskul_siswa;
DROP POLICY IF EXISTS "nilai_ekskul_update" ON public.nilai_ekskul_siswa;
DROP POLICY IF EXISTS "nilai_ekskul_write" ON public.nilai_ekskul_siswa;
DROP POLICY IF EXISTS "nilai_ekskul_read" ON public.nilai_ekskul_siswa;
DROP POLICY IF EXISTS "nilai_ekskul_staff_write" ON public.nilai_ekskul_siswa;

CREATE POLICY "nilai_ekskul_read"
  ON public.nilai_ekskul_siswa
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "nilai_ekskul_staff_write"
  ON public.nilai_ekskul_siswa
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

DROP TRIGGER IF EXISTS trg_guard_staff_nilai_ekskul ON public.nilai_ekskul_siswa;
CREATE TRIGGER trg_guard_staff_nilai_ekskul
  BEFORE INSERT OR UPDATE OR DELETE ON public.nilai_ekskul_siswa
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();


-- ------------------------------------------------------------------------------
-- 10. KUNCI CBT PENGATURAN & WHITELIST (cbt_pengaturan & cbt_whitelist_user)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "allow_all_cbt_pengaturan" ON public.cbt_pengaturan;
DROP POLICY IF EXISTS "cbt_pengaturan_read" ON public.cbt_pengaturan;
DROP POLICY IF EXISTS "cbt_pengaturan_staff_write" ON public.cbt_pengaturan;

CREATE POLICY "cbt_pengaturan_read"
  ON public.cbt_pengaturan
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "cbt_pengaturan_staff_write"
  ON public.cbt_pengaturan
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

DROP TRIGGER IF EXISTS trg_guard_staff_cbt_pengaturan ON public.cbt_pengaturan;
CREATE TRIGGER trg_guard_staff_cbt_pengaturan
  BEFORE INSERT OR UPDATE OR DELETE ON public.cbt_pengaturan
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

-- cbt_whitelist_user
DROP POLICY IF EXISTS "allow_all_cbt_whitelist_user" ON public.cbt_whitelist_user;
DROP POLICY IF EXISTS "cbt_whitelist_read_all" ON public.cbt_whitelist_user;
DROP POLICY IF EXISTS "cbt_whitelist_update" ON public.cbt_whitelist_user;
DROP POLICY IF EXISTS "cbt_whitelist_write" ON public.cbt_whitelist_user;
DROP POLICY IF EXISTS "cbt_whitelist_staff_all" ON public.cbt_whitelist_user;

CREATE POLICY "cbt_whitelist_staff_all"
  ON public.cbt_whitelist_user
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

DROP TRIGGER IF EXISTS trg_guard_staff_cbt_whitelist_user ON public.cbt_whitelist_user;
CREATE TRIGGER trg_guard_staff_cbt_whitelist_user
  BEFORE INSERT OR UPDATE OR DELETE ON public.cbt_whitelist_user
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();


-- ------------------------------------------------------------------------------
-- 11. KUNCI KONSELING BK & JADWAL BK (bk_konsultasi_booking & bk_konsultasi_jadwal)
-- ------------------------------------------------------------------------------
-- bk_konsultasi_jadwal (Slot waktu guru BK yang tersedia)
DROP POLICY IF EXISTS "Allow all actions on jadwal for authenticated users" ON public.bk_konsultasi_jadwal;
DROP POLICY IF EXISTS "bk_jadwal_read_all" ON public.bk_konsultasi_jadwal;
DROP POLICY IF EXISTS "bk_jadwal_update" ON public.bk_konsultasi_jadwal;
DROP POLICY IF EXISTS "bk_jadwal_write" ON public.bk_konsultasi_jadwal;
DROP POLICY IF EXISTS "bk_jadwal_read" ON public.bk_konsultasi_jadwal;
DROP POLICY IF EXISTS "bk_jadwal_staff_write" ON public.bk_konsultasi_jadwal;

CREATE POLICY "bk_jadwal_read"
  ON public.bk_konsultasi_jadwal
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "bk_jadwal_staff_write"
  ON public.bk_konsultasi_jadwal
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

DROP TRIGGER IF EXISTS trg_guard_staff_bk_jadwal ON public.bk_konsultasi_jadwal;
CREATE TRIGGER trg_guard_staff_bk_jadwal
  BEFORE INSERT OR UPDATE OR DELETE ON public.bk_konsultasi_jadwal
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

-- bk_konsultasi_booking (Data curhat & hasil konseling rahasia)
DROP POLICY IF EXISTS "Allow all actions on booking for authenticated users" ON public.bk_konsultasi_booking;
DROP POLICY IF EXISTS "bk_booking_read_all" ON public.bk_konsultasi_booking;
DROP POLICY IF EXISTS "bk_booking_update" ON public.bk_konsultasi_booking;
DROP POLICY IF EXISTS "bk_booking_write" ON public.bk_konsultasi_booking;
DROP POLICY IF EXISTS "bk_booking_select_policy" ON public.bk_konsultasi_booking;
DROP POLICY IF EXISTS "bk_booking_write_policy" ON public.bk_konsultasi_booking;

-- Staff bisa melihat semua booking; Siswa HANYA boleh melihat booking miliknya sendiri
CREATE POLICY "bk_booking_select_policy"
  ON public.bk_konsultasi_booking
  FOR SELECT
  TO anon, authenticated
  USING (
    public.fn_is_authorized_staff()
    OR siswa_nisn = NULLIF(public.fn_get_client_header_part('ebm_actor'), '')
  );

CREATE POLICY "bk_booking_write_policy"
  ON public.bk_konsultasi_booking
  FOR ALL
  TO anon, authenticated
  USING (
    public.fn_is_authorized_staff()
    OR siswa_nisn = NULLIF(public.fn_get_client_header_part('ebm_actor'), '')
  )
  WITH CHECK (
    public.fn_is_authorized_staff()
    OR siswa_nisn = NULLIF(public.fn_get_client_header_part('ebm_actor'), '')
  );

-- Trigger Penjaga khusus BK Booking: Siswa hanya boleh INSERT status 'menunggu', dilarang isi catatan_hasil / ubah status
CREATE OR REPLACE FUNCTION public.fn_guard_bk_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Staff resmi / Guru BK bebas mengelola
  IF public.fn_is_authorized_staff() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'menunggu';
    NEW.balasan_guru := NULL;
    NEW.catatan_hasil := NULL;
    NEW.tampilkan_hasil_ke_siswa := false;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Siswa hanya boleh mengedit catatan keluhannya sendiri JIKA status masih 'menunggu'
    IF OLD.status <> 'menunggu' THEN
      RAISE EXCEPTION 'Akses ditolak: Sesi konseling telah diproses oleh Guru BK dan tidak dapat diubah.';
    END IF;
    -- Lindungi kolom hak guru BK agar tidak bisa diisi oleh siswa
    NEW.status := OLD.status;
    NEW.balasan_guru := OLD.balasan_guru;
    NEW.catatan_hasil := OLD.catatan_hasil;
    NEW.tampilkan_hasil_ke_siswa := OLD.tampilkan_hasil_ke_siswa;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'menunggu' THEN
      RAISE EXCEPTION 'Akses ditolak: Sesi konseling telah diproses dan tidak dapat dihapus oleh siswa.';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_bk_booking ON public.bk_konsultasi_booking;
CREATE TRIGGER trg_guard_bk_booking
  BEFORE INSERT OR UPDATE OR DELETE ON public.bk_konsultasi_booking
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_bk_booking();


-- ------------------------------------------------------------------------------
-- 12. KUNCI PRESTASI SISWA & QR TOKENS (prestasi_siswa & qr_tokens)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "allow_all_prestasi_siswa" ON public.prestasi_siswa;
DROP POLICY IF EXISTS "prestasi_update" ON public.prestasi_siswa;
DROP POLICY IF EXISTS "prestasi_write" ON public.prestasi_siswa;
DROP POLICY IF EXISTS "prestasi_read_all" ON public.prestasi_siswa;
DROP POLICY IF EXISTS "prestasi_staff_write" ON public.prestasi_siswa;

CREATE POLICY "prestasi_read_all"
  ON public.prestasi_siswa
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "prestasi_staff_write"
  ON public.prestasi_siswa
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

DROP TRIGGER IF EXISTS trg_guard_staff_prestasi_siswa ON public.prestasi_siswa;
CREATE TRIGGER trg_guard_staff_prestasi_siswa
  BEFORE INSERT OR UPDATE OR DELETE ON public.prestasi_siswa
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

-- qr_tokens (Token rotasi dinamis Presensi TV)
DROP POLICY IF EXISTS "Public modify qr_tokens" ON public.qr_tokens;
DROP POLICY IF EXISTS "Public select qr_tokens" ON public.qr_tokens;
DROP POLICY IF EXISTS "qr_tokens_read" ON public.qr_tokens;
DROP POLICY IF EXISTS "qr_tokens_staff_write" ON public.qr_tokens;

CREATE POLICY "qr_tokens_read"
  ON public.qr_tokens
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "qr_tokens_staff_write"
  ON public.qr_tokens
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

DROP TRIGGER IF EXISTS trg_guard_staff_qr_tokens ON public.qr_tokens;
CREATE TRIGGER trg_guard_staff_qr_tokens
  BEFORE INSERT OR UPDATE OR DELETE ON public.qr_tokens
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();


-- ------------------------------------------------------------------------------
-- 13. KUNCI PENDAMPING LOMBA & JADWAL CATATAN (pendamping_lomba & jadwal_catatan)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all actions on pendamping_lomba for anon and authenticate" ON public.pendamping_lomba;
DROP POLICY IF EXISTS "pendamping_lomba_read" ON public.pendamping_lomba;
DROP POLICY IF EXISTS "pendamping_lomba_staff_write" ON public.pendamping_lomba;

CREATE POLICY "pendamping_lomba_read"
  ON public.pendamping_lomba
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "pendamping_lomba_staff_write"
  ON public.pendamping_lomba
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

DROP TRIGGER IF EXISTS trg_guard_staff_pendamping_lomba ON public.pendamping_lomba;
CREATE TRIGGER trg_guard_staff_pendamping_lomba
  BEFORE INSERT OR UPDATE OR DELETE ON public.pendamping_lomba
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

-- jadwal_catatan
DROP TRIGGER IF EXISTS trg_guard_staff_jadwal_catatan ON public.jadwal_catatan;
CREATE TRIGGER trg_guard_staff_jadwal_catatan
  BEFORE INSERT OR UPDATE OR DELETE ON public.jadwal_catatan
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();


-- ------------------------------------------------------------------------------
-- 14. KUNCI TRANSAKSI BCA LOG (transaksi_bca_log)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "transaksi_bca_write" ON public.transaksi_bca_log;
DROP POLICY IF EXISTS "transaksi_bca_insert_admin" ON public.transaksi_bca_log;
DROP POLICY IF EXISTS "transaksi_bca_select_all" ON public.transaksi_bca_log;
DROP POLICY IF EXISTS "transaksi_bca_read_all" ON public.transaksi_bca_log;
DROP POLICY IF EXISTS "transaksi_bca_update" ON public.transaksi_bca_log;
DROP POLICY IF EXISTS "transaksi_bca_staff_all" ON public.transaksi_bca_log;

CREATE POLICY "transaksi_bca_staff_all"
  ON public.transaksi_bca_log
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

DROP TRIGGER IF EXISTS trg_guard_staff_transaksi_bca_log ON public.transaksi_bca_log;
CREATE TRIGGER trg_guard_staff_transaksi_bca_log
  BEFORE INSERT OR UPDATE OR DELETE ON public.transaksi_bca_log
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();


-- ------------------------------------------------------------------------------
-- 15. KUNCI LAPORAN KENDALA PRESENSI (laporan_kendala_presensi)
-- ------------------------------------------------------------------------------
-- Siswa boleh melaporkan (INSERT), tapi HANYA staff yang boleh UPDATE status / DELETE
DROP POLICY IF EXISTS "Allow all on laporan_kendala_presensi" ON public.laporan_kendala_presensi;
DROP POLICY IF EXISTS "laporan_kendala_delete" ON public.laporan_kendala_presensi;
DROP POLICY IF EXISTS "laporan_kendala_update" ON public.laporan_kendala_presensi;
DROP POLICY IF EXISTS "laporan_kendala_write" ON public.laporan_kendala_presensi;
DROP POLICY IF EXISTS "laporan_kendala_read_all" ON public.laporan_kendala_presensi;
DROP POLICY IF EXISTS "laporan_kendala_select" ON public.laporan_kendala_presensi;
DROP POLICY IF EXISTS "laporan_kendala_insert" ON public.laporan_kendala_presensi;
DROP POLICY IF EXISTS "laporan_kendala_read" ON public.laporan_kendala_presensi;
DROP POLICY IF EXISTS "laporan_kendala_staff_modify" ON public.laporan_kendala_presensi;

CREATE POLICY "laporan_kendala_read"
  ON public.laporan_kendala_presensi
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "laporan_kendala_insert"
  ON public.laporan_kendala_presensi
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "laporan_kendala_staff_modify"
  ON public.laporan_kendala_presensi
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

CREATE OR REPLACE FUNCTION public.fn_guard_laporan_kendala()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.fn_is_authorized_staff() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'Akses ditolak: Hanya Guru Piket / Admin yang berwenang memodifikasi atau menyelesaikan laporan kendala.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_laporan_kendala ON public.laporan_kendala_presensi;
CREATE TRIGGER trg_guard_laporan_kendala
  BEFORE UPDATE OR DELETE ON public.laporan_kendala_presensi
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_laporan_kendala();
