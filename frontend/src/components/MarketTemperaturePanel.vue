<script setup lang="ts">
import { computed } from 'vue'
import { getToday } from '../../../shared/date-utils'
import type { MarketRiskResponse } from '../services/api'

const props = defineProps<{
  risk: MarketRiskResponse
}>()

const temperature = computed(() => props.risk.temperature ?? null)
const dimensions = computed(() => temperature.value?.dimensions ?? [])
const scoreText = computed(() => temperature.value?.score == null ? '--' : String(temperature.value.score))
const bandClass = computed(() => `band-${temperature.value?.band ?? 'unavailable'}`)
const firstDimension = computed(() => dimensions.value[0] ?? null)
const detailTarget = computed(() => (
  firstDimension.value
    ? { name: 'temperature-dimension', params: { dimensionKey: firstDimension.value.key } }
    : { name: 'temperature' }
))
const dataLagDays = computed(() => {
  if (!props.risk.trade_date) return null
  const latest = new Date(`${props.risk.trade_date}T00:00:00Z`).getTime()
  const today = new Date(`${getToday()}T00:00:00Z`).getTime()
  const diff = Math.floor((today - latest) / 86400000)
  return diff > 0 ? diff : 0
})
const isDataStale = computed(() => (dataLagDays.value ?? 0) >= 2)

</script>

<template>
  <section class="temperature-panel" aria-labelledby="market-temperature-title">
    <header class="temperature-head">
      <div>
        <p class="kicker">MARKET TEMPERATURE</p>
        <h2 id="market-temperature-title">今日市场温度</h2>
      </div>
      <div class="asof-stack">
        <span class="asof">截至 {{ risk.trade_date || '--' }}</span>
        <span v-if="isDataStale" class="stale-badge">数据可能滞后 {{ dataLagDays }} 天</span>
      </div>
    </header>

    <div class="temperature-hero" :class="bandClass">
      <div class="score-block">
        <strong>{{ scoreText }}</strong>
        <span>/ 100</span>
      </div>
      <div class="score-copy">
        <span class="band-pill">{{ temperature?.label ?? '数据不足' }}</span>
        <p>{{ temperature?.summary ?? '市场温度数据仍在积累' }}</p>
        <small>
          {{ temperature?.available_dimension_count ?? 0 }}/{{ temperature?.total_dimension_count ?? 7 }} 个维度可用
        </small>
      </div>
    </div>

    <RouterLink class="detail-entry" :to="detailTarget">
      <span>
        <strong>市场温度详情</strong>
        <small>{{ dimensions.length }} 个维度 · 完整明细</small>
      </span>
      <b>查看</b>
    </RouterLink>
  </section>
</template>

<style lang="scss" scoped>
@use '../styles/theme' as *;

.temperature-panel {
  padding: $space-lg 0 $space-xl;
  border-top: 3px solid $text-primary;
  border-bottom: 1px solid $border-heavy;
  font-family: $font-sans;
}

.temperature-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: $space-md;
}

.kicker {
  margin: 0 0 4px;
  color: $color-info;
  font-size: 10px;
  font-weight: $weight-bold;
  letter-spacing: .08em;
}

.temperature-head h2 {
  margin: 0;
  font-family: $font-serif;
  font-size: $text-2xl;
  line-height: 1;
}

.asof {
  color: $text-tertiary;
  font-size: $text-xs;
  white-space: nowrap;
}

.asof-stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-end;
}

.stale-badge {
  display: inline-block;
  padding: 2px $space-sm;
  border: 1px solid $color-warn;
  color: $color-warn;
  font-size: $text-xs;
  font-weight: $weight-bold;
  white-space: nowrap;
}

.temperature-hero {
  display: grid;
  grid-template-columns: minmax(126px, 180px) 1fr;
  gap: $space-xl;
  align-items: center;
  margin-top: $space-lg;
  padding: $space-lg 0;
  border-top: 1px solid $border;
  border-bottom: 1px solid $border;
}

.score-block {
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
  font-family: $font-serif;
}

.score-block strong {
  color: $text-primary;
  font-size: 58px;
  font-variant-numeric: tabular-nums;
  line-height: .9;
}

.score-block span {
  color: $text-tertiary;
  font-size: $text-md;
}

.score-copy {
  min-width: 0;
}

.band-pill {
  display: inline-block;
  padding: 2px $space-sm;
  border: 1px solid $border-heavy;
  color: $text-primary;
  font-size: $text-xs;
  font-weight: $weight-bold;
}

.score-copy p {
  margin: $space-sm 0 4px;
  color: $text-primary;
  font-family: $font-serif;
  font-size: $text-lg;
  line-height: $leading-normal;
}

.score-copy small {
  color: $text-tertiary;
  font-size: $text-xs;
}

.detail-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $space-md;
  padding: $space-md 0 0;
  color: $text-primary;
  text-decoration: none;
  font-family: $font-sans;
}

.detail-entry span {
  display: block;
}

.detail-entry strong {
  display: block;
  font-size: $text-xs;
  font-weight: $weight-bold;
  letter-spacing: .08em;
}

.detail-entry small {
  display: block;
  margin-top: 2px;
  color: $text-tertiary;
  font-size: $text-xs;
}

.detail-entry b {
  flex: 0 0 auto;
  padding: 4px $space-sm;
  border: 1px solid $border-heavy;
  color: $text-primary;
  font-size: $text-xs;
  font-weight: $weight-bold;
}

@media (max-width: 640px) {
  .temperature-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 5px;
  }

  .asof-stack {
    align-items: flex-start;
  }

  .temperature-hero {
    grid-template-columns: 1fr;
    gap: $space-sm;
  }

  .score-block strong {
    font-size: 48px;
  }
}
</style>
