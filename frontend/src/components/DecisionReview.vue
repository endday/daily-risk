<script setup lang="ts">
import { computed } from 'vue'
import type { DecisionReviewItem } from '../utils/decision-journal'

const props = defineProps<{
  reviews: DecisionReviewItem[]
}>()

const emit = defineEmits<{
  dismiss: []
}>()

// 只显示最新的 1 条回看
const latestReview = computed(() => props.reviews[0] ?? null)

const isPositive = computed(() =>
  latestReview.value ? latestReview.value.returnPct > 0.5 : false
)

const isNegative = computed(() =>
  latestReview.value ? latestReview.value.returnPct < -0.5 : false
)

const intentText = computed(() =>
  latestReview.value?.intent === 'buy' ? '买入' : '卖出'
)

const daysText = computed(() => {
  const days = latestReview.value?.daysPassed ?? 0
  if (days >= 5) return '5天前'
  if (days >= 3) return '3天前'
  return '昨天'
})
</script>

<template>
  <div v-if="latestReview" class="review-bar" :class="{ positive: isPositive, negative: isNegative }">
    <div class="review-content">
      <span class="review-icon">{{ isPositive ? '✓' : isNegative ? '—' : '~' }}</span>
      <span class="review-text">
        <span class="review-when">{{ daysText }}你想{{ intentText }}</span>
        <span class="review-result">，{{ latestReview.returnText }}</span>
      </span>
    </div>
    <button class="review-dismiss" @click="emit('dismiss')" title="关闭">×</button>
  </div>
</template>

<style lang="scss" scoped>
@use '../styles/theme' as *;
@use '../styles/mixins' as *;

.review-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $space-sm $space-lg;
  font-family: $font-sans;
  font-size: $text-sm;
  border-bottom: $rule-thin;
  background: $bg-muted;

  &.positive {
    background: $color-up-light;
    .review-icon { color: $color-up; }
  }

  &.negative {
    background: $color-down-light;
    .review-icon { color: $color-down; }
  }
}

.review-content {
  display: flex;
  align-items: center;
  gap: $space-sm;
  flex: 1;
  min-width: 0;
}

.review-icon {
  font-size: $text-md;
  font-weight: $weight-bold;
  flex-shrink: 0;
  color: $text-secondary;
}

.review-text {
  color: $text-primary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.review-when {
  color: $text-secondary;
}

.review-result {
  font-weight: $weight-medium;
}

.review-dismiss {
  flex-shrink: 0;
  background: none;
  border: none;
  font-size: $text-lg;
  color: $text-tertiary;
  cursor: pointer;
  padding: 0 $space-xs;
  line-height: 1;

  &:active {
    color: $text-primary;
  }
}
</style>
