import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from '@vant/auto-import-resolver'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxy = env.API_PROXY || 'http://localhost:8787'

  return {
    plugins: [
      vue(),
      Components({
        resolvers: [VantResolver()],
      }),
    ],
    server: {
      host: mode === 'remote' ? '0.0.0.0' : undefined,
      port: 5173,
      proxy: {
        '/api': {
          target: apiProxy,
          changeOrigin: true,
        },
        '/admin': {
          target: apiProxy,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['vue'],
            echarts: ['echarts/core', 'echarts/charts', 'echarts/components', 'echarts/renderers', 'vue-echarts'],
          },
        },
      },
    },
  }
})
