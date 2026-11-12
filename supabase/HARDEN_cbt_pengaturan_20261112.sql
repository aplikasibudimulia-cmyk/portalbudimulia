-- ==============================================================================
-- 🔒 HARDENING TABEL cbt_pengaturan (SMP BUDI MULIA)
-- ==============================================================================
-- Tanggal: 2026-11-12
-- Tujuan: Mengunci tabel cbt_pengaturan agar:
--   1. SELECT tetap bisa dibaca publik (siswa/guru) untuk deteksi status CBT aktif/tidak.
--   2. UPDATE/INSERT hanya bisa dilakukan oleh Staff / Admin yang terotorisasi.
--   3. DELETE diblokir total untuk semua peran (mencegah terhapusnya baris id=1).
--   4. Trigger perlindungan ganda (fn_guard_staff_only_write) aktif di level database.
-- ==============================================================================

-- 1. Pastikan Row Level Security aktif
ALTER TABLE public.cbt_pengaturan ENABLE ROW LEVEL SECURITY;

-- 2. Bersihkan policy lama yang berpotensi longgar
DROP POLICY IF EXISTS "allow_all_cbt_pengaturan" ON public.cbt_pengaturan;
DROP POLICY IF EXISTS "Publik baca cbt_pengaturan" ON public.cbt_pengaturan;
DROP POLICY IF EXISTS "Admin kelola cbt_pengaturan" ON public.cbt_pengaturan;
DROP POLICY IF EXISTS "cbt_pengaturan_read" ON public.cbt_pengaturan;
DROP POLICY IF EXISTS "cbt_pengaturan_write_staff_only" ON public.cbt_pengaturan;
DROP POLICY IF EXISTS "cbt_pengaturan_no_delete" ON public.cbt_pengaturan;

-- 3. Policy SELECT: Boleh dibaca oleh siapa saja (anon & authenticated)
--    Wajib publik agar dashboard siswa/guru bisa memeriksa status CBT.
CREATE POLICY "cbt_pengaturan_read"
  ON public.cbt_pengaturan
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 4. Policy INSERT & UPDATE: Hanya Staff / Admin yang terotorisasi
CREATE POLICY "cbt_pengaturan_write_staff_only"
  ON public.cbt_pengaturan
  FOR ALL
  TO anon, authenticated
  USING (public.fn_is_authorized_staff())
  WITH CHECK (public.fn_is_authorized_staff());

-- 5. Policy DELETE: Diblokir total (tidak boleh ada yang menghapus baris id=1)
CREATE POLICY "cbt_pengaturan_no_delete"
  ON public.cbt_pengaturan
  FOR DELETE
  TO anon, authenticated
  USING (false);

-- 6. Pasang Trigger Perlindungan Engine Level (fn_guard_staff_only_write)
DROP TRIGGER IF EXISTS trg_guard_staff_cbt_pengaturan ON public.cbt_pengaturan;
CREATE TRIGGER trg_guard_staff_cbt_pengaturan
  BEFORE INSERT OR UPDATE OR DELETE ON public.cbt_pengaturan
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_staff_only_write();

-- 7. Pastikan baris konfigurasi default id = 1 ada
INSERT INTO public.cbt_pengaturan (id, is_cbt_active)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;
