<script setup lang="ts">
import type { CalendarBannerData } from '../services/api'

defineProps<{
  banner: CalendarBannerData | null
}>()

function bannerClass(key: string): string {
  if (key === 'spring_festival') return 'banner-red'
  if (key.startsWith('earnings')) return 'banner-yellow'
  if (key === 'two_sessions') return 'banner-blue'
  if (key === 'golden_october') return 'banner-orange'
  return 'banner-blue'
}
</script>

<template>
  <div v-if="banner" class="banner" :class="bannerClass(banner.key)">
    <span class="banner-icon">{{ banner.icon }}</span>
    <span class="banner-text">{{ banner.text }}</span>
  </div>
</template>

<style scoped>
.banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px 8px 0 0;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
}

.banner-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.banner-text {
  color: #333;
}

.banner-red {
  background: linear-gradient(135deg, #fff5f5, #ffe8e8);
  border-bottom: 1px solid #ffd4d4;
}

.banner-yellow {
  background: linear-gradient(135deg, #fffbf0, #fff3d4);
  border-bottom: 1px solid #ffe8b0;
}

.banner-blue {
  background: linear-gradient(135deg, #f0f7ff, #e3f0ff);
  border-bottom: 1px solid #c8e0ff;
}

.banner-orange {
  background: linear-gradient(135deg, #fff8f0, #ffeed4);
  border-bottom: 1px solid #ffe0b0;
}
</style>
