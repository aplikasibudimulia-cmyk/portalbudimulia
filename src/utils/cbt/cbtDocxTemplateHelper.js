/**
 * Helper untuk mengunduh Template Naskah Soal Word (.doc)
 * Format: HTML-in-.doc yang dapat dibuka dan diedit langsung di Microsoft Word / Google Docs
 * 
 * Mendukung:
 * - Rumus Equation Word (Insert > Equation / Alt +=) maupun ketik langsung (x² + y² = z²)
 * - Gambar (diagram geometri, grafik, ilustrasi)
 * - Tabel data & tabel distribusi frekuensi
 * - Seluruh ragam soal Kurikulum Merdeka (PG Tunggal, PG Kompleks, Benar/Salah, Menjodohkan, Isian, & Uraian)
 */

export const downloadSampleDocxTemplate = () => {
  // SVG diagram segitiga siku-siku pythagoras inline base64
  const segitigaSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="280" height="180" viewBox="0 0 280 180"><polygon points="30,150 230,150 230,30" fill="%23e0e7ff" stroke="%234338ca" stroke-width="3"/><rect x="210" y="130" width="20" height="20" fill="none" stroke="%234338ca" stroke-width="2"/><text x="120" y="170" font-family="sans-serif" font-size="14" font-weight="bold" fill="%231e293b">a = 8 cm</text><text x="240" y="95" font-family="sans-serif" font-size="14" font-weight="bold" fill="%231e293b">b = 6 cm</text><text x="110" y="80" font-family="sans-serif" font-size="14" font-weight="bold" fill="%234338ca">c = ?</text></svg>`

  // SVG diagram grafik kartesius fungsi kuadrat inline base64
  const grafikSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180" viewBox="0 0 300 180"><line x1="20" y1="140" x2="280" y2="140" stroke="%2364748b" stroke-width="2"/><line x1="150" y1="20" x2="150" y2="170" stroke="%2364748b" stroke-width="2"/><path d="M 50,40 Q 150,180 250,40" fill="none" stroke="%23dc2626" stroke-width="3"/><circle cx="150" cy="140" r="4" fill="%231e293b"/><circle cx="90" cy="140" r="4" fill="%232563eb"/><circle cx="210" cy="140" r="4" fill="%232563eb"/><text x="155" y="135" font-family="sans-serif" font-size="11" fill="%2364748b">0</text><text x="80" y="155" font-family="sans-serif" font-size="11" font-weight="bold" fill="%232563eb">-2</text><text x="205" y="155" font-family="sans-serif" font-size="11" font-weight="bold" fill="%232563eb">2</text><text x="285" y="145" font-family="sans-serif" font-size="12" font-weight="bold" fill="%2364748b">X</text><text x="155" y="25" font-family="sans-serif" font-size="12" font-weight="bold" fill="%2364748b">Y</text><text x="180" y="60" font-family="sans-serif" font-size="12" font-weight="bold" fill="%23dc2626">y = x² - 4</text></svg>`

  const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Template Naskah Soal CBT eBudimulia</title>
<style>
  body {
    font-family: 'Calibri', 'Segoe UI', Arial, sans-serif;
    font-size: 12pt;
    color: #1e293b;
    line-height: 1.6;
    max-width: 210mm;
    margin: 20mm auto;
    padding: 0 15mm;
  }
  h1 {
    font-size: 16pt;
    color: #1e40af;
    border-bottom: 2px solid #3b82f6;
    padding-bottom: 6px;
    margin-bottom: 8px;
  }
  h2 {
    font-size: 13pt;
    color: #1e40af;
    margin-top: 22px;
    margin-bottom: 6px;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 4px;
  }
  .info-box {
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 8px;
    padding: 12px 16px;
    margin: 12px 0;
    font-size: 10pt;
    color: #1e40af;
  }
  .warning-box {
    background: #fef9c3;
    border: 1px solid #fde68a;
    border-radius: 8px;
    padding: 12px 16px;
    margin: 12px 0;
    font-size: 10pt;
    color: #92400e;
  }
  .soal-block {
    margin: 16px 0;
    padding: 14px 18px;
    background: #f8fafc;
    border-left: 4px solid #6366f1;
    border-radius: 0 8px 8px 0;
  }
  .opsi {
    margin: 5px 0 5px 24px;
  }
  .kunci {
    color: #059669;
    font-weight: bold;
    margin-top: 6px;
  }
  .pembahasan {
    color: #64748b;
    font-style: italic;
    margin-top: 3px;
  }
  .separator {
    border: none;
    border-top: 1px dashed #cbd5e1;
    margin: 24px 0;
  }
  table.contoh {
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0;
    font-size: 11pt;
  }
  table.contoh td, table.contoh th {
    border: 1px solid #94a3b8;
    padding: 8px 12px;
    text-align: left;
  }
  table.contoh th {
    background: #e2e8f0;
    font-weight: bold;
    color: #0f172a;
  }
  code {
    background: #f1f5f9;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 10.5pt;
    color: #7c3aed;
  }
  .tag {
    display: inline-block;
    background: #eef2ff;
    color: #4338ca;
    font-weight: bold;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10pt;
    margin-right: 4px;
  }
  .footer {
    margin-top: 36px;
    padding-top: 14px;
    border-top: 1px solid #e2e8f0;
    font-size: 9pt;
    color: #94a3b8;
    text-align: center;
  }
</style>
</head>
<body>

<h1>📘 TEMPLATE NASKAH SOAL CBT eBUDIMULIA</h1>
<p style="font-size:10pt;color:#64748b;">
  Template naskah soal Kurikulum Merdeka resmi untuk sistem CBT eBudimulia SMP Budi Mulia.<br>
  Dapat diedit langsung di Microsoft Word atau Google Docs, lalu disimpan sebagai <strong>.docx</strong>.
</p>

<div class="info-box">
  <strong>📌 ATURAN FORMAT PENULISAN:</strong><br>
  • Awali setiap soal dengan angka dan titik: <code>1. Pertanyaan...</code><br>
  • Tulis opsi jawaban dengan huruf kapital: <code>A.</code>, <code>B.</code>, <code>C.</code>, <code>D.</code>, <code>E.</code><br>
  • Tulis kunci jawaban: <code>Kunci: D</code> (atau <code>Kunci: A, C</code> untuk PG Kompleks)<br>
  • Tulis pembahasan (opsional): <code>Pembahasan: penjelasan langkah pengerjaan...</code><br>
  • Tipe soal selain PG Tunggal dapat ditandai dengan tag: <span class="tag">[PGK]</span> <span class="tag">[BS]</span> <span class="tag">[JODOH]</span> <span class="tag">[ISIAN]</span> <span class="tag">[URAIAN]</span>
</div>

<div class="warning-box">
  <strong>⚡ FITUR UNGGULAN & DUKUNGAN SOAL:</strong><br>
  • <strong>Rumus & Equation:</strong> Anda bebas menggunakan menu <em>Insert → Equation (Alt +=)</em> bawaan Word, atau langsung mengetik rumus seperti <code>x² + y² = z²</code> atau pecahan <code>\frac{a}{b}</code>. Sistem otomatis membacanya <strong>tanpa wajib memakai simbol $</strong>.<br>
  • <strong>Gambar & Diagram:</strong> Sisipkan gambar langsung di Word (<em>Insert → Pictures</em>). Gambar otomatis diproses ke lembar CBT siswa.<br>
  • <strong>Tabel Data:</strong> Sisipkan tabel langsung di Word (<em>Insert → Table</em>). Tabel dipertahankan utuh dan responsif.<br>
  • <strong>Superscript & Subscript:</strong> Bebas menggunakan superscript/subscript Word seperti <code>H₂SO₄</code> atau <code>x₁ + x₂</code>.
</div>

<hr class="separator">

<!-- ========================================================================= -->
<!-- 1. CONTOH SOAL RUMUS / EQUATION BERAGAM                                   -->
<!-- ========================================================================= -->
<h2>BAGIAN 1: CONTOH SOAL RUMUS / EQUATION (MATEMATIKA & IPA)</h2>

<div class="soal-block">
<p><strong>1.</strong> Tentukan nilai x yang memenuhi persamaan pecahan aljabar berikut:</p>
<p style="margin-left:24px;font-weight:bold;color:#4338ca;">\frac{2x + 6}{x - 3} = 4</p>
<p class="opsi">A. x = 6</p>
<p class="opsi">B. x = 9</p>
<p class="opsi">C. x = 12</p>
<p class="opsi">D. x = 15</p>
<p class="kunci">Kunci: B</p>
<p class="pembahasan">Pembahasan: 2x + 6 = 4(x - 3) ➜ 2x + 6 = 4x - 12 ➜ 2x = 18 ➜ x = 9.</p>
</div>

<div class="soal-block">
<p><strong>2.</strong> Akar-akar persamaan kuadrat 2x² - 7x + 3 = 0 dapat dihitung menggunakan rumus kuadratik abc:</p>
<p style="margin-left:24px;font-weight:bold;color:#4338ca;">x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}</p>
<p>Nilai diskriminan (D = b² - 4ac) dari persamaan tersebut adalah ...</p>
<p class="opsi">A. 25</p>
<p class="opsi">B. 49</p>
<p class="opsi">C. 73</p>
<p class="opsi">D. 16</p>
<p class="kunci">Kunci: A</p>
<p class="pembahasan">Pembahasan: D = (-7)² - 4(2)(3) = 49 - 24 = 25. Karena D > 0, terdapat 2 akar riil berlainan.</p>
</div>

