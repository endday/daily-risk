<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { CalendarDayStat, CalendarEffects, RiskEvent, MarketTemperatureResponse, WeekDayData } from '../services/api'
import { fetchWeekEvents } from '../services/api'
import { recommend, type Intent, type DateRange, type Recommendation } from '../utils/decision'
import { formatScore, formatTurnover, signalClass } from '../utils/display'

const props = defineProps<{
  dailyCalendar: CalendarDayStat[]
  calendar: CalendarEffects | null
  events: RiskEvent[]
  today: string
  selectedDate: string
  marketTemperature?: MarketTemperatureResponse | null
}>()

// ============================================
// 状态
// ============================================

const activeIntent = ref<Intent | null>(null)
const dateRange = ref<DateRange>('month')
const weekDays = ref<WeekDayData[]>([])

// ============================================
// 推荐结果
// ============================================

const recommendation = computed<Recommendation | null>(() => {
  if (!activeIntent.value || !props.dailyCalendar) return null
  return recommend(
    activeIntent.value,
    dateRange.value,
    props.dailyCalendar,
    props.selectedDate,
  )
})

// ============================================
// 交互
// ============================================

function setIntent(intent: Intent) {
  if (activeIntent.value === intent) {
    // 再次点击已激活的按钮 → 关闭
    closeDecision()
    return
  }
  activeIntent.value = intent
  // 获取本周数据
  loadWeekData()
}

function closeDecision() {
  activeIntent.value = null
}

async function loadWeekData() {
  try {
    const response = await fetchWeekEvents(props.selectedDate)
    weekDays.value = response.days
  } catch (e) {
    console.error('Failed to load week data:', e)
    weekDays.value = []
  }
}

// 日期变化时刷新周数据
watch(() => props.selectedDate, () => {
  if (activeIntent.value) {
    loadWeekData()
  }
})

function setRange(range: DateRange) {
  dateRange.value = range
}

// ============================================
// 显示辅助
// ============================================

const rangeLabels: Record<DateRange, string> = {
  '3d': '3天内',
  '7d': '7天内',
  'month': '本月',
}

const intentLabel = computed(() =>
  activeIntent.value === 'buy' ? '买入' : '卖出'
)

const recRatingClass = computed(() => {
  if (!recommendation.value) return ''
  return signalClass(recommendation.value.rating)
})

function getScoreClass(rating: number | undefined): string {
  const base = signalClass(rating)
  if (base === 'bullish') return 'score-high'
  if (base === 'neutral') return 'score-medium'
  if (base === 'bearish') return 'score-low'
  return ''
}
</script>

