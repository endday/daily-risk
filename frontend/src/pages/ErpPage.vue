<script setup lang="ts">
import { ref, computed, onMounted, defineAsyncComponent } from 'vue'
import { useRouter } from 'vue-router'
import { fetchErpHistory } from '../services/api'
import type { MarketTemperatureCompactResponse } from '../services/api'
import { erpToTemperaturePosition, erpColorClass } from '../utils/temperature'

const ErpChart = defineAsyncComponent(() => import('../components/ErpChart.vue'))
const ERP_HISTORY_OPTIONS = [
  { label: '3年', years: 3 },
  { label: '5年', years: 5 },
  { label: '8年', years: 8 },
] as const
const ERP_MAX_POINTS = 320

const router = useRouter()
const loading = ref(true)
const data = ref<MarketTemperatureCompactResponse | null>(null)
const selectedYears = ref<(typeof ERP_HISTORY_OPTIONS)[number]['years']>(8)

async function loadErpHistory() {
  loading.value = true
  try {
    data.value = await fetchErpHistory(selectedYears.value, '000300', ERP_MAX_POINTS)
  } catch (e) {
    console.error('Failed to fetch ERP data:', e)
    data.value = null
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadErpHistory()
})

function handleYearsChange(years: (typeof ERP_HISTORY_OPTIONS)[number]['years']) {
  if (years === selectedYears.value) return
  selectedYears.value = years
  void loadErpHistory()
}

const sampledHint = computed(() => {
  if (!data.value?.sampled || !data.value.sample_step || data.value.sample_step <= 1) return ''
  return `为保证加载速度，已按约 ${data.value.sample_step} 个交易日采样`
})

function goHome() {
  router.push('/')
}

// === 当前值 ===
const derived = computed(() => data.value?.derived)
const erp = computed(() => derived.value?.erp)
const erpLabel = computed(() => derived.value?.erp_label)
const erpPosition = computed(() => erp.value != null ? erpToTemperaturePosition(erp.value) : null)
const erpColor = computed(() => erp.value != null ? erpColorClass(erp.value) : '')

// === 图表数据 ===
interface ErpPoint {
  date: string
  erp: number | null
  close: number | null
}

function computeRollingMean(values: number[], windowSize: number): number[] {
  const result: number[] = []
  let sum = 0

  for (let i = 0; i < values.length; i += 1) {
    sum += values[i]
    if (i >= windowSize) {
      sum -= values[i - windowSize]
    }

    const divisor = Math.min(i + 1, windowSize)
    result.push(Math.round((sum / divisor) * 100) / 100)
  }

  return result
}

const chartData = computed<ErpPoint[]>(() => {
  if (!data.value?.history) return []

  // 按日期分组，取沪深300(000300)
  const byDate: Record<string, ErpPoint> = {}
  for (const row of data.value.history) {
    if (row.index_code !== '000300') continue
    const d = row.trade_date
    if (!byDate[d]) byDate[d] = { date: d, erp: null, close: null }
    if (row.close_price != null) byDate[d].close = row.close_price
    if (row.pe_ttm != null && row.pe_ttm > 0 && row.bond_yield_10y != null) {
      byDate[d].erp = Math.round((1 / row.pe_ttm * 100 - row.bond_yield_10y) * 100) / 100
    }
  }

  const points = Object.values(byDate)
    .filter(p => p.erp != null)
    .sort((a, b) => a.date.localeCompare(b.date))
  return points
})

