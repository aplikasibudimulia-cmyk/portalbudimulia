-- ==============================================================================
-- MIGRATION: ADD CBT SINGLE DEVICE LOCK (KUNCI PERANGKAT TUNGGAL CBT)
-- Memastikan 1 akun siswa hanya dapat membuka lembar ujian pada 1 perangkat fisik.
-- Jika siswa pindah perangkat, sistem akan menolak kecuali telah di-reset oleh pengawas.
-- Jawaban sebelumnya tidak akan hilang saat reset perangkat dilakukan.
-- ==============================================================================

-- 1. Tambahkan kolom pendukung di cbt_peserta_ujian jika belum ada
ALTER TABLE public.cbt_peserta_ujian 
ADD COLUMN IF NOT EXISTS device_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS device_info VARCHAR(150),
ADD COLUMN IF NOT EXISTS browser_info VARCHAR(150),
ADD COLUMN IF NOT EXISTS ip_address VARCHAR(50);

-- Index untuk mempercepat lookup device_id
CREATE INDEX IF NOT EXISTS idx_cbt_peserta_device_id ON public.cbt_peserta_ujian(device_id);

-- 2. Stored Procedure: Reset Kunci Perangkat Siswa oleh Pengawas/Guru
CREATE OR REPLACE FUNCTION public.cbt_proctor_reset_device(
    p_peserta_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.cbt_peserta_ujian
    SET 
        device_id = NULL,
        device_info = NULL,
        browser_info = NULL,
        ip_address = NULL,
        status = 'sedang_mengerjakan',
        is_blocked = false,
        block_reason = NULL
    WHERE id = p_peserta_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Peserta ujian tidak ditemukan.');
    END IF;

    -- Catat log audit jika tabel audit tersedia
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cbt_audit_logs') THEN
        INSERT INTO public.cbt_audit_logs (peserta_id, event_type, payload)
        VALUES (p_peserta_id, 'DEVICE_RESET_BY_PROCTOR', jsonb_build_object('timestamp', now()));
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Kunci perangkat berhasil di-reset. Siswa dapat masuk dari perangkat baru.');
END;
$$;

-- Berikan izin eksekusi ke authenticated dan anon
GRANT EXECUTE ON FUNCTION public.cbt_proctor_reset_device(UUID) TO authenticated, anon;
