<script setup lang="ts">
import { computed } from 'vue'
import type { TemperatureDerived, MarketSnapshot } from '../services/api'
import {
  generateTemperatureNarrative,
  erpToTemperaturePosition,
  erpColorClass,
  pePercentileColorClass,
} from '../utils/temperature'

const props = defineProps<{
  derived: TemperatureDerived
  latest: MarketSnapshot[]
}>()

const narrative = computed(() => generateTemperatureNarrative(props.derived, props.latest))

const erpPosition = computed(() =>
  props.derived.erp != null ? erpToTemperaturePosition(props.derived.erp) : null,
)

const erpColor = computed(() =>
  props.derived.erp != null ? erpColorClass(props.derived.erp) : '',
)

const peColor = computed(() =>
  pePercentileColorClass(props.derived.pe_percentile ?? null),
)

const hasData = computed(() => props.derived.erp != null || props.derived.pe_ttm != null)

function formatTurnoverFn(v: number | null | undefined): string {
  if (v == null) return '--'
  if (v >= 10000) return `${(v / 10000).toFixed(1)}万亿`
  return `${Math.round(v)}亿`
}

const formatTurnover = computed(() => formatTurnoverFn(props.derived.turnover_5d_avg))

const adColorClass = computed(() => {
  const r = props.derived.advance_decline_ratio
  if (r == null) return 'tag-neutral'
  if (r >= 60) return 'tag-good'
  if (r >= 45) return 'tag-neutral'
  return 'tag-bad'
})

const turnoverColorClass = computed(() => {
  const t = props.derived.turnover_trend
  if (t === '放量') return 'tag-good'
  if (t === '缩量') return 'tag-bad'
  return 'tag-neutral'
})
</script>

<template>
  <section class="market-pulse">
    <div class="pulse-label">市场体温</div>

    <!-- 数据不足时显示占位 -->
    <div v-if="!hasData" class="pulse-empty">
      <span class="pulse-empty-text">数据积累中</span>
      <span class="pulse-empty-hint">预计 5 天后完整展示</span>
    </div>

    <template v-else>
      <!-- ERP 温度条 -->
      <div class="erp-section">
        <div class="erp-header">
          <span class="erp-label" :class="erpColor">{{ derived.erp_label || '--' }}</span>
          <span v-if="derived.erp != null" class="erp-value">{{ derived.erp.toFixed(2) }}%</span>
        </div>
        <div class="erp-track">
          <div
            class="erp-fill"
            :class="erpColor"
            :style="{ width: erpPosition != null ? erpPosition + '%' : '0%' }"
          ></div>
          <div
            v-if="erpPosition != null"
            class="erp-marker"
            :class="erpColor"
            :style="{ left: erpPosition + '%' }"
          ></div>
        </div>
        <div class="erp-scale">
          <span>极贵</span>
          <span>合理</span>
          <span>极便宜</span>
        </div>
      </div>

      <!-- 四行指标 -->
      <div class="metric-rows">
        <div class="metric-row" v-if="derived.pe_ttm != null">
          <span class="metric-icon">估</span>
          <span class="metric-name">估值</span>
          <span class="metric-val">PE {{ derived.pe_ttm.toFixed(1) }}</span>
          <span class="metric-tag" :class="peColor">{{ derived.pe_label || derived.pe_percentile != null ? `历史${derived.pe_percentile}%位` : '--' }}</span>
        </div>

        <div class="metric-row" v-if="derived.margin_balance_yi != null">
          <span class="metric-icon">杠</span>
          <span class="metric-name">杠杆</span>
          <span class="metric-val">两融 {{ derived.margin_balance_yi.toLocaleString() }}亿</span>
          <span class="metric-tag tag-neutral">--</span>
        </div>

        <div class="metric-row" v-if="derived.advance_decline_ratio != null">
          <span class="metric-icon">情</span>
          <span class="metric-name">情绪</span>
          <span class="metric-val">涨跌比 {{ derived.advance_decline_ratio.toFixed(0) }}%</span>
          <span class="metric-tag" :class="adColorClass">{{ derived.advance_decline_label || '--' }}</span>
        </div>

        <div class="metric-row" v-if="derived.turnover_5d_avg != null">
          <span class="metric-icon">量</span>
          <span class="metric-name">量能</span>
          <span class="metric-val">{{ formatTurnover }}</span>
          <span class="metric-tag" :class="turnoverColorClass">{{ derived.turnover_trend || '--' }}</span>
        </div>
      </div>

      <!-- 编辑点评 -->
      <p class="pulse-narrative">{{ narrative }}</p>
    </template>
  </section>
