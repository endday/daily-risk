<script setup lang="ts">
import { computed } from 'vue'
import type { MarketRiskResponse, MarketRiskSignalState } from '../services/api'

const props = defineProps<{
  risk: MarketRiskResponse
}>()

const overallMeta = computed(() => ({
  unavailable: { label: '数据积累中', detail: '暂时无法判断整体市场情况', tone: 'unavailable' },
  calm: { label: '市场整体较稳', detail: '多数观察项没有明显压力', tone: 'supportive' },
  balanced: { label: '市场强弱不明显', detail: '多数观察项处于正常范围', tone: 'neutral' },
  fragile: { label: '市场偏弱，注意波动', detail: '有多项数据出现走弱迹象', tone: 'watch' },
  elevated: { label: '市场波动偏大，注意风险', detail: '多项数据提示近期风险较高', tone: 'elevated' },
}[props.risk.state]))

const signalConclusion: Record<MarketRiskSignalState, Record<string, string>> = {
  unavailable: {
    breadth: '数据积累中，暂不判断',
    liquidity: '数据积累中，暂不判断',
    tail: '数据积累中，暂不判断',
    valuation: '数据积累中，暂不判断',
  },
  supportive: {
    breadth: '上涨范围较广',
    liquidity: '成交比前段时间活跃',
    tail: '近期回撤压力较小',
    valuation: '大盘估值相对不高',
  },
  neutral: {
    breadth: '上涨范围一般',
    liquidity: '成交热度一般',
    tail: '回撤压力处于正常范围',
    valuation: '大盘估值处于中等位置',
  },
  watch: {
    breadth: '上涨范围正在收窄',
    liquidity: '成交正在降温',
    tail: '市场仍有回撤压力',
    valuation: '大盘估值偏高',
  },
  elevated: {
    breadth: '上涨广度偏热，资金集中度高',
    liquidity: '成交活跃，杠杆资金上升',
    tail: '近期波动和回撤都偏大',
    valuation: '大盘估值处于较高位置',
  },
}

function percentage(value: number | null, digits = 1, withSign = false): string {
  if (value == null) return '--'
  const sign = withSign && value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

function pointChange(value: number | null): string {
  if (value == null) return '--'
  return `${value > 0 ? '+' : ''}${value.toFixed(0)} 个百分点`
}

function percentilePosition(value: number | null): string {
  return value == null ? '--' : `历史 ${value.toFixed(0)}% 位置`
}

const panels = computed(() => [
  {
    key: 'breadth',
    label: '上涨范围',
    state: props.risk.breadth.state,
    value: percentage(props.risk.breadth.above_ma20_ratio, 0),
    valueLabel: '行业处于短期上涨趋势',
    comparison: props.risk.breadth.breadth_change_5d == null
      ? '近 5 日变化 --'
      : `近 5 日变化 ${pointChange(props.risk.breadth.breadth_change_5d)}`,
    conclusion: signalConclusion[props.risk.breadth.state].breadth,
  },
  {
    key: 'liquidity',
    label: '成交热度',
    state: props.risk.liquidity.state,
    value: percentage(props.risk.liquidity.turnover_5d_vs_20d_pct, 0, true),
    valueLabel: '近 5 日成交额比近 1 个月',
    comparison: props.risk.liquidity.turnover_percentile_60d == null
      ? '近 3 个月位置 --'
      : `近 3 个月成交 ${percentilePosition(props.risk.liquidity.turnover_percentile_60d)}`,
    conclusion: signalConclusion[props.risk.liquidity.state].liquidity,
  },
  {
    key: 'tail',
    label: '近期回撤',
    state: props.risk.tail.state,
    value: percentage(props.risk.tail.max_drawdown_60d_pct, 1),
    valueLabel: '近 3 个月最大跌幅',
    comparison: props.risk.tail.downside_volatility_20d == null
      ? '近 1 个月向下波动 --'
      : `近 1 个月向下波动 ${percentage(props.risk.tail.downside_volatility_20d, 1)}`,
    conclusion: signalConclusion[props.risk.tail.state].tail,
  },
  {
    key: 'valuation',
    label: '大盘估值',
    state: props.risk.valuation.state,
    value: percentilePosition(props.risk.valuation.erp_percentile),
    valueLabel: '沪深300估值的历史位置',
    comparison: props.risk.valuation.sample_count
      ? `统计样本 ${props.risk.valuation.sample_count} 个交易日`
      : '统计样本积累中',
    conclusion: signalConclusion[props.risk.valuation.state].valuation,
  },
])
</script>

<template>
  <section class="risk-panel" aria-label="市场概览">
    <header class="risk-header">
      <div>
        <p class="risk-kicker">MARKET OVERVIEW</p>
        <h2>市场概览</h2>
      </div>
      <span class="risk-asof">数据截至 {{ risk.trade_date || '--' }}</span>
    </header>

    <div class="overall-summary" :class="`tone-${overallMeta.tone}`">
      <span>{{ risk.available_component_count }}/4 项数据可用</span>
      <strong>{{ overallMeta.label }}</strong>
      <p>{{ overallMeta.detail }}</p>
    </div>

    <div class="risk-grid">
      <article v-for="panel in panels" :key="panel.key" class="risk-cell" :class="`tone-${panel.state}`">
        <span class="cell-label">{{ panel.label }}</span>
        <strong class="cell-value">{{ panel.value }}</strong>
        <span class="cell-value-label">{{ panel.valueLabel }}</span>
        <span class="cell-comparison">{{ panel.comparison }}</span>
        <p>结论：{{ panel.conclusion }}</p>
      </article>
    </div>

    <details class="risk-details">
      <summary>
        <span>详细数据</span>
        <small>查看计算数据和口径</small>
      </summary>
      <dl class="detail-grid">
        <div>
          <dt>上涨范围</dt>
          <dd>共 {{ risk.breadth.industry_count }} 个行业，其中 {{ percentage(risk.breadth.above_ma20_ratio, 0) }} 处于短期上涨趋势。</dd>
          <dd>前五行业成交占比 {{ percentage(risk.breadth.concentration_top5_pct, 0) }}。</dd>
        </div>
        <div>
          <dt>成交热度</dt>
          <dd>近 5 日成交额较近 20 日 {{ percentage(risk.liquidity.turnover_5d_vs_20d_pct, 0, true) }}。</dd>
          <dd>融资余额近 20 日 {{ percentage(risk.liquidity.margin_change_20d_pct, 1, true) }}。</dd>
        </div>
        <div>
          <dt>近期回撤</dt>
          <dd>近 60 日最大回撤 {{ percentage(risk.tail.max_drawdown_60d_pct, 1) }}。</dd>
          <dd>最差 5% 交易日平均跌幅 {{ percentage(risk.tail.expected_shortfall_5pct, 2) }}。</dd>
        </div>
        <div>
          <dt>大盘估值</dt>
          <dd>沪深300盈利收益率减十年期国债收益率 {{ percentage(risk.valuation.erp, 2) }}。</dd>
          <dd>估值历史位置 {{ percentilePosition(risk.valuation.erp_percentile) }}。</dd>
        </div>
      </dl>
    </details>
  </section>
</template>

<style lang="scss" scoped>
@use '../styles/theme' as *;

.risk-panel {
  padding: $space-lg 0;
  border-top: 2px solid $text-primary;
  border-bottom: 1px solid $border-heavy;
  font-family: $font-sans;
}

.risk-header { display: flex; align-items: flex-end; justify-content: space-between; gap: $space-md; }
.risk-kicker { margin: 0 0 3px; color: $color-info; font-size: 10px; font-weight: $weight-bold; }
.risk-header h2 { margin: 0; font-family: $font-serif; font-size: $text-xl; }
.risk-asof { color: $text-tertiary; font-size: 10px; white-space: nowrap; }

.overall-summary { display: grid; grid-template-columns: auto 1fr; column-gap: $space-md; align-items: baseline; margin: $space-md 0; }
.overall-summary span { color: $text-tertiary; font-size: $text-xs; }
.overall-summary strong { font-family: $font-serif; font-size: $text-lg; }
.overall-summary p { grid-column: 2; margin: 3px 0 0; color: $text-secondary; font-size: $text-xs; }

.risk-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-top: 1px solid $border; }
.risk-cell { min-width: 0; padding: $space-md; border-right: 1px solid $border; }
.risk-cell:last-child { border-right: 0; }
.cell-label { display: block; color: $text-secondary; font-size: $text-xs; }
.cell-value { display: block; margin-top: $space-lg; color: $text-primary; font-family: $font-serif; font-size: 26px; font-variant-numeric: tabular-nums; line-height: 1; }
.cell-value-label { display: block; min-height: 28px; margin-top: 5px; color: $text-tertiary; font-size: 10px; line-height: 1.35; }
.cell-comparison { display: block; min-height: 28px; margin-top: $space-sm; color: $text-secondary; font-size: 10px; font-variant-numeric: tabular-nums; line-height: 1.35; }
.risk-cell p { margin: $space-sm 0 0; color: $text-primary; font-size: $text-xs; font-weight: $weight-semibold; line-height: 1.45; }

