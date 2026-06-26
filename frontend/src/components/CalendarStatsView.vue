<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CalendarEffects } from '../services/api'
import { formatPct, ratingClass, probColorClass, heatmapClass } from '../utils/display'
import CalendarBanner from './CalendarBanner.vue'
import MonthlyCalendarGrid from './MonthlyCalendarGrid.vue'

const props = defineProps<{
  calendarEffects: CalendarEffects
  date: string
  holidays?: Record<string, { name: string; is_trading_day: boolean }>
}>()

const emit = defineEmits<{
  (e: 'selectDate', date: string): void
}>()

// 折叠状态（默认展开）
const collapsed = ref({
  features: false,
  indices: false,
  specialWindows: false,
})

function toggleCollapse(key: keyof typeof collapsed.value) {
  collapsed.value[key] = !collapsed.value[key]
}

const dateParts = computed(() => {
  const [y, m, d] = props.date.split('-').map(Number)
  return { year: y, month: m, day: d }
})

// 处理日历点击（接收完整日期字符串 YYYY-MM-DD）
function handleDayClick(dateStr: string) {
  emit('selectDate', dateStr)
}

// 月份导航
function navigateMonth(offset: number) {
  let m = dateParts.value.month + offset
  let y = dateParts.value.year
  if (m > 12) { m = 1; y++ }
  if (m < 1) { m = 12; y-- }
  const dateStr = `${y}-${String(m).padStart(2, '0')}-01`
  emit('selectDate', dateStr)
}

