<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getToday } from '../../../shared/date-utils'
import { fetchMarketRisk } from '../services/api'
import type { MarketRiskDimension, MarketRiskResponse, MarketTemperatureBand } from '../services/api'

const route = useRoute()
const risk = ref<MarketRiskResponse | null>(null)
const loading = ref(true)
const error = ref('')

const bandLabel: Record<MarketTemperatureBand, string> = {
  unavailable: '数据不足',
  cold: '极冷',
  cool: '偏冷',
  neutral: '中性',
  warm: '偏暖',
  hot: '过热',
}

const dimensions = computed<MarketRiskDimension[]>(() => risk.value?.temperature?.dimensions ?? [])
const dimension = computed(() => dimensions.value.find((item) => item.key === route.params.dimensionKey) ?? null)
const availableMetricCount = computed(() => dimension.value?.metrics.filter((item) => item.status === 'available').length ?? 0)
const dataLagDays = computed(() => {
  if (!risk.value?.trade_date) return null
  const latest = new Date(`${risk.value.trade_date}T00:00:00Z`).getTime()
  const today = new Date(`${getToday()}T00:00:00Z`).getTime()
  const diff = Math.floor((today - latest) / 86400000)
  return diff > 0 ? diff : 0
})
const isDataStale = computed(() => (dataLagDays.value ?? 0) >= 2)