// ECharts 配置
const chartOption = computed(() => {
  const points = chartData.value
  if (points.length < 2) return null

  const dates = points.map(p => p.date)
  const erpValues = points.map(p => p.erp!)
  const closeValues = points.map(p => p.close)
  const erpMeanValues = computeRollingMean(erpValues, 60)
  const thresholdLines = [
    { yAxis: 0, lineStyle: { color: 'rgba(180, 83, 9, 0.35)', type: 'dashed' } },
    { yAxis: 2, lineStyle: { color: 'rgba(217, 119, 6, 0.25)', type: 'dashed' } },
    { yAxis: 5, lineStyle: { color: 'rgba(100, 116, 139, 0.3)', type: 'dashed' } },
    { yAxis: 8, lineStyle: { color: 'rgba(21, 128, 61, 0.3)', type: 'dashed' } },
  ]

  return {
    animation: false,
    grid: {
      left: 4,
      right: 18,
      top: 30,
      bottom: 84,
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', crossStyle: { color: '#999' } },
      formatter(params: any[]) {
        const date = params[0]?.axisValue || ''
        const erp = params.find((p: any) => p.seriesName === '股债利差')
        const close = params.find((p: any) => p.seriesName === '沪深300')
        let html = `<div style="font-family:sans-serif;font-size:12px"><b>${date}</b><br/>`
        if (erp) html += `<span style="color:#E8474C">股债利差: ${erp.value}%</span><br/>`
        if (close) html += `<span style="color:#1A1A1A">沪深300: ${close.value}</span>`
        html += '</div>'
        return html
      },
    },
    legend: {
      data: ['股债利差', 'ERP中枢', '沪深300'],
      bottom: 36,
      textStyle: { fontFamily: 'sans-serif', fontSize: 12, color: '#6B7280' },
      icon: 'roundRect',
      itemWidth: 14,
      itemHeight: 3,
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: {
        fontSize: 11,
        color: '#9CA3AF',
        formatter(val: string) {
          // 只显示月-日
          return val.slice(5)
        },
      },
      axisLine: { lineStyle: { color: '#E5E7EB' } },
      axisTick: { show: false },
    },
    yAxis: [
      {
        type: 'value',
        axisLabel: { fontSize: 11, color: '#9CA3AF', margin: 4 },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: '#F3F4F6' } },
      },
      {
        type: 'value',
        axisLabel: { fontSize: 11, color: '#9CA3AF' },
        axisLine: { show: false },
        splitLine: { show: false },
      },
    ],
    dataZoom: [
      {
        type: 'slider',
        start: 0,
        end: 100,
        height: 24,
        bottom: 8,
        borderColor: '#E5E7EB',
        fillerColor: 'rgba(26,26,26,0.08)',
        handleStyle: { color: '#1A1A1A', borderColor: '#1A1A1A' },
        textStyle: { color: '#9CA3AF', fontSize: 11 },
        dataBackground: {
          lineStyle: { color: '#E5E7EB' },
          areaStyle: { color: 'rgba(232,71,76,0.05)' },
        },
      },
      {
        type: 'inside',
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
      },
    ],
    series: [
      {
        name: '股债利差',
        type: 'line',
        data: erpValues,
        yAxisIndex: 0,
        symbol: 'none',
        lineStyle: { width: 2, color: '#5B8FF9' },
        itemStyle: { color: '#5B8FF9' },
        markLine: {
          silent: true,
          symbol: 'none',
          label: { show: false },
          data: thresholdLines,
        },
      },
      {
        name: 'ERP中枢',
        type: 'line',
        data: erpMeanValues,
        yAxisIndex: 0,
        symbol: 'none',
        smooth: true,
        lineStyle: { width: 1.5, color: '#F59E0B', opacity: 0.95 },
        itemStyle: { color: '#F59E0B' },
      },
      {
        name: '沪深300',
        type: 'line',
        data: closeValues,
        yAxisIndex: 1,
        symbol: 'none',
        lineStyle: { width: 1.5, color: '#111827' },
        itemStyle: { color: '#111827' },
      },
    ],
  }
})
</script>

<template>
  <div class="erp-page">
    <!-- 报头 -->
    <header class="erp-header">
      <button class="erp-back" @click="goHome">← 首页</button>
      <div class="erp-title-block">
        <h1 class="erp-title">股债利差 (ERP)</h1>
        <p class="erp-desc">盈利收益率 - 10年期国债收益率</p>
      </div>
    </header>

    <!-- 加载态 -->
    <div v-if="loading" class="erp-loading">数据加载中...</div>

    <template v-else-if="data">
      <!-- 最新数值 -->
      <section class="erp-summary">
        <div class="erp-summary-row">
          <span class="erp-label" :class="erpColor">{{ erpLabel || '--' }}</span>
          <span v-if="erp != null" class="erp-value">{{ erp.toFixed(2) }}%</span>
        </div>

        <!-- 温度条 -->
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

        <div class="erp-range-switch" role="tablist" aria-label="ERP 历史范围">
          <button
            v-for="option in ERP_HISTORY_OPTIONS"
            :key="option.years"
            class="range-chip"
            :class="{ active: option.years === selectedYears }"
            @click="handleYearsChange(option.years)"
          >{{ option.label }}</button>
        </div>

        <!-- 区间释义 -->
        <div class="erp-zone-legend">
          <span class="zone-item"><span class="zone-dot dot-expensive"></span>ERP < 0 极贵</span>
          <span class="zone-item"><span class="zone-dot dot-fair"></span>0~2 偏高估</span>
          <span class="zone-item"><span class="zone-dot dot-neutral"></span>2~5 合理</span>
          <span class="zone-item"><span class="zone-dot dot-cheap"></span>5~8 低估</span>
          <span class="zone-item"><span class="zone-dot dot-extreme-cheap"></span>>8 极便宜</span>
        </div>
      </section>

      <div class="rule-thin"></div>

      <!-- 图表 -->
      <section class="erp-chart-section">
        <ErpChart v-if="chartOption" :option="chartOption" class="erp-chart" />
        <div v-else class="erp-chart-empty">历史数据不足，暂无法展示走势</div>
        <p v-if="sampledHint" class="erp-chart-note">{{ sampledHint }}</p>
      </section>

      <!-- 底部 -->
      <footer class="erp-footer">
        <div class="footer-rule"></div>
        <span>历史统计不代表未来表现 · 仅供参考，不构成投资建议</span>
      </footer>
    </template>

    <div v-else class="erp-error">数据加载失败，请稍后重试</div>
  </div>
