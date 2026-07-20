<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchIndustryRotation } from '../../services/api'
import type { IndustryRotationMatrixResponse, IndustryRotationMetric } from '../../services/api'

const CACHE_KEY = 'daily-risk:industry-rotation:logbias-v1'
const data = ref<IndustryRotationMatrixResponse | null>(null)
const loading = ref(false)
const error = ref('')

type MatrixRow = {
  boardCode: string
  boardName: string
  week: IndustryRotationMetric | null
  month: IndustryRotationMetric
  halfYear: IndustryRotationMetric | null
}

const rows = computed<MatrixRow[]>(() => {
  if (!data.value) return []
  const byCode = (items: IndustryRotationMetric[]) => new Map(items.map((item) => [item.board_code, item]))
  const week = byCode(data.value.windows.week.industries)
  const halfYear = byCode(data.value.windows.half_year.industries)

  return data.value.windows.month.industries.map((month) => ({
    boardCode: month.board_code,
    boardName: month.board_name,
    week: week.get(month.board_code) ?? null,
    month,
    halfYear: halfYear.get(month.board_code) ?? null,
  }))
})

function nextRefreshAt(now = new Date()): number {
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  let refreshAt = Date.UTC(
    beijing.getUTCFullYear(),
    beijing.getUTCMonth(),
    beijing.getUTCDate(),
    10,
    20,
    0,
  )
  if (refreshAt <= now.getTime()) refreshAt += 24 * 60 * 60 * 1000
  return refreshAt
}

function readCached(): IndustryRotationMatrixResponse | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as { expiresAt: number; data: IndustryRotationMatrixResponse }
    if (cached.expiresAt <= Date.now()) {
      localStorage.removeItem(CACHE_KEY)
      return null
    }
    return cached.data
  } catch {
    return null
  }
}

function writeCached(value: IndustryRotationMatrixResponse) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ expiresAt: nextRefreshAt(), data: value }))
  } catch {
    // Private browsing or a full storage quota should not block the page.
  }
}

function formatFlow(value: number | null | undefined): string {
  if (value == null) return '--'
  const yi = value / 100_000_000
  return `${yi > 0 ? '+' : ''}${yi.toFixed(Math.abs(yi) >= 100 ? 0 : 1)}亿`
}

