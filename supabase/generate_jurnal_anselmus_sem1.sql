-- ==============================================================================
-- SCRIPT AUTO-GENERATE JURNAL MENGAJAR SEMESTER 1 (2026/2027)
-- KHUSUS GURU: Anselmus Mediari Gestawan (Matematika - Kelas 8 & 9)
-- ==============================================================================
-- Karakteristik:
-- 1. Presisi Hari Masuk / Libur: Berdasarkan rekap kehadiran siswa di presensi_harian.
--    - Jika presensi >= 10: Hari KBM Efektif (status = 'terlaksana').
--    - Jika presensi < 10 / nihil: Hari Libur / Kegiatan Sekolah (status = 'libur').
-- 2. Kurikulum Terstruktur:
--    - Kelas 8: Bab 1 (Bilangan Bulat dan Bentuk Akar) & Bab 2 (Teorema Pythagoras)
--    - Kelas 9: Bab 1 (Lingkaran) & Bab 2 (Bangun Ruang)
-- 3. Sinkronisasi Presensi Siswa:
--    - Mengambil nama & status siswa Sakit (S), Izin (I), Alpa (A) tiap kelas secara nyata.
-- 4. Metode KBM: Menggunakan variasi metode aktif sesuai Kurikulum Merdeka.
-- 5. Safe: ON CONFLICT DO NOTHING (tidak menimpa jurnal yang sudah diisi manual).
-- ==============================================================================

