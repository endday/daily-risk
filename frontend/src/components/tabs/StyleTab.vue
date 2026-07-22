<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchRelativeStrength } from '../../services/api'
import type {
  InstrumentQualityStats,
  RelativeStrengthPair,
  RelativeStrengthResponse,
  RelativeStrengthState,
} from '../../services/api'

const CACHE_KEY = 'daily-risk:relative-strength:v1'
const CACHE_MS = 5 * 60 * 1000
const data = ref<RelativeStrengthResponse | null>(null)
const loading = ref(false)
const error = ref('')

const stateMeta: Record<RelativeStrengthState, { label: string; detail: string }> = {
  overheated: { label: '相对过热', detail: '追涨风险上升' },
  strong: { label: '相对走强', detail: '趋势占优' },
  normal: { label: '均衡', detail: '未见极端' },
  weak: { label: '相对走弱', detail: '趋势落后' },
  oversold: { label: '相对超卖', detail: '反转尚待确认' },
}

const sortedPairs = computed(() => [...(data.value?.pairs ?? [])].sort(
  (a, b) => (b.relative_return_60d ?? -Infinity) - (a.relative_return_60d ?? -Infinity),
))
const strongest = computed(() => sortedPairs.value.find((pair) => pair.relative_return_60d != null) ?? null)
const weakest = computed(() => [...sortedPairs.value].reverse().find((pair) => pair.relative_return_60d != null) ?? null)
const extremeCount = computed(() => data.value?.pairs.filter(
  (pair) => pair.state === 'overheated' || pair.state === 'oversold',
).length ?? 0)

function readCache(): RelativeStrengthResponse | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as { expiresAt: number; data: RelativeStrengthResponse }
    if (cached.expiresAt <= Date.now()) return null
    return cached.data
  } catch {
    return null
  }
}

function writeCache(value: RelativeStrengthResponse) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ expiresAt: Date.now() + CACHE_MS, data: value }))
  } catch {
    // Storage availability should not block live data.
  }
}

