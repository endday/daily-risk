<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Almanac, AlmanacByIndex } from '../services/api'
import { formatPct, signalClass, probTextClass } from '../utils/display'

const props = defineProps<{
  almanacByIndex?: AlmanacByIndex
  nextMonthName: string
  nextDayShort: string
}>()

const indexCodes = ['000001', '000300', '000905'] as const
const activeIndex = ref<string>('000001')

const currentData = computed(() => {
  if (props.almanacByIndex) {
    return props.almanacByIndex[activeIndex.value as keyof AlmanacByIndex] ?? null
  }
  return null
})

const currentAlmanac = computed<Almanac | null>(() => {
  return currentData.value?.almanac ?? null
})

function signalColor(action: string): string {
  if (action === 'add') return 'signal-add'
  if (action === 'reduce') return 'signal-reduce'
  return 'signal-hold'
}
</script>

<template>
  <div class="almanac-card">
    <div class="almanac-header">
      <div class="almanac-title-group">
        <span class="almanac-subtitle">近20年历史统计</span>
      </div>
    </div>

    <!-- 指数 Tab -->
    <div class="index-tabs">
      <div
        v-for="code in indexCodes"
        :key="code"
        class="index-tab"
        :class="{ active: activeIndex === code }"
        @click="activeIndex = code"
      >
        {{ almanacByIndex?.[code]?.name ?? code }}
      </div>
    </div>

    <template v-if="currentData && currentAlmanac">
      <!-- 短线 -->
      <div class="dimension" :class="signalColor(currentAlmanac.short_term.signal.action)">
        <div class="dim-header">
          <span class="dim-label">短线</span>
          <span class="dim-sub">明日 {{ nextDayShort }}</span>
        </div>
        <div class="dim-body">
          <span class="dim-score" :class="signalClass(currentAlmanac.short_term.rating)">
            {{ currentAlmanac.short_term.rating.toFixed(1) }}
          </span>
          <span class="dim-signal" :class="signalColor(currentAlmanac.short_term.signal.action)">
            {{ currentAlmanac.short_term.signal.label }}
          </span>
        </div>
        <div class="dim-desc">{{ currentAlmanac.short_term.signal.description }}</div>
        <div class="dim-stats">
          今日 <span :class="probTextClass(currentData.today_prob)">{{ formatPct(currentData.today_prob) }}</span><span class="dim-sample">(n={{ currentData.today_sample_count }})</span>
          · 明日 <span :class="probTextClass(currentData.next_day_prob)">{{ formatPct(currentData.next_day_prob) }}</span><span class="dim-sample">(n={{ currentData.next_day_sample_count }})</span>
        </div>
        <div class="dim-confidence-warn" v-if="currentData.next_day_sample_count < 10">
          ⚠️ 样本量较少，评分仅供参考
        </div>
      </div>

      <!-- 波段 -->
      <div class="dimension" :class="signalColor(currentAlmanac.swing.signal.action)">
        <div class="dim-header">
          <span class="dim-label">波段</span>
          <span class="dim-sub">{{ nextMonthName }}</span>
        </div>
        <div class="dim-body">
          <span class="dim-score" :class="signalClass(currentAlmanac.swing.rating)">
            {{ currentAlmanac.swing.rating.toFixed(1) }}
          </span>
          <span class="dim-signal" :class="signalColor(currentAlmanac.swing.signal.action)">
            {{ currentAlmanac.swing.signal.label }}
          </span>
        </div>
        <div class="dim-desc">{{ currentAlmanac.swing.signal.description }}</div>
        <div class="dim-stats">
          本月 <span :class="probTextClass(currentData.this_month_prob)">{{ formatPct(currentData.this_month_prob) }}</span><span class="dim-sample">(n={{ currentData.this_month_sample_count }})</span>
          · 下月 <span :class="probTextClass(currentData.next_month_prob)">{{ formatPct(currentData.next_month_prob) }}</span><span class="dim-sample">(n={{ currentData.next_month_sample_count }})</span>
        </div>
        <div class="dim-confidence-warn" v-if="currentData.next_month_sample_count < 10">
          ⚠️ 样本量较少，评分仅供参考
        </div>
      </div>

      <!-- 综合建议 -->
      <div class="almanac-advice">
        {{ currentAlmanac.advice }}
      </div>
    </template>

    <div v-else class="almanac-empty">暂无该指数的历史统计数据</div>
  </div>