const monthNames = ['', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

// 衰减趋势
const decayTrend = computed(() => {
  const decay = props.calendarEffects.this_month.decay
  if (!decay?.recent_5y) return 'stable'
  const current = props.calendarEffects.this_month.up_probability
  const r5 = decay.recent_5y.up_probability
  const diff = r5 - current
  if (diff > 0.05) return 'up'
  if (diff < -0.05) return 'down'
  return 'stable'
})

// 波动率排名
const volatilityRank = computed(() => {
  const vol = props.calendarEffects.this_month.volatility
  const allVols = props.calendarEffects.all_months.map(m => m.volatility)
  // Count how many months have higher volatility, then add 1
  const higherCount = allVols.filter(v => v > vol).length
  return higherCount + 1
})

const volatilityLevel = computed(() => {
  const rank = volatilityRank.value
  if (rank <= 3) return 'high'
  if (rank <= 8) return 'medium'
  return 'low'
})

// 连涨跌描述
const streakDesc = computed(() => {
  const s = props.calendarEffects.this_month.streaks
  if (!s) return null
  if (s.avg_up_streak > s.avg_down_streak + 0.5) return '涨势延续性强'
  if (s.avg_down_streak > s.avg_up_streak + 0.5) return '跌势延续性强'
  return '涨跌交替频繁'
})

// 评分显示函数 (0-10分，undefined 默认 5.0)
function formatRating(rating: number | undefined): string {
  if (rating === undefined) return '5.0'
  return rating.toFixed(1)
}

function ratingEmoji(rating: number | undefined): string {
  if (rating === undefined) return '➖'
  if (rating >= 8) return '🔥'
  if (rating >= 6) return '📈'
  if (rating >= 4) return '➖'
  if (rating >= 2) return '📉'
  return '⚠️'
}

function getIndexMonthProb(idxCode: string, month: number): number {
  const idxData = getIndexData(idxCode)
  if (!idxData) return 0.5
  const monthData = idxData.data.find(d => d.month === month)
  return monthData?.up_probability ?? 0.5
}

function getIndexMonthRating(idxCode: string, month: number): number | undefined {
  const idxData = getIndexData(idxCode)
  if (!idxData) return undefined
  const monthData = idxData.data.find(d => d.month === month)
  return monthData?.rating
}


const indexCodes = ['000001', '000300', '000905', '399006'] as const

function getIndexData(idxCode: string) {
  if (!props.calendarEffects.indices_monthly) return null
  return props.calendarEffects.indices_monthly[idxCode as keyof typeof props.calendarEffects.indices_monthly] ?? null
}

</script>

<template>
  <div class="stats-view">
    <!-- 横幅 -->
    <CalendarBanner :banner="calendarEffects.active_banner" />

    <!-- 月度日历 -->
    <div class="card">
      <div class="card-title calendar-title">
        <button class="month-nav-btn" @click="navigateMonth(-1)">◀</button>
        <span>📅 {{ monthNames[dateParts.month] }} · 每日历史评分</span>
        <button class="month-nav-btn" @click="navigateMonth(1)">▶</button>
      </div>
      <MonthlyCalendarGrid
        :dailyCalendar="calendarEffects.daily_calendar"
        :todayDay="dateParts.day"
        :month="dateParts.month"
        :year="dateParts.year"
        :holidays="holidays"
        @selectDay="handleDayClick"
      />
    </div>

    <!-- 本月特征：波动率 + 效应衰减 + 连涨跌（可折叠） -->
    <div class="card collapsible">
      <div class="card-title collapsible-header" @click="toggleCollapse('features')">
        <span>📊 {{ monthNames[dateParts.month] }}特征</span>
        <span class="collapse-icon">{{ collapsed.features ? '▼' : '▲' }}</span>
      </div>
      <div v-show="!collapsed.features">

      <!-- 波动率 -->
      <div class="feature-section">
        <div class="feature-row">
          <span class="feature-label">波动率</span>
          <span class="feature-value" :class="'vol-' + volatilityLevel">
            {{ calendarEffects.this_month.volatility.toFixed(1) }}%
          </span>
          <span class="feature-tag">全年第{{ volatilityRank }}高</span>
        </div>
        <div class="stat-explain" v-if="volatilityLevel === 'high'">
          波动率较高，本月价格波动幅度大，风险和机会都更大。
        </div>
        <div class="stat-explain" v-else-if="volatilityLevel === 'low'">
          波动率较低，本月走势相对平稳。
        </div>
      </div>

      <div class="feature-divider"></div>

      <!-- 效应衰减 -->
      <div class="feature-section" v-if="calendarEffects.this_month.decay">
        <div class="feature-row">
          <span class="feature-label">效应衰减</span>
          <span class="feature-trend" v-if="decayTrend === 'up'"><span class="trend-up">近期增强</span></span>
          <span class="feature-trend" v-else-if="decayTrend === 'down'"><span class="trend-down">近期减弱</span></span>
          <span class="feature-trend" v-else><span class="trend-stable">仍然稳定</span></span>
        </div>
        <div class="decay-mini-bars">
          <div class="decay-mini-row">
            <span class="decay-mini-label">全样本</span>
            <div class="bar-wrapper">
              <div class="bar-fill" :class="probColorClass(calendarEffects.this_month.up_probability)"
                :style="{ width: (calendarEffects.this_month.up_probability * 100) + '%' }"></div>
            </div>
            <span class="decay-mini-value">{{ formatPct(calendarEffects.this_month.up_probability) }}</span>
          </div>
          <div class="decay-mini-row">
            <span class="decay-mini-label">近10年</span>
            <div class="bar-wrapper">
              <div class="bar-fill" :class="probColorClass(calendarEffects.this_month.decay.recent_10y?.up_probability ?? 0.5)"
                :style="{ width: ((calendarEffects.this_month.decay.recent_10y?.up_probability ?? 0.5) * 100) + '%' }"></div>
            </div>
            <span class="decay-mini-value">{{ formatPct(calendarEffects.this_month.decay.recent_10y?.up_probability ?? 0.5) }}</span>
          </div>
          <div class="decay-mini-row">
            <span class="decay-mini-label">近5年</span>
            <div class="bar-wrapper">
              <div class="bar-fill" :class="probColorClass(calendarEffects.this_month.decay.recent_5y?.up_probability ?? 0.5)"
                :style="{ width: ((calendarEffects.this_month.decay.recent_5y?.up_probability ?? 0.5) * 100) + '%' }"></div>
            </div>
            <span class="decay-mini-value">{{ formatPct(calendarEffects.this_month.decay.recent_5y?.up_probability ?? 0.5) }}</span>
          </div>
        </div>
      </div>

      <div class="feature-divider" v-if="calendarEffects.this_month.decay"></div>

      <!-- 连涨跌 -->
      <div class="feature-section" v-if="calendarEffects.this_month.streaks">
        <div class="feature-row">
          <span class="feature-label">连涨跌</span>
          <span class="streak-up">{{ calendarEffects.this_month.streaks.avg_up_streak }}天涨</span>
          <span class="streak-sep">/</span>
          <span class="streak-down">{{ calendarEffects.this_month.streaks.avg_down_streak }}天跌</span>
        </div>
        <div class="streak-extremes" v-if="calendarEffects.this_month.streaks.max_up_streak > 0">
          最长连涨 {{ calendarEffects.this_month.streaks.max_up_streak }} 天 / 最长连跌 {{ calendarEffects.this_month.streaks.max_down_streak }} 天
        </div>
        <div class="stat-explain">
          <template v-if="streakDesc === '涨势延续性强'">
            一旦开始上涨，<span class="trend-up">涨势容易延续</span>。
          </template>
          <template v-else-if="streakDesc === '跌势延续性强'">
            一旦开始下跌，<span class="trend-down">跌势容易延续</span>。
          </template>
          <template v-else>
            <span class="trend-stable">涨跌交替频繁</span>，趋势延续性不强。
          </template>
        </div>
      </div>
      </div>
    </div>

    <!-- 年度最佳/最差月 -->
    <div class="yearly-overview">
      <span class="summary-best">🔥 最佳: {{ monthNames[calendarEffects.yearly_overview.best_month.month] }} {{ formatPct(calendarEffects.yearly_overview.best_month.up_probability) }}</span>
      <span class="summary-worst">⚠️ 最差: {{ monthNames[calendarEffects.yearly_overview.worst_month.month] }} {{ formatPct(calendarEffects.yearly_overview.worst_month.up_probability) }}</span>
    </div>

    <!-- 三大指数评分图（可折叠） -->
    <div class="card collapsible">
      <div class="card-title collapsible-header" @click="toggleCollapse('indices')">
        <span>📊 三大指数 · 全年月度评分</span>
        <span class="collapse-icon">{{ collapsed.indices ? '▼' : '▲' }}</span>
      </div>
      <div v-show="!collapsed.indices">
        <template v-for="idxCode in indexCodes" :key="idxCode">
          <div class="index-section" v-if="getIndexData(idxCode)">
            <div class="index-name">{{ getIndexData(idxCode)!.name }}</div>
            <div class="v-chart">
              <div v-for="m in 12" :key="m" class="v-bar-item" :class="[{ 'is-current': m === dateParts.month }, heatmapClass(getIndexMonthRating(idxCode, m))]">
                <div class="v-bar-rating" :class="ratingClass(getIndexMonthRating(idxCode, m))">
                  {{ formatRating(getIndexMonthRating(idxCode, m)) }}
                </div>
                <div class="v-bar-emoji">{{ ratingEmoji(getIndexMonthRating(idxCode, m)) }}</div>
                <div class="v-bar-pct">{{ formatPct(getIndexMonthProb(idxCode, m)) }}</div>
                <div class="v-bar-label">{{ m }}月</div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- 窗口效应详情（可折叠） -->
    <div class="card collapsible" v-if="calendarEffects.special_effect_stats">
      <div class="card-title collapsible-header" @click="toggleCollapse('specialWindows')">
        <span>🎯 特殊窗口统计</span>
        <span class="collapse-icon">{{ collapsed.specialWindows ? '▼' : '▲' }}</span>
      </div>
      <div v-show="!collapsed.specialWindows">
      <div class="effect-details">
        <div class="effect-item" v-if="calendarEffects.special_effect_stats.spring_festival">
          <span class="effect-icon">🧧</span>
          <div class="effect-content">
            <div class="effect-name">春节效应</div>
            <div class="effect-data">
              节前5日 {{ formatPct(calendarEffects.special_effect_stats.spring_festival.aggregate.pre_5d?.up_probability ?? 0) }}上涨
              / 节后5日 {{ formatPct(calendarEffects.special_effect_stats.spring_festival.aggregate.post_5d?.up_probability ?? 0) }}上涨
            </div>
          </div>
        </div>
        <div class="effect-item" v-if="calendarEffects.special_effect_stats.turn_of_month">
          <span class="effect-icon">📅</span>
          <div class="effect-content">
            <div class="effect-name">月末效应</div>
            <div class="effect-data">
              窗口期 {{ formatPct(calendarEffects.special_effect_stats.turn_of_month.window.up_probability) }}
              vs 非窗口 {{ formatPct(calendarEffects.special_effect_stats.turn_of_month.non_window.up_probability) }}
              · 溢价 +{{ (calendarEffects.special_effect_stats.turn_of_month.premium.up_probability_diff * 100).toFixed(1) }}%
            </div>
          </div>
        </div>
        <div class="effect-item" v-if="calendarEffects.special_effect_stats.two_sessions">
          <span class="effect-icon">🏛️</span>
          <div class="effect-content">
            <div class="effect-name">两会效应</div>
            <div class="effect-data">
              会前 {{ formatPct(calendarEffects.special_effect_stats.two_sessions.pre?.up_probability ?? 0) }}
              / 会中 {{ formatPct(calendarEffects.special_effect_stats.two_sessions.during?.up_probability ?? 0) }}
              / 会后 {{ formatPct(calendarEffects.special_effect_stats.two_sessions.post?.up_probability ?? 0) }}
            </div>
          </div>
        </div>
        <div class="effect-item" v-if="calendarEffects.special_effect_stats.earnings_season">
          <span class="effect-icon">📋</span>
          <div class="effect-content">
            <div class="effect-name">财报季</div>
            <div class="effect-data">
              4月 {{ formatPct(calendarEffects.special_effect_stats.earnings_season.q1_annual?.up_probability ?? 0) }}
              · 8月 {{ formatPct(calendarEffects.special_effect_stats.earnings_season.h1?.up_probability ?? 0) }}
              · 10月 {{ formatPct(calendarEffects.special_effect_stats.earnings_season.q3?.up_probability ?? 0) }}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>

    <!-- 免责 -->
    <div class="disclaimer">💡 历史统计不代表未来表现，仅供参考</div>
  </div>
</template>

<style lang="scss" scoped>
@use '../styles/theme' as *;
@use '../styles/mixins' as *;

.stats-view {
  display: flex;
  flex-direction: column;
}

.card {
  @include editorial-card;
}

.card-title {
  font-family: $font-serif;
  font-size: $text-md;
  font-weight: $weight-bold;
  color: $text-primary;
  margin-bottom: $space-md;
  letter-spacing: 1px;
}

.calendar-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $space-sm;
}

