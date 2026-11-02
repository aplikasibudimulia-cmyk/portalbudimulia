import { get, set } from 'idb-keyval'
import { supabase } from '../supabaseClient'
import { sendFCMPushNotification } from './fcmSender'

const QUEUE_STORAGE_KEY = 'ebm_presensi_pending_queue'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let isProcessingQueue = false

/**
 * Mengambil seluruh daftar antrean presensi dari IndexedDB
 */
export async function getPresensiQueue() {
  try {
    const queue = await get(QUEUE_STORAGE_KEY)
    return Array.isArray(queue) ? queue : []
  } catch (err) {
    console.warn('[PresensiQueue] Gagal membaca antrean:', err)
    return []
  }
}

/**
 * Menyimpan seluruh daftar antrean ke IndexedDB
 */
async function savePresensiQueue(queue) {
  try {
    await set(QUEUE_STORAGE_KEY, queue)
  } catch (err) {
    console.warn('[PresensiQueue] Gagal menyimpan antrean:', err)
  }
}

/**
 * Cari item presensi lokal untuk siswa pada tanggal dan tipe tertentu
 */
export async function getPresensiLocalItem(nisn, tanggal, tipe) {
  if (!nisn || !tanggal) return null
  try {
    const queue = await getPresensiQueue()
    return queue.find(
      q => q.siswa_nisn === nisn && q.tanggal === tanggal && (!tipe || q.tipe === tipe)
    ) || null
  } catch {
    return null
  }
}

/**
 * Ambil semua presensi siswa hari ini dari antrean lokal
 */
export async function getLocalPresensiForToday(nisn, tanggal) {
  if (!nisn || !tanggal) return { masuk: null, pulang: null }
  try {
    const queue = await getPresensiQueue()
    const items = queue.filter(q => q.siswa_nisn === nisn && q.tanggal === tanggal)
    const masuk = items.find(q => q.tipe === 'masuk') || null
    const pulang = items.find(q => q.tipe === 'pulang') || null
    return { masuk, pulang }
  } catch {
    return { masuk: null, pulang: null }
  }
}

/**
 * Hapus data presensi dari antrean lokal (misal ketika dihapus/dibatalkan oleh Piket/Admin)
 */
export async function removeLocalPresensi(nisn, tanggal, tipe) {
  if (!nisn) return
  try {
    const queue = await getPresensiQueue()
    const filtered = queue.filter(
      q => !(q.siswa_nisn === nisn && (!tanggal || q.tanggal === tanggal) && (!tipe || q.tipe === tipe))
    )
    await savePresensiQueue(filtered)
  } catch (err) {
    console.warn('[PresensiQueue] Gagal menghapus antrean lokal:', err)
  }
}

/**
 * Simpan data presensi baru ke antrean lokal (Optimistic UI - Instant < 10ms)
 */