<template>
  <!-- 默认态：两个按钮 -->
  <div v-if="!activeIntent" class="decision-entry">
    <button class="decision-btn buy-btn" @click="setIntent('buy')">
      <span class="btn-icon">↑</span>
      <span class="btn-text">我想买</span>
    </button>
    <button class="decision-btn sell-btn" @click="setIntent('sell')">
      <span class="btn-icon">↓</span>
      <span class="btn-text">我想卖</span>
    </button>
  </div>

  <!-- 激活态：推荐视图 -->
  <div v-else class="decision-active">
    <!-- 顶部控制栏 -->
    <div class="decision-header">
      <div class="intent-switcher">
        <button
          class="intent-btn"
          :class="{ active: activeIntent === 'buy', 'buy-active': activeIntent === 'buy' }"
          @click="setIntent('buy')"
        >我想买</button>
        <button
          class="intent-btn"
          :class="{ active: activeIntent === 'sell', 'sell-active': activeIntent === 'sell' }"
          @click="setIntent('sell')"
        >我想卖</button>
      </div>
      <button class="close-btn" @click="closeDecision">收起</button>
    </div>

    <!-- 时间范围 chips -->
    <div class="range-chips">
      <button
        v-for="(label, key) in rangeLabels"
        :key="key"
        class="range-chip"
        :class="{ active: dateRange === key }"
        @click="setRange(key as DateRange)"
      >{{ label }}</button>
    </div>

    <!-- 推荐结果 -->
    <div v-if="recommendation" class="rec-result">
      <!-- 推荐日期 -->
      <div class="rec-date-row">
        <span class="rec-label">推荐{{ intentLabel }}日期</span>
      </div>
      <div class="rec-date">
        <span class="rec-day">{{ recommendation.dayLabel }}</span>
      </div>

      <!-- 主结论 -->
      <div class="rec-verdict" :class="recommendation.verdictClass">
        <span class="verdict-mark">{{ recommendation.verdictClass === 'positive' ? '✅' : recommendation.verdictClass === 'caution' ? '⚠️' : '—' }}</span>
        <span class="verdict-text">{{ recommendation.verdict }}</span>
      </div>

      <!-- 市场体温摘要（紧凑版） -->
      <div v-if="marketTemperature?.derived" class="rec-temperature">
        <div class="temp-row">
          <span class="temp-label">估值</span>
          <span class="temp-value">{{ marketTemperature.derived.erp_label || '--' }}</span>
          <span class="temp-sub">PE {{ marketTemperature.derived.pe_percentile != null ? `${marketTemperature.derived.pe_percentile}%位` : '--' }}</span>
        </div>
        <div class="temp-row">
          <span class="temp-label">情绪</span>
          <span class="temp-value">{{ marketTemperature.derived.advance_decline_label || '--' }}</span>
          <span class="temp-sub">涨跌比 {{ marketTemperature.derived.advance_decline_ratio != null ? `${marketTemperature.derived.advance_decline_ratio.toFixed(0)}%` : '--' }}</span>
        </div>
        <div class="temp-row">
          <span class="temp-label">量能</span>
          <span class="temp-value">{{ marketTemperature.derived.turnover_trend || '--' }}</span>
          <span class="temp-sub">{{ formatTurnover(marketTemperature.derived.turnover_5d_avg) }}</span>
        </div>
      </div>

      <!-- 评分 + 概率（小字辅助） -->
      <div class="rec-stats">
        <div class="rec-stat">
          <span class="stat-label">评分</span>
          <span class="stat-value" :class="recRatingClass">{{ formatScore(recommendation.rating) }}</span>
        </div>
        <div class="rec-stat">
          <span class="stat-label">上涨概率</span>
          <span class="stat-value" :class="recRatingClass">{{ Math.round(recommendation.upProbability * 100) }}%</span>
        </div>
      </div>

      <!-- 本周评分日历 -->
      <div v-if="weekDays.length > 0" class="rec-week-calendar">
        <div class="week-label">本周评分</div>
        <div class="week-grid">
          <div
            v-for="day in weekDays"
            :key="day.date"
            class="week-day"
            :class="{
              'is-today': day.date === props.today,
              'is-recommended': recommendation && day.date === recommendation.date,
            }"
          >
            <div class="week-day-label">{{ day.day_label.split(' ')[0] }}</div>
            <div class="week-day-score" :class="getScoreClass(day.calendar_effects?.almanac?.short_term?.rating)">
              {{ day.calendar_effects?.almanac?.short_term?.rating?.toFixed(0) || '--' }}
            </div>
          </div>
        </div>
      </div>

      <div class="rec-divider"></div>

      <!-- 支持论据 -->
      <div class="rec-reasons">
        <div class="reasons-title">{{ intentLabel }}理由</div>
        <ul class="reasons-list">
          <li v-for="(reason, i) in recommendation.reasons" :key="i" class="reason-item">
            {{ reason }}
          </li>
        </ul>
      </div>

      <!-- 底部一句软提醒 -->
      <div v-if="recommendation.caveat" class="rec-caveat">
        {{ recommendation.caveat }}
      </div>
    </div>

    <!-- 无数据 -->
    <div v-else class="rec-empty">
      当前范围内暂无有效交易日数据
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '../styles/theme' as *;
@use '../styles/mixins' as *;

// === 默认态：两个按钮 ===
.decision-entry {
  display: flex;
  gap: $space-md;
  padding: $space-lg 0;
}

.decision-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-xs;
  height: 36px;
  border: 1px solid $border-heavy;
  border-radius: $radius-sm;
  background: transparent;
  font-family: $font-sans;
  font-size: $text-sm;
  font-weight: $weight-semibold;
  color: $text-primary;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all $duration-fast $ease-out;

  &:active {
    transform: scale(0.97);
  }
}

.btn-icon {
  font-size: $text-sm;
  line-height: 1;
  font-weight: $weight-bold;
}

.buy-btn {
  color: $color-up-dark;
  border-color: $color-up;
  background: $color-up-light;

  .btn-icon { color: $color-up; }

  &:active {
    background: $color-up;
    color: $text-inverse;
  }
}

.sell-btn {
  color: $color-down-dark;
  border-color: $color-down;
  background: $color-down-light;

  .btn-icon { color: $color-down; }

  &:active {
    background: $color-down;
    color: $text-inverse;
  }
}

// === 激活态 ===
.decision-active {
  padding: $space-lg 0;
}

.decision-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: $space-lg;
}

.intent-switcher {
  display: flex;
  gap: $space-sm;
}

.intent-btn {
  padding: $space-xs $space-md;
  border: 1px solid $border;
  border-radius: $radius-sm;
  background: transparent;
  font-family: $font-sans;
  font-size: $text-sm;
  font-weight: $weight-medium;
  color: $text-tertiary;
  cursor: pointer;
  transition: all $duration-fast $ease-out;

  &.active.buy-active {
    background: $color-up;
    border-color: $color-up;
    color: $text-inverse;
  }

  &.active.sell-active {
    background: $color-down;
    border-color: $color-down;
    color: $text-inverse;
  }
}

.close-btn {
  background: none;
  border: none;
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-tertiary;
  cursor: pointer;
  padding: $space-xs $space-sm;

  &:active {
    color: $text-primary;
  }
}

