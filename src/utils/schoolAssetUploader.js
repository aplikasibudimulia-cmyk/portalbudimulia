import { supabase } from '../supabaseClient'

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'pengumumanbudimulia'

/**
 * Kompres gambar (File/Blob/DataURL) menjadi Blob & Data URL ringan (~15-35 KB).
 * Format PNG dipertahankan agar transparansi cap/TTD tidak hilang.
 */
export function compressImageToBlobAndDataUrl(source, maxSize = 600) {
  return new Promise((resolve) => {
    const finish = (blob, dataUrl, isPng) => resolve({ blob, dataUrl: dataUrl || '', isPng: Boolean(isPng) })
    const handle = (src, isPng) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        let { width, height } = img
        const ratio = Math.min(1, maxSize / Math.max(width || 1, height || 1))
        width = Math.max(1, Math.round(width * ratio))
        height = Math.max(1, Math.round(height * ratio))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        const mime = isPng ? 'image/png' : 'image/jpeg'
        const dataUrl = canvas.toDataURL(mime, 0.85)
        canvas.toBlob((blob) => finish(blob, dataUrl, isPng), mime, 0.85)
      }
      img.onerror = () => finish(null, typeof src === 'string' ? src : '', isPng)
      img.src = src
    }
    if (typeof source === 'string') {
      handle(source, /^data:image\/(png|webp|gif)/i.test(source))
    } else if (source instanceof Blob) {
      const reader = new FileReader()
      reader.onload = (e) => handle(e.target.result, /png|webp|gif/i.test(source.type))
      reader.onerror = () => finish(null, '', false)
      reader.readAsDataURL(source)
    } else {
      finish(null, '', false)
    }
  })
}

export async function compressToDataUrl(source, maxSize = 600) {
  const { dataUrl } = await compressImageToBlobAndDataUrl(source, maxSize)
  return dataUrl
}

/**
 * Unggah gambar ke Supabase Storage (bucket 'tp_lampiran' folder 'school_assets')
 * setelah dikompresi agar ukuran file sangat kecil (~15-35 KB) dan mendukung CORS penuh.
 * Jika gagal, otomatis mencoba Cloudinary, lalu fallback ke DataURL terkompresi.
 */
export async function uploadSchoolImage(fileOrDataUrl, assetName = 'asset') {
  if (!fileOrDataUrl) return null
  try {
    const { blob, dataUrl, isPng } = await compressImageToBlobAndDataUrl(fileOrDataUrl, 600)
    const ext = isPng ? 'png' : 'jpg'
    const mime = isPng ? 'image/png' : 'image/jpeg'
    const safeName = String(assetName).replace(/[^a-zA-Z0-9_-]/g, '_')
    const filePath = `school_assets/${safeName}_${Date.now()}.${ext}`

    if (blob) {
      const { error: upErr } = await supabase.storage
        .from('tp_lampiran')
        .upload(filePath, blob, { contentType: mime, upsert: true, cacheControl: '31536000' })
      if (!upErr) {
        const { data: pub } = supabase.storage.from('tp_lampiran').getPublicUrl(filePath)
        if (pub?.publicUrl) return pub.publicUrl
      }
    }

    if (CLOUD_NAME && (blob || dataUrl)) {
      const formData = new FormData()
      formData.append('file', blob || dataUrl)
      formData.append('upload_preset', UPLOAD_PRESET)
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData
      })
      if (res.ok) {
        const json = await res.json()
        if (json?.secure_url) return json.secure_url
      }
    }
  } catch (err) {
    console.warn('[schoolAssetUploader] Upload gagal:', err)
  }
  return null
}

/**
 * Unggah ke Supabase Storage / Cloudinary; jika gagal pakai Data URL terkompresi (~25 KB).
 */
export async function uploadSchoolImageWithFallback(file, assetName = 'asset') {
  const url = await uploadSchoolImage(file, assetName)
  if (url) return { url, viaCloud: true }
  return { url: await compressToDataUrl(file, 500), viaCloud: false }
}

const isDataUrl = (v) => typeof v === 'string' && v.startsWith('data:image')

/**
 * Migrasi otomatis: pindahkan gambar cap/TTD yang masih berupa base64 besar di database
 * ke Supabase Storage (URL pendek), lalu simpan ke pengaturan_sekolah.
 * Tidak menghapus apa pun bila unggah gagal (data lama tetap utuh).
 */
export async function optimizeStoredSchoolAssets() {
  const keys = ['kartu_cap_url', 'kartu_ttd_url', 'kartu_ujian_settings']
  const { data, error } = await supabase
    .from('pengaturan_sekolah')
    .select('setting_key, setting_value')
    .in('setting_key', keys)
  if (error) throw error

  const map = {}
  ;(data || []).forEach(r => { map[r.setting_key] = r.setting_value })

  const cache = new Map()
  const toUrl = async (value, label) => {
    if (!isDataUrl(value)) return value
    if (cache.has(value)) return cache.get(value)
    const url = await uploadSchoolImage(value, label)
    if (url) cache.set(value, url)
    return url
  }

  const result = { migrated: 0, failed: 0, urls: {} }

  for (const key of ['kartu_cap_url', 'kartu_ttd_url']) {
    const val = map[key]
    if (!isDataUrl(val)) continue
    const url = await toUrl(val, key)
    if (url) {
      const { error: upErr } = await supabase
        .from('pengaturan_sekolah')
        .upsert({ setting_key: key, setting_value: url }, { onConflict: 'setting_key' })
      if (upErr) { result.failed++; continue }
      result.migrated++
      result.urls[key] = url
    } else {
      result.failed++
    }
  }

  if (map.kartu_ujian_settings) {
    try {
      const json = JSON.parse(map.kartu_ujian_settings)
      let changed = false
      for (const field of ['capUrl', 'ttdUrl', 'kartu_cap_url', 'kartu_ttd_url', 'logoUrl', 'kartu_logo_url']) {
        if (isDataUrl(json[field])) {
          // Gunakan URL yang sudah dimigrasi bila ada
          const fallbackUrl =
            (field.toLowerCase().includes('cap') && result.urls.kartu_cap_url) ||
            (field.toLowerCase().includes('ttd') && result.urls.kartu_ttd_url) ||
            (await toUrl(json[field], field))
          if (fallbackUrl) {
            json[field] = fallbackUrl
            changed = true
          } else {
            result.failed++
          }
        }
      }
      if (changed) {
        const { error: upErr } = await supabase
          .from('pengaturan_sekolah')
          .upsert({ setting_key: 'kartu_ujian_settings', setting_value: JSON.stringify(json) }, { onConflict: 'setting_key' })
        if (upErr) result.failed++
        else result.migrated++
      }
    } catch (err) {
      console.warn('[optimizeStoredSchoolAssets] kartu_ujian_settings tidak valid:', err)
    }
  }

  return result
}
