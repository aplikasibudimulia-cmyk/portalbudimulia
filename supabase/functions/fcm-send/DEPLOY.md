# Deploy `fcm-send` (Pengaman Push Notification Firebase)

Urutan di bawah **harus dijalankan berurutan**. Jangan rotasi/hapus kunci lama sebelum langkah 4 selesai,
karena aplikasi Android versi lama masih memakai kunci lama.

## 1. Deploy fungsi
```bash
supabase functions deploy fcm-send --no-verify-jwt
```
`--no-verify-jwt` wajib: aplikasi memakai kunci `sb_publishable_...` (bukan JWT), sama seperti fungsi `line-notify`.

## 2. Simpan kunci Firebase di Secrets (bukan di kode)
Firebase Console → Project settings → Service accounts → **Generate new private key** (unduh JSON baru), lalu:
```bash
supabase secrets set FIREBASE_SERVICE_ACCOUNT="$(cat /path/ke/file-service-account-baru.json)"
```

## 3. Uji
Fungsi dengan target palsu harus menjawab `No registered device tokens` (bukan 404/500):
```bash
curl -s -X POST "$VITE_SUPABASE_URL/functions/v1/fcm-send" \
  -H "Content-Type: application/json" -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
  -d '{"kind":"user","nisn":"__tidak_ada__","title":"uji","body":"uji"}'
```
Lalu kirim 1 notifikasi sungguhan (mis. catat poin ke akun uji) dan pastikan HP menerimanya.

## 4. Matikan kunci lama (setelah semua perangkat memakai aplikasi versi baru)
- Rilis AAB baru, tunggu mayoritas pengguna memperbarui.
- Firebase Console → Service accounts → hapus/nonaktifkan kunci lama (ID kunci lama ada di riwayat git).
- Minta pembersihan tahap akhir: hapus `src/utils/fcmSenderLegacy.js` dan kunci cadangan di
  `supabase/functions/{send-fcm-push,notify-ortu,notify-tabungan}/index.ts`.

## Catatan batasan
Fungsi ini membatasi isi pesan (panjang, tautan hanya internal `/...`, gambar hanya https) dan laju
per penerima (20/menit), tetapi **belum memverifikasi siapa pengirimnya**, karena aplikasi memakai sesi
buatan sendiri (bukan Supabase Auth). Untuk otentikasi pengirim penuh diperlukan perubahan alur login.
