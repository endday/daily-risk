/**
 * Daily Risk Service Worker
 * 缓存策略：
 * - API: Stale-while-revalidate (5分钟)
 * - 静态资源: Cache-first (永久)
 * - index.html: Network-first
 */

const CACHE_NAME = 'daily-risk-v3'
const API_CACHE_NAME = 'daily-risk-api-v3'
const API_CACHE_TTL = 5 * 60 * 1000 // 5 minutes (stale-while-revalidate window)
const API_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000 // 7 days (max offline fallback age)

// Listen for skip waiting message from page
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// Install: cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/manifest.webmanifest',
        '/icons/app-icon.svg',
        '/icons/app-icon-192.png',
        '/icons/app-icon-512.png',
        '/icons/app-icon-maskable-512.png',
      ])
    })
  )
  self.skipWaiting()
})

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== API_CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    })
  )
  self.clients.claim()
})

// Fetch: apply caching strategies
self.addEventListener('fetch', (event) => {
  // Cache API only supports GET, let other methods pass through
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)

  // API requests: Stale-while-revalidate
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(event))
    return
  }

  // Static assets (with hash): Cache-first
  if (/\/assets\/.+-[\w-]{8,}\.[^/]+$/.test(url.pathname)) {
    event.respondWith(handleCacheFirst(event.request))
    return
  }

  // HTML and other: Network-first
  event.respondWith(handleNetworkFirst(event.request))
})

async function handleApiRequest(event) {
  const { request } = event
  const cache = await caches.open(API_CACHE_NAME)
  const cached = await cache.match(request)

  if (cached) {
    const cachedTime = cached.headers.get('x-cache-time')
    const age = cachedTime ? Date.now() - parseInt(cachedTime) : Infinity

    if (age < API_CACHE_TTL) {
      // Fresh cache: return immediately, revalidate in background
      event.waitUntil(fetchAndCache(request, cache))
      return cached
    }

    if (age < API_CACHE_MAX_AGE) {
      // Stale but usable: return cached, try network
      try {
        const response = await fetch(request)
        if (response.ok) {
          const headers = new Headers(response.headers)
          headers.set('x-cache-time', Date.now().toString())
          await cache.put(request, new Response(response.clone().body, { headers }))
          return response
        }
      } catch {
        // Offline: return stale cache
      }
      return cached
    }
  }

  // No cache or expired: fetch fresh
  try {
    const response = await fetch(request)
    if (response.ok) {
      const headers = new Headers(response.headers)
      headers.set('x-cache-time', Date.now().toString())
      await cache.put(request, new Response(response.clone().body, { headers }))
    }
    return response
  } catch {
    // Offline with no cache
    if (cached) return cached
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

async function fetchAndCache(request, cache) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const responseToCache = response.clone()
      const headers = new Headers(responseToCache.headers)
      headers.set('x-cache-time', Date.now().toString())
      const cachedResponse = new Response(responseToCache.body, { headers })
      await cache.put(request, cachedResponse)
    }
  } catch {
    // Network error, ignore
  }
}

async function handleCacheFirst(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) {
    cache.put(request, response.clone())
  }
  return response
}

async function handleNetworkFirst(request) {
  // Cache API only supports GET
  if (request.method !== 'GET') {
    return fetch(request)
  }
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cache = await caches.open(CACHE_NAME)
    const cached = await cache.match(request)
    return cached || new Response('Offline', { status: 503 })
  }
}
