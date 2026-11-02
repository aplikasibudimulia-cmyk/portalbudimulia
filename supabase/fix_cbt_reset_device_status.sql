-- ==============================================================================
-- FIX CBT RESET DEVICE STATUS:
-- Menyetel status peserta ke 'belum_melanjutkan' saat pengawas melakukan reset perangkat
-- agar siswa tetap berada di tab belum mengerjakan sampai siswa login kembali di HP baru.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.cbt_proctor_reset_device(
    p_peserta_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_waktu_mulai TIMESTAMPTZ;
    v_new_status VARCHAR(30);
BEGIN
    SELECT waktu_mulai INTO v_waktu_mulai
    FROM public.cbt_peserta_ujian
    WHERE id = p_peserta_id;

    IF v_waktu_mulai IS NOT NULL THEN
        v_new_status := 'belum_melanjutkan';
    ELSE
        v_new_status := 'belum_mulai';
    END IF;

    UPDATE public.cbt_peserta_ujian
    SET 
        device_id = NULL,
        device_info = NULL,
        browser_info = NULL,
        ip_address = NULL,
        status = v_new_status,
        is_blocked = false,
        block_reason = NULL
    WHERE id = p_peserta_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Peserta ujian tidak ditemukan.');
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cbt_audit_logs') THEN
        INSERT INTO public.cbt_audit_logs (peserta_id, event_type, payload)
        VALUES (p_peserta_id, 'DEVICE_RESET_BY_PROCTOR', jsonb_build_object('timestamp', now(), 'status', v_new_status));
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Kunci perangkat berhasil di-reset. Status diatur ke ' || v_new_status || '.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.cbt_proctor_reset_device(UUID) TO authenticated, anon;
