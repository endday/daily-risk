/**
 * Daily Risk Service Worker
 * 缓存策略：
 * - API: Stale-while-revalidate (5分钟)
 * - 静态资源: Cache-first (永久)
 * - index.html: Network-first
 */

const CACHE_NAME = 'daily-risk-v1'
const API_CACHE_NAME = 'daily-risk-api-v1'
const API_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Install: cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['/'])
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
  const url = new URL(event.request.url)

  // API requests: Stale-while-revalidate
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(event.request))
    return
  }

  // Static assets (with hash): Cache-first
  if (url.pathname.match(/\.[a-f0-9]{8}\./)) {
    event.respondWith(handleCacheFirst(event.request))
    return
  }

  // HTML and other: Network-first
  event.respondWith(handleNetworkFirst(event.request))
})

async function handleApiRequest(request) {
  const cache = await caches.open(API_CACHE_NAME)
  const cached = await cache.match(request)

  if (cached) {
    const cachedTime = cached.headers.get('x-cache-time')
    if (cachedTime && Date.now() - parseInt(cachedTime) < API_CACHE_TTL) {
      // Return cached, fetch in background
      fetchAndCache(request, cache)
      return cached
    }
  }

  // No valid cache, fetch fresh
  const response = await fetch(request)
  if (response.ok) {
    const responseToCache = response.clone()
    const headers = new Headers(responseToCache.headers)
    headers.set('x-cache-time', Date.now().toString())
    const cachedResponse = new Response(responseToCache.body, {
      headers,
    })
    cache.put(request, cachedResponse)
  }
  return response
}

async function fetchAndCache(request, cache) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const responseToCache = response.clone()
      const headers = new Headers(responseToCache.headers)
      headers.set('x-cache-time', Date.now().toString())
      const cachedResponse = new Response(responseToCache.body, { headers })
      cache.put(request, cachedResponse)
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
