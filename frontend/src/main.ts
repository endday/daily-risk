import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(router)
app.mount('#app')

// Register Service Worker with auto-update
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    // 新 SW 安装完在等待时，通知它立即激活
    if (reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' })
    }
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing
      if (!newWorker) return
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // 有旧 SW 控制页面，通知新 SW 跳过等待
          newWorker.postMessage({ type: 'SKIP_WAITING' })
        }
      })
    })
    // 新 SW 接管后，刷新页面拿最新资源
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })
  }).catch((err) => {
    console.warn('SW registration failed:', err)
  })
}
