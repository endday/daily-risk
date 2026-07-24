<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchRelativeStrength } from '../../services/api'
import { useResponseCache } from '../../composables/useResponseCache'
import type {
  InstrumentQualityStats,
  RelativeStrengthPair,
  RelativeStrengthResponse,
} from '../../services/api'

const data = ref<RelativeStrengthResponse | null>(null)
const loading = ref(false)
const error = ref('')
const cache = useResponseCache<RelativeStrengthResponse>('daily-risk:relative-strength:v2')

const styleMeta = {
  '399006_000300': {
    label: '成长 vs 价值',
    numeratorLabel: '成长',
    denominatorLabel: '价值',
    detail: '成长看创业板指，价值看沪深300',
  },
  '000905_000300': {
    label: '小盘 vs 大盘',
    numeratorLabel: '小盘',
    denominatorLabel: '大盘',
    detail: '小盘看中证500，大盘看沪深300',
  },
} as const

const focusPairs = computed(() => {
  const byKey = new Map((data.value?.pairs ?? []).map((pair) => [pair.pair_key, pair]))
  return Object.keys(styleMeta)
    .map((key) => byKey.get(key))
    .filter((pair): pair is RelativeStrengthPair => pair != null)
})

function formatPct(value: number | null, digits = 1, withSign = true): string {
  if (value == null) return '--'
  const sign = withSign && value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

function valueClass(value: number | null): string {
  if (value == null || Math.abs(value) < 0.005) return 'neutral'
  return value > 0 ? 'up' : 'down'
}

function pairMeta(pair: RelativeStrengthPair) {
  return styleMeta[pair.pair_key as keyof typeof styleMeta] ?? {
    label: `${pair.numerator_name} vs ${pair.denominator_name}`,
    numeratorLabel: pair.numerator_name,
    denominatorLabel: pair.denominator_name,
    detail: `${pair.numerator_name} / ${pair.denominator_name}`,
  }
}

function winner(pair: RelativeStrengthPair, value: number | null = pair.relative_return_60d): string | null {
  if (value == null || Math.abs(value) < 0.005) return null
  const meta = pairMeta(pair)
  return value > 0 ? meta.numeratorLabel : meta.denominatorLabel
}

function comparison(pair: RelativeStrengthPair, value: number | null = pair.relative_return_60d): string {
  if (value == null) return '数据积累中'
  if (!winner(pair, value)) return `${pair.numerator_name}和${pair.denominator_name}表现接近`
  const winnerName = value > 0 ? pair.numerator_name : pair.denominator_name
  const loserName = value > 0 ? pair.denominator_name : pair.numerator_name
  return `${winnerName}比${loserName}多涨 ${Math.abs(value).toFixed(1)}%`
}

function verdict(pair: RelativeStrengthPair): string {
  const winnerName = winner(pair)
  if (!winnerName) return pair.relative_return_60d == null ? '暂不下结论' : '两类风格表现接近'
  return `${winnerName}更强`
}

function gapNote(pair: RelativeStrengthPair): string {
  if (pair.state === 'unavailable' || pair.relative_return_60d == null) return ''
  if (pair.state === 'overheated' || pair.state === 'oversold') return '短期差距较大，留意波动'
  return ''
}

function coverageLabel(item: InstrumentQualityStats): string {
  if (item.valid_close_count === 0) return '无数据'
  if (!item.window_available['252']) return '积累中'
  if (item.missing_close_count || item.non_positive_close_count || item.duplicate_date_count) return '需检查'
  return '完整'
}

async function load() {
  const cached = cache.read()
  if (cached) {
    data.value = cached
    return
  }
  loading.value = true
  error.value = ''
  try {
    const response = await fetchRelativeStrength()
    data.value = response
    cache.write(response, Date.now() + 5 * 60 * 1000)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '风格数据加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => void load())
</script>

<template>
  <section class="style-page" :aria-busy="loading">
    <header class="style-header">
      <div>
        <p class="eyebrow">STYLE COMPARISON</p>
        <h2>风格表现</h2>
      </div>
      <span v-if="loading" class="loading-indicator" role="status">更新中</span>
      <span v-else-if="data" class="as-of">数据截至 {{ data.trade_date }}</span>
    </header>

    <p v-if="loading && !data" class="state-line">正在更新风格数据...</p>
    <p v-else-if="error && !data" class="state-line error">{{ error }}</p>

    <template v-if="data">
      <p class="style-intro">成长、价值、小盘和大盘的近期相对表现。</p>

      <div class="style-cards">
        <article v-for="pair in focusPairs" :key="pair.pair_key" class="style-card">
          <header>
            <div>
              <h3>{{ pairMeta(pair).label }}</h3>
              <p>{{ pairMeta(pair).detail }}</p>
            </div>
          </header>

          <div class="main-data">
            <span>近 3 个月相对表现</span>
            <strong :class="valueClass(pair.relative_return_60d)">{{ comparison(pair) }}</strong>
          </div>

          <div class="period-data" aria-label="不同周期相对表现">
            <div>
              <span>近 1 个月</span>
              <b :class="valueClass(pair.relative_return_20d)">{{ formatPct(pair.relative_return_20d) }}</b>
            </div>
            <div>
              <span>近 3 个月</span>
              <b :class="valueClass(pair.relative_return_60d)">{{ formatPct(pair.relative_return_60d) }}</b>
            </div>
            <div>
              <span>近 1 年</span>
              <b :class="valueClass(pair.relative_return_252d)">{{ formatPct(pair.relative_return_252d) }}</b>
            </div>
          </div>

          <p class="style-verdict">结论：{{ verdict(pair) }}</p>
          <p v-if="gapNote(pair)" class="gap-note">{{ gapNote(pair) }}</p>
        </article>
      </div>

      <details class="style-details">
        <summary>
          <span>详细数据</span>
          <small>查看技术指标和数据质量</small>
        </summary>
        <div class="research-table">
          <article v-for="pair in focusPairs" :key="pair.pair_key" class="research-row">
            <strong>{{ pairMeta(pair).label }}</strong>
            <span>相对强弱指标 {{ pair.rsi_14?.toFixed(1) ?? '--' }}</span>
            <span>历史位置 {{ pair.historical_percentile?.toFixed(0) ?? '--' }}%</span>
            <span>状态开始 {{ pair.state_changed_at || '--' }}</span>
            <span>对齐样本 {{ pair.aligned_sample_count }} 日</span>
          </article>
        </div>
        <div class="quality-table">
          <article v-for="item in data.quality" :key="item.instrument_code" class="quality-row">
            <strong>{{ item.instrument_name }}</strong>
            <span>有效数据 {{ item.valid_close_count }} 日</span>
            <span>近 1 个月涨跌 {{ formatPct(item.return_20d) }}</span>
            <span>近 1 年涨跌 {{ formatPct(item.return_252d) }}</span>
            <b :class="`coverage-${coverageLabel(item)}`">{{ coverageLabel(item) }}</b>
          </article>
        </div>
      </details>

      <p class="style-disclaimer">仅反映市场表现，不构成交易建议。</p>
    </template>
  </section>
</template>

<style lang="scss" scoped>
@use '../../styles/theme' as *;

.style-page { padding: $space-xl 0 96px; font-family: $font-sans; }
.style-header { display: flex; align-items: end; justify-content: space-between; padding-bottom: $space-md; border-bottom: 2px solid $text-primary; }
.eyebrow { margin: 0 0 4px; color: $color-info; font-size: $text-xs; font-weight: $weight-bold; }
h2 { margin: 0; font-family: $font-serif; font-size: 28px; }
.as-of, .loading-indicator { color: $text-tertiary; font-size: $text-xs; }
.state-line { padding: 72px 0; color: $text-tertiary; text-align: center; }
.state-line.error { color: $color-down; }
.style-intro { margin: $space-md 0; color: $text-secondary; font-size: $text-sm; }

.style-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-top: 1px solid $border-heavy; border-bottom: 1px solid $border-heavy; }
.style-card { min-width: 0; padding: $space-lg; border-right: 1px solid $border; }
.style-card:last-child { border-right: 0; }
.style-card header { display: flex; justify-content: space-between; }
.style-card h3 { margin: 0; font-family: $font-serif; font-size: $text-lg; }
.style-card header p { margin: 4px 0 0; color: $text-tertiary; font-size: $text-xs; }
.main-data { margin-top: $space-lg; }
.main-data span { display: block; color: $text-tertiary; font-size: $text-xs; }
.main-data strong { display: block; margin-top: 5px; font-size: $text-md; font-weight: $weight-semibold; line-height: 1.45; }
.period-data { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: $space-md; border-top: 1px solid $border-light; border-bottom: 1px solid $border-light; }
.period-data > div { min-width: 0; padding: $space-sm 0; border-right: 1px solid $border-light; text-align: center; }
.period-data > div:last-child { border-right: 0; }
.period-data span { display: block; color: $text-tertiary; font-size: 10px; }
.period-data b { display: block; margin-top: 4px; font-size: $text-xs; font-variant-numeric: tabular-nums; }
.style-verdict { margin: $space-md 0 0; color: $text-primary; font-size: $text-sm; font-weight: $weight-semibold; }
.gap-note { margin: 5px 0 0; color: $color-warn; font-size: $text-xs; }
.up { color: $color-up; }
.down { color: $color-down; }
.neutral { color: $text-secondary; }

.style-details { margin-top: $space-xl; border-top: 1px solid $border-heavy; border-bottom: 1px solid $border; }
.style-details summary { display: flex; align-items: center; justify-content: space-between; padding: $space-md; cursor: pointer; font-size: $text-sm; }
.style-details summary small { color: $text-tertiary; font-size: $text-xs; }
.research-table, .quality-table { border-top: 1px solid $border; }
.research-row, .quality-row { display: grid; grid-template-columns: 1.3fr repeat(4, minmax(0, 1fr)); gap: $space-sm; align-items: center; padding: $space-md; border-bottom: 1px solid $border-light; font-size: $text-xs; }
.research-row:last-child, .quality-row:last-child { border-bottom: 0; }
.research-row span, .quality-row span { color: $text-secondary; font-variant-numeric: tabular-nums; }
.quality-row b { text-align: right; }
.coverage-完整 { color: $color-up; }
.coverage-积累中 { color: $color-warn; }
.coverage-需检查, .coverage-无数据 { color: $color-down; }
.style-disclaimer { margin: $space-md 0 0; color: $text-tertiary; font-size: $text-xs; text-align: center; }

@media (max-width: 720px) {
  .style-page { padding: $space-lg 0 88px; }
  .style-cards { grid-template-columns: 1fr; }
  .style-card { padding: $space-lg 0; border-right: 0; border-bottom: 1px solid $border; }
  .style-card:last-child { border-bottom: 0; }
  .research-row, .quality-row { grid-template-columns: 1fr 1fr; padding: $space-sm 0; }
  .research-row strong, .quality-row strong { grid-column: 1 / -1; }
  .quality-row b { text-align: left; }
}
</style>