function formatPct(value: number | null | undefined): string {
  if (value == null) return '--'
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function valueClass(value: number | null | undefined) {
  if (value == null || value === 0) return 'neutral'
  return value > 0 ? 'up' : 'down'
}

function logBiasClass(value: number | null | undefined) {
  if (value == null) return 'neutral'
  if (value > 15) return 'bias-hot'
  if (value >= 5) return 'bias-strong'
  if (value >= 0) return 'bias-above'
  if (value >= -5) return 'bias-pullback'
  return 'bias-breakdown'
}

async function load() {
  error.value = ''
  const cached = readCached()
  if (cached) {
    data.value = cached
    return
  }

  loading.value = true
  try {
    const response = await fetchIndustryRotation()
    data.value = response
    writeCached(response)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '行业数据加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => void load())
</script>

<template>
  <div class="rotation-page" :aria-busy="loading">
    <header class="rotation-header">
      <div>
        <p class="eyebrow">INDUSTRY FLOW & TREND</p>
        <h1>行业资金趋势</h1>
      </div>
      <div class="header-meta">
        <span v-if="loading" class="loading-indicator" role="status"><i></i>更新中</span>
        <span v-if="data" class="as-of">数据截至 {{ data.trade_date }}</span>
      </div>
    </header>

    <div v-if="loading && !data" class="state-line">正在加载行业数据...</div>
    <div v-else-if="error && !data" class="state-line error">{{ error }}</div>

    <template v-if="data">
      <p class="sort-note">按近一月涨跌排序。每个周期同时展示主力净流入与区间涨跌。</p>
      <div class="bias-guide" aria-label="主线乖离阈值说明">
        <span>主线乖离</span>
        <i>&lt;-5</i><i>-5~0</i><i>0~5</i><i>5~15</i><i>&gt;15</i>
      </div>

      <div class="matrix-scroll">
        <section class="matrix" aria-label="行业资金与趋势矩阵">
          <div class="matrix-head">
            <span>行业</span>
            <span>一周</span>
            <span>一月</span>
            <span>半年</span>
            <span title="[ln(收盘价) - EMA20(ln(收盘价))] × 100">主线乖离</span>
            <span>近一年</span>
          </div>

          <div v-for="row in rows" :key="row.boardCode" class="matrix-row">
            <strong class="industry-name">{{ row.boardName }}</strong>

            <div class="period-cell">
              <span :class="valueClass(row.week?.cumulative_main_net_inflow)">{{ formatFlow(row.week?.cumulative_main_net_inflow) }}</span>
              <b :class="valueClass(row.week?.period_return_pct)">{{ formatPct(row.week?.period_return_pct) }}</b>
            </div>

            <div class="period-cell">
              <span :class="valueClass(row.month.cumulative_main_net_inflow)">{{ formatFlow(row.month.cumulative_main_net_inflow) }}</span>
              <b :class="valueClass(row.month.period_return_pct)">{{ formatPct(row.month.period_return_pct) }}</b>
            </div>

            <div class="period-cell">
              <span :class="valueClass(row.halfYear?.cumulative_main_net_inflow)">{{ formatFlow(row.halfYear?.cumulative_main_net_inflow) }}</span>
              <b :class="valueClass(row.halfYear?.period_return_pct)">{{ formatPct(row.halfYear?.period_return_pct) }}</b>
            </div>

            <div class="bias-cell" :class="logBiasClass(row.month.log_bias_20_pct)">
              {{ formatPct(row.month.log_bias_20_pct) }}
            </div>

            <span class="annual-cell">积累中</span>
          </div>
        </section>
      </div>

      <footer class="matrix-note">
        <span>上行 / 流入为红，下行 / 流出为绿。</span>
        <span>主线乖离 = [ln(收盘价) - EMA20(ln(收盘价))] × 100；年度数据积累中。</span>
      </footer>

      <section class="bias-reading" aria-label="主线乖离解读">
        <div class="reading-title">主线乖离怎么看</div>
        <div class="reading-grid">
          <div class="reading-band breakdown"><b>&lt; -5</b><span>大幅跌穿均线，先按失速观察</span></div>
          <div class="reading-band pullback"><b>-5 ~ 0</b><span>刚跌穿均线，关注能否回抽</span></div>
          <div class="reading-band above"><b>0 ~ 5</b><span>均线上方，趋势尚未确认加速</span></div>
          <div class="reading-band strong"><b>5 ~ 15</b><span>主线强度区，观察持续性</span></div>
          <div class="reading-band hot"><b>&gt; 15</b><span>加速偏热，避免只因强势追高</span></div>
        </div>
        <p class="reading-summary">更有参考价值的形态是：先突破 5%，回调后在 0 附近获得支撑，再次向上突破 5%。单日触及 5% 不等于主线；持续站稳、相对同类行业更强，才说明趋势可能在扩散。</p>
      </section>
    </template>
  </div>
</template>

<style lang="scss" scoped>
@use '../../styles/theme' as *;

.rotation-page { max-width: 1080px; margin: 0 auto; padding: $space-xl 0 96px; }
.rotation-header { display: flex; align-items: end; justify-content: space-between; border-bottom: 2px solid $text-primary; padding-bottom: $space-md; }
.eyebrow { margin: 0 0 4px; color: $color-info; font-size: $text-xs; font-weight: $weight-bold; }
h1 { margin: 0; font-family: $font-serif; font-size: 28px; letter-spacing: 0; }
.header-meta { display: flex; flex-direction: column; align-items: end; gap: 4px; }
.as-of { color: $text-tertiary; font-size: $text-xs; }
.loading-indicator { display: inline-flex; align-items: center; gap: 5px; color: $color-info; font-size: $text-xs; }
.loading-indicator i { width: 9px; height: 9px; border: 1px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: rotation-spin .7s linear infinite; }
.sort-note { margin: $space-lg 0 $space-sm; color: $text-secondary; font-size: $text-sm; }
.bias-guide { display: flex; align-items: center; gap: 0; margin-bottom: $space-md; color: $text-tertiary; font-size: $text-xs; }
.bias-guide span { margin-right: $space-sm; color: $text-secondary; font-weight: $weight-bold; }
.bias-guide i { min-width: 42px; padding: 2px 4px; border-left: 1px solid $border; font-style: normal; text-align: center; }
.bias-guide i:nth-of-type(1) { color: $color-down; }
.bias-guide i:nth-of-type(2) { color: $color-neutral; }
.bias-guide i:nth-of-type(4) { color: $color-up; }
.bias-guide i:nth-of-type(5) { color: $color-warn; }
.matrix-scroll { overflow-x: auto; border-top: 1px solid $border-heavy; border-bottom: 1px solid $border; }
.matrix { min-width: 650px; }
.matrix-head, .matrix-row { display: grid; grid-template-columns: minmax(108px, 1.15fr) repeat(3, minmax(86px, 1fr)) minmax(68px, .72fr) minmax(58px, .65fr); align-items: center; }
.matrix-head { min-height: 38px; background: $bg-muted; color: $text-secondary; font-size: $text-xs; font-weight: $weight-bold; text-align: center; }
.matrix-head span:first-child { padding-left: $space-md; text-align: left; }
.matrix-row { min-height: 58px; border-top: 1px solid $border-light; }
.matrix-row:hover { background: $bg-hover; }
.industry-name { padding-left: $space-sm; font-size: $text-sm; }
.period-cell { display: flex; flex-direction: column; gap: 3px; align-items: center; font-size: $text-xs; font-variant-numeric: tabular-nums; }
.period-cell b { font-size: $text-sm; }
.bias-cell, .annual-cell { text-align: center; font-size: $text-sm; font-variant-numeric: tabular-nums; }
.annual-cell { color: $text-tertiary; font-size: $text-xs; }
.up { color: $color-up; }
.down { color: $color-down; }
.neutral { color: $text-secondary; }
.bias-hot { color: $color-warn; font-weight: $weight-bold; }
.bias-strong { color: $color-up; font-weight: $weight-bold; }
.bias-above { color: $text-secondary; }
.bias-pullback { color: $color-neutral; }
.bias-breakdown { color: $color-down; font-weight: $weight-bold; }
.matrix-note { display: flex; justify-content: space-between; gap: $space-md; margin-top: $space-md; color: $text-tertiary; font-size: $text-xs; line-height: 1.6; }
.bias-reading { margin-top: $space-xl; padding-top: $space-lg; border-top: 1px solid $border; }
.reading-title { margin-bottom: $space-sm; color: $text-primary; font-size: $text-sm; font-weight: $weight-bold; }
.reading-grid { display: grid; grid-template-columns: repeat(5, 1fr); border: 1px solid $border; }
.reading-band { min-height: 66px; padding: $space-sm; border-right: 1px solid $border; }
.reading-band:last-child { border-right: 0; }
.reading-band b { display: block; margin-bottom: 4px; font-size: $text-sm; }
.reading-band span { display: block; color: $text-secondary; font-size: $text-xs; line-height: 1.45; }
.reading-band.breakdown b { color: $color-down; }
.reading-band.pullback b { color: $color-neutral; }
.reading-band.strong b { color: $color-up; }
.reading-band.hot b { color: $color-warn; }
.reading-summary { margin: $space-md 0 0; color: $text-secondary; font-size: $text-xs; line-height: 1.7; }
.state-line { padding: 64px 0; color: $text-tertiary; text-align: center; }
.state-line.error { color: $color-up; }

@keyframes rotation-spin { to { transform: rotate(360deg); } }

@media (max-width: 640px) {
  .rotation-page { padding: $space-lg 0 88px; }
  .rotation-header { align-items: start; }
  .sort-note { margin: $space-md 0 $space-sm; font-size: $text-xs; }
  .bias-guide { gap: 0; margin-bottom: $space-sm; font-size: 10px; }
  .bias-guide span { margin-right: 4px; }
  .bias-guide i { min-width: 0; flex: 1; padding: 2px 1px; }
  .matrix-scroll { overflow-x: visible; margin: 0; }
  .matrix { min-width: 0; }
  .matrix-head, .matrix-row { grid-template-columns: minmax(68px, 1.15fr) repeat(3, minmax(56px, 1fr)) minmax(48px, .85fr); }
  .matrix-head { min-height: 34px; font-size: 10px; }
  .matrix-head span:first-child { padding-left: $space-sm; }
  .matrix-head span:last-child, .annual-cell { display: none; }
  .matrix-row { min-height: 54px; }
  .industry-name { padding-left: $space-sm; font-size: 12px; line-height: 1.25; overflow-wrap: anywhere; }
  .period-cell { gap: 2px; font-size: 10px; }
  .period-cell b, .bias-cell { font-size: 11px; }
  .matrix-note { flex-direction: column; gap: 2px; }
  .bias-reading { margin-top: $space-lg; padding-top: $space-md; }
  .reading-grid { grid-template-columns: 1fr; }
  .reading-band { display: grid; grid-template-columns: 56px 1fr; align-items: center; min-height: 0; padding: 8px $space-sm; border-right: 0; border-bottom: 1px solid $border; column-gap: $space-sm; }
  .reading-band:last-child { border-bottom: 0; }
  .reading-band b { margin-bottom: 0; }
}
</style>
