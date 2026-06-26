<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  MarkAreaComponent,
  LegendComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { fetchMarketTemperature } from '../services/api'
import type { MarketTemperatureResponse } from '../services/api'
import { erpToTemperaturePosition, erpColorClass } from '../utils/temperature'

use([
  LineChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  MarkAreaComponent,
  LegendComponent,
  CanvasRenderer,
])

const router = useRouter()
const loading = ref(true)
const data = ref<MarketTemperatureResponse | null>(null)

onMounted(() => {
  fetchMarketTemperature(365)
    .then(res => { data.value = res })
    .catch(e => { console.error('Failed to fetch ERP data:', e) })
    .finally(() => { loading.value = false })
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

  // 极贵区间 (<0) 和各阈值线
  const markAreas: any[] = [
    [
      { yAxis: -5, name: '极贵' },
      { yAxis: 0 },
    ],
    [
      { yAxis: 0 },
      { yAxis: 2 },
    ],
    [
      { yAxis: 2 },
      { yAxis: 5 },
    ],
    [
      { yAxis: 5 },
      { yAxis: 8 },
    ],
    [
      { yAxis: 8 },
      { yAxis: 15 },
    ],
  ]

  const zoneColors = [
    'rgba(46,175,125,0.06)',   // 极贵 (淡绿)
    'rgba(26,26,26,0.02)',     // 偏高估 (极淡灰)
    'rgba(26,26,26,0.015)',    // 合理 (几乎透明)
    'rgba(232,71,76,0.04)',    // 偏低估 (淡红)
    'rgba(196,30,58,0.07)',    // 极便宜 (稍深红)
  ]

  return {
    animation: false,
    grid: {
      left: 50,
      right: 50,
      top: 30,
      bottom: 70,
      backgroundColor: '#FFFFFF',
      show: true,
      borderWidth: 0,
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
      data: ['股债利差', '沪深300'],
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
        name: 'ERP %',
        nameTextStyle: { fontSize: 11, color: '#9CA3AF', padding: [0, 30, 0, 0] },
        axisLabel: { fontSize: 11, color: '#9CA3AF' },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: '#F3F4F6' } },
      },
      {
        type: 'value',
        name: '指数',
        nameTextStyle: { fontSize: 11, color: '#9CA3AF', padding: [0, 0, 0, 30] },
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
        lineStyle: { width: 2, color: '#E8474C' },
        itemStyle: { color: '#E8474C' },
        markArea: {
          silent: true,
          data: markAreas.map((area, i) => ({
            itemStyle: { color: zoneColors[i] },
            name: ['极贵', '偏高估', '合理', '偏低估', '极便宜'][i],
            ...area,
          })),
        },
      },
      {
        name: '沪深300',
        type: 'line',
        data: closeValues,
        yAxisIndex: 1,
        symbol: 'none',
        lineStyle: { width: 1.5, color: '#1A1A1A' },
        itemStyle: { color: '#1A1A1A' },
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
        <VChart v-if="chartOption" :option="chartOption" autoresize class="erp-chart" />
        <div v-else class="erp-chart-empty">历史数据不足，暂无法展示走势</div>
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
