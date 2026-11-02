/**
 * Utilitas Kompresi Gambar Klien (Client-Side Image Compressor)
 * Mengompresi screenshot/foto sebelum diunggah ke Supabase Storage.
 * Mengurangi ukuran file dari 3-5 MB menjadi ~80-150 KB tanpa merusak kejelasan teks screenshot.
 */

export async function compressImage(file, options = {}) {
  const {
    maxWidth = 1080,
    maxHeight = 1920,
    quality = 0.65,
    outputType = 'image/jpeg'
  } = options

  if (!file || !file.type.startsWith('image/')) {
    throw new Error('File bukan merupakan gambar yang valid.')
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'))
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = () => reject(new Error('Gagal memuat gambar ke elemen canvas.'))
      img.onload = () => {
        let { width, height } = img

        // Pertahankan rasio aspek gambar saat diperkecil
        if (width > maxWidth || height > maxHeight) {
          const ratioW = maxWidth / width
          const ratioH = maxHeight / height
          const ratio = Math.min(ratioW, ratioH)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        // Background putih untuk menghindari area transparan menjadi hitam saat konversi ke JPEG
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Gagal mengompresi gambar via canvas toBlob.'))
              return
            }
            resolve({
              blob,
              width,
              height,
              originalSize: file.size,
              compressedSize: blob.size,
              reductionPercent: Math.round(((file.size - blob.size) / file.size) * 100)
            })
          },
          outputType,
          quality
        )
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}