</template>

<style lang="scss" scoped>
@use '../styles/theme' as *;
@use '../styles/mixins' as *;

.erp-page {
  min-height: 100vh;
  padding: 0 $space-xl;
  background: $bg-page;
  color: $text-primary;
  font-family: $font-serif;
}

// === 报头 ===
.erp-header {
  display: flex;
  align-items: center;
  gap: $space-md;
  padding: $space-md 0;
  border-bottom: $rule-thin;
}

.erp-back {
  background: none;
  border: 1px solid $border;
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-secondary;
  padding: $space-xs $space-sm;
  cursor: pointer;
  border-radius: $radius-sm;

  &:active { color: $text-primary; border-color: $text-primary; }
}

.erp-title-block {
  flex: 1;
}

.erp-title {
  font-family: $font-serif;
  font-size: $text-lg;
  font-weight: $weight-bold;
  letter-spacing: 1px;
  color: $text-primary;
  margin: 0;
}

.erp-desc {
  font-family: $font-sans;
  font-size: $text-xs;
  color: $text-tertiary;
  margin: 2px 0 0;
}

// === 数值卡片 ===
.erp-summary {
  padding: $space-lg 0;
}

.erp-summary-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 2px;
}

.erp-label {
  font-family: $font-serif;
  font-size: $text-lg;
  font-weight: $weight-bold;
  letter-spacing: 1px;

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
  background: linear-gradient(to right, $color-down 0%, $color-neutral 50%, $color-up 100%);
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
}

.erp-marker {
  position: absolute;
  top: -3px;
  width: 3px;
  height: 14px;
  background: $text-primary;
  transform: translateX(-50%);

  &.erp-extreme-cheap { background: $color-up-dark; }
  &.erp-cheap { background: $color-up; }
  &.erp-fair { background: $color-neutral; }
  &.erp-expensive { background: $color-down; }
  &.erp-extreme-expensive { background: $color-down-dark; }
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

.erp-zone-legend {
  display: flex;
  flex-wrap: wrap;
  gap: $space-sm $space-md;
  margin-top: $space-md;
  font-family: $font-sans;
  font-size: $text-xs;
  color: $text-secondary;
}

.zone-item {
  display: flex;
  align-items: center;
  gap: $space-xs;
}

.zone-dot {
  width: 8px;
  height: 8px;
  border-radius: 1px;

  &.dot-expensive { background: $color-down-medium; }
  &.dot-fair { background: rgba($color-down, 0.15); }
  &.dot-neutral { background: rgba($color-neutral, 0.15); }
  &.dot-cheap { background: rgba($color-up, 0.15); }
  &.dot-extreme-cheap { background: $color-up-medium; }
}

.erp-range-switch {
  display: flex;
  gap: $space-sm;
  margin-top: $space-md;
}

.range-chip {
  min-width: 52px;
  padding: $space-xs $space-sm;
  border: 1px solid $border;
  border-radius: $radius-sm;
  background: transparent;
  color: $text-secondary;
  font-family: $font-sans;
  font-size: $text-sm;
  cursor: pointer;

  &.active {
    background: $text-primary;
    border-color: $text-primary;
    color: $text-inverse;
  }
}

// === 分割线 ===
.rule-thin {
  height: 1px;
  background: $border;
}

// === 图表 ===
.erp-chart-section {
  padding: $space-lg 0;
}

.erp-chart {
  width: 100%;
  height: 400px;
}

.erp-chart-empty {
  text-align: center;
  padding: $space-3xl 0;
  color: $text-disabled;
  font-family: $font-sans;
  font-size: $text-md;
}

.erp-chart-note {
  margin: $space-sm 0 0;
  font-family: $font-sans;
  font-size: $text-xs;
  color: $text-tertiary;
  text-align: center;
}

.erp-loading,
.erp-error {
  text-align: center;
  padding: $space-3xl 0;
  font-family: $font-sans;
  font-size: $text-md;
  color: $text-secondary;
}

.erp-error { color: $color-up; }

// === 底部 ===
.erp-footer {
  text-align: center;
  font-size: $text-xs;
  color: $text-tertiary;
  font-family: $font-sans;
  margin-top: $space-xl;
  padding-bottom: $space-xl;
}

.footer-rule {
  height: 1px;
  background: $border;
  margin-bottom: $space-md;
}
</style>
