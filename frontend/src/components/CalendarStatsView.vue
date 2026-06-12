<script setup lang="ts">
import { computed } from 'vue'
import type { CalendarEffects } from '../services/api'
import CalendarBanner from './CalendarBanner.vue'
import MonthlyCalendarGrid from './MonthlyCalendarGrid.vue'
import AlmanacCard from './AlmanacCard.vue'

const props = defineProps<{
  calendarEffects: CalendarEffects
  date: string
}>()

const emit = defineEmits<{
  (e: 'selectDate', date: string): void
}>()

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

function probColor(prob: number): string {
  if (prob > 0.55) return 'bar-up'
  if (prob < 0.45) return 'bar-down'
  return 'bar-neutral'
}

// 评分显示函数 (0-10分)
function formatRating(rating: number | undefined): string {
  if (rating === undefined) return '5.0'
  return rating.toFixed(1)
}

function ratingClass(rating: number | undefined): string {
  if (rating === undefined) return 'rating-neutral'
  if (rating >= 8) return 'rating-excellent'
  if (rating >= 6) return 'rating-good'
  if (rating >= 4) return 'rating-neutral'
  if (rating >= 2) return 'rating-poor'
  return 'rating-terrible'
}

function ratingEmoji(rating: number | undefined): string {
  if (rating === undefined) return '➖'
  if (rating >= 8) return '🔥'
  if (rating >= 6) return '📈'
  if (rating >= 4) return '➖'
  if (rating >= 2) return '📉'
  return '⚠️'
}

function formatPct(prob: number): string {
  return `${Math.round(prob * 100)}%`
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

// 热力图背景色（基于评分 0-10，5级色阶）
function heatmapBg(rating: number | undefined): string {
  if (rating === undefined) return 'transparent'
  if (rating >= 8) return 'rgba(232, 71, 76, 0.22)'   // 极强利好
  if (rating >= 6) return 'rgba(232, 71, 76, 0.10)'   // 利好
  if (rating >= 4) return 'rgba(156, 163, 175, 0.06)' // 中性
  if (rating >= 2) return 'rgba(46, 175, 125, 0.10)'  // 利空
  return 'rgba(46, 175, 125, 0.22)'                    // 极强利空
}

const indexCodes = ['000001', '000300', '000905'] as const

function getIndexData(idxCode: string) {
  if (!props.calendarEffects.indices_monthly) return null
  return props.calendarEffects.indices_monthly[idxCode as keyof typeof props.calendarEffects.indices_monthly] ?? null
}

// 明日日期简写 (如 "6/12")
const nextDayShort = computed(() => {
  const nd = props.calendarEffects.next_trading_day
  if (!nd?.date) return ''
  const [, m, d] = nd.date.split('-').map(Number)
  return `${m}/${d}`
})

</script>

<template>
  <div class="stats-view">
    <!-- 横幅 -->
    <CalendarBanner :banner="calendarEffects.active_banner" />

    <!-- 黄历卡片 -->
    <AlmanacCard
      :almanacByIndex="calendarEffects.almanac_by_index"
      :nextMonthName="monthNames[dateParts.month % 12 + 1]"
      :nextDayShort="nextDayShort"
    />

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
        @selectDay="handleDayClick"
      />
    </div>

    <!-- 本月特征：波动率 + 效应衰减 + 连涨跌 -->
    <div class="card">
      <div class="card-title">📊 {{ monthNames[dateParts.month] }}特征</div>

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
              <div class="bar-fill" :class="probColor(calendarEffects.this_month.up_probability)"
                :style="{ width: (calendarEffects.this_month.up_probability * 100) + '%' }"></div>
            </div>
            <span class="decay-mini-value">{{ formatPct(calendarEffects.this_month.up_probability) }}</span>
          </div>
          <div class="decay-mini-row">
            <span class="decay-mini-label">近10年</span>
            <div class="bar-wrapper">
              <div class="bar-fill" :class="probColor(calendarEffects.this_month.decay.recent_10y?.up_probability ?? 0.5)"
                :style="{ width: ((calendarEffects.this_month.decay.recent_10y?.up_probability ?? 0.5) * 100) + '%' }"></div>
            </div>
            <span class="decay-mini-value">{{ formatPct(calendarEffects.this_month.decay.recent_10y?.up_probability ?? 0.5) }}</span>
          </div>
          <div class="decay-mini-row">
            <span class="decay-mini-label">近5年</span>
            <div class="bar-wrapper">
              <div class="bar-fill" :class="probColor(calendarEffects.this_month.decay.recent_5y?.up_probability ?? 0.5)"
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

    <!-- 年度最佳/最差月 -->
    <div class="yearly-overview">
      <span class="summary-best">🔥 最佳: {{ monthNames[calendarEffects.yearly_overview.best_month.month] }} {{ formatPct(calendarEffects.yearly_overview.best_month.up_probability) }}</span>
      <span class="summary-worst">⚠️ 最差: {{ monthNames[calendarEffects.yearly_overview.worst_month.month] }} {{ formatPct(calendarEffects.yearly_overview.worst_month.up_probability) }}</span>
    </div>

    <!-- 三大指数评分图 -->
    <template v-for="idxCode in indexCodes" :key="idxCode">
      <div class="card" v-if="getIndexData(idxCode)">
        <div class="card-title">📊 {{ getIndexData(idxCode)!.name }} · 全年月度评分</div>
        <div class="v-chart">
          <div v-for="m in 12" :key="m" class="v-bar-item" :class="{ 'is-current': m === dateParts.month }"
            :style="{ backgroundColor: getIndexMonthRating(idxCode, m) !== undefined ? heatmapBg(getIndexMonthRating(idxCode, m)) : 'transparent' }">
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

    <!-- 卡片10: 窗口效应详情 -->
    <div class="card" v-if="calendarEffects.special_effect_stats">
      <div class="card-title">🎯 特殊窗口统计</div>
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

    <!-- 免责 -->
    <div class="disclaimer">💡 历史统计不代表未来表现，仅供参考</div>
  </div>
</template>

<style scoped>
.stats-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  box-shadow: var(--shadow-md);
}

