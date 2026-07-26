<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchValuationRanking } from '../../services/api'
import type { ValuationCategory, ValuationRankingItem, ValuationRankingResponse } from '../../services/api'

type CategoryFilter = 'all' | ValuationCategory

const filters: Array<{ key: CategoryFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'broad', label: '宽基' },
  { key: 'industry', label: '行业' },
  { key: 'theme', label: '主题' },
  { key: 'strategy', label: '策略' },
]

const categoryLabels: Record<ValuationCategory, string> = {
  broad: '宽基',
  industry: '行业',
  theme: '主题',
  strategy: '策略',
}

const stateLabels: Record<ValuationRankingItem['state'], string> = {
  low: '低位',
  below_average: '偏低',
  fair: '中位',
  high: '偏高',
  unavailable: '待接入',
}

const activeFilter = ref<CategoryFilter>('all')
const data = ref<ValuationRankingResponse | null>(null)
const loading = ref(true)
const error = ref('')

const availableItems = computed(() => (data.value?.items || []).filter((item) =>
  item.state !== 'unavailable' && (activeFilter.value === 'all' || item.category === activeFilter.value),
))
const accumulatingItems = computed(() => (data.value?.items || []).filter((item) =>
  item.state === 'unavailable' && (activeFilter.value === 'all' || item.category === activeFilter.value),
))
const asOfDate = computed(() => data.value?.trade_date?.replace(/-/g, '.') || '--')

function formatPe(value: number | null): string {
  return value == null ? '--' : value.toFixed(2)
}