.month-nav-btn {
  background: none;
  border: none;
  font-size: $text-md;
  color: $text-secondary;
  cursor: pointer;
  padding: $space-xs $space-sm;
  border-radius: 0;
  line-height: 1;

  &:active { color: $text-primary; }
}

// === 本月特征 ===
.feature-section { margin: 0; }
.feature-divider {
  height: 1px;
  background: $border;
  margin: $space-md 0;
}
.feature-row {
  display: flex;
  align-items: center;
  gap: $space-sm;
  margin-bottom: $space-xs;
}
.feature-label {
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-secondary;
  font-weight: $weight-medium;
}
.feature-value {
  font-family: $font-serif;
  font-size: $text-lg;
  font-weight: $weight-bold;
  @include tabular-nums;
}
.feature-tag {
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-tertiary;
}
.feature-trend {
  font-family: $font-sans;
  font-size: $text-sm;
  font-weight: $weight-semibold;
}
.vol-high { color: $color-up; }
.vol-medium { color: $color-warn; }
.vol-low { color: $color-down; }

.decay-mini-bars { display: flex; flex-direction: column; gap: $space-xs; }
.decay-mini-row {
  display: flex;
  align-items: center;
  gap: $space-sm;
}
.decay-mini-label {
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-tertiary;
  width: 36px;
  flex-shrink: 0;
}
.decay-mini-value {
  font-size: $text-sm;
  font-weight: $weight-semibold;
  width: 32px;
  text-align: right;
  flex-shrink: 0;
  @include tabular-nums;
}

