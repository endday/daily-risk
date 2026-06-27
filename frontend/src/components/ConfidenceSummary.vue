<script setup lang="ts">
defineProps<{
  nextDayProb: number | null
  nextDaySampleCount: number | null
  swingProb: number | null
  shortRating: number | null
}>()

function formatPct(prob: number | null): string {
  if (prob == null) return '--'
  return `${Math.round(prob * 100)}%`
}

function confidenceLabel(sampleCount: number | null): string {
  if (sampleCount == null) return '样本未知'
  if (sampleCount >= 15) return '样本充足'
  if (sampleCount >= 10) return '可供参考'
  return '样本偏少'
}

function directionLabel(prob: number | null): string {
  if (prob == null) return '未知'
  if (prob > 0.55) return '偏强'
  if (prob < 0.45) return '偏弱'
  return '中性'
}
</script>

<template>
  <section class="confidence-summary">
    <span class="summary-kicker">历史参考</span>
    <p class="summary-line">
      次日上涨概率
      <strong>{{ formatPct(nextDayProb) }}</strong>
      ，{{ directionLabel(nextDayProb) }}；
      样本
      <strong>{{ nextDaySampleCount ?? '--' }}</strong>
      年，{{ confidenceLabel(nextDaySampleCount) }}；
      本月胜率
      <strong>{{ formatPct(swingProb) }}</strong>
      ，短线评分
      <strong>{{ shortRating != null ? shortRating.toFixed(1) : '--' }}</strong>
      。
    </p>
  </section>
</template>

<style lang="scss" scoped>
@use '../styles/theme' as *;
@use '../styles/mixins' as *;

.confidence-summary {
  padding: $space-sm 0 $space-md;
}

.summary-kicker {
  @include editorial-label;
  margin-bottom: $space-xs;
}

.summary-line {
  margin: 0;
  font-family: $font-sans;
  font-size: $text-sm;
  line-height: $leading-relaxed;
  color: $text-secondary;
  padding-bottom: $space-sm;
  border-bottom: $rule-thin;

  strong {
    font-family: $font-serif;
    font-weight: $weight-bold;
    color: $text-primary;
    margin: 0 2px;
  }
}
</style>
