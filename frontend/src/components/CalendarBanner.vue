<script setup lang="ts">
import type { CalendarBannerData } from '../services/api'

defineProps<{
  banner: CalendarBannerData | null
}>()
</script>

<template>
  <div v-if="banner" class="banner" :class="'banner-' + banner.key">
    <span class="banner-icon">{{ banner.icon }}</span>
    <span class="banner-text">{{ banner.text }}</span>
  </div>
</template>

<style lang="scss" scoped>
@use '../styles/theme' as *;

.banner {
  display: flex;
  align-items: center;
  gap: $space-sm;
  padding: $space-sm 0;
  border-left: 3px solid $border-heavy;
  padding-left: $space-md;
  margin-bottom: $space-md;
  font-family: $font-sans;
  font-size: $text-sm;
  font-weight: $weight-medium;
  line-height: $leading-normal;
}

.banner-icon {
  font-size: $text-lg;
  flex-shrink: 0;
}

.banner-text {
  color: $text-primary;
}
</style>