DO $$
DECLARE
  v_guru_id UUID := '111b8b70-33fe-4e26-9d41-ef03467e0e78';
  v_ta_id   UUID := '4e1ae0ff-a398-488c-a940-14dc69f337d9';
  v_mapel_id UUID := 'e73c6de1-a569-4284-b1ba-122c2d13d671';
  v_sem INT := 1;

  v_date DATE;
  v_day_name TEXT;
  v_pres_count INT;
  v_is_school_day BOOLEAN;

  -- Counter pertemuan per kelas
  v_count_8a INT := 0;
  v_count_8b INT := 0;
  v_count_8c INT := 0;
  v_count_8d INT := 0;
  v_count_9a INT := 0;
  v_count_9b INT := 0;

  v_meeting_idx INT;
  v_bab TEXT;
  v_materi TEXT;
  v_kegiatan TEXT;
  v_alasan TEXT;
  v_status TEXT;

  v_absent_str TEXT;
  v_absent_json JSONB;
  v_total_inserted INT := 0;

  -- Array Materi Kelas 8 Bab 1 (Bilangan Bulat dan Bentuk Akar)
  materi_8_bab1 TEXT[] := ARRAY[
    'Pengenalan sifat bilangan bulat dan operasi hitung campuran',
    'Penerapan operasi bilangan bulat dalam penyelesaian masalah sehari-hari',
    'Konsep dasar perpangkatan dan bilangan berpangkat bulat positif',
    'Sifat perkalian dan pembagian pada bilangan berpangkat',
    'Konsep perpangkatan bilangan berpangkat dan bilangan berpangkat pecahan',
    'Pengenalan bentuk akar dan hubungannya dengan bilangan berpangkat pecahan',
    'Operasi penjumlahan dan pengurangan bentuk akar',
    'Operasi perkalian dan pembagian bentuk akar',
    'Merasionalkan bentuk pecahan dengan penyebut bentuk akar',
    'Merasionalkan pecahan bentuk akar suku dua (sekawan)',
    'Notasi ilmiah (bentuk baku) bilangan sangat besar dan sangat kecil',
    'Latihan terbimbing dan pemecahan masalah kontekstual bentuk akar',
    'Kuis formatif dan pembahasan soal evaluasi Bab 1',
    'Penguatan materi dan refleksi pemahaman konsep Bab 1'
  ];

  -- Array Materi Kelas 8 Bab 2 (Teorema Pythagoras)
  materi_8_bab2 TEXT[] := ARRAY[
    'Pengenalan dan penemuan rumus Teorema Pythagoras melalui luas persegi',
    'Menghitung panjang salah satu sisi segitiga siku-siku jika dua sisi diketahui',
    'Mengenal dan menentukan Tripel Pythagoras',
    'Menentukan jenis segitiga (lancip, siku-siku, tumpul) berdasarkan panjang sisi',
    'Perbandingan panjang sisi-sisi segitiga siku-siku khusus (sudut 45°-45°-90°)',
    'Perbandingan panjang sisi-sisi segitiga siku-siku khusus (sudut 30°-60°-90°)',
    'Penerapan Teorema Pythagoras pada bangun datar (persegi, belah ketupat, trapesium)',
    'Penerapan Teorema Pythagoras pada bangun ruang (panjang diagonal sisi dan diagonal ruang)',
    'Menghitung jarak antara dua titik koordinat menggunakan prinsip Pythagoras',
    'Pemecahan masalah kontekstual kehidupan sehari-hari berbasis Teorema Pythagoras',
    'Latihan soal tipe asesmen dan studi kasus geometri',
    'Kuis formatif dan pembahasan latihan soal Teorema Pythagoras',
    'Asesmen sumatif / pengayaan materi Teorema Pythagoras',
    'Refleksi dan persiapan Penilaian Akhir Semester (PAS)'
  ];

  -- Array Materi Kelas 9 Bab 1 (Lingkaran)
  materi_9_bab1 TEXT[] := ARRAY[
    'Mengenal unsur-unsur lingkaran (jari-jari, diameter, busur, tali busur, tembereng, juring)',
    'Menghitung keliling lingkaran dan pemecahan masalah kontekstual',
    'Menghitung luas lingkaran dan luas daerah gabungan lingkaran',
    'Konsep dan hubungan antara sudut pusat dan sudut keliling lingkaran',
    'Menghitung panjang busur lingkaran berdasarkan sudut pusat',
    'Menghitung luas juring lingkaran dan tembereng',
    'Garis singgung lingkaran yang melalui titik pada lingkaran',
    'Garis singgung persekutuan luar dua lingkaran (GSPL)',
    'Garis singgung persekutuan dalam dua lingkaran (GSPD)',
    'Penerapan garis singgung persekutuan dalam kehidupan nyata (roda gigi, rantai sepeda)',
    'Latihan terbimbing dan eksplorasi soal cerita geometri lingkaran',
    'Kuis formatif dan pembahasan soal penguatan konsep Bab Lingkaran',
    'Refleksi pembelajaran dan asesmen kompetensi lingkaran'
  ];

  -- Array Materi Kelas 9 Bab 2 (Bangun Ruang)
  materi_9_bab2 TEXT[] := ARRAY[
    'Mengenal unsur, jaring-jaring, dan karakteristik tabung',
    'Menghitung luas permukaan tabung (dengan tutup dan tanpa tutup)',
    'Menghitung volume tabung dan aplikasinya dalam wadah silinder',
    'Mengenal unsur, jaring-jaring, dan luas permukaan kerucut',
    'Menghitung volume kerucut dan hubungan volume tabung dengan kerucut',
    'Karakteristik bola dan menghitung luas permukaan bola',
    'Menghitung volume bola dan setengah bola padat',
    'Gabungan bangun ruang sisi lengkung (tabung + kerucut, tabung + setengah bola)',
    'Perubahan volume bangun ruang jika ukuran jari-jari atau tinggi diperbesar/diperkecil',
    'Pemecahan masalah kontekstual dan estimasi kapasitas benda berbentuk lengkung',
    'Latihan soal AKM dan penalaran matematis bangun ruang sisi lengkung',
    'Kuis formatif dan asesmen pemahaman materi Bangun Ruang',
    'Refleksi dan persiapan Penilaian Akhir Semester (PAS)'
  ];

  -- Variasi Metode KBM
  kegiatan_rotations TEXT[] := ARRAY[
    'Ceramah Interaktif, Tanya Jawab, Latihan Soal / Mandiri',
    'Tanya Jawab, Diskusi Kelompok, Latihan Soal / Mandiri',
    'Diskusi Kelompok, Presentasi Siswa, Tanya Jawab',
    'Problem-Based Learning (PBL), Diskusi Kelompok, Latihan Soal / Mandiri',
    'Praktikum / Eksperimen, Tanya Jawab, Diskusi Kelompok',
    'Kuis / Asesmen Formatif, Tanya Jawab, Literasi & Refleksi'
  ];

  -- Record kursor jadwal
  rec RECORD;