</template>

<style lang="scss" scoped>
@use '../styles/theme' as *;
@use '../styles/mixins' as *;

.market-pulse {
  @include editorial-card;
  padding-top: $space-lg;
  padding-bottom: $space-lg;
}

.pulse-label {
  @include editorial-label;
  margin-bottom: $space-md;
}

// === 空状态 ===
.pulse-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $space-xs;
  padding: $space-lg 0;
}

.pulse-empty-text {
  font-family: $font-sans;
  font-size: $text-md;
  color: $text-disabled;
}

.pulse-empty-hint {
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-disabled;
}

// === ERP 温度条 ===
.erp-section {
  margin-bottom: $space-lg;
}

.erp-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: $space-sm;
}

.erp-label {
  font-family: $font-serif;
  font-size: $text-lg;
  font-weight: $weight-bold;
  letter-spacing: 1px;

  // 全部使用主题变量：极值用 dark，中间档用 base
  &.erp-extreme-cheap { color: $color-up-dark; }
  &.erp-cheap { color: $color-up; }
  &.erp-fair { color: $color-neutral; }
  &.erp-expensive { color: $color-down; }
  &.erp-extreme-expensive { color: $color-down-dark; }
}

.erp-value {
  font-family: $font-serif;
  font-size: $text-xl;
  font-weight: $weight-bold;
  @include tabular-nums;
  color: $text-primary;
}

.erp-track {
  position: relative;
  height: 8px;
  // 纯主题变量三色渐变：$color-down → $color-neutral → $color-up
  background: linear-gradient(
    to right,
    $color-down 0%,
    $color-neutral 50%,
    $color-up 100%
  );
  border-radius: 1px;
  overflow: visible;
}

.erp-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  opacity: 0.25;
  background: $text-primary;
  transition: width $duration-normal $ease-out;
}

.erp-marker {
  position: absolute;
  top: -3px;
  width: 3px;
  height: 14px;
  background: $text-primary;
  transform: translateX(-50%);
  transition: left $duration-normal $ease-out;
}

.erp-scale {
  display: flex;
  justify-content: space-between;
  margin-top: $space-xs;
  font-family: $font-sans;
  font-size: $text-xs;
  letter-spacing: 1px;

  > :first-child { color: $color-down-dark; }
  > :nth-child(2) { color: $color-neutral; }
  > :last-child { color: $color-up-dark; }
}

// === 四行指标 ===
.metric-rows {
  border-top: $rule-thin;
  border-bottom: $rule-thin;
}

.metric-row {
  display: flex;
  align-items: center;
  gap: $space-sm;
  padding: $space-sm 0;
  font-family: $font-sans;
  font-size: $text-md;
  border-bottom: $rule-thin;

  &:last-child { border-bottom: none; }
}

.metric-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: $text-xs;
  font-weight: $weight-bold;
  color: $text-inverse;
  background: $text-secondary;
  border-radius: $radius-sm;
  flex-shrink: 0;
}

.metric-name {
  color: $text-secondary;
  font-size: $text-sm;
  width: 32px;
  flex-shrink: 0;
}

.metric-val {
  flex: 1;
  font-weight: $weight-medium;
  color: $text-primary;
  @include tabular-nums;
}

.metric-tag {
  font-size: $text-sm;
  font-weight: $weight-medium;
  padding: 1px $space-sm;
  border-radius: $radius-sm;
  flex-shrink: 0;
  white-space: nowrap;

  &.tag-good { background: $color-up-light; color: $color-up-dark; }
  &.tag-bad { background: $color-down-light; color: $color-down-dark; }
  &.tag-neutral { background: $bg-muted; color: $text-secondary; }
  &.erp-extreme-cheap { background: $color-up-light; color: $color-up-dark; }
  &.erp-cheap { background: $color-up-medium; color: $color-up-dark; }
  &.erp-fair { background: $color-neutral-light; color: $color-neutral; }
  &.erp-expensive { background: $color-down-medium; color: $color-down-dark; }
  &.erp-extreme-expensive { background: $color-down-medium; color: $color-down-dark; }
}

// === 编辑点评 ===
.pulse-narrative {
  font-family: $font-serif;
  font-size: $text-sm;
  line-height: $leading-relaxed;
  color: $text-secondary;
  margin: $space-md 0 0;
  text-indent: 2em;
}
</style>