<div class="soal-block">
<p><strong>3.</strong> Nilai x yang memenuhi persamaan eksponen 3^(2x - 1) = 81 adalah ...</p>
<p class="opsi">A. x = 1,5</p>
<p class="opsi">B. x = 2,0</p>
<p class="opsi">C. x = 2,5</p>
<p class="opsi">D. x = 3,0</p>
<p class="kunci">Kunci: C</p>
<p class="pembahasan">Pembahasan: 3^(2x - 1) = 3^4 ➜ 2x - 1 = 4 ➜ 2x = 5 ➜ x = 2,5.</p>
</div>

<div class="soal-block">
<p><strong>4.</strong> Hasil perhitungan trigonometri dari sin(30°) · cos(60°) + tan(45°) adalah ...</p>
<p class="opsi">A. \frac{1}{4}</p>
<p class="opsi">B. \frac{3}{4}</p>
<p class="opsi">C. \frac{5}{4}</p>
<p class="opsi">D. \frac{3}{2}</p>
<p class="kunci">Kunci: C</p>
<p class="pembahasan">Pembahasan: sin(30°) = 0,5; cos(60°) = 0,5; tan(45°) = 1. Maka (0,5 × 0,5) + 1 = 0,25 + 1 = 1,25 = 5/4.</p>
</div>