BEGIN
  RAISE NOTICE 'Memulai generasi jurnal mengajar otomatis untuk Pak Anselmus Mediari Gestawan...';

  -- Loop setiap hari kalender dari 14 Juli 2026 sampai 13 November 2026
  FOR v_date IN
    SELECT d::date
    FROM generate_series('2026-07-14'::date, '2026-11-13'::date, '1 day'::interval) d
    WHERE extract(isodow from d) <= 5 -- Senin s/d Jumat
    ORDER BY d
  LOOP
    -- Hitung presensi siswa sekolah pada tanggal ini
    SELECT count(*) INTO v_pres_count
    FROM public.presensi_harian
    WHERE tanggal = v_date;

    v_is_school_day := (v_pres_count >= 10);
    
    -- Tentukan hari dalam bahasa Indonesia
    v_day_name := CASE extract(isodow from v_date)
      WHEN 1 THEN 'Senin'
      WHEN 2 THEN 'Selasa'
      WHEN 3 THEN 'Rabu'
      WHEN 4 THEN 'Kamis'
      WHEN 5 THEN 'Jumat'
    END;

    -- Ambil jadwal mengajar Pak Ansel pada hari ini (jadwal berurutan sudah di-group)
    FOR rec IN
      SELECT 
        id as jadwal_id,
        hari,
        kelas,
        jam_ke_awal,
        jam_ke_akhir,
        waktu_mulai,
        waktu_selesai
      FROM (
        VALUES
          -- SENIN
          ('Senin', '8A', 3, 4, '08:20:00'::time, '10:10:00'::time, 'a14ce791-5e99-492c-a44a-3cef9a0470fe'::uuid),
          ('Senin', '8D', 5, 6, '10:10:00'::time, '11:30:00'::time, '4b918af5-83b6-41ef-89f5-3392e6063812'::uuid),
          ('Senin', '8C', 7, 8, '11:30:00'::time, '13:10:00'::time, 'b61efc0a-383b-4be6-932f-429b3e204fc3'::uuid),
          ('Senin', '9B', 9, 10, '13:10:00'::time, '14:30:00'::time, 'a1f2e50d-5d78-4a49-99e7-bda51034fc9c'::uuid),
          -- SELASA
          ('Selasa', '8C', 1, 1, '07:00:00'::time, '07:40:00'::time, 'ee221d01-16af-4899-82d8-6efe56c3909d'::uuid),
          ('Selasa', '9A', 2, 3, '07:40:00'::time, '09:00:00'::time, '11ff7c8a-338c-4dc1-8ae3-007fa7b21ebf'::uuid),
          ('Selasa', '9B', 4, 4, '09:30:00'::time, '10:10:00'::time, 'b61b9ea6-bca2-4aff-b3b6-a424912c492b'::uuid),
          ('Selasa', '8A', 6, 7, '10:50:00'::time, '12:10:00'::time, '10f893f6-de31-4100-8d26-04486b90c0f7'::uuid),
          ('Selasa', '8B', 9, 10, '13:10:00'::time, '14:30:00'::time, '0a42a7b5-de66-4eb2-860e-475e4099c613'::uuid),
          -- RABU
          ('Rabu', '9B', 4, 5, '09:30:00'::time, '10:50:00'::time, '0d31db3e-9834-4521-8c3e-305b884943db'::uuid),
          ('Rabu', '9A', 6, 7, '10:50:00'::time, '12:10:00'::time, 'cae6b462-d774-4b08-8e60-d69922cf6cbe'::uuid),
          ('Rabu', '8C', 8, 9, '12:30:00'::time, '13:50:00'::time, '0afa6669-bc4f-462c-b516-0c658cc21c9a'::uuid),
          -- KAMIS
          ('Kamis', '9A', 1, 1, '07:00:00'::time, '07:40:00'::time, 'f5c06b51-34dc-4895-80bb-bb60f1ab1aad'::uuid),
          ('Kamis', '8A', 5, 5, '10:10:00'::time, '10:50:00'::time, '734f4278-28a9-48bd-90bd-d57eb5d47491'::uuid),
          ('Kamis', '8D', 7, 7, '11:30:00'::time, '12:10:00'::time, '37551839-4055-4b20-95f8-b46bc57f5dc2'::uuid),
          ('Kamis', '8B', 8, 9, '12:30:00'::time, '13:50:00'::time, 'b80449ae-473b-428d-9d35-989d04d85495'::uuid),
          -- JUMAT
          ('Jumat', '8B', 4, 4, '09:25:00'::time, '10:05:00'::time, 'ebe0c059-263c-4014-898a-c0026912b95d'::uuid),
          ('Jumat', '8D', 7, 8, '11:25:00'::time, '13:05:00'::time, '0fdd31b0-882a-4971-89ae-f9bf133a1183'::uuid)
      ) AS t(hari, kelas, jam_ke_awal, jam_ke_akhir, waktu_mulai, waktu_selesai, id)
      WHERE t.hari = v_day_name
    LOOP
      IF v_is_school_day THEN
        -- Naikkan counter pertemuan per kelas
        IF rec.kelas = '8A' THEN v_count_8a := v_count_8a + 1; v_meeting_idx := v_count_8a;
        ELSIF rec.kelas = '8B' THEN v_count_8b := v_count_8b + 1; v_meeting_idx := v_count_8b;
        ELSIF rec.kelas = '8C' THEN v_count_8c := v_count_8c + 1; v_meeting_idx := v_count_8c;
        ELSIF rec.kelas = '8D' THEN v_count_8d := v_count_8d + 1; v_meeting_idx := v_count_8d;
        ELSIF rec.kelas = '9A' THEN v_count_9a := v_count_9a + 1; v_meeting_idx := v_count_9a;
        ELSIF rec.kelas = '9B' THEN v_count_9b := v_count_9b + 1; v_meeting_idx := v_count_9b;
        END IF;

        -- Tentukan Bab & Materi berdasarkan tanggal & jenjang
        IF rec.kelas IN ('8A', '8B', '8C', '8D') THEN
          IF v_date <= '2026-09-25'::date THEN
            v_bab := 'Bab 1: Bilangan Bulat dan Bentuk Akar';
            v_materi := materi_8_bab1[((v_meeting_idx - 1) % array_length(materi_8_bab1, 1)) + 1];
          ELSE
            v_bab := 'Bab 2: Teorema Pythagoras';
            v_materi := materi_8_bab2[((v_meeting_idx - 1) % array_length(materi_8_bab2, 1)) + 1];
          END IF;
        ELSE -- Kelas 9A & 9B
          IF v_date <= '2026-09-25'::date THEN
            v_bab := 'Bab 1: Lingkaran';
            v_materi := materi_9_bab1[((v_meeting_idx - 1) % array_length(materi_9_bab1, 1)) + 1];
          ELSE
            v_bab := 'Bab 2: Bangun Ruang';
            v_materi := materi_9_bab2[((v_meeting_idx - 1) % array_length(materi_9_bab2, 1)) + 1];
          END IF;
        END IF;

        -- Variasi Kegiatan / Metode
        v_kegiatan := kegiatan_rotations[((v_meeting_idx - 1) % array_length(kegiatan_rotations, 1)) + 1];
        v_status := 'terlaksana';
        v_alasan := null;

        -- Ambil data siswa tidak hadir dari presensi_harian kelas ini secara presisi
        SELECT 
          COALESCE(string_agg(s.nama_lengkap || ' (' || UPPER(p.status) || ')', ', '), ''),
          COALESCE(jsonb_agg(jsonb_build_object('nisn', s.nisn, 'nama', s.nama_lengkap, 'status', UPPER(p.status))), '[]'::jsonb)
        INTO v_absent_str, v_absent_json
        FROM public.presensi_harian p
        JOIN public.enrollment e ON e.nisn = p.siswa_nisn AND e.tahun_ajaran_id = v_ta_id
        JOIN public.siswa_permanent s ON s.nisn = p.siswa_nisn
        WHERE p.tanggal = v_date
          AND e.kelas = rec.kelas
          AND UPPER(p.status) IN ('S', 'I', 'A');

        IF v_absent_str = '' THEN
          v_absent_str := null;
          v_absent_json := '[]'::jsonb;
        END IF;

      ELSE
        -- Hari Libur / Tidak ada aktivitas presensi sekolah
        v_status := 'libur';
        v_bab := null;
        v_materi := null;
        v_kegiatan := null;
        v_alasan := 'Hari Libur / Kegiatan Sekolah';
        v_absent_str := null;
        v_absent_json := '[]'::jsonb;
      END IF;

      -- Masukkan ke jurnal_mengajar (Aman: ON CONFLICT DO NOTHING agar data manual yang sudah ada tidak tertimpa)
      INSERT INTO public.jurnal_mengajar (
        tahun_ajaran_id,
        semester,
        guru_id,
        jadwal_id,
        tanggal,
        hari,
        kelas,
        mata_pelajaran_id,
        jam_ke_awal,
        jam_ke_akhir,
        waktu_mulai,
        waktu_selesai,
        status,
        bab,
        materi,
        kegiatan,
        sertakan_absen,
        siswa_tidak_hadir,
        siswa_tidak_hadir_data,
        catatan,
        alasan
      )
      VALUES (
        v_ta_id,
        v_sem,
        v_guru_id,
        rec.jadwal_id,
        v_date,
        v_day_name,
        rec.kelas,
        v_mapel_id,
        rec.jam_ke_awal,
        rec.jam_ke_akhir,
        rec.waktu_mulai,
        rec.waktu_selesai,
        v_status,
        v_bab,
        v_materi,
        v_kegiatan,
        (v_status = 'terlaksana'),
        v_absent_str,
        v_absent_json,
        CASE WHEN v_status = 'terlaksana' THEN 'KBM berjalan tertib, aktif, dan kondusif.' ELSE null END,
        v_alasan
      )
      ON CONFLICT (guru_id, jadwal_id, tanggal) DO NOTHING;

      IF FOUND THEN
        v_total_inserted := v_total_inserted + 1;
      END IF;

    END LOOP; -- loop jadwal
  END LOOP; -- loop tanggal

  RAISE NOTICE 'Selesai! Berhasil membuat % baris jurnal mengajar untuk Pak Anselmus.', v_total_inserted;
END;
$$;
