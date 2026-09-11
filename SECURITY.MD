# 🛡️ RENCANA KEAMANAN SISTEM & ROADMAP PEMBARUAN (SECURITY.MD)
**Aplikasi:** eBudiMulia — Portal Sistem Informasi SMP Budi Mulia Jakarta  
**Dokumentasi Dibuat:** September 2026  
**Status Saat Ini:** Versi 1.4 (Build 5) — Aman dan Beroperasi Normal di Google Play Store  

---

## 📌 Ringkasan Status Saat Ini
Aplikasi eBudiMulia saat ini berstatus **Production** di Google Play Console dan telah memenuhi seluruh verifikasi pengembang Google Android (*meet Android developer verification requirements*).

Dokumen ini mencatat rencana mitigasi keamanan yang telah disepakati untuk dikerjakan **secara bertahap pada rilis pembaruan berikutnya (misal Versi 1.5)** tanpa mengganggu aplikasi yang sedang berjalan saat ini.

---

## 🚀 Rencana Pembaruan Utama (Akan Dikerjakan pada Update Berikutnya)

### 1. Migrasi Firebase Private Key ke Supabase Edge Function
* **Lokasi Saat Ini:** [`src/utils/fcmSender.js`](file:///Users/anselmusmediarigestawan/Project%20Apps/eBudimulia/src/utils/fcmSender.js)
* **Kondisi:**
  Saat ini, kunci privat Service Account Firebase (`private_key`) tertanam langsung di kode JavaScript klien agar aplikasi web dan Android bisa langsung menandatangani JWT Google OAuth2 dan mengirim FCM Push Notification.
* **Target Perbaikan:**
  Memindahkan proses pembuatan token JWT dan pemanggilan API FCM ke **Supabase Edge Function** (`send-fcm-push`).
* **Prinsip Perbaikan (Zero-Breaking Changes):**
  - **Fungsi Pemanggilan Tetap Sama:** Di file `src/utils/fcmSender.js`, fungsi `sendFCMPushNotification()` dan `sendFCMPushToWaliKelas()` tetap mempertahankan parameter dan keluaran yang sama persis (`{ success, sentCount }`).
  - **Tanpa Mengubah Komponen:** Halaman seperti presensi siswa, input tabungan bendahara, dan notifikasi wali kelas **tidak memerlukan perubahan kode sama sekali**.
  - **Hasil Akhir:** Kunci privat Firebase hilang dari bundel publik JavaScript dan file APK/AAB, membuat sistem 100% aman dari ancaman ekstraksi credential.

---

## 📋 Catatan Keputusan Desain & Arsitektur yang Dipertahankan

Sesuai kebutuhan operasional dan kemudahan pengguna sekolah, aspek-aspek berikut **tetap dipertahankan seperti sekarang**:

1. **Penyimpanan Akun Multi-Login (`credentialStore.js`)**:
   - **Status:** Dipertahankan.
   - **Alasan:** Memudahkan orang tua yang memiliki lebih dari satu anak bersekolah di SMP Budi Mulia untuk berpindah akun secara instan dalam 1 klik tanpa harus mengetik ulang password.

2. **Login Cepat via QR Code / Deep Link (`?u=...&p=...`)**:
   - **Status:** Dipertahankan.
   - **Alasan:** Memudahkan siswa melakukan scan kartu pelajar untuk presensi langsung tanpa kendala login manual.

3. **Otorisasi Menu Sisi Klien (Client-Side Role)**:
   - **Status:** Dipertahankan.
   - **Alasan:** Tampilan UI dan menu navigasi (Admin, BK, Guru, Siswa) sudah berjalan stabil dan sesuai peran masing-masing.

4. **Koneksi Supabase Anon Key**:
   - **Status:** Dipertahankan.
   - **Alasan:** Alur RPC (`fn_login`) dan sinkronisasi data antar modul sudah terintegrasi penuh.

---

## 🛠️ Panduan Eksekusi Saat Waktu Rilis v1.5 Tiba

Ketika Anda siap untuk merilis pembaruan aplikasi berikutnya ke Google Play Store, ikuti langkah berurutan ini:

### Langkah 1: Aktifkan Supabase Edge Function
1. Buka dashboard Supabase project Anda: `https://supabase.com/dashboard/project/ngdepacckohoxemlauhd/functions`.
2. Pastikan function `send-fcm-push` telah aktif (skrip sudah tersedia di folder repository: `supabase/functions/send-fcm-push/index.ts`).
3. Set secret environment variable di Supabase untuk `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, dan `FIREBASE_PRIVATE_KEY`.

### Langkah 2: Hubungkan `fcmSender.js` ke Edge Function
Ganti pemanggilan langsung Google API di `src/utils/fcmSender.js` menjadi pemanggilan internal Supabase:
```javascript
const { data, error } = await supabase.functions.invoke('send-fcm-push', {
  body: payload
});
```

### Langkah 3: Naikkan Versi Aplikasi & Build AAB
1. Di file `android/app/build.gradle`:
   - Naikkan `versionCode` menjadi `6`
   - Naikkan `versionName` menjadi `"1.5"`
2. Jalankan perintah build:
   ```bash
   npm run build
   npx cap sync android
   cd android && ./gradlew bundleRelease
   ```
3. Upload file `eBudimulia.aab` yang baru ke Google Play Console pada menu **Production / Produksi**.

---

*Dokumen ini dapat diperbarui sewaktu-waktu sesuai dengan kebutuhan pengembangan sistem informasi SMP Budi Mulia.*