<!-- ========================================================================= -->
<!-- 2. CONTOH SOAL DENGAN TABEL DATA                                         -->
<!-- ========================================================================= -->
<h2>BAGIAN 2: CONTOH SOAL DENGAN TABEL DATA & STATISTIK</h2>

<div class="soal-block">
<p><strong>5.</strong> Perhatikan tabel distribusi frekuensi nilai ulangan matematika kelas 8 berikut:</p>
<table class="contoh">
  <tr><th>Rentang Nilai</th><th>Frekuensi (Siswa)</th><th>Titik Tengah (x)</th><th>f · x</th></tr>
  <tr><td>60 - 69</td><td>4</td><td>64,5</td><td>258</td></tr>
  <tr><td>70 - 79</td><td>10</td><td>74,5</td><td>745</td></tr>
  <tr><td>80 - 89</td><td>14</td><td>84,5</td><td>1.183</td></tr>
  <tr><td>90 - 100</td><td>12</td><td>95,0</td><td>1.140</td></tr>
  <tr style="background:#f1f5f9;font-weight:bold;"><td>Total</td><td>40</td><td>-</td><td>3.326</td></tr>
</table>
<p>Berdasarkan tabel di atas, nilai rata-rata (mean) dari kelas tersebut adalah ...</p>
<p class="opsi">A. 81,15</p>
<p class="opsi">B. 83,15</p>
<p class="opsi">C. 85,25</p>
<p class="opsi">D. 87,50</p>
<p class="kunci">Kunci: B</p>
<p class="pembahasan">Pembahasan: Rata-rata = Total (f · x) / Total Frekuensi = 3.326 / 40 = 83,15.</p>
</div>