.bar-wrapper { @include progress-track; flex: 1; }
.bar-fill { @include progress-fill; }
.bar-up { background: $color-up; }
.bar-down { background: $color-down; }
.bar-neutral { background: $border; }

.streak-up { color: $color-up; font-size: $text-sm; font-weight: $weight-semibold; font-family: $font-sans; }
.streak-down { color: $color-down; font-size: $text-sm; font-weight: $weight-semibold; font-family: $font-sans; }
.streak-sep { color: $text-disabled; font-size: $text-sm; }
.streak-extremes {
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-tertiary;
  margin-bottom: $space-xs;
}

// === 年度概览 ===
.yearly-overview {
  display: flex;
  justify-content: space-between;
  font-family: $font-sans;
  font-size: $text-sm;
  padding: $space-sm 0;
  background: $bg-card;
  border-bottom: $rule-thin;
}
.summary-best { color: $color-up; font-weight: $weight-medium; }
.summary-worst { color: $color-down; font-weight: $weight-medium; }

// === 解释文字 ===
.stat-explain {
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-secondary;
  line-height: $leading-relaxed;
  padding: $space-sm $space-md;
  background: $bg-muted;
  border-radius: 0;
}
.trend-up { color: $color-up; font-weight: $weight-semibold; }
.trend-down { color: $color-down; font-weight: $weight-semibold; }
.trend-stable { color: $text-secondary; font-weight: $weight-semibold; }