// === 时间范围 chips ===
.range-chips {
  display: flex;
  gap: $space-sm;
  margin-bottom: $space-xl;
}

.range-chip {
  padding: $space-xs $space-md;
  border: 1px solid $border;
  border-radius: $radius-sm;
  background: transparent;
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-secondary;
  cursor: pointer;
  transition: all $duration-fast $ease-out;

  &.active {
    background: $text-primary;
    border-color: $text-primary;
    color: $text-inverse;
  }
}

// === 推荐结果 ===
.rec-result {
  @include anim-rise;
}

.rec-date-row {
  margin-bottom: $space-sm;
}

.rec-label {
  @include editorial-label;
}

.rec-date {
  margin-bottom: $space-lg;
}

.rec-day {
  font-family: $font-serif;
  font-size: $text-2xl;
  font-weight: $weight-bold;
  color: $text-primary;
  letter-spacing: 1px;
}

// === 主结论 ===
.rec-verdict {
  display: flex;
  align-items: center;
  gap: $space-sm;
  padding: $space-lg 0 $space-md;

  &.positive { color: $color-up-dark; }
  &.neutral { color: $text-secondary; }
  &.caution { color: $color-warn; }
}

.verdict-mark {
  font-size: $text-xl;
  line-height: 1;
}

.verdict-text {
  font-family: $font-serif;
  font-size: $text-lg;
  font-weight: $weight-bold;
  letter-spacing: 1px;
}

// === 市场体温摘要 ===
.rec-temperature {
  margin: $space-md 0;
  padding: $space-md;
  background: $bg-muted;
  border-radius: $radius-sm;
}

.temp-row {
  display: flex;
  align-items: center;
  gap: $space-sm;
  padding: $space-xs 0;
  font-family: $font-sans;
  font-size: $text-sm;

  & + .temp-row {
    border-top: 1px solid $border;
  }
}

.temp-label {
  color: $text-tertiary;
  width: 32px;
  flex-shrink: 0;
}

.temp-value {
  font-weight: $weight-medium;
  color: $text-primary;
  flex: 1;
}

.temp-sub {
  color: $text-tertiary;
  font-size: $text-xs;
  @include tabular-nums;
}

// === 7天评分日历 ===
.rec-week-calendar {
  margin: $space-md 0;
}

.week-label {
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-secondary;
  margin-bottom: $space-sm;
}

.week-grid {
  display: flex;
  gap: $space-xs;
}

.week-day {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $space-xs;
  padding: $space-sm $space-xs;
  border-radius: $radius-sm;
  background: $bg-muted;

  &.is-today {
    background: $color-neutral-light;
  }

  &.is-recommended {
    background: $color-up-light;
    border: 1px solid $color-up;
  }
}

.week-day-label {
  font-family: $font-sans;
  font-size: $text-xs;
  color: $text-secondary;
}

.week-day-score {
  font-family: $font-serif;
  font-size: $text-lg;
  font-weight: $weight-bold;
  @include tabular-nums;

  &.score-high { color: $color-up; }
  &.score-medium { color: $color-neutral; }
  &.score-low { color: $color-down; }
}

.rec-stats {
  display: flex;
  gap: $space-2xl;
  margin-bottom: $space-lg;
}

.rec-stat {
  display: flex;
  flex-direction: column;
  gap: $space-xs;
}

.stat-label {
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-secondary;
}

.stat-value {
  font-family: $font-serif;
  font-size: $text-xl;
  font-weight: $weight-bold;
  @include tabular-nums;

  &.bullish { color: $color-up; }
  &.neutral { color: $color-neutral; }
  &.bearish { color: $color-down; }
}

.rec-divider {
  height: 1px;
  background: $border;
  margin-bottom: $space-lg;
}

// === 论据 ===
.rec-reasons {
  margin-bottom: $space-lg;
}

.reasons-title {
  font-family: $font-sans;
  font-size: $text-sm;
  font-weight: $weight-semibold;
  color: $text-secondary;
  letter-spacing: 2px;
  margin-bottom: $space-md;
}

.reasons-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.reason-item {
  font-family: $font-sans;
  font-size: $text-md;
  color: $text-primary;
  line-height: $leading-relaxed;
  padding: $space-xs 0;
  padding-left: $space-lg;
  position: relative;

  &::before {
    content: '·';
    position: absolute;
    left: $space-sm;
    color: $text-tertiary;
    font-weight: $weight-bold;
  }
}

// === 底部一句软提醒 ===
.rec-caveat {
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-tertiary;
  line-height: $leading-relaxed;
  border-top: $rule-thin;
  padding-top: $space-md;
}

// === 空状态 ===
.rec-empty {
  text-align: center;
  padding: $space-2xl 0;
  color: $text-disabled;
  font-family: $font-sans;
  font-size: $text-md;
}
</style>