.tone-supportive .cell-value, .tone-supportive.overall-summary strong { color: $color-up; }
.tone-watch .cell-value, .tone-watch.overall-summary strong { color: $color-warn; }
.tone-elevated .cell-value, .tone-elevated.overall-summary strong { color: $color-down; }
.tone-unavailable .cell-value, .tone-unavailable.overall-summary strong { color: $text-disabled; }

.risk-details { margin-top: $space-md; border-top: 1px solid $border; }
.risk-details summary { display: flex; align-items: center; justify-content: space-between; padding: $space-md 0; cursor: pointer; font-size: $text-sm; }
.risk-details summary small { color: $text-tertiary; font-size: $text-xs; }
.detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; border-top: 1px solid $border; }
.detail-grid > div { padding: $space-md; border-right: 1px solid $border; border-bottom: 1px solid $border-light; }
.detail-grid > div:nth-child(2n) { border-right: 0; }
.detail-grid dt { margin-bottom: $space-sm; color: $text-primary; font-size: $text-xs; font-weight: $weight-bold; }
.detail-grid dd { margin: 0 0 4px; color: $text-secondary; font-size: 10px; line-height: 1.45; }

@media (max-width: 760px) {
  .risk-header { align-items: flex-start; flex-direction: column; gap: 5px; }
  .overall-summary { grid-template-columns: 1fr; gap: 3px; }
  .overall-summary p { grid-column: auto; }
  .risk-grid { grid-template-columns: 1fr; }
  .risk-cell { display: grid; grid-template-columns: minmax(96px, .8fr) 1fr; column-gap: $space-md; padding: $space-md 0; border-right: 0; border-bottom: 1px solid $border; }
  .risk-cell:last-child { border-bottom: 0; }
  .cell-label { grid-column: 1; }
  .cell-value { grid-column: 2; grid-row: 1 / span 2; margin-top: 0; align-self: end; font-size: 23px; text-align: right; }
  .cell-value-label, .cell-comparison, .risk-cell p { grid-column: 1 / -1; min-height: 0; }
  .cell-value-label { margin-top: $space-sm; }
  .cell-comparison { margin-top: 4px; }
  .risk-cell p { margin-top: 5px; }
  .detail-grid { grid-template-columns: 1fr; }
  .detail-grid > div { border-right: 0; }
}
</style>