export async function enqueuePresensi(item) {
  try {
    const queue = await getPresensiQueue()
    
    // Cegah duplikat jika sudah ada untuk tanggal & tipe yang sama
    const filtered = queue.filter(
      q => !(q.siswa_nisn === item.siswa_nisn && q.tanggal === item.tanggal && q.tipe === item.tipe)
    )

    const queueItem = {
      id: item.id || `pq_${item.siswa_nisn}_${item.tanggal}_${item.tipe}_${Date.now()}`,
      tanggal: item.tanggal,
      tipe: item.tipe,
      siswa_nisn: item.siswa_nisn,
      nama_lengkap: item.nama_lengkap || '',
      kelas: item.kelas || '-',
      tahun_ajaran_id: item.tahun_ajaran_id || null,
      status: item.status || 'H',
      waktu: item.waktu || '07:00',
      metode: item.metode || 'qr_scan',
      keterangan: item.keterangan || '',
      selfieBlob: item.selfieBlob || null,
      selfiePreview: item.selfiePreview || null,
      selfieUrl: item.selfieUrl || null,
      syncStatus: 'pending', // 'pending' | 'syncing' | 'synced' | 'failed'
      attempts: 0,
      lastError: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    filtered.unshift(queueItem)
    await savePresensiQueue(filtered)

    // Trigger background sync secara hening (non-blocking)
    setTimeout(() => {
      processPresensiQueue().catch(err => console.warn('[PresensiQueue] Background sync error:', err))
    }, 100)

    return queueItem
  } catch (err) {
    console.error('[PresensiQueue] Gagal enqueue presensi:', err)
    return null
  }
}

/**
 * Upload foto selfie ke Supabase Storage
 */
async function uploadSelfieBlob(blob, nisn, tipe, tanggal) {
  if (!blob) return null
  try {
    const fileName = `${nisn}_${tipe}_${tanggal}_${Date.now()}.jpg`
    const { error } = await supabase.storage
      .from('selfie-presensi')
      .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' })

    if (error) {
      console.warn('[PresensiQueue] Upload selfie storage error:', error.message)
      return null
    }

    const { data: urlData } = supabase.storage.from('selfie-presensi').getPublicUrl(fileName)
    return urlData?.publicUrl || null
  } catch (err) {
    console.warn('[PresensiQueue] Error saat upload selfie blob:', err)
    return null
  }
}

/**
 * Kirim notifikasi ke orang tua di background setelah data tersimpan di server
 */
async function triggerNotifications(item, selfieUrl) {
  try {
    const tipeLabel = item.tipe === 'pulang' ? 'Pulang' : 'Masuk'
    const statusLabel = item.status === 'T' ? 'Terlambat' : item.status === 'H' ? 'Hadir' : item.status

    // 1. Broadcast ke channel orang tua di Supabase Realtime
    const channelsToSend = [`notif-ortu-${item.siswa_nisn}`, `app-notif-${item.siswa_nisn}`]
    channelsToSend.forEach(chName => {
      const broadcastCh = supabase.channel(chName, { config: { broadcast: { self: true } } })
      broadcastCh.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await broadcastCh.send({
            type: 'broadcast',
            event: 'presensi_update',
            payload: {
              nisn: item.siswa_nisn,
              namaLengkap: item.nama_lengkap,
              kelas: item.kelas,
              status: item.status,
              statusLabel,
              waktu: item.waktu,
              tipe: item.tipe,
              tipeLabel,
              tanggal: item.tanggal,
              selfieUrl,
              lokasi: item.keterangan || ''
            }
          })
          setTimeout(() => supabase.removeChannel(broadcastCh), 3000)
        }
      })
    })

    // 2. Kirim Google FCM Push Notification
    sendFCMPushNotification({
      nisn: item.siswa_nisn,
      title: `Presensi ${tipeLabel} Siswa (${statusLabel} - ${item.waktu} WIB)`,
      body: `${item.nama_lengkap} - Presensi ${tipeLabel} pukul ${item.waktu} WIB (${statusLabel}).`,
      image: selfieUrl || undefined,
      targetMenu: 'PRESENSI',
      data: { tag: `presensi-${item.siswa_nisn}-${item.tipe}`, tipe: item.tipe }
    }).catch(err => console.warn('[PresensiQueue FCM] Error:', err))

    // 3. Webhook LINE Notify (jika ada)
    if (supabaseUrl && supabaseAnonKey) {
      fetch(`${supabaseUrl}/functions/v1/line-notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          nisn: item.siswa_nisn,
          nama: item.nama_lengkap,
          kelas: item.kelas,
          status: item.status,
          waktu: item.waktu,
          tipe: item.tipe,
          fotoUrl: selfieUrl,
          keterangan: item.keterangan || '-'
        }),
      }).catch(err => console.warn('[PresensiQueue LINE] Error:', err))
    }
  } catch (err) {
    console.warn('[PresensiQueue] Gagal kirim notifikasi background:', err)
  }
}

/**
 * Mencoba mengirim presensi langsung ke Supabase terlebih dahulu (Online-first).
 * Jika berhasil dalam waktu timeout (default 3.5 detik):
 *   - Mengembalikan { success: true, isServerSynced: true, queueItem }
 * Jika timeout / offline / gagal:
 *   - Otomatis menyimpan ke antrean lokal IndexedDB (Optimistic Fallback)
 *   - Mengembalikan { success: true, isServerSynced: false, queueItem }
 */
export async function submitPresensiDirectOrQueue(item, timeoutMs = 3500) {
  const queueItem = {
    id: item.id || `pq_${item.siswa_nisn}_${item.tanggal}_${item.tipe}_${Date.now()}`,
    tanggal: item.tanggal,
    tipe: item.tipe,
    siswa_nisn: item.siswa_nisn,
    nama_lengkap: item.nama_lengkap || '',
    kelas: item.kelas || '-',
    tahun_ajaran_id: item.tahun_ajaran_id || null,
    status: item.status || 'H',
    waktu: item.waktu || '07:00',
    metode: item.metode || 'qr_scan',
    keterangan: item.keterangan || '',
    selfieBlob: item.selfieBlob || null,
    selfiePreview: item.selfiePreview || null,
    selfieUrl: item.selfieUrl || null,
    syncStatus: 'pending', // 'pending' | 'syncing' | 'synced' | 'failed'
    attempts: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  const isOnline = typeof navigator === 'undefined' || navigator.onLine

  if (isOnline) {
    try {
      // 1. FAST DIRECT UPSERT KE SUPABASE DENGAN TIMEOUT
      const upsertPromise = supabase.from('presensi_harian').upsert({
        tanggal: queueItem.tanggal,
        tahun_ajaran_id: queueItem.tahun_ajaran_id || null,
        kelas: queueItem.kelas || '-',
        siswa_nisn: queueItem.siswa_nisn,
        status: queueItem.status,
        waktu: queueItem.waktu,
        metode: queueItem.metode,
        tipe: queueItem.tipe,
        selfie_url: queueItem.selfieUrl || null,
        keterangan: queueItem.keterangan || '',
        updated_at: new Date().toISOString()
      }, { onConflict: 'tanggal,siswa_nisn,tipe' })

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT_SERVER')), timeoutMs)
      )

      const { error: upsertErr } = await Promise.race([upsertPromise, timeoutPromise])

      if (!upsertErr) {
        // BERHASIL LANGSUNG TERVERIFIKASI DI SERVER!
        queueItem.syncStatus = 'synced'

        // Simpan ke IndexedDB lokal sebagai status synced
        const queue = await getPresensiQueue()
        const filtered = queue.filter(
          q => !(q.siswa_nisn === queueItem.siswa_nisn && q.tanggal === queueItem.tanggal && q.tipe === queueItem.tipe)
        )
        filtered.unshift(queueItem)
        await savePresensiQueue(filtered)

        // Upload selfie & kirim notifikasi secara asynchronous di background
        setTimeout(async () => {
          let finalSelfieUrl = queueItem.selfieUrl
          if (!finalSelfieUrl && queueItem.selfieBlob) {
            try {
              finalSelfieUrl = await uploadSelfieBlob(queueItem.selfieBlob, queueItem.siswa_nisn, queueItem.tipe, queueItem.tanggal)
              if (finalSelfieUrl) {
                await supabase.from('presensi_harian').update({
                  selfie_url: finalSelfieUrl,
                  updated_at: new Date().toISOString()
                }).eq('tanggal', queueItem.tanggal).eq('siswa_nisn', queueItem.siswa_nisn).eq('tipe', queueItem.tipe)

                const qCurrent = await getPresensiQueue()
                const tIdx = qCurrent.findIndex(q => q.id === queueItem.id)
                if (tIdx !== -1) {
                  qCurrent[tIdx].selfieUrl = finalSelfieUrl
                  qCurrent[tIdx].selfieBlob = null
                  await savePresensiQueue(qCurrent)
                }
              }
            } catch (err) {
              console.warn('[PresensiQueue] Gagal upload selfie background:', err)
            }
          }
          triggerNotifications(queueItem, finalSelfieUrl).catch(() => {})
        }, 100)

        return { success: true, isServerSynced: true, queueItem }
      }
    } catch (err) {
      console.warn('[PresensiQueue] Pengiriman langsung ke server gagal/timeout, beralih ke antrean lokal:', err.message)
    }
  }

  // JIKA OFFLINE / TIMEOUT: SIMPAN KE ANTRIAN LOKAL INDEXEDDB
  queueItem.syncStatus = 'pending'
  const queue = await getPresensiQueue()
  const filtered = queue.filter(
    q => !(q.siswa_nisn === queueItem.siswa_nisn && q.tanggal === queueItem.tanggal && q.tipe === queueItem.tipe)
  )
  filtered.unshift(queueItem)
  await savePresensiQueue(filtered)

  // Picu background sync untuk mencoba terus saat internet siap
  setTimeout(() => {
    processPresensiQueue().catch(err => console.warn('[PresensiQueue] Background sync error:', err))
  }, 500)

  return { success: true, isServerSynced: false, queueItem }
}

/**
 * Worker Background Sync: Mengunggah antrean yang tertunda ke Supabase
 */
export async function processPresensiQueue() {
  if (isProcessingQueue) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.log('[PresensiQueue] Perangkat offline, menunda sinkronisasi.')
    return
  }

  isProcessingQueue = true

  try {
    let queue = await getPresensiQueue()
    const pendingItems = queue.filter(q => q.syncStatus === 'pending' || q.syncStatus === 'failed')

    if (pendingItems.length === 0) {
      isProcessingQueue = false
      return
    }

    console.log(`[PresensiQueue] Memulai silent sync untuk ${pendingItems.length} data...`)

    for (const item of pendingItems) {
      // Jika internet putus di tengah jalan, hentikan loop
      if (typeof navigator !== 'undefined' && !navigator.onLine) break

      try {
        // 1. FAST UPSERT KE TABEL presensi_harian TERLEBIH DAHULU (Prioritas Utama: Data Kehadiran Teks Masuk Server)
        let finalSelfieUrl = item.selfieUrl || null
        const { error: upsertErr } = await supabase.from('presensi_harian').upsert({
          tanggal: item.tanggal,
          tahun_ajaran_id: item.tahun_ajaran_id || null,
          kelas: item.kelas || '-',
          siswa_nisn: item.siswa_nisn,
          status: item.status,
          waktu: item.waktu,
          metode: item.metode,
          tipe: item.tipe,
          selfie_url: finalSelfieUrl,
          keterangan: item.keterangan || '',
          updated_at: new Date().toISOString()
        }, { onConflict: 'tanggal,siswa_nisn,tipe' })

        if (upsertErr) throw upsertErr

        // 2. Tandai status antrean lokal menjadi 'synced' SEGERA setelah record database tersimpan
        queue = await getPresensiQueue()
        let targetIndex = queue.findIndex(q => q.id === item.id)
        if (targetIndex !== -1) {
          queue[targetIndex] = {
            ...queue[targetIndex],
            syncStatus: 'synced',
            lastError: null,
            updatedAt: new Date().toISOString()
          }
          await savePresensiQueue(queue)
        }

        // 3. Upload selfie jika ada blob dan belum ada selfieUrl (Non-blocking terhadap pencatatan kehadiran)
        if (!finalSelfieUrl && item.selfieBlob) {
          try {
            finalSelfieUrl = await uploadSelfieBlob(item.selfieBlob, item.siswa_nisn, item.tipe, item.tanggal)
            if (finalSelfieUrl) {
              await supabase.from('presensi_harian').update({
                selfie_url: finalSelfieUrl,
                updated_at: new Date().toISOString()
              }).eq('tanggal', item.tanggal).eq('siswa_nisn', item.siswa_nisn).eq('tipe', item.tipe)

              queue = await getPresensiQueue()
              targetIndex = queue.findIndex(q => q.id === item.id)
              if (targetIndex !== -1) {
                queue[targetIndex].selfieUrl = finalSelfieUrl
                queue[targetIndex].selfieBlob = null // Hapus blob untuk menghemat storage IndexedDB
                await savePresensiQueue(queue)
              }
            }
          } catch (selfieErr) {
            console.warn('[PresensiQueue] Gagal upload selfie blob (namun kehadiran teks telah aman tersimpan):', selfieErr)
          }
        }

        // 4. Kirim notifikasi non-blocking
        triggerNotifications(item, finalSelfieUrl).catch(() => {})

        // 5. Beri sinyal ke UI bahwa data sudah tersinkronisasi
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('ebm-presensi-synced', {
              detail: {
                id: item.id,
                siswa_nisn: item.siswa_nisn,
                tanggal: item.tanggal,
                tipe: item.tipe,
                selfieUrl: finalSelfieUrl,
                status: item.status
              }
            })
          )
        }

        console.log(`[PresensiQueue] ✅ Sukses sinkronisasi presensi ${item.tipe} untuk ${item.siswa_nisn}`)
      } catch (err) {
        console.warn(`[PresensiQueue] Gagal sinkronisasi item ${item.id}:`, err)
        queue = await getPresensiQueue()
        const targetIndex = queue.findIndex(q => q.id === item.id)
        if (targetIndex !== -1) {
          queue[targetIndex].attempts = (queue[targetIndex].attempts || 0) + 1
          queue[targetIndex].lastError = err.message || 'Network error'
          queue[targetIndex].syncStatus = 'failed'
          queue[targetIndex].updatedAt = new Date().toISOString()
          await savePresensiQueue(queue)
        }
      }
    }
  } finally {
    isProcessingQueue = false
  }
}

/**
 * Pemicu sinkronisasi manual dari tombol UI
 */
export async function forceSyncPendingQueue() {
  try {
    const queue = await getPresensiQueue()
    const pending = queue.filter(q => q.syncStatus === 'pending' || q.syncStatus === 'failed')
    if (pending.length === 0) {
      return { success: true, count: 0, message: 'Semua data telah tersinkronisasi.' }
    }
    await processPresensiQueue()
    const queueAfter = await getPresensiQueue()
    const remaining = queueAfter.filter(q => q.syncStatus === 'pending' || q.syncStatus === 'failed')
    if (remaining.length === 0) {
      return { success: true, count: pending.length, message: 'Seluruh data berhasil disinkronkan ke server sekolah!' }
    } else {
      return { success: false, count: remaining.length, message: `${remaining.length} data masih belum terkirim. Pastikan internet Anda aktif.` }
    }
  } catch (err) {
    return { success: false, count: 0, message: err.message || 'Gagal sinkronisasi' }
  }
}

// Inisialisasi otomatis: Pasang listener online untuk memproses antrean saat sinyal pulih
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[PresensiQueue] Koneksi internet kembali aktif. Menjalankan sinkronisasi...')
    processPresensiQueue().catch(() => {})
  })

  // Jalankan pengecekan berkala setiap 20 detik jika ada antrean tertunda
  setInterval(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      processPresensiQueue().catch(() => {})
    }
  }, 20000)
}
