type CachedResponse<T> = {
  expiresAt: number
  data: T
}

export function useResponseCache<T>(key: string) {
  function read(): T | null {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return null
      const cached = JSON.parse(raw) as CachedResponse<T>
      if (cached.expiresAt <= Date.now()) {
        localStorage.removeItem(key)
        return null
      }
      return cached.data
    } catch {
      return null
    }
  }

  function write(data: T, expiresAt: number) {
    try {
      localStorage.setItem(key, JSON.stringify({ expiresAt, data } satisfies CachedResponse<T>))
    } catch {
      // Browser storage must not prevent rendering fresh API data.
    }
  }

  return { read, write }
}