function formatPct(value: number | null, signed = false): string {
  if (value == null) return '--'
  return `${signed && value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await fetchValuationRanking()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '估值数据加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => void load())
</script>

<template>
  <section class="valuation-page" aria-labelledby="valuation-title">
    <header class="valuation-head">
      <div>
        <p class="eyebrow">A 股指数 · 机会观察</p>
        <h1 id="valuation-title">指数估值榜</h1>
      </div>
      <p class="as-of">截至 {{ asOfDate }}</p>
    </header>

    <p class="method-line">按 PE（TTM）近六年历史分位从低到高排列，样本不足 240 个交易日不参与排名。</p>

    <nav class="category-tabs" aria-label="估值指数分类">
      <button
        v-for="filter in filters"
        :key="filter.key"
        type="button"
        :class="{ active: activeFilter === filter.key }"
        :aria-pressed="activeFilter === filter.key"
        @click="activeFilter = filter.key"
      >{{ filter.label }}</button>
    </nav>

    <p v-if="loading" class="page-state" role="status">正在整理历史估值…</p>
    <p v-else-if="error" class="page-state error">{{ error }}</p>

    <template v-else>
      <div class="ledger-title">
        <span>低分位优先</span>
        <span>{{ availableItems.length }} 个可排名指数</span>
      </div>
      <div class="ledger" role="table" aria-label="指数估值排名">
        <div class="ledger-head" role="row">
          <span>序</span>
          <span>指数</span>
          <span>PE</span>
          <span>6Y 分位</span>
          <span>20 日</span>
          <span>60 日回撤</span>
        </div>
        <div v-for="item in availableItems" :key="item.code" class="ledger-row" role="row">
          <span class="rank" :class="{ 'rank-top': item.rank && item.rank <= 3 }">{{ item.rank }}</span>
          <span class="index-cell">
            <strong>{{ item.name }}</strong>
            <small>{{ categoryLabels[item.category] }} · {{ item.code }}</small>
          </span>
          <span class="metric pe">{{ formatPe(item.latest_pe_ttm) }}</span>
          <span class="metric percentile" :class="item.state">{{ formatPct(item.pe_percentile) }} <b>{{ stateLabels[item.state] }}</b></span>
          <span class="metric" :class="{ up: (item.return_20d_pct || 0) > 0, down: (item.return_20d_pct || 0) < 0 }">{{ formatPct(item.return_20d_pct, true) }}</span>
          <span class="metric down">{{ formatPct(item.max_drawdown_60d_pct) }}</span>
        </div>
        <p v-if="availableItems.length === 0" class="empty-ledger">该分类暂未形成可用的 PE 历史样本。</p>
      </div>

      <section v-if="accumulatingItems.length" class="pending-section" aria-label="历史 PE 样本积累中的指数">
        <div class="ledger-title">
          <span>历史 PE 样本积累中</span>
          <span>样本达到一年后纳入排序</span>
        </div>
        <div class="pending-list">
          <div v-for="item in accumulatingItems" :key="item.code" class="pending-row">
            <span>
              <strong>{{ item.name }}</strong>
              <small>{{ categoryLabels[item.category] }} · {{ item.code }}</small>
            </span>
            <span>{{ item.pe_sample_count }} / 240 个样本</span>
          </div>
        </div>
      </section>
    </template>
  </section>
</template>

<style lang="scss" scoped>
@use '../../styles/theme' as *;
@use '../../styles/mixins' as *;

.valuation-page {
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: $space-xl 0 $space-lg-xl;
  font-family: $font-sans;
}

.valuation-head { display: flex; align-items: end; justify-content: space-between; gap: $space-lg; border-bottom: 2px solid $text-primary; padding-bottom: $space-md; }
.eyebrow { margin: 0 0 $space-xs; color: $text-tertiary; font-size: $text-xs; font-weight: $weight-semibold; letter-spacing: 1px; }
h1 { margin: 0; color: $text-primary; font-family: $font-serif; font-size: 30px; line-height: 1; font-weight: $weight-bold; }
.as-of { margin: 0; color: $text-secondary; font-size: $text-sm; @include tabular-nums; white-space: nowrap; }
.method-line { margin: $space-md 0 $space-lg; color: $text-secondary; font-size: $text-sm; line-height: $leading-relaxed; }

.category-tabs { display: flex; width: 100%; overflow-x: auto; border-bottom: 1px solid $border; }
.category-tabs button { flex: 1 0 76px; min-height: 38px; padding: 0 $space-sm; border: 0; border-right: 1px solid $border; border-bottom: 2px solid transparent; background: transparent; color: $text-tertiary; cursor: pointer; font-family: $font-sans; font-size: $text-sm; font-weight: $weight-semibold; }
.category-tabs button:last-child { border-right: 0; }
.category-tabs button.active { border-bottom-color: $text-primary; color: $text-primary; }

.page-state { margin: 0; padding: $space-lg-xl 0; color: $text-tertiary; text-align: center; font-size: $text-sm; }
.page-state.error { color: $color-down; }
.ledger-title { display: flex; justify-content: space-between; gap: $space-md; padding: $space-xl 0 $space-sm; color: $text-secondary; font-size: $text-xs; font-weight: $weight-semibold; letter-spacing: 1px; }
.ledger { border-top: 1px solid $border; }
.ledger-head, .ledger-row { display: grid; grid-template-columns: 40px minmax(180px, 1.7fr) minmax(74px, .7fr) minmax(108px, .9fr) minmax(78px, .7fr) minmax(94px, .85fr); column-gap: $space-md; align-items: center; }
.ledger-head { min-height: 34px; color: $text-tertiary; border-bottom: 1px solid $border; font-size: $text-xs; }
.ledger-row { min-height: 58px; border-bottom: 1px solid $border; transition: background $duration-fast $ease-out; }
.ledger-row:hover { background: $bg-muted; }
.rank { color: $text-tertiary; font-family: $font-serif; font-size: $text-lg; @include tabular-nums; }
.rank-top { color: $color-warn; font-weight: $weight-bold; }
.index-cell { display: flex; flex-direction: column; min-width: 0; }
.index-cell strong, .pending-row strong { overflow: hidden; color: $text-primary; font-size: $text-md; font-weight: $weight-semibold; text-overflow: ellipsis; white-space: nowrap; }
.index-cell small, .pending-row small { margin-top: 2px; color: $text-tertiary; font-size: $text-xs; @include tabular-nums; }
.metric { color: $text-primary; font-family: $font-serif; font-size: $text-md; @include tabular-nums; white-space: nowrap; }
.metric.pe { font-weight: $weight-bold; }
.metric.percentile { color: $text-secondary; }
.metric.percentile b { margin-left: 3px; font-family: $font-sans; font-size: $text-xs; font-weight: $weight-semibold; }
.metric.percentile.low { color: $color-up; }
.metric.percentile.below_average { color: $color-warn; }
.metric.percentile.high { color: $color-down; }
.up { color: $color-up; }
.down { color: $color-down; }
.empty-ledger { margin: 0; padding: $space-xl; color: $text-tertiary; text-align: center; font-size: $text-sm; }
.pending-section { margin-top: $space-xl; }
.pending-list { border-top: 1px solid $border; }
.pending-row { display: flex; align-items: center; justify-content: space-between; gap: $space-lg; min-height: 52px; border-bottom: 1px solid $border; color: $text-tertiary; font-size: $text-sm; @include tabular-nums; }
.pending-row > span:first-child { display: flex; min-width: 0; flex-direction: column; }

@media (max-width: 720px) {
  .valuation-page { padding-top: $space-lg; }
  h1 { font-size: 26px; }
  .method-line { margin-bottom: $space-md; }
  .ledger-head, .ledger-row { grid-template-columns: 30px minmax(0, 1fr) 66px 88px; column-gap: $space-sm; }
  .ledger-head span:nth-child(5), .ledger-head span:nth-child(6), .ledger-row span:nth-child(5), .ledger-row span:nth-child(6) { display: none; }
  .ledger-row { min-height: 56px; }
  .index-cell strong { font-size: $text-sm; }
  .metric { font-size: $text-sm; }
  .metric.percentile b { display: block; margin: 1px 0 0; }
  .pending-row { font-size: $text-xs; }
}
</style>
