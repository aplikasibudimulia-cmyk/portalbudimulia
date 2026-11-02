// eBudiMulia Service Worker v4.0
// Handles: Web Push Notifications & Silent Offline PWA Resilience with Network-First Navigation

const CACHE_NAME = 'ebudimulia-v4'
const STATIC_ASSETS = ['/favicon.png', '/logo.png', '/manifest.json']

// ===== Install Event =====
self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Caching static assets dilewati:', err.message)
      })
    })
  )
})

// ===== Activate Event =====
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Deleting obsolete cache:', cache)
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

  const { title = 'eBudiMulia', body = '', icon = '/logo.png', badge = '/logo.png', image, tag, data } = payload

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      image: image || undefined,
      tag: tag ? `${tag}_${Date.now()}` : `ebudimulia-notif_${Date.now()}`,
      renotify: true,
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
    const { title, body, icon, image, tag, data } = event.data
    self.registration.showNotification(title || 'eBudiMulia', {
      body: body || '',
      icon: icon || '/logo.png',
      badge: '/logo.png',
      image: image || undefined,
      tag: tag ? `${tag}_${Date.now()}` : `local-notif_${Date.now()}`,
      renotify: true,
      data: data || {},
      vibrate: [150, 75, 150],
    }).catch((err) => {
      // Abaikan error jika izin notifikasi belum di-granted di browser ini
    })
  }
})

// ===== Fetch Event (PWA Installable & Background Offline Handling) =====
// Hanya intercept GET request dari origin yang sama
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  if (!event.request.url.startsWith(self.location.origin)) return

  const url = new URL(event.request.url)

  // Abaikan request Vite dev server (HMR, internal module pings) dan endpoint API
  if (
    url.pathname.startsWith('/@vite') ||
    url.pathname.startsWith('/@fs') ||
    url.pathname.startsWith('/@id') ||
    url.pathname.includes('hot-update') ||
    url.pathname.startsWith('/api/')
  ) {
    return
  }

  // Network-First for Navigation (HTML pages) so user ALWAYS receives the fresh application bundle
  if (event.request.mode === 'navigate' || url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {})
          }
          return networkResponse
        })
        .catch(async () => {
          const cached = await caches.match(event.request)
          if (cached) return cached
          const rootCached = await caches.match('/')
          if (rootCached) return rootCached
          throw new Error('Offline and no cached root available')
        })
    )
    return
  }

  // Static Assets: Network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === 'basic' &&
          url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|webp|woff2?|json)$/)
        ) {
          const responseToCache = networkResponse.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache).catch(() => {})
          })
        }
        return networkResponse
      })
      .catch(async (networkError) => {
        const cachedResponse = await caches.match(event.request)
        if (cachedResponse) {
          return cachedResponse
        }
        throw networkError
      })
  )
})