function formatPct(value: number | null, digits = 2): string {
  if (value == null) return '--'
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`
}

function valueClass(value: number | null): string {
  if (value == null || Math.abs(value) < 0.005) return 'neutral'
  return value > 0 ? 'up' : 'down'
}

function stateClass(state: RelativeStrengthState): string {
  return `state-${state}`
}

function coverageLabel(item: InstrumentQualityStats): string {
  if (item.valid_close_count === 0) return '无数据'
  if (!item.window_available['252']) return '积累中'
  if (item.missing_close_count || item.non_positive_close_count || item.duplicate_date_count) return '需检查'
  return '完整'
}

function meanReversionRate(pair: RelativeStrengthPair): string {
  const stat = pair.forward_stats.find((item) => item.horizon_days === 20)
  if (!stat || stat.positive_probability == null) return '--'
  return `${stat.positive_probability.toFixed(0)}%`
}

async function load() {
  const cached = readCache()
  if (cached) {
    data.value = cached
    return
  }
  loading.value = true
  error.value = ''
  try {
    const response = await fetchRelativeStrength()
    data.value = response
    writeCache(response)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '风格数据加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => void load())
</script>

<template>
  <div class="style-page" :aria-busy="loading">
    <header class="style-header">
      <div>
        <p class="eyebrow">RELATIVE MARKET STRUCTURE</p>
        <h1>风格强弱</h1>
      </div>
      <div class="header-meta">
        <span v-if="loading" class="loading-indicator" role="status"><i></i>更新中</span>
        <span v-if="data" class="as-of">数据截至 {{ data.trade_date }}</span>
      </div>
    </header>

    <div v-if="loading && !data" class="state-line">正在计算相对强弱...</div>
    <div v-else-if="error && !data" class="state-line error">{{ error }}</div>

    <template v-if="data">
      <section class="signal-strip" aria-label="风格概览">
        <div class="signal-primary">
          <span class="signal-label">60日领先</span>
          <strong>{{ strongest?.numerator_name || '--' }}</strong>
          <span v-if="strongest" :class="valueClass(strongest.relative_return_60d)">{{ formatPct(strongest.relative_return_60d) }}</span>
        </div>
        <div class="signal-item">
          <span>60日落后</span>
          <b>{{ weakest?.numerator_name || '--' }}</b>
        </div>
        <div class="signal-item">
          <span>极端组合</span>
          <b>{{ extremeCount }} / {{ data.pairs.length }}</b>
        </div>
        <div class="signal-item">
          <span>样本覆盖</span>
          <b>{{ Math.min(...data.quality.map(item => item.valid_close_count)) }} 日</b>
        </div>
      </section>

      <section class="pair-section">
        <div class="section-heading">
          <h2>指数配对</h2>
          <span>按60日相对收益排序</span>
        </div>
        <div class="pair-table">
          <div class="pair-head">
            <span>组合</span><span>20日</span><span>60日</span><span>252日</span><span title="相对比值的14日RSI">RSI14</span><span title="相对比值在242日窗口中的标准分">Z242</span><span>状态</span>
          </div>
          <article v-for="pair in sortedPairs" :key="pair.pair_key" class="pair-row">
            <div class="pair-name">
              <strong>{{ pair.numerator_name }}</strong>
              <span>/ {{ pair.denominator_name }}</span>
            </div>
            <b data-label="20日" :class="valueClass(pair.relative_return_20d)">{{ formatPct(pair.relative_return_20d) }}</b>
            <b data-label="60日" :class="valueClass(pair.relative_return_60d)">{{ formatPct(pair.relative_return_60d) }}</b>
            <b data-label="252日" :class="valueClass(pair.relative_return_252d)">{{ formatPct(pair.relative_return_252d) }}</b>
            <span class="numeric">{{ pair.rsi_14?.toFixed(1) ?? '--' }}</span>
            <span class="numeric">{{ pair.zscore_242?.toFixed(2) ?? '--' }}</span>
            <div class="pair-state" :class="stateClass(pair.state)">
              <b>{{ stateMeta[pair.state].label }}</b>
              <span>{{ stateMeta[pair.state].detail }}</span>
            </div>
            <div class="pair-foot">
              <span>状态始于 {{ pair.state_changed_at || '--' }}</span>
              <span>历史分位 {{ pair.historical_percentile?.toFixed(0) ?? '--' }}%</span>
              <span title="历史极值后20日，按均值回归方向校准后的正收益比例">20日均值回归 {{ meanReversionRate(pair) }}</span>
              <span>对齐样本 {{ pair.aligned_sample_count }}</span>
            </div>
          </article>
        </div>
      </section>

      <details class="quality-section">
        <summary>
          <span>数据质量</span>
          <b>{{ data.quality.filter(item => coverageLabel(item) === '完整').length }} / {{ data.quality.length }} 完整</b>
        </summary>
        <div class="quality-table">
          <div v-for="item in data.quality" :key="item.instrument_code" class="quality-row">
            <div><strong>{{ item.instrument_name }}</strong><span>{{ item.instrument_code }}</span></div>
            <div><span>覆盖</span><b>{{ item.valid_close_count }} 日</b></div>
            <div><span>起始</span><b>{{ item.first_date || '--' }}</b></div>
            <div><span>20日波动</span><b>{{ formatPct(item.volatility_20d, 1) }}</b></div>
            <div><span>最大回撤</span><b :class="valueClass(item.max_drawdown_pct)">{{ formatPct(item.max_drawdown_pct, 1) }}</b></div>
            <em :class="`coverage-${coverageLabel(item)}`">{{ coverageLabel(item) }}</em>
          </div>
        </div>
      </details>
    </template>
  </div>
</template>

<style lang="scss" scoped>
@use '../../styles/theme' as *;

.style-page { max-width: 1080px; margin: 0 auto; padding: $space-xl 0 96px; font-family: $font-sans; }
.style-header { display: flex; align-items: end; justify-content: space-between; padding-bottom: $space-md; border-bottom: 2px solid $text-primary; }
.eyebrow { margin: 0 0 4px; color: $color-info; font-size: $text-xs; font-weight: $weight-bold; }
h1 { margin: 0; font-family: $font-serif; font-size: 28px; letter-spacing: 0; }
.header-meta { display: flex; flex-direction: column; align-items: end; gap: 4px; }
.as-of { color: $text-tertiary; font-size: $text-xs; }
.loading-indicator { display: inline-flex; align-items: center; gap: 5px; color: $color-info; font-size: $text-xs; }
.loading-indicator i { width: 9px; height: 9px; border: 1px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: style-spin .7s linear infinite; }
.state-line { padding: 72px 0; color: $text-tertiary; text-align: center; }
.state-line.error { color: $color-up; }

.signal-strip { display: grid; grid-template-columns: 1.6fr repeat(3, 1fr); border-bottom: 1px solid $border-heavy; }
.signal-primary, .signal-item { min-height: 96px; padding: $space-lg $space-md; border-right: 1px solid $border; }
.signal-item:last-child { border-right: 0; }
.signal-primary { display: grid; grid-template-columns: 1fr auto; align-content: center; gap: 4px $space-md; }
.signal-label, .signal-item span { color: $text-tertiary; font-size: $text-xs; }
.signal-primary strong { font-family: $font-serif; font-size: 22px; }
.signal-primary > span:last-child { align-self: end; font-size: $text-lg; font-weight: $weight-bold; }
.signal-item { display: flex; flex-direction: column; justify-content: center; gap: 7px; }
.signal-item b { font-size: $text-md; font-variant-numeric: tabular-nums; }

.pair-section { margin-top: $space-xl; }
.section-heading { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: $space-sm; }
.section-heading h2 { margin: 0; font-family: $font-serif; font-size: $text-lg; }
.section-heading span { color: $text-tertiary; font-size: $text-xs; }
.pair-table { border-top: 1px solid $border-heavy; }
.pair-head, .pair-row { display: grid; grid-template-columns: minmax(170px, 1.45fr) repeat(3, minmax(64px, .7fr)) repeat(2, minmax(56px, .55fr)) minmax(112px, 1fr); align-items: center; }
.pair-head { min-height: 38px; background: $bg-muted; color: $text-secondary; font-size: $text-xs; font-weight: $weight-bold; text-align: center; }
.pair-head span:first-child { padding-left: $space-md; text-align: left; }
.pair-row { min-height: 76px; border-bottom: 1px solid $border; }
.pair-row:hover { background: $bg-hover; }
.pair-name { display: flex; flex-direction: column; gap: 3px; padding-left: $space-md; }
.pair-name strong { font-size: $text-sm; }
.pair-name span { color: $text-tertiary; font-size: $text-xs; }
.pair-row > b, .numeric { text-align: center; font-size: $text-sm; font-variant-numeric: tabular-nums; }
.pair-state { display: flex; flex-direction: column; gap: 3px; padding-left: $space-sm; }
.pair-state b { font-size: $text-xs; }
.pair-state span { color: $text-tertiary; font-size: 10px; }
.pair-foot { grid-column: 1 / -1; display: flex; gap: $space-lg; padding: 0 $space-md $space-sm; color: $text-tertiary; font-size: 10px; }
.up, .state-strong b { color: $color-up; }
.down, .state-weak b { color: $color-down; }
.neutral, .state-normal b { color: $text-secondary; }
.state-overheated b { color: $color-warn; }
.state-oversold b { color: $color-info; }

.quality-section { margin-top: $space-xl; border-top: 1px solid $border-heavy; border-bottom: 1px solid $border; }
.quality-section summary { display: flex; justify-content: space-between; padding: $space-md; cursor: pointer; font-size: $text-sm; }
.quality-section summary b { color: $text-secondary; font-size: $text-xs; }
.quality-table { border-top: 1px solid $border; }
.quality-row { display: grid; grid-template-columns: 1.3fr repeat(4, 1fr) 60px; align-items: center; min-height: 54px; padding: 0 $space-md; border-bottom: 1px solid $border-light; font-size: $text-xs; }
.quality-row:last-child { border-bottom: 0; }
.quality-row > div { display: flex; flex-direction: column; gap: 3px; }
.quality-row span { color: $text-tertiary; }
.quality-row em { font-style: normal; font-weight: $weight-bold; text-align: right; }
.coverage-完整 { color: $color-up; }
.coverage-积累中 { color: $color-warn; }
.coverage-需检查, .coverage-无数据 { color: $color-down; }

@keyframes style-spin { to { transform: rotate(360deg); } }

@media (max-width: 720px) {
  .style-page { padding: $space-lg 0 88px; }
  .signal-strip { grid-template-columns: 1fr 1fr; }
  .signal-primary, .signal-item { min-height: 82px; padding: $space-md $space-sm; border-bottom: 1px solid $border; }
  .signal-strip > :nth-child(2) { border-right: 0; }
  .signal-primary strong { font-size: $text-lg; }
  .pair-table { overflow-x: visible; }
  .pair-head { display: none; }
  .pair-row { grid-template-columns: minmax(92px, 1.35fr) repeat(3, minmax(0, .62fr)) minmax(68px, .9fr); min-height: 86px; padding-top: $space-sm; }
  .pair-row > .numeric { display: none; }
  .pair-name { min-width: 0; padding-left: $space-sm; overflow: hidden; }
  .pair-name strong, .pair-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pair-row > b { min-width: 0; font-size: 10px; }
  .pair-row > b::before { content: attr(data-label); display: block; margin-bottom: 3px; color: $text-tertiary; font-size: 9px; font-weight: $weight-medium; }
  .pair-state { min-width: 0; padding-left: 4px; }
  .pair-foot { gap: $space-sm; overflow-x: auto; padding: 5px $space-sm $space-sm; white-space: nowrap; }
  .quality-row { grid-template-columns: 1.1fr 1fr 1fr 52px; padding: $space-sm; }
  .quality-row > div:nth-child(3), .quality-row > div:nth-child(4) { display: none; }
}
</style>
