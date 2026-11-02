-- ==============================================================================
-- 📘 SKRIP PERBAIKAN PENSKORAN CBT: STANDAR SKALA NILAI 0 - 100
-- Deskripsi:
-- Memperbaiki kalkulasi cbt_internal_score_submission agar nilai_akhir
-- selalu dihitung dalam skala 0 - 100 berdasarkan total bobot butir soal:
-- nilai_akhir = ROUND((total_skor_diperoleh / total_bobot_maksimal) * 100.0, 2)
-- Serta otomatis menghitung ulang seluruh peserta ujian yang sudah selesai.
-- ==============================================================================

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
    -- 1. Ambil info sesi & bank soal
    SELECT s.id, s.bank_soal_id, s.skema_pg_kompleks 
    INTO v_sesi_id, v_bank_soal_id, v_skema_pgk
    FROM public.cbt_peserta_ujian p
    JOIN public.cbt_sesi_ujian s ON s.id = p.sesi_id
    WHERE p.id = p_peserta_id;

    IF v_sesi_id IS NULL THEN
        RETURN 0.0;
    END IF;

    -- 2. Hitung total bobot maksimal dari seluruh butir soal di bank soal
    SELECT COALESCE(SUM(so.bobot), 0.0)
    INTO v_total_bobot_maksimal
    FROM public.cbt_soal so
    WHERE so.bank_soal_id = v_bank_soal_id;

    -- 3. Iterasi seluruh jawaban siswa untuk peserta ini
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
                -- Isian Singkat (Case insensitive trim)
                IF LOWER(TRIM(v_rec.jawaban_terpilih)) = LOWER(TRIM(v_rec.kunci_jawaban)) THEN
                    v_skor_soal := v_rec.bobot;
                    v_is_correct := true;
                END IF;

            ELSIF v_rec.tipe_soal = 'menjodohkan' THEN
                -- Menjodohkan (Pencocokan JSON)
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

    -- 4. Hitung nilai akhir dalam skala 0 - 100
    IF v_total_bobot_maksimal <= 0 THEN
        -- Fallback jika bobot bank soal kosong: hitung dari butir soal yang dijawab
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

    -- 5. Simpan total nilai akhir di peserta ujian
    UPDATE public.cbt_peserta_ujian 
    SET nilai_akhir = v_nilai_akhir 
    WHERE id = p_peserta_id;

    RETURN v_nilai_akhir;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Berikan izin eksekusi ke semua role
GRANT EXECUTE ON FUNCTION public.cbt_internal_score_submission(UUID) TO anon, authenticated, service_role;

-- ==============================================================================
-- 🚀 MIGRASI OTOMATIS: HITUNG ULANG SELURUH PESERTA YANG SUDAH SELESAI
-- ==============================================================================
DO $$
DECLARE
    r RECORD;
    v_res NUMERIC;
    v_count INT := 0;
BEGIN
    FOR r IN SELECT id FROM public.cbt_peserta_ujian WHERE status = 'selesai'
    LOOP
        v_res := public.cbt_internal_score_submission(r.id);
        v_count := v_count + 1;
    END LOOP;
    RAISE NOTICE 'Berhasil menghitung ulang nilai % peserta ujian.', v_count;
END $$;