onMounted(async () => {
  loading.value = true
  error.value = ''
  try {
    risk.value = await fetchMarketRisk()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="dimension-page">
    <header class="page-head">
      <RouterLink class="back-link" to="/">返回今日</RouterLink>
      <div>
        <p class="kicker">MARKET TEMPERATURE</p>
        <h1>{{ dimension?.label ?? '子指标详情' }}</h1>
      </div>
      <div class="asof-stack">
        <span class="asof">截至 {{ risk?.trade_date || '--' }}</span>
        <span v-if="isDataStale" class="stale-badge">数据可能滞后 {{ dataLagDays }} 天</span>
      </div>
    </header>

    <section v-if="loading" class="state-panel">加载中...</section>
    <section v-else-if="error" class="state-panel error">{{ error }}</section>
    <section v-else-if="!dimension" class="state-panel">
      <p>没有找到这个温度维度。</p>
      <RouterLink to="/">回到首页</RouterLink>
    </section>

    <template v-else>
      <section class="dimension-summary" :class="`band-${dimension.band}`">
        <div class="score-block">
          <strong>{{ dimension.score ?? '--' }}</strong>
          <span>/ 100</span>
        </div>
        <div class="summary-copy">
          <span class="band-pill">{{ bandLabel[dimension.band] }}</span>
          <p>{{ dimension.summary }}</p>
          <small>{{ availableMetricCount }}/{{ dimension.metrics.length }} 个子指标可用</small>
        </div>
      </section>

      <nav class="dimension-nav" aria-label="市场温度维度">
        <RouterLink
          v-for="item in dimensions"
          :key="item.key"
          :to="{ name: 'temperature-dimension', params: { dimensionKey: item.key } }"
          class="nav-item"
          :class="{ active: item.key === dimension.key }"
        >
          <span>{{ item.label }}</span>
          <strong>{{ item.score ?? '--' }}</strong>
        </RouterLink>
      </nav>

      <section class="metric-section">
        <header>
          <h2>子指标</h2>
          <span>原始输入、缺失项和计算口径</span>
        </header>

        <dl class="metric-list">
          <div
            v-for="item in dimension.metrics"
            :key="item.key"
            class="metric-row"
            :class="{ missing: item.status === 'missing' }"
          >
            <dt>
              {{ item.label }}
              <small v-if="item.description">{{ item.description }}</small>
            </dt>
            <dd>{{ item.display_value }}</dd>
          </div>
        </dl>
      </section>
    </template>
  </main>
</template>

<style lang="scss" scoped>
@use '../styles/theme' as *;

.dimension-page {
  min-height: 100vh;
  padding: $space-lg $space-xl $space-2xl;
  background: $bg-page;
  color: $text-primary;
  font-family: $font-sans;
}

.page-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: $space-xl;
  align-items: end;
  padding-bottom: $space-lg;
  border-bottom: 3px solid $text-primary;
}

.back-link {
  color: $color-info;
  font-size: $text-sm;
  font-weight: $weight-bold;
  text-decoration: none;
}

.kicker {
  margin: 0 0 4px;
  color: $color-info;
  font-size: 10px;
  font-weight: $weight-bold;
  letter-spacing: .08em;
}

h1 {
  margin: 0;
  font-family: $font-serif;
  font-size: $text-2xl;
  line-height: 1.1;
}

.asof-stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-end;
}

.asof {
  color: $text-tertiary;
  font-size: $text-xs;
  white-space: nowrap;
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

.state-panel {
  padding: $space-xl 0;
  border-bottom: 1px solid $border;
  color: $text-secondary;
}

.state-panel.error {
  color: $color-warn;
}

.dimension-summary {
  display: grid;
  grid-template-columns: minmax(120px, 170px) 1fr;
  gap: $space-xl;
  align-items: center;
  padding: $space-xl 0;
  border-bottom: 1px solid $border-heavy;
}

.score-block {
  display: flex;
  align-items: baseline;
  gap: 5px;
  font-family: $font-serif;
}

.score-block strong {
  font-size: 58px;
  font-variant-numeric: tabular-nums;
  line-height: .9;
}

.score-block span {
  color: $text-tertiary;
  font-size: $text-md;
}

.band-pill {
  display: inline-block;
  padding: 2px $space-sm;
  border: 1px solid $border-heavy;
  font-size: $text-xs;
  font-weight: $weight-bold;
}

.summary-copy p {
  margin: $space-sm 0 4px;
  font-family: $font-serif;
  font-size: $text-lg;
  line-height: $leading-normal;
}

.summary-copy small {
  color: $text-tertiary;
  font-size: $text-xs;
}

.band-warm .score-block strong,
.band-hot .score-block strong {
  color: $color-up;
}

.band-cool .score-block strong,
.band-cold .score-block strong {
  color: $color-down;
}

.band-unavailable .score-block strong {
  color: $text-disabled;
}

.dimension-nav {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  border-bottom: 1px solid $border;
}

.nav-item {
  display: flex;
  justify-content: space-between;
  gap: $space-sm;
  min-width: 0;
  padding: $space-sm;
  border-right: 1px solid $border;
  color: $text-secondary;
  text-decoration: none;
}

.nav-item:last-child {
  border-right: 0;
}

.nav-item.active {
  background: $text-primary;
  color: $text-inverse;
}

.nav-item span {
  min-width: 0;
  overflow: hidden;
  font-size: $text-xs;
  font-weight: $weight-bold;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-item strong {
  font-family: $font-serif;
  font-size: $text-md;
  font-variant-numeric: tabular-nums;
}

.metric-section {
  padding-top: $space-lg;
}

.metric-section header {
  display: flex;
  justify-content: space-between;
  gap: $space-md;
  align-items: baseline;
  padding-bottom: $space-sm;
}

.metric-section h2 {
  margin: 0;
  font-family: $font-serif;
  font-size: $text-xl;
}

.metric-section header span {
  color: $text-tertiary;
  font-size: $text-xs;
}

.metric-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  border-top: 1px solid $border-heavy;
}

.metric-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(96px, auto);
  gap: $space-lg;
  min-width: 0;
  padding: $space-md;
  border-right: 1px solid $border;
  border-bottom: 1px solid $border-light;
}

.metric-row:nth-child(2n) {
  border-right: 0;
}

.metric-row dt {
  min-width: 0;
  color: $text-secondary;
  font-size: $text-sm;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.metric-row dt small {
  display: block;
  margin-top: 2px;
  color: $text-tertiary;
  font-size: $text-xs;
  line-height: 1.4;
}

.metric-row dd {
  margin: 0;
  color: $text-primary;
  font-size: $text-sm;
  font-weight: $weight-bold;
  font-variant-numeric: tabular-nums;
  line-height: 1.45;
  text-align: right;
  overflow-wrap: anywhere;
}

.metric-row.missing dd,
.metric-row.missing dt {
  color: $text-disabled;
}

@media (max-width: 900px) {
  .page-head {
    grid-template-columns: 1fr;
    gap: $space-sm;
    align-items: start;
  }

  .asof-stack {
    align-items: flex-start;
  }

  .dimension-nav {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .nav-item:nth-child(2n) {
    border-right: 0;
  }

  .metric-list {
    grid-template-columns: 1fr;
  }

  .metric-row,
  .metric-row:nth-child(2n) {
    border-right: 0;
  }
}

@media (max-width: 640px) {
  .dimension-page {
    padding: $space-md $space-lg $space-xl;
  }

  .dimension-summary {
    grid-template-columns: 1fr;
    gap: $space-sm;
  }

  .score-block strong {
    font-size: 48px;
  }

  .metric-section header {
    align-items: flex-start;
    flex-direction: column;
    gap: 3px;
  }

  .metric-row {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .metric-row dd {
    text-align: left;
  }
}
</style>