// === 三大指数评分图 ===
.v-chart {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 1px;
  background: $border;
  border: 1px solid $border;
}
.v-bar-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: $space-sm $space-xs;
  border-radius: 0;
  min-height: 62px;
  background: $bg-card;
}
.v-bar-item.is-current {
  border: 2px solid $border-heavy;
}
.v-bar-rating {
  font-family: $font-serif;
  font-size: $text-lg;
  font-weight: $weight-bold;
  line-height: 1;
  @include tabular-nums;

  &.rating-excellent { color: $color-up-dark; }
  &.rating-good { color: $color-up; }
  &.rating-neutral { color: $text-secondary; }
  &.rating-poor { color: $color-down; }
  &.rating-terrible { color: $color-down-dark; }
}
.v-bar-emoji { font-size: $text-sm; margin: 3px 0; }
.v-bar-pct { font-size: $text-sm; color: $text-tertiary; font-family: $font-sans; @include tabular-nums; }
.v-bar-label { font-size: $text-sm; color: $text-tertiary; font-family: $font-sans; margin-top: 2px; }
.v-bar-item.is-current .v-bar-label { color: $text-primary; font-weight: $weight-bold; }

// 热力图色阶（引用 theme 变量）
.v-bar-item.heat-5 { background: $rating-excellent-bg; }
.v-bar-item.heat-4 { background: $rating-good-bg; }
.v-bar-item.heat-3 { background: $rating-neutral-bg; }
.v-bar-item.heat-2 { background: $rating-poor-bg; }
.v-bar-item.heat-1 { background: $rating-terrible-bg; }

// === 特殊窗口 ===
.effect-details { display: flex; flex-direction: column; }
.effect-item {
  display: flex;
  gap: $space-sm;
  padding: $space-sm 0;
  border-bottom: $rule-thin;

  &:last-child { border-bottom: none; }
}
.effect-icon { font-size: $text-xl; flex-shrink: 0; }
.effect-content { flex: 1; }
.effect-name { font-family: $font-sans; font-size: $text-sm; font-weight: $weight-semibold; color: $text-primary; margin-bottom: $space-xs; }
.effect-data { font-family: $font-sans; font-size: $text-sm; color: $text-secondary; line-height: $leading-normal; }

// === 折叠区块 ===
.collapsible-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;

  &:active { opacity: 0.7; }
}

.collapse-icon {
  font-size: $text-sm;
  color: $text-tertiary;
}

.index-section {
  margin-bottom: $space-md;
  padding-bottom: $space-md;
  border-bottom: $rule-thin;

  &:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: none; }
}

.index-name {
  font-family: $font-sans;
  font-size: $text-sm;
  font-weight: $weight-semibold;
  color: $text-secondary;
  margin-bottom: $space-sm;
}

.disclaimer {
  text-align: center;
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-tertiary;
  padding: $space-sm 0;
}
</style>
