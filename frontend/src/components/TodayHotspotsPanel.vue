<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchIndustryRotation, fetchRelativeStrength, fetchValuationRanking } from '../services/api'
import { useResponseCache } from '../composables/useResponseCache'
import type {
  IndustryRotationMatrixResponse,
  IndustryRotationMetric,
  RelativeStrengthPair,
  RelativeStrengthResponse,
  ValuationRankingItem,
  ValuationRankingResponse,
} from '../services/api'

type HotspotKind = 'ETF' | '行业' | '风格'

type HotspotMetric = {
  label: string
  value: string
  tone?: 'up' | 'down' | 'neutral' | 'warn'
}

type Hotspot = {
  id: string
  kind: HotspotKind
  title: string
  subtitle: string
  score: number
  route: { path: string, query?: Record<string, string> }
  metrics: HotspotMetric[]
}

const MAX_HOTSPOTS = 5
const CACHE_TTL_MS = 5 * 60 * 1000
const loading = ref(false)
const error = ref('')
const valuation = ref<ValuationRankingResponse | null>(null)
const industry = ref<IndustryRotationMatrixResponse | null>(null)
const relative = ref<RelativeStrengthResponse | null>(null)

const valuationCache = useResponseCache<ValuationRankingResponse>('daily-risk:today-hotspots:valuation:v1')
const industryCache = useResponseCache<IndustryRotationMatrixResponse>('daily-risk:today-hotspots:industry:v1')
const relativeCache = useResponseCache<RelativeStrengthResponse>('daily-risk:today-hotspots:relative:v1')

const etfCandidates = [
  { code: '588000', title: '科创 50 ETF', terms: ['科创50', '科创 50', '000688'], category: 'theme' },
  { code: '159915', title: '创业板 ETF', terms: ['创业板', '399006'], category: 'broad' },
  { code: '512010', title: '医药 ETF', terms: ['医药', '医疗', '生物医药'], category: 'industry' },
  { code: '512880', title: '证券 ETF', terms: ['证券', '券商', '非银'], category: 'industry' },
  { code: '515790', title: '光伏 ETF', terms: ['光伏', '新能源', '电力设备'], category: 'theme' },
] as const

const styleMeta: Record<string, { title: string, positive: string, negative: string }> = {
  '399006_000300': { title: '成长风格', positive: '创业板相对沪深 300 升温', negative: '沪深 300 相对创业板占优' },
  '000905_000300': { title: '小盘风格', positive: '中证 500 相对沪深 300 升温', negative: '沪深 300 相对中证 500 占优' },
}

const asOfDate = computed(() => {
  const dates = [
    valuation.value?.trade_date,
    industry.value?.trade_date,
    relative.value?.trade_date,
  ].filter((date): date is string => Boolean(date))
  const sorted = dates.sort()
  return sorted.length ? sorted[sorted.length - 1].replace(/-/g, '.') : '--'
})

const hotspots = computed(() => {
  const items = [
    ...buildEtfHotspots(valuation.value),
    ...buildIndustryHotspots(industry.value),
    ...buildStyleHotspots(relative.value),
  ]

  return items
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_HOTSPOTS)
})

