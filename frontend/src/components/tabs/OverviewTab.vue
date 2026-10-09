<script setup lang="ts">
import type { CalendarEffects, MarketRiskResponse, MarketTemperatureResponse, RiskEvent } from '../../services/api'
import { scoreColor } from '../../utils/display'

defineProps<{
  calendar: CalendarEffects | null
  dailyCalendar: CalendarEffects['daily_calendar']
  nextDayShort: string
  nextMonthName: string
  selectedDate: string
  selectedDayEvents: RiskEvent[]
  shortDesc: string
  shortLabel: string
  shortRating: number | null
  temperature: MarketTemperatureResponse | null
  marketRisk: MarketRiskResponse | null
  today: string
  topEvents: RiskEvent[]
}>()

const emit = defineEmits<{
  showEvents: []
}>()

function riskStateLabel(state: string | undefined): string {
  return ({ calm: '市场较稳', balanced: '强弱均衡', fragile: '偏弱，注意波动', elevated: '波动偏大', unavailable: '数据积累中' } as Record<string, string>)[state || 'unavailable'] || '数据积累中'
}

function formatPct(value: number | null | undefined): string {
  return value == null ? '--' : `${value.toFixed(1)}%`
}
</script>

<template>
  <div class="tab-panel">
    <section class="focus-card">
      <div>
        <span class="focus-kicker">宽基决策</span>
        <h2>先看位置，再决定仓位</h2>
        <p>趋势、估值、超买超卖和回撤集中在一个页面里。</p>
      </div>
      <div class="focus-actions">
        <RouterLink to="/accumulation">看加仓指标</RouterLink>
        <RouterLink to="/trends?view=valuation">看估值位置</RouterLink>
      </div>
    </section>

    <section v-if="marketRisk" class="evidence-strip" aria-label="市场状态摘要">
      <article><span>市场状态</span><strong>{{ riskStateLabel(marketRisk.state) }}</strong><small>{{ marketRisk.summary }}</small></article>
      <article><span>近期回撤</span><strong>{{ formatPct(marketRisk.tail.max_drawdown_60d_pct) }}</strong><small>{{ marketRisk.tail.summary }}</small></article>
      <article><span>估值位置</span><strong>{{ marketRisk.valuation.erp_percentile == null ? '--' : `${marketRisk.valuation.erp_percentile.toFixed(0)}%` }}</strong><small>{{ marketRisk.valuation.summary }}</small></article>
    </section>

    <section v-if="topEvents.length > 0" class="today-events">
      <div class="section-label">今日要事</div>
      <div v-for="evt in topEvents" :key="evt.event_key" class="event-brief">
        <span class="event-brief-name">{{ evt.display_name }}</span>
        <span class="event-brief-score" :class="scoreColor(evt.score)">{{ evt.score }}</span>
        <span v-if="evt.event_time" class="event-brief-time">{{ evt.event_time }}</span>
      </div>
      <div v-if="selectedDayEvents.length > 2" class="event-more" @click="emit('showEvents')">
        查看全部 {{ selectedDayEvents.length }} 个事件 →
      </div>
    </section>

    <footer class="editorial-footer">
      <div class="footer-rule"></div>
      <span>历史统计不代表未来表现 · 仅供参考，不构成投资建议</span>
    </footer>
  </div>
</template>

<style lang="scss" scoped>
@use '../../styles/theme' as *;
@use '../../styles/mixins' as *;

.today-events {
  padding: $space-lg 0;
}

.section-label {
  @include editorial-label;
  margin-bottom: $space-sm;
}

.event-brief {
  display: flex;
  align-items: center;
  gap: $space-sm;
  padding: $space-sm 0;
  font-family: $font-sans;
  font-size: $text-md;
  border-bottom: $rule-thin;

  &:last-of-type { border-bottom: none; }
}

.event-brief-name {
  flex: 1;
  color: $text-primary;
  font-weight: $weight-medium;
}

.event-brief-score {
  font-family: $font-serif;
  font-weight: $weight-bold;
  @include tabular-nums;
  padding: 1px 8px;
  border-radius: $radius-sm;
  font-size: $text-sm;
  color: $text-inverse;

  &.red { background: $color-up; }
  &.orange { background: $color-warn; }
  &.yellow { background: $color-neutral; color: $text-primary; }
  &.gray { background: $text-disabled; color: $text-secondary; }
}

.event-brief-time {
  font-size: $text-sm;
  color: $text-tertiary;
  @include tabular-nums;
}

.event-more {
  font-family: $font-sans;
  font-size: $text-sm;
  color: $color-info;
  cursor: pointer;
  padding-top: $space-sm;
  font-weight: $weight-medium;

  &:active { opacity: 0.6; }
}

.editorial-footer {
  text-align: center;
  font-size: $text-xs;
  color: $text-tertiary;
  font-family: $font-sans;
  margin-top: $space-xl;
}

.footer-rule {
  height: 1px;
  background: $border;
  margin-bottom: $space-md;
}

.rule-thin {
  height: 1px;
  background: $border;
}

.focus-card {
  display: flex;
  justify-content: space-between;
  gap: $space-lg;
  padding: $space-lg 0;
  border-bottom: 2px solid $text-primary;
}

.focus-kicker { color: $color-up-dark; font-size: $text-xs; font-weight: $weight-bold; }
.focus-card h2 { margin: $space-xs 0; font-family: $font-serif; font-size: $text-xl; }
.focus-card p { margin: 0; color: $text-secondary; font-size: $text-sm; }
.focus-actions { display: flex; flex-direction: column; gap: $space-sm; align-items: flex-end; justify-content: center; white-space: nowrap; }
.focus-actions a { color: $color-info; font-size: $text-sm; font-weight: $weight-semibold; text-decoration: none; }

.evidence-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; margin: $space-lg 0; background: $border; border: 1px solid $border; }
.evidence-strip article { min-width: 0; padding: $space-md; background: $bg-card; }
.evidence-strip span, .evidence-strip small { display: block; color: $text-tertiary; font-size: $text-xs; }
.evidence-strip strong { display: block; margin: $space-xs 0; font-family: $font-serif; font-size: $text-lg; }
.evidence-strip small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

@media (max-width: 520px) {
  .focus-card { display: block; }
  .focus-actions { align-items: flex-start; flex-direction: row; margin-top: $space-md; }
  .evidence-strip { grid-template-columns: 1fr; }
}
</style>