.card-title {
  font-size: var(--text-md);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  margin-bottom: var(--space-md);
}

.calendar-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.month-nav-btn {
  background: none;
  border: none;
  font-size: var(--text-md);
  color: var(--text-secondary);
  cursor: pointer;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  transition: all var(--duration-fast) var(--ease-out);
  line-height: 1;
}

.month-nav-btn:active {
  background: var(--bg-muted);
  color: var(--text-primary);
  transform: scale(0.9);
}

/* 本月特征 */
.feature-section { margin: 0; }
.feature-divider {
  height: 1px;
  background: var(--border-light);
  margin: var(--space-md) 0;
}
.feature-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-xs);
}
.feature-label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  font-weight: var(--font-medium);
}
.feature-value {
  font-size: var(--text-lg);
  font-weight: var(--font-bold);
  font-variant-numeric: tabular-nums;
}
.feature-tag {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}
.feature-trend {
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
}
.vol-high { color: var(--color-up); }
.vol-medium { color: var(--color-warn); }
.vol-low { color: var(--color-down); }

.decay-mini-bars { display: flex; flex-direction: column; gap: var(--space-xs); }
.decay-mini-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
.decay-mini-label {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  width: 36px;
  flex-shrink: 0;
}
.decay-mini-value {
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  width: 32px;
  text-align: right;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.bar-wrapper { flex: 1; height: 5px; background: var(--bg-muted); border-radius: var(--radius-sm); overflow: hidden; }
.bar-fill { height: 100%; border-radius: var(--radius-sm); transition: width var(--duration-normal) var(--ease-out); }
.bar-up { background: var(--color-up); }
.bar-down { background: var(--color-down); }
.bar-neutral { background: var(--color-neutral); }

.streak-up { color: var(--color-up); font-size: var(--text-sm); font-weight: var(--font-semibold); }
.streak-down { color: var(--color-down); font-size: var(--text-sm); font-weight: var(--font-semibold); }
.streak-sep { color: var(--text-disabled); font-size: var(--text-sm); }
.streak-extremes {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  margin-bottom: var(--space-xs);
}

/* 年度概览 */
.yearly-overview {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-sm);
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-card);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
}
.summary-best { color: var(--color-up); font-weight: var(--font-medium); }
.summary-worst { color: var(--color-down); font-weight: var(--font-medium); }

/* 解释文字 */
.stat-explain {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: var(--leading-relaxed);
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-muted);
  border-radius: var(--radius-sm);
}
.trend-up { color: var(--color-up); font-weight: var(--font-semibold); }
.trend-down { color: var(--color-down); font-weight: var(--font-semibold); }
.trend-stable { color: var(--text-secondary); font-weight: var(--font-semibold); }

/* 三大指数评分图 — 6列×2行网格 */
.v-chart {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: var(--space-xs);
  padding: var(--space-xs);
  background: var(--bg-muted);
  border-radius: var(--radius-md);
}
.v-bar-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-sm) var(--space-xs);
  border-radius: var(--radius-sm);
  min-height: 62px;
  transition: background-color var(--duration-fast) var(--ease-out);
}
.v-bar-item.is-current {
  border: 2px solid var(--color-warn);
}
.v-bar-rating {
  font-size: var(--text-lg);
  font-weight: var(--font-bold);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.v-bar-rating.rating-excellent { color: var(--color-up-dark); }
.v-bar-rating.rating-good { color: var(--color-up); }
.v-bar-rating.rating-neutral { color: var(--text-secondary); }
.v-bar-rating.rating-poor { color: var(--color-down); }
.v-bar-rating.rating-terrible { color: var(--color-down-dark); }
.v-bar-emoji { font-size: var(--text-sm); margin: 3px 0; }
.v-bar-pct { font-size: var(--text-sm); color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.v-bar-label { font-size: var(--text-sm); color: var(--text-tertiary); margin-top: 2px; }
.v-bar-item.is-current .v-bar-label { color: var(--color-warn); font-weight: var(--font-bold); }

/* 特殊窗口 */
.effect-details { display: flex; flex-direction: column; gap: var(--space-sm); }
.effect-item {
  display: flex;
  gap: var(--space-sm);
  padding: var(--space-sm);
  background: var(--bg-muted);
  border-radius: var(--radius-md);
}
.effect-icon { font-size: var(--text-xl); flex-shrink: 0; }
.effect-content { flex: 1; }
.effect-name { font-size: var(--text-sm); font-weight: var(--font-semibold); color: var(--text-primary); margin-bottom: var(--space-xs); }
.effect-data { font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-normal); }

.disclaimer { text-align: center; font-size: var(--text-sm); color: var(--text-tertiary); padding: var(--space-sm) 0; }
</style>
