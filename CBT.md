# 📘 BLUEPRINT ARSITEKTUR & SPESIFIKASI SISTEM CBT (PENILAIAN DIGITAL) eBUDIMULIA
**Versi:** 3.0 (Master Hub Siswa, Spesifikasi Frontend React eBudimulia, API & Realtime Contracts, Test Cases Gladi Bersih, & Supabase Deployment)  
**Status:** Dokumen Spesifikasi Resmi (*Master Specification Document*)  
**Target Beban:** 500+ Siswa Serentak (Kurikulum Merdeka SMP Budi Mulia)

---

## 📑 DAFTAR ISI
1. [Manajemen Sesi Penilaian (Formulir Guru)](#1-manajemen-sesi-penilaian-formulir-guru)
2. [Import Bank Soal Word (.docx), Ragam Soal Kurikulum Merdeka, & Versioning](#2-import-bank-soal-word-docx-ragam-soal-kurikulum-merdeka--versioning)
3. [Sistem Token Ujian Dinamis Terikat Ruang/Kelas (Scoped Token)](#3-sistem-token-ujian-dinamis-terikat-ruangkelas-scoped-token)
4. [Layar Monitor Pengawas Berbasis Hak Akses (Role-Based Proctoring)](#4-layar-monitor-pengawas-berbasis-hak-akses-role-based-proctoring)
5. [Portal Penilaian Siswa & Lembar Ujian (Assessment Hub, ANBK, & Strike Cerdas)](#5-portal-penilaian-siswa--lembar-ujian-assessment-hub-anbk--strike-cerdas)
6. [Akomodasi Khusus Siswa Inklusi (ABK) & Ujian Susulan](#6-akomodasi-khusus-siswa-inklusi-abk--ujian-susulan)
7. [Koreksi Otomatis, Penskoran Parsial PG Kompleks, Analisis CP/TP, & Integrasi Rapor](#7-koreksi-otomatis-penskoran-parsial-pg-kompleks-analisis-cptp--integrasi-rapor)
8. [Ketahanan Sistem & Penanganan Skenario Lapangan (Revisi v1.1)](#8-ketahanan-sistem--penanganan-skenario-lapangan-revisi-v11)
9. [Skema Lengkap Database CBT (Zero-Trust DDL, RLS Policies, Trigger, & RPC Production)](#9-skema-lengkap-database-cbt-zero-trust-ddl-rls-policies-trigger--rpc-production)
10. [Audit Log, Mitigasi Thundering Herd, Kapasitas Supabase, Kontrol Akses Admin, & Backup](#10-audit-log-mitigasi-thundering-herd-kapasitas-supabase-kontrol-akses-admin--backup)
11. [Spesifikasi Frontend & Hirarki Komponen React eBudimulia](#11-spesifikasi-frontend--hirarki-komponen-react-ebudimulia)
12. [Kontrak API & Konvensi Realtime Supabase](#12-kontrak-api--konvensi-realtime-supabase)
13. [Matriks Skenario Uji Coba Konkret (Test Cases Gladi Bersih)](#13-matriks-skenario-uji-coba-konkret-test-cases-gladi-bersih)
14. [Deployment Checklist & Konfigurasi Infrastruktur Supabase](#14-deployment-checklist--konfigurasi-infrastruktur-supabase)

---

## 1. MANAJEMEN SESI PENILAIAN (FORMULIR GURU)

Sebelum ujian diselenggarakan, guru menyusun sesi penilaian melalui formulir pembuatan ujian dengan alur yang terkunci rapi:

### A. Identitas Ujian
* **Judul Penilaian**: Input teks bebas, contoh: *"Sumatif Bab 2: Aljabar"*, *"Penilaian Tengah Semester (PTS) Ganjil IPA"*.
* **Mata Pelajaran (Terkunci Otomatis 🔒)**: Terkunci otomatis membaca data guru yang sedang login (dari `session.guru_mapel_raw`). Guru hanya dapat memilih mata pelajaran yang resmi ditugaskan oleh Admin kepadanya.
* **Tahun Ajaran & Semester (Terkunci Otomatis 🔒)**: Mengikuti kalender akademik aktif sekolah saat itu.
* **Kategori Penilaian (Kurikulum Merdeka)**:
  * Formatif / Kuis Harian
  * Sumatif Lingkup Materi (Ulangan Bab)
  * Sumatif Akhir Semester (SAS / PAS / PTS)

### B. Sasaran Peserta & KKM
* **Target Kelas (Terkunci Otomatis 🔒)**: Menampilkan pilihan kelas yang diampu guru tersebut (misal: `[✓] 7A`, `[✓] 7B`, `[✓] 7C`).
* **Nilai KKM / KKTP**: Batas kelulusan minimum (Default: `75`).

### C. Waktu, Durasi, & Interaksi Jam Tutup dengan Extra Time
* **Tanggal Pelaksanaan**: Kalender tanggal aktif ujian.
* **Rentang Jam Buka - Tutup**: Jam akses gerbang dibuka dan ditutup (contoh: `07:30 WIB` s.d. `09:30 WIB`). Di luar jam ini, lembar ujian tidak dapat dimulai oleh siswa umum.
* **Durasi Pengerjaan**: Timer hitung mundur siswa (pilihan: `30`, `60`, `90`, atau `120 menit`). Timer mulai berkurang saat siswa menekan tombol "Mulai Ujian".
* **Perlindungan Hak Extra Time (ABK & Kompensasi Gangguan)**:
  * Jam Tutup Gerbang bersifat dinamis per individu:
    $$\text{Jam Tutup Efektif Siswa} = \text{Jam Tutup Sesi} + (\text{extra\_waktu\_menit})$$
  * **Formula Keterlambatan Terintegrasi**:
    $$\text{Waktu Tersedia} = \min\Big(\text{Durasi Ujian} + \text{extra\_waktu\_menit}, \text{Jam Tutup Efektif Siswa} - \text{Jam Masuk}\Big)$$
  * *Hasilnya*: Siswa inklusi (ABK) yang berhak atas tambahan +30 menit atau siswa yang mendapat kompensasi teknis dari pengawas **tidak akan terpotong oleh jam dinding gerbang penutupan umum**.

### D. Pengaturan Pengumuman Nilai (Fleksibilitas Penuh)
Guru menentukan bagaimana nilai dibagikan kepada siswa:
1. **Langsung Ditampilkan (Instan)**: Nilai langsung muncul di layar siswa detik itu juga setelah siswa mengklik tombol "Selesai".
2. **Manual (Ditahan Dulu)**: Nilai disembunyikan sampai guru selesai memeriksa & mengoreksi (misal ada soal uraian). Di akun guru tersedia tombol:
   * **Bagikan Nilai Massal**: Sekali klik, seluruh siswa satu kelas serentak menerima nilai dan notifikasi.
   * **Bagikan Nilai Per Siswa**: Rilis nilai satu per satu khusus untuk siswa tertentu (misal yang baru selesai ujian susulan).
3. **Kunci Jawaban & Pembahasan**: Pilihan saklar `ON / OFF` untuk menampilkan atau menyembunyikan kunci jawaban dan pembahasan agar tidak bocor ke kelas lain.

### E. Saklar Pengacakan Soal & Opsi (Bisa ON / OFF)
* **Acak Urutan Soal (`ON / OFF`)**:
  * Dapat dimatikan (*OFF*) jika ujian memiliki soal cerita / teks wacana panjang yang berlaku berurutan untuk beberapa nomor (misal soal nomor 1–5 berdasarkan wacana di stimulus awal).
  * Dapat diaktifkan (*ON*) untuk ujian hitungan/konsep agar nomor siswa yang duduk berdampingan berbeda urutannya.
* **Acak Urutan Opsi Jawaban (`ON / OFF`)**: Mengacak urutan opsi A, B, C, D per siswa.

---

## 2. IMPORT BANK SOAL WORD (.docx), RAGAM SOAL KURIKULUM MERDEKA, & VERSIONING

Fitur utama untuk efisiensi guru dalam menyusun puluhan butir soal lengkap dengan berbagai tipe soal Kurikulum Merdeka/ANBK, rumus, gambar, serta tata kelola riwayat:

### A. Template Word untuk Beragam Tipe Soal (Kurikulum Merdeka)

Guru cukup menggunakan penanda teks terstruktur di Microsoft Word sesuai jenis soal:

#### 1. Pilihan Ganda Tunggal (Default)
```text
[SOAL]
[TP: TP-1.1]
Perhatikan gambar organel sel berikut:
[GAMBAR]
Bagian yang ditunjuk berfungsi sebagai tempat pembentukan energi yaitu...
[A] Ribosom
[B] Mitokondria
[C] Lisosom
[D] Badan Golgi
[KUNCI] B
[BOBOT] 2
[PEMBAHASAN] Mitokondria adalah organel respirasi penghasil ATP.
```

#### 2. Pilihan Ganda Kompleks (Centang Jawaban Benar Lebih dari Satu)
```text
[SOAL]
[TIPE: PG_KOMPLEKS]
[TP: TP-1.2]
Pilihlah dua pernyataan yang benar mengenai ciri-ciri fotosintesis:
[A] Membutuhkan energi cahaya matahari
[B] Menghasilkan gas karbon dioksida
[C] Terjadi di dalam organel kloroplas
[D] Merupakan contoh peristiwa katabolisme
[KUNCI] A, C
[BOBOT] 3
```

#### 3. Benar / Salah (Tabel Pernyataan)
```text
[SOAL]
[TIPE: BENAR_SALAH]
[TP: TP-2.1]
Tentukan nilai kebenaran dari pernyataan-pernyataan matematika berikut:
[PERNYATAAN: Akar kuadrat dari 81 adalah 9] B
[PERNYATAAN: Hasil kali dua bilangan negatif adalah bilangan negatif] S
[PERNYATAAN: Angka 2 adalah satu-satunya bilangan prima yang genap] B
[BOBOT] 3
```

#### 4. Menjodohkan (Pasangan Kolom Kiri & Kanan)
```text
[SOAL]
[TIPE: MENJODOHKAN]
[TP: TP-3.1]
Jodohkanlah negara di bawah ini dengan ibu kotanya yang tepat:
[PASANGAN: Indonesia] Jakarta
[PASANGAN: Jepang] Tokyo
[PASANGAN: Prancis] Paris
[BOBOT] 3
```

#### 5. Isian Singkat & Uraian (Essay)
```text
[SOAL]
[TIPE: ISIAN]
[TP: TP-1.3]
Lambang unsur kimia untuk zat besi dalam tabel periodik adalah...
[KUNCI] Fe
[BOBOT] 2

[SOAL]
[TIPE: ESSAY]
[TP: TP-4.2]
Jelaskan 3 faktor utama yang memengaruhi laju fotosintesis pada tumbuhan hijau!
[BOBOT] 5
[RUBRIK] Kriteria: Cahaya (bobot 2), Suhu (bobot 1.5), Konsentrasi CO2 (bobot 1.5).
```

### B. Dukungan Equation & Simbol Sains (KaTeX Rendering)
* Rumus Word Equation (OMML / MathML) otomatis diekstrak dan dikonversi menjadi sintaks **LaTeX**.
* Di sisi aplikasi siswa dan guru, rumus dirender super cepat menggunakan **KaTeX** (bebas beban server, rendering murni di sisi browser klien).
* Mendukung penuh: pecahan, akar kuadrat, eksponen, integral, sigma, matriks, simbol kimia ($H_2SO_4$), serta harakat bahasa Arab.

### C. Ekstraksi & Auto-Convert Gambar Word (EMF / WMF to PNG/JPG)
* Pustaka parser mengekstrak gambar biner langsung dari arsip zip `.docx` (`word/media/imageX.*`).
* **Auto-Convert Format Gambar**: Parser backend otomatis mendeteksi dan mengonversi format gambar internal Microsoft Word yang tidak didukung browser web (`.emf` / `.wmf`) menjadi `.png` atau `.jpg` standar sebelum diunggah ke Supabase Storage.
* Gambar diunggah ke Supabase Storage bucket `cbt-assets` dan URL-nya ditautkan langsung ke butir soal bersangkutan.

### D. Pre-flight Validator & Deteksi Duplikasi Lintas Riwayat Mapel Guru
Sebelum soal dimasukkan ke database, sistem menyediakan layar verifikasi:
1. **Pemeriksaan Sintaks Otomatis**:
   * Memvalidasi apakah ada tag yang belum ditutup (misal `[EQUATION]` tanpa `[/EQUATION]`).
   * Memvalidasi apakah ada soal pilihan ganda yang lupa diberi tag `[KUNCI]`.
   * Memvalidasi apakah ada opsi jawaban yang kosong atau nomor soal terduplikasi.
2. **Deteksi Duplikasi Soal Lintas Bank Soal (*Cross-Bank Similarity Hash*)**:
   * Sistem menghitung hash normalisasi teks `content_hash = MD5(LOWER(TRIM(konten_soal)))`.
   * Validator membandingkan hash tersebut ke **dua lapisan**:
     * Lapisan 1: Antar-soal di dalam file yang sedang diunggah (*intra-file*).
     * Lapisan 2: Terhadap seluruh riwayat butir soal milik guru bersangkutan pada mata pelajaran yang sama di database (`cbt_soal`).
   * Jika ditemukan kesamaan > 95%, sistem memunculkan peringatan informatif: *"Peringatan: Soal No. 12 terindikasi identik dengan Soal No. 4 pada Bank Soal 'PTS Ganjil 2024'"*. Guru dapat memutuskan apakah tetap menggunakan soal tersebut atau memperbaruinya.
3. **Interactive Preview Modal**:
   * Menampilkan preview persis bagaimana soal akan terlihat di layar HP siswa (termasuk render rumus dan gambar).
   * Guru hanya mengklik tombol "Simpan ke Bank Soal" jika seluruh validasi berstatus hijau (lolos 100%).

### E. Tata Kelola Bank Soal: Kloning & Kapan Kunci (*Immutable Lock*) Berfungsi
* **Kloning Bank Soal Antar-Tahun**: Guru dapat mengkloning bank soal tahun sebelumnya ke semester/tahun ajaran aktif cukup dengan 1 tombol *"Gunakan Ulang Bank Soal"*.
* **Aturan Kunci Bank Soal (*Precision Locking*)**:
  * **Saat Sesi Berstatus `'draft'`**: Bank soal **TETAP TERBUKA (Bebas Direvisi)** oleh guru. Guru masih bisa mengoreksi salah ketik atau mengganti gambar selama sesi belum dimulai.
  * **Saat Sesi Berstatus `'aktif'` atau `'selesai'`**: Database trigger otomatis mengunci bank soal menjadi **Read-Only (`is_locked = true`)**.
  * **Pencegahan Mundur Status (*State-Machine Protection*)**: Database secara mutlak memblokir upaya transisi mundur status sesi dari `'aktif'` atau `'selesai'` kembali ke `'draft'`. Jika guru ingin membuat variasi soal baru, guru wajib menduplikasi menjadi versi baru (*Version 2* / *Fork*).

---

## 3. SISTEM TOKEN UJIAN DINAMIS TERIKAT RUANG/KELAS (SCOPED TOKEN)

Mencegah kebocoran token lintas ruangan (misal siswa memfoto token dan mengirim ke kelas lain via WhatsApp):

### A. Pengikatan Token Berbasis Ruang / Sesi (Scoped Token)
* Token tidak lagi bersifat global satu sekolah. Token diikat ke tuple:
  `Token_Unik = f(sesi_id, ruang_ujian_id / kelas_id)`
* **Contoh Riil:**
  * Ruang 7A: Token = `7A-K8X`
  * Ruang 7B: Token = `7B-M3Q`
  * Siswa yang terdaftar di kelas 7B **tidak akan bisa membuka soal** menggunakan token milik ruang 7A, meskipun token tersebut difoto dan dikirim lewat grup chat.

### B. Verifikasi Token Aman via RPC `cbt_verify_token` (Anti Brute-Force Oracle)
* **Kunci Identitas Terikat Sesi Login**: Parameter token dievaluasi terhadap NISN yang terekstrak langsung dari sesi token JWT login siswa (`auth.jwt() ->> 'nisn'`). Siswa **tidak bisa mengoper NISN orang lain** untuk menebak token kelas lain.
* **Rate-Limiting & Kunci Percobaan Gagal**:
  * Sistem mencatat counter kegagalan memasukkan token (`token_attempts`).
  * Jika terjadi 5 kali kesalahan input token berturut-turut, akun siswa otomatis dibekukan dari percobaan token selama 5 menit (`token_locked_until = now() + 5 minutes`). Hal ini melumpuhkan seluruh skenario serangan *brute-force* otomatis.
* **Metadata Aman (Anti-Leak)**:
  * Fungsi hanya mengembalikan metadata umum: `{ sesi_id, judul, mapel, durasi_menit, waktu_buka, waktu_tutup }` tanpa pernah membocorkan isi data `scoped_tokens` ruangan lain.

### C. Alur Regenerasi Berkala & Distribusi
1. **Regenerasi Otomatis (Per X Menit) / Manual Admin**:
   * Admin / Proktor Utama memiliki dashboard **"Pusat Token Ujian"**.
   * Token dapat diatur auto-refresh setiap 15–30 menit atau di-generate ulang manual jika dicurigai ada indikasi kebocoran.
2. **Distribusi Terpusat**:
   * Admin merilis token baru $\rightarrow$ Muncul di dashboard Pengawas Ruang atau dikabarkan ke Grup Pengawas.
   * Guru pengawas memperbarui tulisan token di papan tulis kelas.

---

## 4. LAYAR MONITOR PENGAWAS BERBASIS HAK AKSES (ROLE-BASED PROCTORING)

Layar pantau ujian dikunci dengan aturan otorisasi ketat:

### A. Aturan Hak Akses (Role-Based Access Control)
Layar monitor pengawas **HANYA DAPAT DIAKSES** oleh:
1. **Super Admin / Proktor Utama** (dapat melihat seluruh ruangan).
2. **Guru yang Ditugaskan sebagai Pengawas Ruang** pada sesi tersebut (hanya dapat melihat daftar siswa di ruangan/kelas tempat dia bertugas).
3. Guru lain yang tidak bertugas tidak memiliki menu ini di dashboard mereka.

### B. Penanganan Status Monitoring & Gap Offline-First
Karena aplikasi siswa berjalan secara *Local-First*, layar pengawas membaca status siswa melalui mekanisme **Batch Heartbeat Sync (15–30 detik)**:
* **Data yang Ditampilkan Realtime:**
  * 🟢 **Budi Santoso**: *Online • Soal 34/50 • Terakhir sync 8 detik lalu*
  * 🟢 **Siti Aminah**: *Selesai & Terkumpul (08:45 WIB) • Nilai Tersimpan*
  * 🟡 **Andi Pratama**: *🟡 Offline (Wi-Fi tersendat 2 menit lalu - Bukan Pelanggaran)*
  * 🔴 **Joko Susilo**: **TERKUNCI** *(Strike 3 - Terdeteksi buka aplikasi lain)*
* **Pembedaan Jelas Penyebab**:
  * Pengawas dapat membedakan dengan mudah siswa yang tersendat akibat koneksi jaringan (label kuning) vs siswa yang sengaja keluar aplikasi (label merah).

### C. Aksi Tanggap Pengawas (Remote Unlock, Extra Time, & Freeze Timer)
* **Buka Kunci Jarak Jauh (Remote Unlock)**:
  * Guru pengawas cukup menekan tombol **"Buka Kunci Siswa"** dari layar pengawas untuk mengirimkan sinyal websocket/realtime ke HP siswa membuka kembali lembar ujian seketika.
* **Penambahan Waktu Individual (+Extra Time)**:
  * Tombol cepat **"+ Waktu"** (+5, +10, +15 menit) khusus per siswa untuk mengompensasi kendala teknis (misal HP mati atau ganti perangkat di tengah ujian).
  * Terkoneksi langsung ke database dan sinyal realtime (lihat Bagian 8A & 8E).
* **Pembekuan Timer Global Seluruh Sesi Aktif (*Global Freeze Timer*)**:
  * Tombol darurat di panel Admin untuk membekukan hitung mundur seluruh siswa satu sekolah serentak jika terjadi kendala teknis global (misal listrik/Wi-Fi pusat padam).
  * Mengeksekusi RPC `cbt_freeze_all_active_sessions` dan `cbt_unfreeze_all_sessions` yang secara otomatis menggeser jam tutup seluruh sesi aktif sebanding durasi padam (lihat Bagian 8B).

---

## 5. PORTAL PENILAIAN SISWA & LEMBAR UJIAN (ASSESSMENT HUB, ANBK, & STRIKE CERDAS)

### A. Beranda Portal Penilaian Siswa (Student Assessment Hub)
Ketika siswa mengklik menu **"Penilaian / CBT"** di bilah navigasi (sidebar) atau dashboard eBudimulia, siswa **TIDAK LANGSUNG** dihadapkan pada kotak isian token kosong. Pendekatan langsung meminta token sering kali membuat siswa bingung mengenai ujian apa yang harus dikerjakan, berapa durasinya, dan bagaimana melihat hasil penilaian yang lalu.

Sebagai gantinya, siswa disambut oleh **Portal Penilaian Siswa (`SiswaCbtPortalSection.jsx`)** yang komprehensif, modern, dan selaras dengan tema eBudimulia (`data-theme`), dilengkapi 3 Tab Navigasi Utama dan Banner Kesiapan Perangkat:

#### 1. Widget Kesiapan Perangkat (*Pre-Exam Readiness Checklist*)
Terletak di bagian paling atas portal sebelum siswa memilih ujian:
* 🔋 **Indikator Daya Baterai**: Membaca *Web Battery API* perangkat siswa. Memberikan rekomendasi hijau jika daya $\ge 50\%$, dan peringatan oranye/merah jika baterai $< 20\%$ untuk segera menghubungkan pengisi daya (*charger*) sebelum ujian dimulai.
* 📶 **Indikator Jaringan Wi-Fi / Internet**: Melakukan ping ringan secara berkala ke Supabase. Memberikan umpan balik latency (Hijau: $< 100\text{ ms}$, Kuning: $100\text{--}300\text{ ms}$, Merah: Terputus / Tidak Stabil).
* 🛡️ **Ringkasan Tata Tertib Digital**: Mengingatkan siswa secara visual mengenai aturan anti-curang 3-strike (maksimal 3 kali keluar jendela/aplikasi sebelum lembar ujian terkunci otomatis), larangan mode *split-screen*, serta petunjuk melambaikan tangan ke pengawas jika mengalami kendala teknis.

#### 2. Tab 1: "Ujian Hari Ini / Siap Dikerjakan" (*Active Sessions*)
Menampilkan kartu-kartu sesi ujian yang aktif pada hari ini khusus untuk kelas siswa tersebut (`siswa.kelas = ANY(s.kelas_ids)`):
* **Detail Informasi pada Kartu Ujian**:
  * Ikon & Nama Mata Pelajaran (misal: *Matematika*, *Ilmu Pengetahuan Alam*).
  * Judul & Topik Penilaian (misal: *Sumatif Tengah Semester Ganjil - Aljabar & Geometri*).
  * Nama Guru Pengampu mata pelajaran.
  * Rentang Waktu Akses (misal: *07.30 - 09.30 WIB*).
  * Alokasi Durasi Pengerjaan (misal: *90 Menit*).
  * Target Ketuntasan / KKM-KKTP (misal: *KKTP: 75.00*).
  * Jumlah Butir Soal & Tipe Soal (misal: *30 Soal - PG, PG Kompleks, Isian*).
* **Logika Dinamis Tombol Aksi**:
  * ⏳ **"Belum Dibuka"** *(Badge Countdown)*: Jika waktu server belum mencapai `waktu_buka`. Menampilkan hitung mundur waktu (contoh: *Dimulai dalam 15 menit*). Tombol dinonaktifkan (*disabled*).
  * 🟢 **"Mulai Ujian"** *(Aktif)*: Jika waktu sekarang berada di dalam jendela pengerjaan. Mengklik tombol ini akan memunculkan **Modal Konfirmasi Ujian & Input Token**.
  * 🟡 **"Lanjutkan Ujian"** *(Resume State)*: Jika siswa sebelumnya sudah memulai ujian dan statusnya masih `'sedang_mengerjakan'` (misalnya akibat browser ter-refresh atau HP mati mendadak lalu menyala kembali). Tombol otomatis mengarahkan siswa langsung ke nomor soal terakhir **tanpa perlu menginput ulang token**.
  * 🔒 **"Waktu Habis / Ditutup"**: Jika jam dinding telah melewati `waktu_tutup`. Tombol terkunci dengan keterangan *Ujian telah ditutup*.

#### 3. Tab 2: "Jadwal Penilaian Mendatang" (*Upcoming Schedule*)
Menampilkan kalender dan daftar agenda penilaian di hari-hari mendatang yang sudah dijadwalkan oleh para guru untuk kelas siswa:
* Menampilkan: Hari & Tanggal Pelaksanaan, Jam Masuk, Durasi, Mata Pelajaran, Guru Pengampu, dan Topik / Kisi-Kisi Ringkas yang dicantumkan guru.
* Memberikan kepastian jadwal belajar mandiri bagi siswa di rumah dan memudahkan orang tua memantau kalender asesmen sekolah.
* Dilengkapi badge penghitung hari (misal: *2 Hari Lagi*, *Pekan Depan*).

#### 4. Tab 3: "Riwayat & Hasil Penilaian" (*Past Exam History & Results*)
Menampilkan arsip seluruh penilaian yang telah selesai dikerjakan oleh siswa di masa lampau:
* **Detail Riwayat**: Tanggal pengerjaan, judul ujian, guru pengampu, waktu selesai, dan durasi pengerjaan aktual siswa.
* **Transparansi Nilai yang Adaptif terhadap Kebijakan Guru**:
  * **Skenario A - Nilai Diumumkan Langsung (`is_nilai_shared = true` atau `tampilkan_nilai = 'instan'`)**:
    * Menampilkan Nilai / Skor Akhir Siswa (misal: **88.00 / 100**).
    * Badge Ketercapaian: 🟢 **Tuntas (Melampaui KKTP)** atau 🟠 **Perlu Remedial**.
    * Statistik butir soal: Jumlah jawaban benar, salah, dan ragu-ragu.
  * **Skenario B - Nilai Ditahan Guru (`is_nilai_shared = false` / `tampilkan_nilai = 'manual'`)**:
    * Menampilkan badge informatif: ⏳ **"Menunggu Pengumuman Guru"**.
    * Dilengkapi pesan keterangan: *"Nilai sedang direkap dan direviu oleh guru mata pelajaran. Hasil resmi akan dipublikasikan serentak setelah seluruh kelas menyelesaikan penilaian."*
* **Fitur "Lihat Pembahasan & Evaluasi" (Tombol Review Kunci)**:
  * Jika guru mengaktifkan saklar `tampilkan_kunci = true`:
    * Tombol 📖 **"Lihat Pembahasan"** akan aktif. Siswa dapat membuka kembali lembar review interaktif untuk melihat butir mana yang salah dijawab, opsi jawaban yang benar, serta penjelasan konsep / rubrik yang ditulis guru untuk bahan refleksi belajar.
  * Jika guru mematikan `tampilkan_kunci = false`:
    * Tombol pembahasan disembunyikan untuk menjaga kerahasiaan bank soal sekolah.

---

### B. Modal Konfirmasi & Penginputan Token Ruang Ujian
Ketika siswa mengklik tombol 🟢 **"Mulai Ujian"** pada salah satu kartu di Tab Ujian Hari Ini, aplikasi memunculkan **Modal Konfirmasi & Token (`SiswaCbtTokenModal.jsx`)**:
1. **Verifikasi Identitas & Ringkasan Aturan**:
   * Menampilkan nama siswa, NISN, kelas, nama mata pelajaran, dan durasi.
   * Siswa mencentang pakta kejujuran: *"Saya menyatakan akan mengerjakan ujian ini secara mandiri dan jujur tanpa bantuan pihak lain."*
2. **Input Box Token Ruang (*Scoped Token*)**:
   * Kotak input 6 karakter dengan huruf kapital otomatis (*uppercase* dan *auto-spaced font-mono*).
   * Token ruang didistribusikan oleh pengawas di papan tulis kelas fisik (contoh: `7A-K8X`).
3. **Verifikasi Aman via RPC `cbt_start_exam`**:
   * Menekan tombol "Masuk Lembar Ujian" akan mengeksekusi RPC `cbt_start_exam(p_sesi_id, p_token)`.
   * Sistem memverifikasi token sesuai kelas siswa, mencatat `waktu_mulai`, mengubah status menjadi `'sedang_mengerjakan'`, dan mengunci layar ke mode *Fullscreen Immersive* (`CbtUjianSiswaPage.jsx`).
   * Jika token salah, counter `token_attempts` bertambah. Jika gagal 3 kali berturut-turut, sistem mengunci input selama 5 menit untuk menangkis *brute-force attack*.

---

### C. Arsitektur Local-First UI + Batch Heartbeat Sync
1. **Interaksi UI Tanpa Delay Network (Optimistic Local-First)**:
   * Setiap kali siswa memilih opsi jawaban atau berpindah nomor, data **langsung tercatat instan di memori lokal (IndexedDB)** tanpa menunggu respons server. Siswa merasakan pengalaman pengerjaan yang sangat mulus dan bebas hambatan.
2. **Periodic Batch Sync (Debouncing 15–30 Detik)**:
   * Di latar belakang, aplikasi mengirim delta jawaban ke Supabase secara berkala setiap **15–30 detik sekali** (menggunakan teknik *debouncing*) untuk mencegah penumpukan koneksi (*connection exhaustion*) pada 500+ siswa serentak.
   * `Payload: { nisn, sesi_id, delta_jawaban, nomor_terakhir, status_baterai, status_koneksi }`
   * **Jaring Pengaman Perangkat Rusak**: Jika HP siswa mendadak mati / kehabisan baterai di tengah ujian, siswa dapat login dari HP cadangan sekolah, dan seluruh jawaban terakhirnya **sudah aman tersimpan di cloud** dari snapshot terakhir.

### D. Navigasi Nomor Soal & Tombol "Ragu-Ragu" (Standar ANBK)
Mengadopsi standar navigasi yang akrab bagi siswa SMP:
1. **Palet Warna Indikator Nomor Soal**:
   * ⬜ **Putih / Abu-abu**: Soal belum dijawab.
   * 🟩 **Hijau**: Soal sudah dijawab mantap.
   * 🟨 **Kuning**: Soal sudah dijawab namun ditandai **Ragu-Ragu**.
2. **Tombol Checkbox `[✓] Ragu-Ragu`**:
   * Terletak tepat di sebelah tombol navigasi *Sebelumnya / Selanjutnya*.
   * Menyimpan status boolean `is_ragu` di memori lokal dan database (`cbt_jawaban_siswa.is_ragu`).
   * Jawaban pada nomor kuning **tetap dihitung nilainya** saat submit final, warna kuning semata-mata memudahkan siswa melihat nomor yang masih ingin diperiksa ulang sebelum mengakhiri ujian.

### E. Alur & Spesifikasi Teknis Penyerahan Darurat (Emergency QR Code Scan)
Jika saat menekan tombol "Selesai & Kumpulkan" terjadi pemadaman Wi-Fi total di sekolah:
1. Sistem melakukan *auto-retry* di latar belakang sebanyak 5 kali.
2. Jika seluruh percobaan gagal, sistem **tidak menampilkan error menyeramkan**, melainkan mengalihkan layar siswa ke **Modal Lembar Jawaban Darurat (QR Code)**.
3. **Spesifikasi Enkripsi & Kompresi QR Code**:
   * **Struktur Data Minimalis**:
     `Payload = { s: sesi_id, n: nisn, t: timestamp, a: { [soal_id]: jawaban } }`
   * **Kompresi**: Dikonversi menjadi biner terkompresi menggunakan algoritma **Gzip / Deflate** (`pako.js`).
   * **Enkripsi**: Dienkripsi menggunakan algoritma **AES-256-GCM** dengan public salt dan Session Secret Key milik Admin/Proktor.
   * **Ukuran Output**: Untuk 50 butir soal pilihan ganda, string terenkripsi berukuran **hanya ~250 s.d. 350 byte**. Sangat mudah dipindai oleh kamera HP pengawas dalam waktu < 0.5 detik pada standar koreksi kesalahan QR Level-M.
4. **Penanganan Jawaban Essay Panjang pada Mode Darurat**:
   * Untuk mencegah ukuran QR membengkak melewati kapasitas ideal (< 2 KB), QR Code **hanya menampung butir soal otomatis (PG, PG Kompleks, Benar-Salah, Menjodohkan, dan Isian Singkat)** untuk mengamankan nilai seketika.
   * Jawaban essay panjang disimpan ke file lokal terenkripsi di folder download HP siswa (`jawaban_essay_[nisn].ebm`) atau jika Wi-Fi mati permanen hingga jam selesai, siswa menyalin jawaban essay ke lembar kertas buram berparaf pengawas.
5. **Alur Eksekusi Scan Admin via RPC**:
   * Admin/Proktor membuka menu **"Scan Lembar Jawaban Darurat"** di HP/Laptop Admin.
   * Admin memindai QR Code di layar HP siswa.
   * Aplikasi admin mendekripsi payload dan mengeksekusi RPC `cbt_submit_emergency_answers(p_peserta_id, p_answers)` dengan otorisasi role pengawas.
   * Sistem otomatis menyimpan jawaban, menjalankan penilaian, dan layar siswa menerima konfirmasi tanda terima resmi.

### F. Keamanan Mutlak: Zero-Trust Pemisahan Kunci Jawaban & Skor
* **Pemisahan Total Tabel Kunci Jawaban (`cbt_soal_kunci`)**:
  * Tabel `cbt_soal` hanya memuat konten pertanyaan tanpa kunci/rubrik.
  * Kunci jawaban dipisahkan ke tabel `cbt_soal_kunci` yang **DITUTUP TOTAL (Zero Policy)** dari akses anon maupun authenticated. Hanya bisa dibaca oleh `service_role` di backend scoring RPC.
* **Pemisahan Skor dari Input Siswa (`cbt_penilaian_jawaban`)**:
  * Tabel `cbt_jawaban_siswa` murni menampung input siswa (`jawaban_terpilih`, `is_ragu`). Tidak ada kolom `skor` atau `is_correct` di tabel ini!
  * Siswa hanya diizinkan mengupdate `cbt_jawaban_siswa` selama status ujiannya masih `'sedang_mengerjakan'`.
  * Seluruh perhitungan nilai (`skor`, `is_correct`) disimpan di tabel terpisah: **`cbt_penilaian_jawaban`** yang hanya dapat ditulis oleh database scoring engine.
  * Siswa secara teknis **TIDAK BISA MEMANIPULASI SKOR SENDIRI** melalui REST API.

### G. Proteksi Anti-Curang Bertingkat yang Cerdas (Strike System Adaptif)
Sistem membedakan antara **gangguan jaringan** dengan **kesengajaan membuka aplikasi lain**:
1. **Pengecualian Status Offline**:
   * Jika jendela kehilangan fokus (*blur_window*) saat status koneksi terputus (`navigator.onLine === false` atau heartbeat gagal kirim), sistem menandainya sebagai `SUSPENDED_OFFLINE` dan **TIDAK MENGURANGI KUOTA STRIKE**. Siswa jujur tidak dihukum akibat Wi-Fi sekolah yang drop.
2. **Kuota 3 Kali Strike (Hanya Saat Online / Explicit App Switch)**:
   * **Pelanggaran 1 & 2**: Layar menampilkan peringatan keras (*pop-up warning*): *"Anda terdeteksi keluar dari aplikasi. Kesempatan tersisa: X kali"*. Siswa diberikan waktu 5 detik (*grace period*) untuk kembali ke layar ujian.
   * **Pelanggaran 3**: Lembar ujian otomatis **TERKUNCI PERMANEN** 🔒 dan memerlukan *Remote Unlock* dari Pengawas Ruang.
3. **Pencegahan Bypass Submit saat Terkunci**:
   * Siswa yang berstatus `'terkunci'` **dilarang memanggil RPC submit**. Fungsi `cbt_submit_exam` memverifikasi status dan menolak eksekusi submit sampai pengawas melakukan *Remote Unlock*.
4. **Tombol "Reset Kuota Strike" Pengawas**:
   * Jika terjadi kendala jaringan massal di satu ruangan yang sempat memicu peringatan, pengawas dapat mereset kuota strike siswa dari layar monitor proktor.

| Fitur Proteksi | Android Native (Capacitor AAB) | iOS (PWA Standalone) | Web Desktop (Chrome/Edge) |
| :--- | :---: | :---: | :---: |
| **Anti-Screenshot & Layar Hitam** | ✅ **Aktif Penuh** (`FLAG_SECURE`) | ❌ *Tidak didukung iOS PWA* | ❌ *Tidak didukung browser* |
| **Kunci Tombol Hardware Back / Gestur** | ✅ **Mati Total** (Capacitor Back Listener) | ✅ **Kaku** (CSS Touch-Action) | ✅ **Mati** (History Trap API) |
| **Kunci Layar Penuh (Force Fullscreen)** | ✅ Immersive Sticky Mode | ✅ Standalone Mode (Tanpa URL Bar) | ✅ HTML5 Fullscreen API Lock |
| **Deteksi Pindah Tab / Buka Aplikasi Lain** | ✅ `appStateChange` Native Listener | ✅ Page Visibility API + Blur | ✅ `visibilitychange` + Window Blur |
| **Blokir Klik Kanan, Blok Teks, & Copy-Paste** | ✅ Mati Total | ✅ Mati Total (`user-select: none`) | ✅ Mati Total (Event PreventDefault) |
| **Strike Cerdas (Abaikan Offline)** | ✅ Kuota 3 Strike (Grace 5s) | ✅ Kuota 3 Strike (Grace 5s) | ✅ Kuota 3 Strike (Grace 5s) |

---

## 6. AKOMODASI KHUSUS SISWA INKLUSI (ABK) & UJIAN SUSULAN

Memenuhi standar regulasi pendidikan formal sekolah:

### A. Akomodasi Siswa Berkebutuhan Khusus (ABK / Inklusi)
Diatur khusus oleh guru per siswa pada profil peserta ujian:
1. **Ekstra Waktu Otomatis**: Penambahan durasi personal (misal: +15 menit atau +30 menit dari waktu reguler), terintegrasi ke formula perpanjangan jam tutup (Bagian 1C).
2. **Skalabilitas Teks Khusus**: Pilihan ukuran huruf hingga *Extra Large* (A+++) untuk siswa *low-vision*.
3. **Mode Kontras Tinggi (*High Contrast Mode*)**: Tampilan latar belakang hitam pekat dengan teks kuning terang untuk kemudahan membaca.
4. **Dukungan Text-to-Speech (TTS)**: Tombol pemutar suara untuk membacakan teks soal bagi siswa yang mengalami kesulitan membaca mandiri.

### B. Alur Formal Ujian Susulan & Remedial Terarah
1. **Sesi Susulan & Remedial Terarah (Multi-Select Siswa)**:
   * Guru dapat membuka sesi ujian khusus yang ditargetkan hanya kepada **siswa tertentu** (menggunakan *multi-select* siswa) tanpa harus membuat sesi baru untuk satu kelas penuh.
   * Terhubung langsung dengan data absensi eBudimulia: sistem menampilkan daftar siswa yang tercatat berhalangan hadir (Sakit / Izin) pada hari H ujian utama.
2. **Pilihan Paket Soal Paralel (Paket B)**:
   * Guru dapat menggunakan Bank Soal yang sama atau menautkan **Paket Soal B** (soal paralel setara) agar siswa susulan tidak mendapat soal yang sudah dibocorkan teman sekelasnya.
3. **Jadwal & Token Khusus**: Sesi susulan memiliki token dan jendela waktu tersendiri.

---

## 7. KOREKSI OTOMATIS, PENSKORAN PARSIAL PG KOMPLEKS, ANALISIS CP/TP, & INTEGRASI RAPOR

### A. Skema Penskoran PG Kompleks (Pilihan Guru)
Untuk soal Pilihan Ganda Kompleks (jawaban benar lebih dari satu), guru dapat memilih metode penskoran pada pengaturan sesi ujian:
1. **Skor Parsial Proporsional (Rekomendasi Kurikulum Merdeka & ANBK)**:
   Siswa yang menjawab sebagian opsi benar tetap memperoleh poin yang adil, dengan pengurangan poin untuk opsi salah yang dipilih:
   $$\text{Skor} = \max\left(0, \frac{\text{Jumlah Benar Dipilih}}{\text{Total Opsi Benar}} - \frac{\text{Jumlah Salah Dipilih}}{\text{Total Opsi Salah}}\right) \times \text{Bobot}$$
   * *Implementasi Nyata*: Dijalankan secara otomatis oleh logika PL/pgSQL di dalam RPC `cbt_submit_exam` dan `cbt_submit_emergency_answers`.
   * *Contoh Soal (Bobot 3, Kunci: A & C)*:
     * Siswa memilih `[A, C]` $\rightarrow$ Skor penuh: **3.0**.
     * Siswa hanya memilih `[A]` $\rightarrow$ Mendapat separuh nilai: **1.5**.
     * Siswa memilih `[A, C, D]` (2 benar, 1 salah) $\rightarrow$ Poin parsial: $3 \times (2/2 - 1/2) =$ **1.5**.
     * Siswa memilih `[B, D]` (semua salah) $\rightarrow$ **0.0** (tidak ada minus di bawah 0).
2. **All-or-Nothing (Ketepatan Mutlak)**:
   Siswa hanya memperoleh skor penuh jika mencentang seluruh opsi benar secara presisi tanpa kurang dan tanpa lebih; selain itu mendapat skor 0.

### B. Koreksi Cepat Server-Side & Uraian Terpadu
* **Pilihan Ganda, Benar-Salah, & Menjodohkan**: Dikoreksi otomatis oleh backend Supabase saat submit dalam waktu < 0,1 detik.
* **Koreksi Uraian / Essay Terpadu**:
  * Guru memeriksa essay per butir soal berdampingan dengan rubrik penilaian.
  * Perubahan skor essay dicatat otomatis ke tabel `cbt_audit_nilai`.

### C. Analisis Butir Soal Terpetakan ke Capaian Pembelajaran (CP & TP)
Analisis terhubung langsung ke Kurikulum Merdeka:
* **Pemetaan TP (Tujuan Pembelajaran)**:
  * *"TP-1.1 (Memahami Aljabar): Ketuntasan Kelas 88% (Tuntas)"*
  * *"TP-1.2 (Menyelesaikan SPLDV): Ketuntasan Kelas 42% (Perlu Remedial Klasikal)"*
* **Tingkat Kesukaran & Daya Pembeda**: Mengklasifikasikan butir soal yang valid, terlalu mudah, terlalu sulit, atau memiliki distraktor yang tidak berfungsi.

### D. Ekspor Berkas Arsip Fisik & Integrasi Rapor 1-Klik
1. **Berita Acara Ujian (BAU) & Rekap Excel**: Siap cetak PDF resmi kop SMP Budi Mulia dan ekspor `.xlsx` matriks perolehan skor.
2. **Integrasi 1-Klik ke Nilai Rapor**: Guru mengklik *"Salin Nilai ke Rapor eBudimulia"* langsung ke komponen target di [NilaiGuruSection.jsx](file:///Users/anselmusmediarigestawan/Project%20Apps/eBudimulia/src/components/NilaiGuruSection.jsx).

---

## 8. KETAHANAN SISTEM & PENANGANAN SKENARIO LAPANGAN (REVISI V1.1)

### A. Penambahan Waktu Individual (+Extra Time) & Hubungannya dengan Server Drift
Ketika Admin atau Pengawas Ruang memberikan tambahan waktu (+5, +10, +15 menit) kepada siswa tertentu:
1. **Pencatatan Database**: Nilai disimpan di kolom `extra_waktu_menit` pada tabel `cbt_peserta_ujian` (contoh: `extra_waktu_menit = extra_waktu_menit + 10`).
2. **Sinyal Realtime Reaktif**: Supabase Realtime memancarkan event `EXTRA_TIME_GRANTED` ke channel HP siswa.
3. **Pembaruan Timer Live**: Timer di layar HP siswa otomatis bertambah secara langsung tanpa perlu me-refresh aplikasi.
4. **Perhitungan Anti-Manipulasi Jam HP (*Server Drift Sync*)**:
   Hitung mundur siswa dikunci menggunakan patokan waktu server:
   $$\text{Sisa Detik} = \Big(\text{Waktu Mulai} + (\text{Durasi Standar} + \text{extra\_waktu\_menit}) \times 60\Big) - \text{Jam Server}$$
   * **Hasilnya**: Jika siswa berusaha memundurkan jam pada pengaturan HP-nya, sisa waktu **tidak akan berubah**, karena patokan durasi dan waktu akhir terverifikasi dari nilai `extra_waktu_menit` resmi di database server.

### B. Sinkronisasi Global Freeze Multi-Sesi vs Jam Tutup Sesi
Saat terjadi pemadaman listrik/Wi-Fi massal di mana terdapat banyak sesi ujian aktif sekaligus (misal kelas 7 Matematika dan kelas 8 IPA di jam yang sama):
1. Admin menekan **"Bekukan Seluruh Sesi Ujian (Global Freeze)"**:
   * Sistem mengeksekusi RPC `cbt_freeze_all_active_sessions`:
     ```sql
     UPDATE public.cbt_sesi_ujian 
     SET freeze_started_at = now(), status = 'beku' 
     WHERE status = 'aktif';
     ```
   * Seluruh sesi aktif di seluruh kelas dan mapel serentak dibekukan. Timer seluruh siswa terkunci di detik terakhir.
2. Saat jaringan normal kembali dan Admin menekan **"Lanjutkan Seluruh Ujian (Unfreeze)"**:
   * Sistem mengeksekusi RPC `cbt_unfreeze_all_sessions`:
     ```sql
     UPDATE public.cbt_sesi_ujian 
     SET waktu_tutup = waktu_tutup + (now() - freeze_started_at),
         freeze_started_at = NULL,
         status = 'aktif'
     WHERE status = 'beku';
     ```
   * **Kepastian Operasional**: Seluruh sesi aktif otomatis dimundurkan jam tutupnya sebesar durasi padam secara adil dan proporsional. Tidak ada siswa yang terkunci oleh jam dinding wall-clock lama!

---

## 9. SKEMA LENGKAP DATABASE CBT (ZERO-TRUST DDL, RLS POLICIES, TRIGGER, & RPC PRODUCTION)

Semua tabel CBT dikelompokkan dengan prefix `cbt_*` agar terisolasi sempurna dari tabel lama sekolah:

```sql
-- 1. BANK SOAL
CREATE TABLE public.cbt_bank_soal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guru_id UUID NOT NULL,
    mapel VARCHAR(100) NOT NULL,
    judul VARCHAR(255) NOT NULL,
    tingkat VARCHAR(10) NOT NULL, -- '7', '8', '9'
    is_locked BOOLEAN DEFAULT false NOT NULL, -- Kunci aktif saat sesi berstatus 'aktif'
    version INT DEFAULT 1 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. BUTIR SOAL (KONTEN PUBLIK SISWA - ZERO KUNCI JAWABAN)
CREATE TABLE public.cbt_soal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_soal_id UUID NOT NULL REFERENCES public.cbt_bank_soal(id) ON DELETE CASCADE,
    nomor_urut INT NOT NULL,
    tipe_soal VARCHAR(30) DEFAULT 'PG' NOT NULL, -- 'PG', 'PG_KOMPLEKS', 'BENAR_SALAH', 'MENJODOHKAN', 'ISIAN', 'ESSAY'
    stimulus TEXT, -- Wacana / Teks bacaan panjang
    konten_soal TEXT NOT NULL,
    opsi_jawaban JSONB, -- Array pilihan [{label: 'A', text: '...'}, ...] atau data pasangan/pernyataan
    bobot NUMERIC(4,2) DEFAULT 1.0 NOT NULL,
    gambar_urls TEXT[], -- URL gambar terunggah
    tp_kode VARCHAR(50), -- Kurikulum Merdeka Tujuan Pembelajaran
    content_hash VARCHAR(64), -- MD5 hash untuk deteksi duplikasi lintas bank soal
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX idx_cbt_soal_bank ON public.cbt_soal(bank_soal_id, nomor_urut);
CREATE INDEX idx_cbt_soal_hash ON public.cbt_soal(content_hash);

-- 3. KUNCI JAWABAN & RUBRIK (TERISOLASI TOTAL - ZERO ACCESS UNTUK CLIENT)
CREATE TABLE public.cbt_soal_kunci (
    soal_id UUID PRIMARY KEY REFERENCES public.cbt_soal(id) ON DELETE CASCADE,
    kunci_jawaban TEXT NOT NULL, -- 'B', 'A,C', atau format pasangan JSON
    rubrik TEXT,
    pembahasan TEXT,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. SESI UJIAN
CREATE TABLE public.cbt_sesi_ujian (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_soal_id UUID NOT NULL REFERENCES public.cbt_bank_soal(id) ON DELETE RESTRICT,
    judul VARCHAR(255) NOT NULL,
    guru_id UUID NOT NULL,
    mapel VARCHAR(100) NOT NULL,
    kelas_ids TEXT[] NOT NULL, -- Array kelas: ['7A', '7B']
    kategori VARCHAR(50) NOT NULL, -- 'formatif', 'sumatif_materi', 'sas'
    waktu_buka TIMESTAMPTZ NOT NULL,
    waktu_tutup TIMESTAMPTZ NOT NULL,
    durasi_menit INT NOT NULL,
    kkm NUMERIC(4,2) DEFAULT 75.0 NOT NULL,
    status VARCHAR(30) DEFAULT 'draft' NOT NULL, -- 'draft', 'aktif', 'selesai', 'beku'
    skema_pg_kompleks VARCHAR(30) DEFAULT 'parsial' NOT NULL, -- 'parsial', 'all_or_nothing'
    acak_soal BOOLEAN DEFAULT false NOT NULL,
    acak_opsi BOOLEAN DEFAULT false NOT NULL,
    tampilkan_nilai VARCHAR(30) DEFAULT 'manual' NOT NULL, -- 'instan', 'manual'
    tampilkan_kunci BOOLEAN DEFAULT false NOT NULL,
    scoped_tokens JSONB DEFAULT '{}'::jsonb NOT NULL, -- {'7A': '7A-K8X', '7B': '7B-M3Q'}
    freeze_started_at TIMESTAMPTZ, -- Timestamp mulai beku
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX idx_cbt_sesi_status_waktu ON public.cbt_sesi_ujian(status, waktu_buka, waktu_tutup);

-- 5. PESERTA UJIAN (LIFECYCLE STATUS DIKENDALIKAN OLEH RPC)
CREATE TABLE public.cbt_peserta_ujian (
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
CREATE INDEX idx_cbt_peserta_lookup ON public.cbt_peserta_ujian(sesi_id, siswa_nisn, status);

-- 6. JAWABAN SISWA (MURNI INPUT SISWA - TANPA NILAI/SKOR)
CREATE TABLE public.cbt_jawaban_siswa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    peserta_id UUID NOT NULL REFERENCES public.cbt_peserta_ujian(id) ON DELETE CASCADE,
    soal_id UUID NOT NULL REFERENCES public.cbt_soal(id) ON DELETE CASCADE,
    jawaban_terpilih TEXT, -- Opsi terpilih, teks isian, atau JSON array untuk PG kompleks
    is_ragu BOOLEAN DEFAULT false NOT NULL, -- Penanda tombol kuning Ragu-Ragu
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_cbt_jawaban_peserta_soal UNIQUE (peserta_id, soal_id)
);
CREATE INDEX idx_cbt_jawaban_peserta ON public.cbt_jawaban_siswa(peserta_id);

-- 7. PENILAIAN JAWABAN SISWA (TERPISAH TOTAL DARI INPUT SISWA)
CREATE TABLE public.cbt_penilaian_jawaban (
    jawaban_id UUID PRIMARY KEY REFERENCES public.cbt_jawaban_siswa(id) ON DELETE CASCADE,
    is_correct BOOLEAN,
    skor NUMERIC(5,2) DEFAULT 0 NOT NULL,
    catatan_koreksi TEXT,
    graded_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. LOG PELANGGARAN SISWA (STRIKE SYSTEM)
CREATE TABLE public.cbt_log_pelanggaran (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    peserta_id UUID NOT NULL REFERENCES public.cbt_peserta_ujian(id) ON DELETE CASCADE,
    jenis_pelanggaran VARCHAR(50) NOT NULL, -- 'blur_window', 'exit_fullscreen', 'app_switch'
    strike_ke INT NOT NULL CHECK (strike_ke IN (1, 2, 3)),
    durasi_detik INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX idx_cbt_log_pelanggaran_peserta ON public.cbt_log_pelanggaran(peserta_id, strike_ke);

-- 9. AUDIT KOREKSI NILAI ESSAY
CREATE TABLE public.cbt_audit_nilai (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jawaban_id UUID NOT NULL REFERENCES public.cbt_jawaban_siswa(id) ON DELETE CASCADE,
    guru_id UUID NOT NULL,
    skor_lama NUMERIC(5,2),
    skor_baru NUMERIC(5,2) NOT NULL,
    catatan_koreksi TEXT,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX idx_cbt_audit_nilai_jawaban ON public.cbt_audit_nilai(jawaban_id);

-- 10. PENGATURAN GLOBAL & FITUR FLAG CBT
CREATE TABLE public.cbt_pengaturan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    akses_mode VARCHAR(30) DEFAULT 'whitelist' NOT NULL, -- 'whitelist' (hanya tester) atau 'semua' (publik)
    is_active BOOLEAN DEFAULT true NOT NULL,
    updated_by UUID,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 11. WHITELIST AKUN PENGUJI (GURU & SISWA)
CREATE TABLE public.cbt_tester_whitelist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier VARCHAR(100) NOT NULL, -- NISN siswa atau ID pengguna guru
    nama VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL, -- 'guru' atau 'siswa'
    keterangan VARCHAR(255), -- Contoh: 'Guru Uji Coba IPA', 'Siswa Kelas Simulasi 7A'
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_cbt_whitelist_identifier_role UNIQUE (identifier, role)
);
CREATE INDEX idx_cbt_whitelist_lookup ON public.cbt_tester_whitelist(identifier, role, is_active);

-- 12. AUDIT LOGS
CREATE TABLE public.cbt_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sesi_id UUID REFERENCES public.cbt_sesi_ujian(id) ON DELETE SET NULL,
    user_id UUID NOT NULL,
    action VARCHAR(100) NOT NULL,
    meta JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX idx_cbt_audit_logs_sesi ON public.cbt_audit_logs(sesi_id, created_at);

-- ========================================================
-- KEAMANAN ROW-LEVEL SECURITY (RLS) POLICIES
-- ========================================================

-- Aktifkan RLS pada seluruh tabel
ALTER TABLE public.cbt_bank_soal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_soal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_soal_kunci ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_sesi_ujian ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_peserta_ujian ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_jawaban_siswa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_penilaian_jawaban ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_log_pelanggaran ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_audit_nilai ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_pengaturan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_tester_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. TABEL KUNCI JAWABAN (cbt_soal_kunci): ZERO ACCESS untuk anon & authenticated!
-- Tidak ada CREATE POLICY untuk public/authenticated. Hanya service_role yang dapat mengakses.

-- 2. TABEL SOAL (cbt_soal): Siswa hanya bisa membaca butir soal jika terdaftar di sesi aktif
CREATE POLICY "Guru bisa kelola soal bank miliknya"
ON public.cbt_soal FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.cbt_bank_soal b WHERE b.id = cbt_soal.bank_soal_id AND b.guru_id = auth.uid()));

CREATE POLICY "Siswa bisa baca butir soal sesi aktifnya"
ON public.cbt_soal FOR SELECT TO authenticated
USING (EXISTS (
    SELECT 1 FROM public.cbt_sesi_ujian s
    JOIN public.cbt_peserta_ujian p ON p.sesi_id = s.id
    WHERE s.bank_soal_id = cbt_soal.bank_soal_id 
      AND s.status = 'aktif'
      AND p.siswa_nisn = (auth.jwt() ->> 'nisn')
));

-- 3. TABEL SESI UJIAN (cbt_sesi_ujian): Guru/Admin kelola sesi, Siswa hanya bisa SELECT sesi terdaftarnya
CREATE POLICY "Guru dan Admin kelola sesi ujian"
ON public.cbt_sesi_ujian FOR ALL TO authenticated
USING (guru_id = auth.uid() OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "Siswa lihat informasi sesi terdaftarnya dan jadwal kelasnya"
ON public.cbt_sesi_ujian FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.cbt_peserta_ujian p 
        WHERE p.sesi_id = cbt_sesi_ujian.id AND p.siswa_nisn = (auth.jwt() ->> 'nisn')
    )
    OR
    (
        status IN ('aktif', 'terjadwal', 'selesai', 'beku')
        AND (auth.jwt() ->> 'kelas') = ANY(kelas_ids)
    )
);

-- 4. TABEL PESERTA UJIAN (cbt_peserta_ujian): Siswa hanya bisa SELECT status dirinya
CREATE POLICY "Siswa baca status ujiannya sendiri"
ON public.cbt_peserta_ujian FOR SELECT TO authenticated
USING (siswa_nisn = (auth.jwt() ->> 'nisn'));

CREATE POLICY "Pengawas dan Guru kelola peserta ujian"
ON public.cbt_peserta_ujian FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.cbt_sesi_ujian s WHERE s.id = cbt_peserta_ujian.sesi_id AND (s.guru_id = auth.uid() OR (auth.jwt() ->> 'role') = 'admin')));

-- 5. TABEL JAWABAN SISWA (cbt_jawaban_siswa): Siswa INSERT/UPDATE saat status 'sedang_mengerjakan'
CREATE POLICY "Siswa baca jawabannya sendiri"
ON public.cbt_jawaban_siswa FOR SELECT TO authenticated
USING (EXISTS (
    SELECT 1 FROM public.cbt_peserta_ujian p 
    WHERE p.id = cbt_jawaban_siswa.peserta_id AND p.siswa_nisn = (auth.jwt() ->> 'nisn')
));

CREATE POLICY "Siswa simpan jawaban saat ujian aktif"
ON public.cbt_jawaban_siswa FOR INSERT TO authenticated
WITH CHECK (EXISTS (
    SELECT 1 FROM public.cbt_peserta_ujian p 
    WHERE p.id = cbt_jawaban_siswa.peserta_id 
      AND p.siswa_nisn = (auth.jwt() ->> 'nisn')
      AND p.status = 'sedang_mengerjakan'
));

CREATE POLICY "Siswa update jawaban saat ujian aktif"
ON public.cbt_jawaban_siswa FOR UPDATE TO authenticated
USING (EXISTS (
    SELECT 1 FROM public.cbt_peserta_ujian p 
    WHERE p.id = cbt_jawaban_siswa.peserta_id 
      AND p.siswa_nisn = (auth.jwt() ->> 'nisn')
      AND p.status = 'sedang_mengerjakan'
))
WITH CHECK (EXISTS (
    SELECT 1 FROM public.cbt_peserta_ujian p 
    WHERE p.id = cbt_jawaban_siswa.peserta_id 
      AND p.siswa_nisn = (auth.jwt() ->> 'nisn')
      AND p.status = 'sedang_mengerjakan'
));

-- 6. TABEL PENILAIAN JAWABAN (cbt_penilaian_jawaban): Siswa hanya bisa membaca jika nilai sudah dibagikan
CREATE POLICY "Siswa baca penilaian setelah dibagikan"
ON public.cbt_penilaian_jawaban FOR SELECT TO authenticated
USING (EXISTS (
    SELECT 1 FROM public.cbt_jawaban_siswa j
    JOIN public.cbt_peserta_ujian p ON p.id = j.peserta_id
    WHERE j.id = cbt_penilaian_jawaban.jawaban_id 
      AND p.siswa_nisn = (auth.jwt() ->> 'nisn')
      AND p.is_nilai_shared = true
));

CREATE POLICY "Guru kelola penilaian jawaban"
ON public.cbt_penilaian_jawaban FOR ALL TO authenticated
USING (EXISTS (
    SELECT 1 FROM public.cbt_jawaban_siswa j
    JOIN public.cbt_peserta_ujian p ON p.id = j.peserta_id
    JOIN public.cbt_sesi_ujian s ON s.id = p.sesi_id
    WHERE j.id = cbt_penilaian_jawaban.jawaban_id AND (s.guru_id = auth.uid() OR (auth.jwt() ->> 'role') = 'admin')
));

-- 7. TABEL PENGATURAN, WHITELIST, AUDIT LOGS
CREATE POLICY "Admin kelola cbt_pengaturan"
ON public.cbt_pengaturan FOR ALL TO authenticated
USING ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "Semua akun bisa baca mode akses CBT"
ON public.cbt_pengaturan FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admin kelola cbt_tester_whitelist"
ON public.cbt_tester_whitelist FOR ALL TO authenticated
USING ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "Akun baca status whitelist dirinya"
ON public.cbt_tester_whitelist FOR SELECT TO authenticated
USING (identifier = (auth.jwt() ->> 'nisn') OR identifier = (auth.uid())::text);

CREATE POLICY "Admin dan Proktor baca semua audit log"
ON public.cbt_audit_logs FOR ALL TO authenticated
USING ((auth.jwt() ->> 'role') IN ('admin', 'proktor'));

CREATE POLICY "Guru hanya baca audit log sesi miliknya"
ON public.cbt_audit_logs FOR SELECT TO authenticated
USING (EXISTS (
    SELECT 1 FROM public.cbt_sesi_ujian s 
    WHERE s.id = cbt_audit_logs.sesi_id AND s.guru_id = auth.uid()
));

CREATE POLICY "Siswa insert log pelanggaran dirinya"
ON public.cbt_log_pelanggaran FOR INSERT TO authenticated
WITH CHECK (EXISTS (
    SELECT 1 FROM public.cbt_peserta_ujian p 
    WHERE p.id = cbt_log_pelanggaran.peserta_id AND p.siswa_nisn = (auth.jwt() ->> 'nisn')
));

CREATE POLICY "Guru baca log pelanggaran peserta"
ON public.cbt_log_pelanggaran FOR SELECT TO authenticated
USING (EXISTS (
    SELECT 1 FROM public.cbt_peserta_ujian p 
    JOIN public.cbt_sesi_ujian s ON s.id = p.sesi_id
    WHERE p.id = cbt_log_pelanggaran.peserta_id AND (s.guru_id = auth.uid() OR (auth.jwt() ->> 'role') = 'admin')
));

-- ========================================================
-- DATABASE TRIGGER & RPC STORED PROCEDURES
-- ========================================================

-- Trigger: Kunci Bank Soal saat Sesi 'aktif' & Cegah Reversi Status Sesi
CREATE OR REPLACE FUNCTION public.fn_cbt_sesi_status_machine()
RETURNS TRIGGER AS $$
BEGIN
    -- Cegah status aktif/selesai kembali mundur ke draft
    IF OLD.status IN ('aktif', 'selesai') AND NEW.status = 'draft' THEN
        RAISE EXCEPTION 'Pelanggaran Alur: Sesi ujian yang sudah aktif atau selesai tidak dapat dikembalikan ke status draft.';
    END IF;

    -- Kunci bank soal saat sesi aktif
    IF NEW.status = 'aktif' AND OLD.status = 'draft' THEN
        UPDATE public.cbt_bank_soal SET is_locked = true WHERE id = NEW.bank_soal_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_cbt_sesi_status
BEFORE UPDATE ON public.cbt_sesi_ujian
FOR EACH ROW EXECUTE FUNCTION public.fn_cbt_sesi_status_machine();

-- RPC 1: Verifikasi Token Masuk Ujian Siswa (Anti Brute-Force Oracle)
CREATE OR REPLACE FUNCTION public.cbt_verify_token(p_token TEXT)
RETURNS JSONB AS $$
DECLARE
    v_nisn TEXT := (auth.jwt() ->> 'nisn');
    v_peserta RECORD;
    v_expected_token TEXT;
BEGIN
    IF v_nisn IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: Token autentikasi siswa tidak ditemukan.';
    END IF;

    -- Cari peserta ujian aktif
    SELECT p.*, s.status AS sesi_status, s.waktu_buka, s.waktu_tutup, s.scoped_tokens, s.judul, s.mapel, s.durasi_menit
    INTO v_peserta
    FROM public.cbt_peserta_ujian p
    JOIN public.cbt_sesi_ujian s ON s.id = p.sesi_id
    WHERE p.siswa_nisn = v_nisn AND s.status = 'aktif'
    ORDER BY s.waktu_buka DESC LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tidak ada sesi ujian aktif yang terdaftar untuk akun Anda.';
    END IF;

    -- Cek lockout brute force
    IF v_peserta.token_locked_until IS NOT NULL AND v_peserta.token_locked_until > now() THEN
        RAISE EXCEPTION 'Akun Anda dibekukan sementara selama 5 menit karena 5x salah memasukkan token.';
    END IF;

    -- Ambil token yang cocok untuk kelas/ruang siswa
    v_expected_token := v_peserta.scoped_tokens ->> v_peserta.kelas;
    IF v_expected_token IS NULL OR UPPER(TRIM(v_expected_token)) <> UPPER(TRIM(p_token)) THEN
        -- Tambah counter gagal
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
CREATE OR REPLACE FUNCTION public.cbt_start_exam(p_peserta_id UUID, p_token TEXT)
RETURNS JSONB AS $$
DECLARE
    v_peserta RECORD;
    v_sesi RECORD;
    v_expected_token TEXT;
BEGIN
    SELECT p.*, s.status AS sesi_status, s.scoped_tokens, s.durasi_menit, s.waktu_tutup
    INTO v_peserta
    FROM public.cbt_peserta_ujian p
    JOIN public.cbt_sesi_ujian s ON s.id = p.sesi_id
    WHERE p.id = p_peserta_id AND p.siswa_nisn = (auth.jwt() ->> 'nisn');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Data peserta ujian tidak ditemukan atau bukan milik akun Anda.';
    END IF;

    -- Penolakan tegas untuk status terkunci dan selesai
    IF v_peserta.status = 'terkunci' THEN
        RAISE EXCEPTION 'Ujian Anda saat ini TERKUNCI karena pelanggaran anti-curang. Silakan hubungi Pengawas Ruang untuk Remote Unlock.';
    ELSIF v_peserta.status = 'selesai' THEN
        RAISE EXCEPTION 'Ujian Anda sudah selesai dan telah dikumpulkan.';
    END IF;

    IF v_peserta.sesi_status <> 'aktif' THEN
        RAISE EXCEPTION 'Sesi ujian belum dibuka atau sudah berakhir.';
    END IF;

    -- Validasi token
    v_expected_token := v_peserta.scoped_tokens ->> v_peserta.kelas;
    IF UPPER(TRIM(v_expected_token)) <> UPPER(TRIM(p_token)) THEN
        RAISE EXCEPTION 'Token ujian tidak cocok.';
    END IF;

    -- Jika baru pertama kali mulai
    IF v_peserta.status = 'belum_mulai' THEN
        UPDATE public.cbt_peserta_ujian
        SET status = 'sedang_mengerjakan', waktu_mulai = now()
        WHERE id = p_peserta_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'sedang_mengerjakan',
        'waktu_mulai', COALESCE(v_peserta.waktu_mulai, now()),
        'extra_waktu_menit', v_peserta.extra_waktu_menit
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- INTERNAL FUNCTION: Mesin Penskoran Otomatis (Termasuk Parsial PG Kompleks)
CREATE OR REPLACE FUNCTION public.cbt_internal_score_submission(p_peserta_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_peserta RECORD;
    v_jawaban RECORD;
    v_kunci RECORD;
    v_total_skor NUMERIC(5,2) := 0;
    v_skor_soal NUMERIC(5,2);
    v_is_correct BOOLEAN;
BEGIN
    SELECT p.*, s.skema_pg_kompleks
    INTO v_peserta
    FROM public.cbt_peserta_ujian p
    JOIN public.cbt_sesi_ujian s ON s.id = p.sesi_id
    WHERE p.id = p_peserta_id;

    FOR v_jawaban IN 
        SELECT j.*, s.tipe_soal, s.bobot, s.opsi_jawaban 
        FROM public.cbt_jawaban_siswa j 
        JOIN public.cbt_soal s ON s.id = j.soal_id 
        WHERE j.peserta_id = p_peserta_id 
    LOOP
        SELECT * INTO v_kunci FROM public.cbt_soal_kunci WHERE soal_id = v_jawaban.soal_id;
        
        IF FOUND THEN
            -- 1. Pilihan Ganda Tunggal & Isian Singkat
            IF v_jawaban.tipe_soal = 'PG' OR v_jawaban.tipe_soal = 'ISIAN' THEN
                IF UPPER(TRIM(v_jawaban.jawaban_terpilih)) = UPPER(TRIM(v_kunci.kunci_jawaban)) THEN
                    v_skor_soal := v_jawaban.bobot;
                    v_is_correct := true;
                ELSE
                    v_skor_soal := 0;
                    v_is_correct := false;
                END IF;

            -- 2. Pilihan Ganda Kompleks (Implementasi Riil Rumus Parsial Bagian 7A)
            ELSIF v_jawaban.tipe_soal = 'PG_KOMPLEKS' THEN
                DECLARE
                    v_arr_kunci TEXT[];
                    v_arr_siswa TEXT[];
                    v_item TEXT;
                    v_n_benar INT := 0;
                    v_n_salah INT := 0;
                    v_total_kunci_benar INT;
                    v_total_kunci_salah INT;
                    v_ratio NUMERIC(5,3);
                BEGIN
                    v_arr_kunci := string_to_array(replace(UPPER(v_kunci.kunci_jawaban), ' ', ''), ',');
                    v_arr_siswa := string_to_array(replace(UPPER(COALESCE(v_jawaban.jawaban_terpilih, '')), ' ', ''), ',');
                    v_total_kunci_benar := array_length(v_arr_kunci, 1);
                    
                    SELECT count(*) INTO v_total_kunci_salah FROM jsonb_array_elements(v_jawaban.opsi_jawaban);
                    v_total_kunci_salah := GREATEST(1, v_total_kunci_salah - v_total_kunci_benar);

                    FOREACH v_item IN ARRAY v_arr_siswa LOOP
                        IF v_item = ANY(v_arr_kunci) THEN
                            v_n_benar := v_n_benar + 1;
                        ELSE
                            v_n_salah := v_n_salah + 1;
                        END IF;
                    END LOOP;

                    IF v_peserta.skema_pg_kompleks = 'all_or_nothing' THEN
                        IF v_n_benar = v_total_kunci_benar AND v_n_salah = 0 THEN
                            v_skor_soal := v_jawaban.bobot;
                            v_is_correct := true;
                        ELSE
                            v_skor_soal := 0;
                            v_is_correct := false;
                        END IF;
                    ELSE
                        -- Formula Parsial Kurikulum Merdeka: max(0, (benar/kunci_benar) - (salah/kunci_salah)) * bobot
                        v_ratio := (v_n_benar::numeric / v_total_kunci_benar) - (v_n_salah::numeric / v_total_kunci_salah);
                        v_skor_soal := ROUND(GREATEST(0, v_ratio) * v_jawaban.bobot, 2);
                        v_is_correct := (v_skor_soal = v_jawaban.bobot);
                    END IF;
                END;

            -- 3. Benar-Salah & Menjodohkan
            ELSIF v_jawaban.tipe_soal = 'BENAR_SALAH' OR v_jawaban.tipe_soal = 'MENJODOHKAN' THEN
                IF UPPER(TRIM(v_jawaban.jawaban_terpilih)) = UPPER(TRIM(v_kunci.kunci_jawaban)) THEN
                    v_skor_soal := v_jawaban.bobot;
                    v_is_correct := true;
                ELSE
                    v_skor_soal := 0;
                    v_is_correct := false;
                END IF;

            -- 4. Essay (Menunggu Koreksi Guru)
            ELSE
                v_skor_soal := 0;
                v_is_correct := NULL;
            END IF;

            -- Simpan ke tabel penilaian terpisah
            INSERT INTO public.cbt_penilaian_jawaban(jawaban_id, is_correct, skor)
            VALUES (v_jawaban.id, v_is_correct, v_skor_soal)
            ON CONFLICT (jawaban_id) DO UPDATE SET is_correct = EXCLUDED.is_correct, skor = EXCLUDED.skor;

            v_total_skor := v_total_skor + v_skor_soal;
        END IF;
    END LOOP;

    -- Update total nilai akhir
    UPDATE public.cbt_peserta_ujian SET nilai_akhir = v_total_skor WHERE id = p_peserta_id;
    RETURN v_total_skor;
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

    -- Validasi status ketat: cegah bypass dari siswa yang terkunci strike 3
    IF v_peserta.status <> 'sedang_mengerjakan' THEN
        IF v_peserta.status = 'terkunci' THEN
            RAISE EXCEPTION 'Ujian tidak dapat dikumpulkan: lembar ujian Anda sedang TERKUNCI. Silakan hubungi Pengawas Ruang.';
        ELSIF v_peserta.status = 'selesai' THEN
            RAISE EXCEPTION 'Ujian ini sudah pernah dikumpulkan sebelumnya.';
        ELSE
            RAISE EXCEPTION 'Status peserta tidak valid untuk mengumpulkan ujian.';
        END IF;
    END IF;

    -- Kunci status peserta menjadi 'selesai'
    UPDATE public.cbt_peserta_ujian
    SET status = 'selesai', waktu_selesai = now()
    WHERE id = p_peserta_id;

    -- Jalankan penskoran otomatis
    v_total_skor := public.cbt_internal_score_submission(p_peserta_id);

    -- Sinkronisasi visibilitas nilai sesuai kebijakan guru pengampu
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

-- RPC 4: Submit Lembar Jawaban Darurat via Scan QR Pengawas (Admin / Proktor Only)
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
    -- Otorisasi ketat
    IF v_admin_role NOT IN ('admin', 'proktor', 'guru') THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya Pengawas atau Admin yang berhak memproses lembar jawaban darurat.';
    END IF;

    SELECT p.* INTO v_peserta FROM public.cbt_peserta_ujian p WHERE p.id = p_peserta_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Data peserta ujian tidak ditemukan.';
    END IF;

    -- Upsert jawaban siswa dari payload QR
    FOR v_soal_id_txt, v_jawaban_txt IN SELECT * FROM jsonb_each_text(p_answers) LOOP
        INSERT INTO public.cbt_jawaban_siswa(peserta_id, soal_id, jawaban_terpilih, updated_at)
        VALUES (p_peserta_id, v_soal_id_txt::uuid, v_jawaban_txt, now())
        ON CONFLICT (peserta_id, soal_id) 
        DO UPDATE SET jawaban_terpilih = EXCLUDED.jawaban_terpilih, updated_at = now();
    END LOOP;

    -- Ubah status menjadi selesai
    UPDATE public.cbt_peserta_ujian
    SET status = 'selesai', waktu_selesai = now()
    WHERE id = p_peserta_id;

    -- Jalankan penskoran otomatis
    v_total_skor := public.cbt_internal_score_submission(p_peserta_id);

    -- Log audit
    INSERT INTO public.cbt_audit_logs(user_id, action, meta)
    VALUES (auth.uid(), 'EMERGENCY_QR_SUBMISSION', jsonb_build_object(
        'peserta_id', p_peserta_id,
        'siswa_nisn', v_peserta.siswa_nisn,
        'answers_count', (SELECT count(*) FROM jsonb_each_text(p_answers)),
        'total_skor', v_total_skor,
        'timestamp', now()
    ));

    RETURN jsonb_build_object(
        'success', true,
        'peserta_id', p_peserta_id,
        'siswa_nisn', v_peserta.siswa_nisn,
        'status', 'selesai',
        'total_skor', v_total_skor
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC 5: Global Freeze Seluruh Sesi Aktif (Hanya Admin / Proktor)
CREATE OR REPLACE FUNCTION public.cbt_freeze_all_active_sessions(p_admin_id UUID)
RETURNS INT AS $$
DECLARE
    v_affected INT;
BEGIN
    IF (auth.jwt() ->> 'role') NOT IN ('admin', 'proktor') THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya Admin atau Proktor Utama yang berhak membekukan sesi ujian.';
    END IF;

    UPDATE public.cbt_sesi_ujian
    SET freeze_started_at = now(), status = 'beku'
    WHERE status = 'aktif';
    GET DIAGNOSTICS v_affected = ROW_COUNT;

    INSERT INTO public.cbt_audit_logs(user_id, action, meta)
    VALUES (p_admin_id, 'GLOBAL_FREEZE', jsonb_build_object('affected_sessions', v_affected, 'timestamp', now()));

    RETURN v_affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC 6: Global Unfreeze & Geser Jam Tutup Proporsional (Hanya Admin / Proktor)
CREATE OR REPLACE FUNCTION public.cbt_unfreeze_all_sessions(p_admin_id UUID)
RETURNS INT AS $$
DECLARE
    v_affected INT;
BEGIN
    IF (auth.jwt() ->> 'role') NOT IN ('admin', 'proktor') THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya Admin atau Proktor Utama yang berhak melanjutkan sesi ujian.';
    END IF;

    UPDATE public.cbt_sesi_ujian
    SET waktu_tutup = waktu_tutup + (now() - freeze_started_at),
        freeze_started_at = NULL,
        status = 'aktif'
    WHERE status = 'beku';
    GET DIAGNOSTICS v_affected = ROW_COUNT;

    INSERT INTO public.cbt_audit_logs(user_id, action, meta)
    VALUES (p_admin_id, 'GLOBAL_UNFREEZE', jsonb_build_object('affected_sessions', v_affected, 'timestamp', now()));

    RETURN v_affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Hak Akses Eksekusi Fungsi RPC
REVOKE EXECUTE ON FUNCTION public.cbt_verify_token(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cbt_start_exam(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cbt_submit_exam(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cbt_submit_emergency_answers(UUID, JSONB) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cbt_freeze_all_active_sessions(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cbt_unfreeze_all_sessions(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.cbt_verify_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_start_exam(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_submit_exam(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_submit_emergency_answers(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_freeze_all_active_sessions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_unfreeze_all_sessions(UUID) TO authenticated;
```

---

## 10. AUDIT LOG, MITIGASI THUNDERING HERD, KAPASITAS SUPABASE, KONTROL AKSES ADMIN, & BACKUP

Menjamin akuntabilitas legalitas nilai, ketahanan infrastruktur database, serta kesiapan darurat:

### A. Audit & Activity Log Keamanan
Setiap tindakan penting di dalam sistem dicatat ke tabel `cbt_audit_logs` dengan stempel waktu, identitas pengguna, dan detail metadata:
* Log rilis dan pergantian token ujian.
* Log tindakan guru pengawas yang membuka kunci (*remote unlock*) atau mereset kuota strike siswa.
* Log kejadian pelanggaran siswa (waktu keluar, durasi meninggalkan layar).
* Log penambahan waktu ujian individual (+Extra Time) atau pembekuan timer global (*Global Freeze*).
* Log pengumpulan jawaban darurat via QR scan pengawas.
* Log perubahan mode akses CBT (uji coba ke publik).
* Log waktu penerbitan / pembagian nilai ke siswa.

### B. Analisis Kapasitas Supabase & Strategi Sizing Hari-H Ujian
Sekolah eBudimulia saat ini menggunakan paket **Supabase Pro** dengan Compute Size **`SMALL` (2 vCPU, 2GB RAM, 90 Max Connections)**:
1. **Kapasitas Ujian Reguler (Formatif, Ulangan Harian, & PTS per Angkatan: 150–250 Siswa)**:
   * Dengan batch sync delta setiap 20–30 detik (menggunakan debouncing di client), trafik write ke Supabase hanya berkisar **8 s.d. 12 requests per detik (RPS)**.
   * Tingkat beban ini hanya mengonsumsi ~10–15% CPU dan RAM pada tier `SMALL`. Sistem berjalan sangat stabil, aman, dan responsif.
2. **Kapasitas Ujian Akbar Serentak (SAS / PAS: 500–600 Siswa Serentak Seluruh Kelas 7, 8, 9)**:
   * Saat 500+ siswa ujian serentak, trafik heartbeat sync melonjak ke **~25–35 write RPS** ditambah pembacaan realtime oleh puluhan guru pengawas.
   * **Strategi Sizing Hari-H**: Supabase mengizinkan upgrade compute instan tanpa downtime (*zero-downtime rolling update*):
     * **Rekomendasi Operasional**: Proktor menaikkan compute ke tier **`MEDIUM` (2 vCPU, 4GB RAM, 120 Max Connections)** tepat pada pekan ujian SAS/PAS (hanya sekitar 5–7 hari).
     * Biaya prorata harian hanya sekitar ~$5 (puluhan ribu rupiah).
     * Begitu pekan ujian selesai, compute di-downgrade kembali ke `SMALL`.

### C. Mitigasi Lonjakan Serentak (Thundering Herd Protection)
1. **Randomized Client-Side Jitter (0 s.d. 3 Detik)**:
   * Aplikasi menyisipkan jeda acak tak kasat mata antara 0–3000 ms sebelum mengirim request unduh paket soal. Beban puncak terdistribusi merata dan tidak memukul database di milidetik yang sama.
2. **In-Memory Question Caching**:
   * Paket soal yang sudah difinalisasi di-cache di level API/Edge Functions sehingga query database tidak diulang ratusan kali untuk paket soal yang identik.
3. **Indeks Komposit PostgreSQL**:
   * Seluruh tabel `cbt_*` dipasangi composite index pada kolom-kolom kritis: `(sesi_id, siswa_nisn)`, `(sesi_id, status)`, dan `(bank_soal_id, nomor_urut)`.

### D. Panel Kontrol Akses CBT di Admin (Whitelist Testing & Public Release Toggle)
1. **Saklar Master Akses CBT (*Master Release Toggle*)**:
   * 🔘 **Mode Uji Coba Terbatas (*Whitelist Only* - Default)**: Menu CBT disembunyikan secara global bagi siswa dan guru reguler. Hanya akun penguji yang didaftarkan yang dapat melihat menu ini.
   * 🟢 **Buka untuk Semua Guru & Siswa (*Public / General Release*)**: Sekali klik saklar ini diaktifkan oleh Admin, sistem terbuka untuk seluruh sekolah tanpa perlu rilis ulang file AAB atau build web.
2. **Manajemen Akun Terpilih (*Whitelist Manager UI*)**:
   * **Kelola Guru Penguji**: Admin memilih akun guru yang berhak mencoba membuat bank soal dan menguji jadwal ujian.
   * **Kelola Siswa Penguji**: Admin dapat memilih siswa tertentu atau memilih satu kelas simulasi (misal kelas 7A) untuk uji coba pengerjaan soal.

### E. Prosedur Mitigasi Risiko & Cadangan Pemulihan (Backup / PITR)
Sebelum penyelenggaraan ujian besar (SAS/PAS skala penuh):
1. **Point-in-Time Recovery (PITR) Supabase**:
   * Admin memastikan fitur PITR di dashboard Supabase berstatus aktif, memungkinkan database di-rollback ke detik mana pun jika terjadi *human error* fatal (misal guru tidak sengaja menghapus bank soal di tengah ujian).
2. **Snapshot Cadangan Terjadwal**:
   * Tim IT sekolah mengekspor backup snapshot data skema `cbt_*` sebelum hari-H ujian ke penyimpanan lokal aman.
3. **Simulasi Gladi Bersih Beban (*Dry-Run Testing*)**:
   * Menggunakan akun-akun whitelist di luar jam sekolah untuk menguji coba koneksi 50–100 perangkat serentak guna memverifikasi kestabilan throughput Wi-Fi sekolah dan latency server Supabase sebelum hari pelaksanaan riil.

---

## 11. SPESIFIKASI FRONTEND & HIRARKI KOMPONEN REACT eBUDIMULIA

Untuk menjamin konsistensi 100% dengan estetika eBudimulia, seluruh modul antarmuka CBT dibangun di atas stack:
* **Framework**: React (Vite) + Tailwind CSS
* **Design System**: Tipografi `'Plus Jakarta Sans'`, token warna dinamis `var(--theme-50)` s.d. `var(--theme-900)` terikat atribut `data-theme` (Indigo, Blue, Emerald, Rose, Amber, Slate).
* **Ikon**: `lucide-react`
* **Persistensi Lokal**: `idb-keyval` (IndexedDB Promise-based wrapper super ringan < 1KB)
* **Equation Renderer**: KaTeX (`katex` + CSS bawaan)
* **Word Parser**: `mammoth.js` untuk konversi dokumen bank soal `.docx`
* **QR Engine**: `qrcode.react` (Siswa QR render) & `@zxing/browser` (Admin QR scanner)

### A. Pohon & Struktur Komponen (*Component Tree*)
```text
src/
├── pages/
│   └── CbtUjianSiswaPage.jsx         # Layar ujian siswa Fullscreen Immersive (terpisah dari layout dashboard)
├── components/cbt/
│   ├── SiswaCbtPortalSection.jsx      # Assessment Hub Siswa (Tab Ujian Hari Ini, Jadwal Mendatang, Riwayat Nilai)
│   ├── SiswaCbtTokenModal.jsx         # Modal konfirmasi integritas & input token kelas
│   ├── SiswaCbtPembahasanModal.jsx    # Modal telaah butir soal & pembahasan resmi guru
│   ├── CbtNavigasiNomor.jsx           # Palet grid nomor soal ANBK (Abu-abu, Hijau, Kuning)
│   ├── CbtSoalRenderer.jsx            # Parser konten soal: KaTeX equation, zoom gambar, & input ragam soal
│   ├── CbtMonitorPengawasSection.jsx  # Layar matriks pengawas: status realtime siswa, remote unlock, extra time
│   ├── CbtBankSoalGuruSection.jsx     # Panel guru: drag-drop Word .docx, pre-flight validator, daftar bank soal
│   └── AdminCbtConfigSection.jsx      # Panel admin: toggle whitelist/public release, kelola akun tester
```

### B. Arsitektur State Management & Local-First Engine
```text
┌────────────────────────────────────────────────────────┐
│               Siswa Memilih Jawaban                    │
└──────────────────────────┬─────────────────────────────┘
                           │ 1. Instan (< 1ms)
                           ▼
┌────────────────────────────────────────────────────────┐
│         idb-keyval (IndexedDB Storage Lokal)           │
│   Key: 'cbt_jawaban_' + sesi_id + '_' + siswa_nisn     │
└──────────────────────────┬─────────────────────────────┘
                           │ 2. Background Sync (Debounce 20s)
                           ▼
┌────────────────────────────────────────────────────────┐
│     Batch Delta Sync Engine (HTTP POST / Supabase)     │
│   Payload: { delta_jawaban, nomor_terakhir, baterai }  │
└────────────────────────────────────────────────────────┘
```

### C. Wireframe Visual Antarmuka Siswa (ASCII Mockups)

#### Wireframe 1: Portal Penilaian Siswa (`SiswaCbtPortalSection.jsx`)
```text
+-----------------------------------------------------------------------------------+
|  [Logo eBudimulia]  PORTAL PENILAIAN DIGITAL (CBT)            Siswa: Rizky (7A)   |
+-----------------------------------------------------------------------------------+
|  [!] KESIAPAN UJIAN:  [🔋 Baterai: 88% Aman]  [📶 Wi-Fi: Stabil 24ms]  [🛡️ 3-Strike]  |
+-----------------------------------------------------------------------------------+
|  [ Ujian Hari Ini (1) ]   |   [ Jadwal Mendatang (3) ]   |   [ Riwayat Nilai (12) ]  |
+-----------------------------------------------------------------------------------+
|  +-----------------------------------------------------------------------------+  |
|  | [Icon MATEMATIKA]  SUMATIF TENGAH SEMESTER GANJIL            [KKTP: 75.00]   |  |
|  | Guru: Budi Santoso, S.Pd.  •  30 Soal (PG, PGK, Isian)                      |  |
|  | Waktu: Hari Ini, 07:30 - 09:30 WIB (Durasi: 90 Menit)                       |  |
|  |                                                                             |  |
|  | [🟢 Mulai Ujian (Buka Token)]                  [ Sisa Waktu Masuk: 45 Menit ] |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

#### Wireframe 2: Lembar Ujian Siswa ANBK (`CbtUjianSiswaPage.jsx`)
```text
+-----------------------------------------------------------------------------------+
| [eBM CBT] STS Matematika 7A | Sisa Waktu: [ 01:24:15 ] | [🔋 85%] [📶 Online]     |
+-----------------------------------------------------+-----------------------------+
| SOAL NO. 14 DARI 30 SOAL                            | DAFTAR NOMOR SOAL:          |
|                                                     | [ 1✓] [ 2✓] [ 3✓] [ 4✓] [ 5✓] |
| Diberikan persamaan kuadrat sebagai berikut:       | [ 6✓] [ 7✓] [ 8✓] [ 9✓] [10✓] |
| $$f(x) = 2x^2 + 4x - 6$$                            | [11✓] [12✓] [13✓] [14 ] [15?]|
| Tentukan koordinat titik puncak dari kurva tsb!     | [16 ] [17 ] [18 ] [19 ] [20 ] |
|                                                     | [21 ] [22 ] [23 ] [24 ] [25 ] |
| ( ) A. (-1, -8)                                     | [26 ] [27 ] [28 ] [29 ] [30 ] |
| ( ) B. (1, -8)                                      | --------------------------- |
| (•) C. (-1, 8)                                      | Keterangan:                 |
| ( ) D. (2, 4)                                       | [✓] Hijau : Dijawab         |
|                                                     | [?] Kuning: Ragu-Ragu       |
| [ ] Ragu-Ragu                                       | [ ] Putih : Belum Dijawab   |
| --------------------------------------------------- | --------------------------- |
| [< Sebelumnya]                 [Selanjutnya >]      | [ Selesai & Kumpulkan Ujian ]|
+-----------------------------------------------------+-----------------------------+
```

---

## 12. KONTRAK API & KONVENSI REALTIME SUPABASE

### A. Kontrak Client-Side RPC (`supabase.rpc`)

#### 1. Mulai Ujian (`cbt_start_exam`)
* **Request**:
  ```javascript
  const { data, error } = await supabase.rpc('cbt_start_exam', {
    p_sesi_id: 'd9b1c70e-1234-4567-89ab-cdef01234567',
    p_token: '7A-K8X'
  });
  ```
* **Response Sukses (JSONB)**:
  ```json
  {
    "success": true,
    "peserta_id": "a8f34bc1-...",
    "status": "sedang_mengerjakan",
    "waktu_mulai": "2026-09-15T07:35:00Z",
    "durasi_menit": 90,
    "waktu_tutup": "2026-09-15T09:30:00Z"
  }
  ```
* **Kode Error Standar**:
  * `ERR_TOKEN_INVALID`: Token tidak cocok dengan ruang/kelas siswa.
  * `ERR_TOKEN_LOCKED`: Akun terkunci 5 menit akibat 3x salah memasukkan token.
  * `ERR_OUTSIDE_WINDOW`: Sesi belum dibuka atau sudah melewati batas toleransi masuk.
  * `ERR_ALREADY_FINISHED`: Siswa sudah pernah menyelesaikan ujian ini.

#### 2. Kumpulkan Ujian (`cbt_submit_exam`)
* **Request**:
  ```javascript
  const { data, error } = await supabase.rpc('cbt_submit_exam', {
    p_peserta_id: 'a8f34bc1-...'
  });
  ```
* **Response Sukses (JSONB)**:
  ```json
  {
    "success": true,
    "status": "selesai",
    "waktu_selesai": "2026-09-15T08:55:12Z",
    "total_skor_sementara": 88.5, // NULL jika guru memilih mode 'manual' / tahan nilai
    "is_nilai_shared": true       // FALSE jika nilai ditahan guru
  }
  ```

#### 3. Remote Unlock Pengawas (`cbt_proctor_remote_unlock`)
* **Request**:
  ```javascript
  const { data, error } = await supabase.rpc('cbt_proctor_remote_unlock', {
    p_peserta_id: 'a8f34bc1-...'
  });
  ```

#### 4. Tambah Waktu Individual (`cbt_proctor_add_extra_time`)
* **Request**:
  ```javascript
  const { data, error } = await supabase.rpc('cbt_proctor_add_extra_time', {
    p_peserta_id: 'a8f34bc1-...',
    p_menit: 15
  });
  ```

### B. Konvensi Saluran Supabase Realtime
1. **Saluran Broadcast Sesi Ujian (`cbt_broadcast:sesi_{sesi_id}`)**:
   * Digunakan oleh guru pengawas untuk mengirim pengumuman darurat, notifikasi pembekuan (*global freeze*), atau permintaan refresh timer.
2. **Saluran Presence Siswa (`cbt_presence:sesi_{sesi_id}`)**:
   * Klien siswa melakukan `channel.track({ nisn, nomor_terakhir, baterai, online_at })`.
   * Layar pengawas memetakan grid kartu siswa secara dinamis tanpa membebani database dengan query polling.
3. **Saluran Privat Siswa (`cbt_private:peserta_{peserta_id}`)**:
   * Digunakan untuk menerima pesan langsung dari pengawas: notifikasi *Remote Unlock* atau penambahan *Extra Time*.

---

## 13. MATRIKS SKENARIO UJI COBA KONKRET (TEST CASES GLADI BERSIH)

Untuk memvalidasi kesiapan sebelum rilis publik, tim QA dan IT sekolah wajib menjalankan 6 skenario uji coba:

| ID | Nama Skenario | Kondisi Awal | Langkah Pengujian | Ekspektasi Hasil |
| :--- | :--- | :--- | :--- | :--- |
| **TC-01** | **Alur Ujian Normal (Happy Path)** | Sesi berstatus `aktif`, token kelas tersedia di papan tulis. | Siswa masuk portal -> Pilih Tab "Ujian Hari Ini" -> Klik "Mulai Ujian" -> Centang integritas -> Input token -> Kerjakan 30 soal -> Klik "Selesai". | Jawaban tersimpan di DB, status peserta berubah `'selesai'`, skor terhitung otomatis. Jika `tampilkan_nilai='instan'`, skor langsung tampil di Tab Riwayat. |
| **TC-02** | **Pemadaman Wi-Fi & Reconnection** | Siswa sedang mengerjakan soal nomor 10. | Putuskan koneksi Wi-Fi laptop/HP siswa selama 5 menit -> Siswa tetap lanjut menjawab nomor 11-15 -> Nyalakan kembali Wi-Fi. | UI tidak macet (*optimistic local-first via IndexedDB*), badge koneksi berubah merah lalu hijau saat online, delta jawaban nomor 11-15 tersinkronisasi otomatis tanpa ada data hilang. |
| **TC-03** | **Penyerahan Darurat via QR Code** | Siswa selesai mengerjakan seluruh soal, namun Wi-Fi sekolah padam permanen. | Siswa menekan "Kumpulkan Ujian" -> Auto-retry 5x gagal -> Muncul modal Lembar Jawaban Darurat QR -> Pengawas membuka scanner di menu Admin -> Scan QR siswa. | RPC `cbt_submit_emergency_answers` sukses dieksekusi oleh HP pengawas, status siswa berubah `'selesai'`, tanda terima resmi muncul di layar siswa. |
| **TC-04** | **Deteksi Curang & 3-Strike Lockout** | Siswa sedang di lembar ujian fullscreen. | Siswa menekan tombol Home / Alt-Tab membuka browser lain 3 kali berturut-turut. | Pelanggaran 1 & 2 memunculkan pop-up peringatan keras (grace period 5s). Pada pelanggaran ke-3, lembar ujian terkunci total 🔒. Siswa tidak bisa submit sampai pengawas melakukan *Remote Unlock*. |
| **TC-05** | **Extra Time Siswa ABK vs Jam Tutup** | Siswa ABK login pada jam 08:30, sesi tutup jam 09:00 (sisa 30 menit). Durasi ujian 60 menit + Extra Time ABK 30 menit. | Pengawas memeriksa sisa waktu pengerjaan di layar proktor dan siswa. | Sisa waktu siswa dihitung $\min(60+30, 09:00-08:30 + 30) = 60\text{ menit}$. Jam tutup khusus siswa ABK digeser otomatis sebesar extra time yang disetujui. |
| **TC-06** | **Anti Brute-Force Token Lockout** | Siswa berada di modal input token. | Siswa menebak token salah sebanyak 5 kali berturut-turut. | Sistem menolak dengan pesan lockout, tombol "Mulai" dibekukan selama 5 menit (`token_locked_until`). Percobaan ke-6 ditolak seketika oleh RPC `cbt_start_exam`. |

---

## 14. DEPLOYMENT CHECKLIST & KONFIGURASI INFRASTRUKTUR SUPABASE

Sebelum menggelar simulasi CBT skala sekolah:

### A. Konfigurasi Environment Variables (`.env`)
Pastikan variabel lingkungan terkonfigurasi dengan benar di environment hosting / build:
```bash
VITE_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
# Service role key hanya disimpan di server / Edge Functions, DILARANG dipublish di client:
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### B. Konfigurasi Supabase Storage Bucket (`cbt-assets`)
Diperlukan untuk menampung gambar diagram, grafik, dan ilustrasi soal hasil ekstraksi Word:
1. **Buat Bucket**: Masuk ke Supabase Dashboard -> **Storage** -> Buat bucket baru dengan nama **`cbt-assets`**.
2. **Pengaturan Privasi**: Jadikan bucket **Public Read** agar gambar dapat dimuat cepat oleh browser siswa melalui CDN Supabase.
3. **Storage RLS Policies**:
   ```sql
   -- Izinkan publik membaca gambar aset soal
   CREATE POLICY "Publik baca aset cbt"
   ON storage.objects FOR SELECT TO authenticated, anon
   USING (bucket_id = 'cbt-assets');

   -- Hanya Guru dan Admin yang dapat mengunggah gambar soal
   CREATE POLICY "Guru dan Admin upload aset cbt"
   ON storage.objects FOR INSERT TO authenticated
   WITH CHECK (
       bucket_id = 'cbt-assets' 
       AND (auth.jwt() ->> 'role') IN ('guru', 'admin')
   );
   ```
4. **Batas Ukuran Berkas (*File Size Limit*)**: Set maksimal **5 MB** per gambar dengan mime-type `image/png, image/jpeg, image/webp, image/svg+xml`.

### C. Urutan Eksekusi Migrasi Database (*Execution Order*)
Jalankan skrip SQL di Supabase SQL Editor dengan urutan:
1. **Ekstensi & DDL Tabel**: Jalankan DDL 10 tabel utama (Bagian 9A).
2. **Indeks Performa**: Buat seluruh indeks komposit untuk optimasi beban 500 siswa.
3. **Row-Level Security (RLS)**: Aktifkan RLS dan pasang policies per role (Bagian 9B).
4. **Trigger & Proteksi Integritas**: Pasang trigger lock bank soal dan guard jawaban siswa (Bagian 9C).
5. **Stored Functions & RPC**: Deploy `cbt_internal_score_submission`, `cbt_start_exam`, `cbt_submit_exam`, `cbt_verify_token`, `cbt_submit_emergency_answers`, dan RPC Pengawas (Bagian 9D).
6. **Inisialisasi Pengaturan**: Masukkan baris awal ke `cbt_pengaturan` dengan `is_cbt_active = false` (Mode Whitelist Only) sebelum gladi bersih dimulai.

---

*Dokumen ini merupakan panduan arsitektur final (Versi 3.0) yang menggabungkan keamanan zero-trust, portal penilaian siswa ANBK yang ramah pengguna, integrasi Kurikulum Merdeka SMP Budi Mulia, dan ketahanan infrastruktur komprehensif.*

