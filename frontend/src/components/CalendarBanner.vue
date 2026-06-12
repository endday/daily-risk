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
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  line-height: var(--leading-normal);
}

.banner-icon {
  font-size: var(--text-lg);
  flex-shrink: 0;
}

.banner-text {
  color: var(--text-primary);
}

.banner-red {
  background: linear-gradient(135deg, var(--color-up-light), rgba(232, 71, 76, 0.06));
  border-bottom: 1px solid rgba(232, 71, 76, 0.15);
}

.banner-yellow {
  background: linear-gradient(135deg, var(--color-warn-light), rgba(245, 166, 35, 0.06));
  border-bottom: 1px solid rgba(245, 166, 35, 0.15);
}

.banner-blue {
  background: linear-gradient(135deg, rgba(74, 144, 217, 0.08), rgba(74, 144, 217, 0.03));
  border-bottom: 1px solid rgba(74, 144, 217, 0.12);
}

.banner-orange {
  background: linear-gradient(135deg, var(--color-warn-light), rgba(245, 166, 35, 0.06));
  border-bottom: 1px solid rgba(245, 166, 35, 0.15);
}
</style>