<div class="soal-block">
<p><strong>6.</strong> Tabel berikut menyajikan data percobaan laju fotosintesis Hydrilla verticillata dengan berbagai intensitas cahaya:</p>
<table class="contoh">
  <tr><th>Tabung</th><th>Jarak Lampu (cm)</th><th>Jumlah Gelembung / 5 Menit</th><th>Keterangan</th></tr>
  <tr><td>A</td><td>10 cm</td><td>85 gelembung</td><td>Sangat cepat</td></tr>
  <tr><td>B</td><td>20 cm</td><td>52 gelembung</td><td>Cepat</td></tr>
  <tr><td>C</td><td>30 cm</td><td>28 gelembung</td><td>Sedang</td></tr>
  <tr><td>D</td><td>40 cm</td><td>12 gelembung</td><td>Lambat</td></tr>
</table>
<p>Kesimpulan yang paling tepat berdasarkan data tabel percobaan tersebut adalah ...</p>
<p class="opsi">A. Semakin jauh jarak lampu, laju fotosintesis semakin meningkat</p>
<p class="opsi">B. Semakin dekat jarak sumber cahaya, laju fotosintesis semakin tinggi</p>
<p class="opsi">C. Intensitas cahaya tidak memengaruhi pembentukan gelembung oksigen</p>
<p class="opsi">D. Tabung D menghasilkan laju fotosintesis paling optimal</p>
<p class="kunci">Kunci: B</p>
<p class="pembahasan">Pembahasan: Jarak lampu yang lebih dekat menghasilkan intensitas cahaya lebih tinggi sehingga gelembung oksigen fotosintesis bertambah banyak.</p>
</div>

<!-- ========================================================================= -->
<!-- 3. CONTOH SOAL DENGAN GAMBAR / DIAGRAM                                   -->
<!-- ========================================================================= -->
<h2>BAGIAN 3: CONTOH SOAL DENGAN GAMBAR / DIAGRAM</h2>

<div class="soal-block">
<p><strong>7.</strong> Perhatikan gambar segitiga siku-siku di bawah ini:</p>
<div style="margin:10px 0;">
  <img src="${segitigaSvg}" alt="Diagram Segitiga Siku-Siku" style="max-width:280px;height:auto;border-radius:8px;border:1px solid #cbd5e1;padding:4px;" />
</div>
<p>Jika panjang sisi a = 8 cm dan sisi b = 6 cm, berapakah panjang sisi miring (c) segitiga tersebut?</p>
<p class="opsi">A. 9 cm</p>
<p class="opsi">B. 10 cm</p>
<p class="opsi">C. 12 cm</p>
<p class="opsi">D. 14 cm</p>
<p class="kunci">Kunci: B</p>
<p class="pembahasan">Pembahasan: Teorema Pythagoras: c = √(a² + b²) = √(8² + 6²) = √(64 + 36) = √100 = 10 cm.</p>
</div>

<div class="soal-block">
<p><strong>8.</strong> Perhatikan gambar grafik fungsi kuadrat berikut:</p>
<div style="margin:10px 0;">
  <img src="${grafikSvg}" alt="Grafik Fungsi Kuadrat" style="max-width:300px;height:auto;border-radius:8px;border:1px solid #cbd5e1;padding:4px;" />
</div>
<p>Titik potong grafik y = x² - 4 dengan sumbu X adalah ...</p>
<p class="opsi">A. (-2, 0) dan (2, 0)</p>
<p class="opsi">B. (0, -4) dan (0, 4)</p>
<p class="opsi">C. (-4, 0) dan (4, 0)</p>
<p class="opsi">D. (-2, 0) dan (0, -4)</p>
<p class="kunci">Kunci: A</p>
<p class="pembahasan">Pembahasan: Titik potong sumbu X terjadi saat y = 0 ➜ x² - 4 = 0 ➜ (x - 2)(x + 2) = 0 ➜ x = -2 atau x = 2. Titiknya (-2, 0) dan (2, 0).</p>
</div>

