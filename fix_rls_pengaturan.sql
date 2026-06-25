-- Izinkan public/anon untuk membaca pengaturan_sekolah agar notif Telegram jalan di HP siswa
CREATE POLICY "Allow public read pengaturan_sekolah"
ON public.pengaturan_sekolah FOR SELECT
USING (true);
