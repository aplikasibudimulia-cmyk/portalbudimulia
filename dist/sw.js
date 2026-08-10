// eBudiMulia Service Worker v1.0
// Handles: Web Push Notifications

const CACHE_NAME = 'ebudimulia-v2'

// ===== Install Event =====
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

// ===== Activate Event =====
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache)
          }
        })
      )
    }).then(() => self.clients.claim())
  )
})

// ===== Push Event (dari server) =====
self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'eBudiMulia', body: event.data.text() }
  }

  const { title = 'eBudiMulia', body = '', icon = '/logo.png', badge = '/logo.png', tag, data } = payload

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag: tag || 'ebudimulia-notif',
      data: data || {},
      requireInteraction: false,
      vibrate: [200, 100, 200],
    })
  )
})

// ===== Notification Click =====
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})

// ===== Message from App =====
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_LOCAL_NOTIF') {
    const { title, body, icon, tag, data } = event.data
    self.registration.showNotification(title || 'eBudiMulia', {
      body: body || '',
      icon: icon || '/logo.png',
      badge: '/logo.png',
      tag: tag || 'local-notif',
      data: data || {},
      vibrate: [150, 75, 150],
    }).catch((err) => {
      // Abaikan error jika izin notifikasi belum di-granted di browser ini
    })
  }
})

// ===== Fetch Event (Wajib untuk PWA Installable) =====
// Chrome mewajibkan adanya event 'fetch' agar muncul prompt "Install App" (Add to Home screen)
// Hanya intercept GET request dari origin yang sama untuk menghindari gangguan CORS/Auth pada API Supabase.
self.addEventListener('fetch', (event) => {
  if (event.request.method === 'GET' && event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      fetch(event.request).catch((err) => {
        return caches.match(event.request).then((res) => res || new Response('', { status: 408 }))
      })
    )
  }
})