<!-- ========================================================================= -->
<!-- 4. RAGAM SOAL KURIKULUM MERDEKA LAINNYA                                   -->
<!-- ========================================================================= -->
<h2>BAGIAN 4: RAGAM TIPE SOAL KURIKULUM MERDEKA</h2>

<div class="soal-block">
<p><strong>9.</strong> [PGK] Manakah di antara pernyataan berikut yang BENAR mengenai sifat-sifat bangun datar belah ketupat? (Pilih semua yang benar)</p>
<p class="opsi">A. Keempat sisinya sama panjang</p>
<p class="opsi">B. Kedua diagonalnya saling membagi dua sama panjang dan tegak lurus</p>
<p class="opsi">C. Keempat sudutnya pasti siku-siku 90°</p>
<p class="opsi">D. Memiliki dua simetri lipat dan dua simetri putar</p>
<p class="kunci">Kunci: A, B, D</p>
<p class="pembahasan">Pembahasan: Belah ketupat memiliki 4 sisi sama panjang, diagonal berpotongan tegak lurus, dan 2 simetri. Keempat sudutnya tidak selalu 90° (jika 90° namanya persegi).</p>
</div>

<div class="soal-block">
<p><strong>10.</strong> [BS] Tentukan apakah pernyataan berikut Benar atau Salah:</p>
<p style="margin-left:24px;">"Energi kinetik suatu benda bermassa m yang bergerak dengan kecepatan v dinyatakan dengan rumus E_k = \frac{1}{2} m v²."</p>
<p class="opsi">A. Benar</p>
<p class="opsi">B. Salah</p>
<p class="kunci">Kunci: A</p>
<p class="pembahasan">Pembahasan: Rumus energi kinetik fisika mekanika klasik adalah Ek = ½ m v².</p>
</div>

<div class="soal-block">
<p><strong>11.</strong> [ISIAN] Rumus kimia untuk asam sulfat adalah ...</p>
<p class="kunci">Kunci: H2SO4</p>
<p class="pembahasan">Pembahasan: Asam sulfat memiliki rumus molekul H₂SO₄.</p>
</div>

<div class="soal-block">
<p><strong>12.</strong> [URAIAN] Jelaskan langkah-langkah pembuktian teorema Pythagoras pada segitiga siku-siku dengan panjang sisi a, b, dan hipotenusa c!</p>
<p class="kunci">Kunci: Jawaban lengkap disertai penjabaran kuadrat sisi tegak dan luas persegi.</p>
<p class="pembahasan">Pembahasan: Pembuktian dapat dilakukan dengan membuat persegi besar berukuran (a + b) dan menempatkan 4 segitiga siku-siku di dalamnya sehingga menyisakan persegi tengah berukuran c².</p>
</div>

<hr class="separator">

<h3>🔽 MULAI KETIK NASKAH SOAL ANDA DI SINI</h3>
<p style="color:#94a3b8;font-size:10pt;">
  Hapus contoh-contoh di atas atau modifikasi sesuai kebutuhan mata pelajaran Anda.<br>
  Pertahankan format <strong>1. Pertanyaan</strong>, <strong>A-D Opsi</strong>, dan <strong>Kunci: X</strong>.
</p>

<hr class="separator">

<p><strong>1.</strong> Tuliskan pertanyaan nomor satu di sini...</p>
<p class="opsi">A. Pilihan jawaban A</p>
<p class="opsi">B. Pilihan jawaban B</p>
<p class="opsi">C. Pilihan jawaban C</p>
<p class="opsi">D. Pilihan jawaban D</p>
<p class="kunci">Kunci: A</p>
<p class="pembahasan">Pembahasan: Tuliskan penjelasan atau solusi di sini (opsional).</p>

<div class="footer">
  Template Naskah Soal — Sistem CBT eBudimulia — SMP Budi Mulia Jakarta
</div>

</body>
</html>`

  // Buat file Blob dalam format HTML yang dapat dibuka Word (.doc)
  const blob = new Blob(
    ['\ufeff' + htmlContent], // BOM UTF-8 agar karakter matematika & diagram tampil sempurna di Word
    { type: 'application/msword;charset=utf-8' }
  )
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'Template_Naskah_Soal_CBT_eBudimulia.doc'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