function formatPct(value: number | null | undefined, digits = 1, withSign = true): string {
  if (value == null) return '--'
  const sign = withSign && value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

function formatAmount(value: number | null | undefined): string {
  if (value == null) return '--'
  const yi = value / 100_000_000
  return `${yi.toFixed(Math.abs(yi) >= 100 ? 0 : 1)}亿`
}

function metricTone(value: number | null | undefined): HotspotMetric['tone'] {
  if (value == null || Math.abs(value) < 0.005) return 'neutral'
  return value > 0 ? 'up' : 'down'
}

function percentileScore(item: ValuationRankingItem): number {
  if (item.pe_percentile == null) return 0
  const valuationScore = Math.max(0, 45 - item.pe_percentile) * 1.6
  const momentumScore = Math.max(0, item.return_20d_pct ?? 0) * 1.4
  const drawdownBonus = Math.max(0, Math.abs(item.max_drawdown_60d_pct ?? 0) - 4) * 0.25
  return valuationScore + momentumScore + drawdownBonus
}

function findValuationMatch(items: ValuationRankingItem[], terms: readonly string[]) {
  return items.find((item) => terms.some((term) =>
    item.code.includes(term) || item.name.includes(term),
  ))
}

function buildEtfHotspots(data: ValuationRankingResponse | null): Hotspot[] {
  if (!data) return []
  const rankable = data.items.filter((item) => item.state !== 'unavailable')

  return etfCandidates
    .map((candidate): Hotspot | null => {
      const match = findValuationMatch(rankable, candidate.terms)
      if (!match || match.pe_percentile == null) return null

      const isLowValuation = match.pe_percentile <= 35
      const isWarming = (match.return_20d_pct ?? 0) > 0
      if (!isLowValuation && !isWarming) return null

      const reasons = [
        isLowValuation ? '关联指数估值偏低' : '关联指数估值回到中位',
        isWarming ? '近 20 日表现升温' : '仍处观察区间',
      ]

      return {
        id: `etf-${candidate.code}`,
        kind: 'ETF',
        title: candidate.title,
        subtitle: `${reasons.join('，')}；对应 ${match.name}`,
        score: 70 + percentileScore(match),
        route: { path: '/trends', query: { view: 'valuation' } },
        metrics: [
          { label: '估值分位', value: formatPct(match.pe_percentile, 0, false), tone: match.pe_percentile <= 35 ? 'up' : 'neutral' },
          { label: '20 日', value: formatPct(match.return_20d_pct), tone: metricTone(match.return_20d_pct) },
        ],
      } satisfies Hotspot
    })
    .filter((item): item is Hotspot => item != null)
}

function buildIndustryHotspots(data: IndustryRotationMatrixResponse | null): Hotspot[] {
  if (!data) return []
  const weekByCode = new Map(data.windows.week.industries.map((item) => [item.board_code, item]))

  return data.windows.month.industries
    .map((month) => ({
      month,
      week: weekByCode.get(month.board_code) ?? null,
      score: industryScore(month, weekByCode.get(month.board_code) ?? null),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map(({ month, week, score }) => ({
      id: `industry-${month.board_code}`,
      kind: '行业',
      title: month.board_name,
      subtitle: industryReason(month, week),
      score,
      route: { path: '/trends', query: { view: 'industry' } },
      metrics: [
        { label: '一月', value: formatPct(month.period_return_pct), tone: metricTone(month.period_return_pct) },
        { label: '日均额', value: formatAmount(month.avg_turnover_amount), tone: 'neutral' },
      ],
    }))
}

function industryScore(month: IndustryRotationMetric, week: IndustryRotationMetric | null): number {
  const monthReturn = month.period_return_pct ?? 0
  const weekReturn = week?.period_return_pct ?? 0
  const bias = month.log_bias_20_pct ?? 0
  if (bias > 15 || monthReturn <= 0) return 0

  const turnoverScore = Math.log10(Math.max(month.avg_turnover_amount, 1_000_000_000)) * 3
  const biasScore = bias >= 0 ? Math.min(bias, 10) * 1.8 : bias * 0.6
  return 45 + monthReturn * 2.2 + weekReturn * 1.3 + turnoverScore + biasScore
}

function industryReason(month: IndustryRotationMetric, week: IndustryRotationMetric | null): string {
  const bias = month.log_bias_20_pct
  if (bias != null && bias >= 5) return '行业热度靠前，价格仍在均线上方'
  if ((week?.period_return_pct ?? 0) > 0) return '一周和一月表现同时转强'
  return '近一月表现靠前，尚未进入过热区'
}

function buildStyleHotspots(data: RelativeStrengthResponse | null): Hotspot[] {
  if (!data) return []

  return data.pairs
    .filter((pair) => styleMeta[pair.pair_key])
    .map((pair) => {
      const score = styleScore(pair)
      const meta = styleMeta[pair.pair_key]
      const relativeReturn = pair.relative_return_20d ?? pair.relative_return_60d
      const positive = (relativeReturn ?? 0) >= 0

      return {
        id: `style-${pair.pair_key}`,
        kind: '风格',
        title: meta.title,
        subtitle: positive ? meta.positive : meta.negative,
        score,
        route: { path: '/trends', query: { view: 'index' } },
        metrics: [
          { label: '20 日相对', value: formatPct(pair.relative_return_20d), tone: metricTone(pair.relative_return_20d) },
          { label: '60 日相对', value: formatPct(pair.relative_return_60d), tone: metricTone(pair.relative_return_60d) },
        ],
      } satisfies Hotspot
    })
    .filter((item) => item.score > 0)
}

function styleScore(pair: RelativeStrengthPair): number {
  const short = pair.relative_return_20d ?? 0
  const medium = pair.relative_return_60d ?? 0
  const bias = Math.abs(pair.log_bias_20_pct ?? 0)
  const base = Math.abs(short) > 0.5 || Math.abs(medium) > 1 ? 50 : 0
  return base + Math.abs(short) * 2.8 + Math.abs(medium) * 1.4 - Math.max(0, bias - 12)
}

async function readOrFetch<T>(cache: ReturnType<typeof useResponseCache<T>>, request: () => Promise<T>): Promise<T> {
  const cached = cache.read()
  if (cached) return cached
  const response = await request()
  cache.write(response, Date.now() + CACHE_TTL_MS)
  return response
}

async function load() {
  loading.value = true
  error.value = ''

  const results = await Promise.allSettled([
    readOrFetch(valuationCache, fetchValuationRanking),
    readOrFetch(industryCache, fetchIndustryRotation),
    readOrFetch(relativeCache, fetchRelativeStrength),
  ])

  if (results[0].status === 'fulfilled') valuation.value = results[0].value
  if (results[1].status === 'fulfilled') industry.value = results[1].value
  if (results[2].status === 'fulfilled') relative.value = results[2].value

  if (results.every((result) => result.status === 'rejected')) {
    error.value = '热点数据加载失败'
  }

  loading.value = false
}

onMounted(() => void load())
</script>

<template>
  <section class="hotspots-panel" :aria-busy="loading" aria-labelledby="today-hotspots-title">
    <header class="hotspots-head">
      <div>
        <p class="kicker">MARKET HEAT</p>
        <h2 id="today-hotspots-title">今日热点</h2>
      </div>
      <span class="as-of">截至 {{ asOfDate }}</span>
    </header>

    <p class="hotspots-note">按估值位置、行业热度和风格相对强弱综合排序，ETF 相关线索优先展示。</p>

    <p v-if="loading && hotspots.length === 0" class="state-line" role="status">正在整理热点数据...</p>
    <p v-else-if="error && hotspots.length === 0" class="state-line error">{{ error }}</p>
    <p v-else-if="hotspots.length === 0" class="state-line">热点数据整理中</p>

    <div v-else class="hotspot-list">
      <RouterLink
        v-for="(item, index) in hotspots"
        :key="item.id"
        class="hotspot-row"
        :to="item.route"
      >
        <span class="rank">{{ index + 1 }}</span>
        <span class="main">
          <span class="title-line">
            <b class="kind">{{ item.kind }}</b>
            <strong>{{ item.title }}</strong>
          </span>
          <small>{{ item.subtitle }}</small>
        </span>
        <span class="metrics">
          <span
            v-for="metric in item.metrics"
            :key="metric.label"
            class="metric"
            :class="metric.tone"
          >
            <em>{{ metric.label }}</em>
            <b>{{ metric.value }}</b>
          </span>
        </span>
      </RouterLink>
    </div>
  </section>
</template>

<style lang="scss" scoped>
@use '../styles/theme' as *;

.hotspots-panel {
  padding: $space-xl 0;
  border-bottom: 1px solid $border-heavy;
  font-family: $font-sans;
}

.hotspots-head {
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

.hotspots-head h2 {
  margin: 0;
  font-family: $font-serif;
  font-size: $text-2xl;
  line-height: 1;
}

.as-of {
  color: $text-tertiary;
  font-size: $text-xs;
  white-space: nowrap;
}

.hotspots-note {
  margin: $space-md 0 $space-sm;
  color: $text-secondary;
  font-size: $text-sm;
  line-height: $leading-relaxed;
}

.state-line {
  margin: 0;
  padding: $space-xl 0;
  color: $text-tertiary;
  text-align: center;
  font-size: $text-sm;
}

.state-line.error {
  color: $color-down;
}

.hotspot-list {
  border-top: 1px solid $border;
}

.hotspot-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) minmax(160px, .62fr);
  gap: $space-md;
  align-items: center;
  min-height: 68px;
  border-bottom: 1px solid $border;
  color: $text-primary;
  text-decoration: none;
  transition: background $duration-fast $ease-out;
}

.hotspot-row:hover {
  background: $bg-hover;
}

.rank {
  color: $text-tertiary;
  font-family: $font-serif;
  font-size: $text-xl;
  font-variant-numeric: tabular-nums;
  font-weight: $weight-bold;
}

.main {
  min-width: 0;
}

.title-line {
  display: flex;
  align-items: center;
  gap: $space-sm;
  min-width: 0;
}

.kind {
  flex: 0 0 auto;
  padding: 1px 5px;
  border: 1px solid $border-heavy;
  color: $text-primary;
  font-size: 10px;
  line-height: 1.3;
}

.title-line strong {
  min-width: 0;
  overflow: hidden;
  color: $text-primary;
  font-size: $text-md;
  font-weight: $weight-bold;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.main small {
  display: block;
  margin-top: 5px;
  overflow: hidden;
  color: $text-secondary;
  font-size: $text-xs;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-left: 1px solid $border-light;
}

.metric {
  min-width: 0;
  padding: 0 $space-sm;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.metric em {
  display: block;
  color: $text-tertiary;
  font-size: 10px;
  font-style: normal;
}

.metric b {
  display: block;
  margin-top: 3px;
  color: $text-primary;
  font-family: $font-serif;
  font-size: $text-md;
  white-space: nowrap;
}

.metric.up b { color: $color-up; }
.metric.down b { color: $color-down; }
.metric.warn b { color: $color-warn; }
.metric.neutral b { color: $text-secondary; }

@media (max-width: 680px) {
  .hotspots-panel {
    padding: $space-lg 0;
  }

  .hotspots-head {
    align-items: flex-start;
  }

  .hotspot-row {
    grid-template-columns: 28px minmax(0, 1fr);
    gap: $space-sm;
    min-height: 74px;
    padding: $space-sm 0;
  }

  .rank {
    font-size: $text-lg;
  }

  .title-line {
    gap: 6px;
  }

  .title-line strong {
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.35;
  }

  .main small {
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .metrics {
    grid-column: 2;
    display: flex;
    flex-wrap: wrap;
    gap: $space-sm;
    margin-top: $space-xs;
    border-left: 0;
  }

  .metric {
    display: inline-flex;
    gap: 4px;
    align-items: baseline;
    padding: 0;
    text-align: left;
  }

  .metric b {
    margin-top: 0;
    font-size: $text-sm;
  }
}
</style>