</template>

<style lang="scss" scoped>
@use '../styles/theme' as *;
@use '../styles/mixins' as *;

.almanac-card {
  @include editorial-card;
}

.almanac-header {
  display: flex;
  align-items: center;
  gap: $space-sm;
  margin-bottom: $space-sm;
  padding-bottom: $space-sm;
  border-bottom: $rule-heavy;
}

.almanac-title-group {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.almanac-title {
  font-family: $font-serif;
  font-size: $text-md;
  font-weight: $weight-bold;
  color: $text-primary;
  letter-spacing: 2px;
}

.almanac-subtitle {
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-tertiary;
  font-weight: $weight-normal;
}

// === 指数 Tab ===
.index-tabs {
  display: flex;
  gap: 0;
  background: transparent;
  border-radius: 0;
  padding: 0;
  margin-bottom: $space-md;
  border-bottom: 1px solid $border;
}

.index-tab {
  flex: 1;
  text-align: center;
  padding: $space-xs 0;
  font-family: $font-sans;
  font-size: $text-sm;
  font-weight: $weight-medium;
  color: $text-tertiary;
  border-radius: 0;
  cursor: pointer;
  transition: color $duration-fast $ease-out;
  position: relative;

  &.active {
    background: transparent;
    color: $text-primary;
    font-weight: $weight-semibold;

    &::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: 20%;
      right: 20%;
      height: 2px;
      background: $text-primary;
    }
  }

  &:active { transform: scale(0.97); }
}

// === 维度 ===
.dimension {
  border-radius: 0;
  padding: $space-sm 0;
  margin-bottom: $space-sm;
  border-left: 3px solid transparent;
  padding-left: $space-md;

  &.signal-add { border-left-color: $color-up; }
  &.signal-hold { border-left-color: $border; }
  &.signal-reduce { border-left-color: $color-down; }
}

.dim-header {
  display: flex;
  align-items: baseline;
  gap: $space-sm;
  margin-bottom: $space-xs;
}

.dim-label {
  font-family: $font-sans;
  font-size: $text-sm;
  font-weight: $weight-semibold;
  color: $text-secondary;
}

.dim-sub {
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-tertiary;
}

.dim-body {
  display: flex;
  align-items: baseline;
  gap: $space-sm;
  margin-bottom: $space-xs;
}

.dim-score {
  font-family: $font-serif;
  font-size: $text-2xl;
  font-weight: $weight-bold;
  line-height: 1;
  @include tabular-nums;

  &.bullish { color: $color-up; }
  &.neutral { color: $color-neutral; }
  &.bearish { color: $color-down; }
}

.dim-signal {
  font-family: $font-sans;
  font-size: $text-sm;
  font-weight: $weight-semibold;
  padding: 2px $space-sm;
  border-radius: $radius-sm;

  &.signal-add { background: $color-up-light; color: $color-up-dark; }
  &.signal-hold { background: $bg-muted; color: $text-secondary; }
  &.signal-reduce { background: $color-down-light; color: $color-down-dark; }
}

.dim-desc {
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-secondary;
  line-height: $leading-normal;
}

.dim-stats {
  font-family: $font-sans;
  font-size: $text-sm;
  font-weight: $weight-medium;
  margin-top: $space-xs;
  color: $text-secondary;
}

.dim-sample {
  font-size: $text-sm;
  color: $text-tertiary;
  font-weight: $weight-normal;
  margin-left: 2px;
}

.prob-up { color: $color-up; }
.prob-down { color: $color-down; }
.prob-neutral { color: $text-secondary; }

.dim-confidence-warn {
  font-family: $font-sans;
  font-size: $text-sm;
  color: $color-warn;
  margin-top: $space-xs;
  padding: $space-xs $space-sm;
  background: $color-neutral-light;
  border-radius: $radius-sm;
}

// === 综合建议 ===
.almanac-advice {
  margin-top: $space-xs;
  padding: $space-sm 0;
  border-top: $rule-thin;
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-secondary;
  line-height: $leading-relaxed;
  text-align: center;
}

.almanac-empty {
  text-align: center;
  padding: $space-2xl 0;
  color: $text-disabled;
  font-family: $font-sans;
  font-size: $text-sm;
}
</style>
