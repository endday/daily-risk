<script setup lang="ts">
import { computed } from 'vue'
import type { CalendarEffects } from '../services/api'
import CalendarBanner from './CalendarBanner.vue'
import MonthlyCalendarGrid from './MonthlyCalendarGrid.vue'

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

// 处理日历点击
function handleDayClick(day: number) {
  const newDate = `${dateParts.value.year}-${String(dateParts.value.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  emit('selectDate', newDate)
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

function probColorText(prob: number): string {
  if (prob > 0.55) return '#e74c3c'
  if (prob < 0.45) return '#27ae60'
  return '#666'
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

function ratingLabel(rating: number | undefined): string {
  if (rating === undefined) return '中性'
  if (rating >= 8) return '极强利好'
  if (rating >= 6) return '利好'
  if (rating >= 4) return '中性'
  if (rating >= 2) return '利空'
  return '极强利空'
}

function formatPct(prob: number): string {
  return `${Math.round(prob * 100)}%`
}

function formatChange(change: number): string {
  const sign = change >= 0 ? '+' : ''
  return `${sign}${change.toFixed(1)}%`
}

function changeColor(change: number): string {
  if (change > 0) return '#e74c3c'
  if (change < 0) return '#27ae60'
  return '#95a5a6'
}

function getMonthProb(m: number): number {
  const monthData = props.calendarEffects.all_months?.find(d => d.month === m)
  return monthData?.up_probability ?? 0.5
}

function getMonthLabel(m: number): string | null {
  const monthData = props.calendarEffects.all_months?.find(d => d.month === m)
  return monthData?.label ?? null
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

// 热力图背景色（基于评分 0-10）
function heatmapBg(rating: number | undefined): string {
  if (rating === undefined) return 'transparent'
  if (rating >= 9) return 'rgba(196, 30, 58, 0.3)'   // 深红
  if (rating >= 8) return 'rgba(231, 76, 60, 0.25)'  // 红色
  if (rating >= 7) return 'rgba(248, 118, 100, 0.2)' // 浅红
  if (rating >= 6) return 'rgba(255, 179, 179, 0.15)'// 淡红
  if (rating >= 4) return 'rgba(240, 240, 240, 0.1)' // 灰色
  if (rating >= 3) return 'rgba(184, 230, 184, 0.15)'// 淡绿
  if (rating >= 2) return 'rgba(125, 205, 125, 0.2)' // 浅绿
  return 'rgba(39, 174, 96, 0.25)'                   // 绿色
}

const indexCodes = ['000001', '000300', '000905'] as const

function getIndexData(idxCode: string) {
  if (!props.calendarEffects.indices_monthly) return null
  return props.calendarEffects.indices_monthly[idxCode as keyof typeof props.calendarEffects.indices_monthly] ?? null
}
</script>

<template>
  <div class="stats-view">
    <!-- 横幅 -->
    <CalendarBanner :banner="calendarEffects.active_banner" />

    <!-- 卡片1: 概率概览 (评分为核心指标) -->
    <div class="card">
      <div class="card-title">📊 {{ monthNames[dateParts.month] }}{{ dateParts.day }}日 · 上证指数 · 近20年</div>
      <div class="two-columns">
        <div class="column column-today">
          <div class="column-label">今日 ({{ dateParts.day }}号)</div>
          <div class="rating-display">
            <span class="rating-emoji">{{ ratingEmoji(calendarEffects.today.rating) }}</span>
            <div class="rating-info">
              <span class="rating-value" :class="ratingClass(calendarEffects.today.rating)">
                {{ formatRating(calendarEffects.today.rating) }}
              </span>
              <span class="rating-label">{{ ratingLabel(calendarEffects.today.rating) }}</span>
            </div>
          </div>
          <div class="rating-bar">
            <div class="rating-bar-fill" :class="ratingClass(calendarEffects.today.rating)"
              :style="{ width: (calendarEffects.today.rating ?? 5) * 10 + '%' }"></div>
          </div>
          <div class="column-sub" :style="{ color: changeColor(calendarEffects.today.avg_change_pct) }">
            上涨概率 {{ formatPct(calendarEffects.today.up_probability) }} · 平均 {{ formatChange(calendarEffects.today.avg_change_pct) }}
          </div>
        </div>
        <div class="column column-month">
          <div class="column-label">本月 ({{ monthNames[dateParts.month] }})</div>
          <div class="rating-display">
            <span class="rating-emoji">{{ ratingEmoji(calendarEffects.this_month.rating) }}</span>
            <div class="rating-info">
              <span class="rating-value" :class="ratingClass(calendarEffects.this_month.rating)">
                {{ formatRating(calendarEffects.this_month.rating) }}
              </span>
              <span class="rating-label">{{ ratingLabel(calendarEffects.this_month.rating) }}</span>
            </div>
          </div>
          <div class="rating-bar">
            <div class="rating-bar-fill" :class="ratingClass(calendarEffects.this_month.rating)"
              :style="{ width: (calendarEffects.this_month.rating ?? 5) * 10 + '%' }"></div>
          </div>
          <div class="column-sub" :style="{ color: changeColor(calendarEffects.this_month.avg_change_pct) }">
            上涨概率 {{ formatPct(calendarEffects.this_month.up_probability) }} · 平均 {{ formatChange(calendarEffects.this_month.avg_change_pct) }}
          </div>
          <div class="column-tag" v-if="calendarEffects.this_month.label">
            {{ calendarEffects.this_month.label }}
          </div>
        </div>
      </div>
    </div>

    <!-- 卡片2: 月度日历 -->
    <div class="card">
      <div class="card-title">📅 {{ monthNames[dateParts.month] }}日历</div>
      <MonthlyCalendarGrid
        :dailyCalendar="calendarEffects.daily_calendar"
        :todayDay="dateParts.day"
        :month="dateParts.month"
        :year="dateParts.year"
        @selectDay="handleDayClick"
      />
    </div>

    <!-- 卡片3: 全年走势 -->
    <div class="card">
      <div class="card-title">📈 全年月度涨跌概率</div>
      <div class="yearly-bars">
        <div v-for="m in 12" :key="m" class="bar-row" :class="{ 'is-current': m === dateParts.month }">
          <div class="bar-label">{{ m }}月</div>
          <div class="bar-wrapper">
            <div class="bar-fill" :class="probColor(getMonthProb(m))"
              :style="{ width: (getMonthProb(m) * 100) + '%' }"></div>
          </div>
          <div class="bar-value" :style="{ color: probColorText(getMonthProb(m)) }">{{ formatPct(getMonthProb(m)) }}</div>
          <div class="bar-tag" v-if="getMonthLabel(m)">{{ getMonthLabel(m) }}</div>
        </div>
      </div>
      <div class="yearly-summary">
        <span class="summary-best">🔥 最佳: {{ monthNames[calendarEffects.yearly_overview.best_month.month] }} {{ formatPct(calendarEffects.yearly_overview.best_month.up_probability) }}</span>
        <span class="summary-worst">⚠️ 最差: {{ monthNames[calendarEffects.yearly_overview.worst_month.month] }} {{ formatPct(calendarEffects.yearly_overview.worst_month.up_probability) }}</span>
      </div>
    </div>

    <!-- 卡片4: 波动率 -->
    <div class="card">
      <div class="card-title">📊 本月波动率</div>
      <div class="stat-highlight">
        <span class="stat-value" :class="'vol-' + volatilityLevel">
          {{ calendarEffects.this_month.volatility.toFixed(1) }}%
        </span>
        <span class="stat-rank">全年第{{ volatilityRank }}高</span>
      </div>
      <div class="stat-explain">
        <template v-if="volatilityLevel === 'high'">
          波动率较高，意味着本月价格波动幅度大，风险和机会都更大。
        </template>
        <template v-else-if="volatilityLevel === 'medium'">
          波动率适中，价格波动处于全年中等水平。
        </template>
        <template v-else>
          波动率较低，意味着本月走势相对平稳。
        </template>
      </div>
    </div>

    <!-- 卡片5: 效应衰减 -->
    <div class="card" v-if="calendarEffects.this_month.decay">
      <div class="card-title">📉 效应衰减检测</div>
      <div class="decay-bars">
        <div class="decay-row">
          <span class="decay-label">全样本</span>
          <div class="bar-wrapper">
            <div class="bar-fill" :class="probColor(calendarEffects.this_month.up_probability)"
              :style="{ width: (calendarEffects.this_month.up_probability * 100) + '%' }"></div>
          </div>
          <span class="decay-value">{{ formatPct(calendarEffects.this_month.up_probability) }}</span>
        </div>
        <div class="decay-row">
          <span class="decay-label">近10年</span>
          <div class="bar-wrapper">
            <div class="bar-fill" :class="probColor(calendarEffects.this_month.decay.recent_10y?.up_probability ?? 0.5)"
              :style="{ width: ((calendarEffects.this_month.decay.recent_10y?.up_probability ?? 0.5) * 100) + '%' }"></div>
          </div>
          <span class="decay-value">{{ formatPct(calendarEffects.this_month.decay.recent_10y?.up_probability ?? 0.5) }}</span>
        </div>
        <div class="decay-row">
          <span class="decay-label">近5年</span>
          <div class="bar-wrapper">
            <div class="bar-fill" :class="probColor(calendarEffects.this_month.decay.recent_5y?.up_probability ?? 0.5)"
              :style="{ width: ((calendarEffects.this_month.decay.recent_5y?.up_probability ?? 0.5) * 100) + '%' }"></div>
          </div>
          <span class="decay-value">{{ formatPct(calendarEffects.this_month.decay.recent_5y?.up_probability ?? 0.5) }}</span>
        </div>
      </div>
      <div class="stat-explain">
        <template v-if="decayTrend === 'up'">
          近5年上涨概率高于历史均值，说明该效应近期在<span class="trend-up">增强</span>。
        </template>
        <template v-else-if="decayTrend === 'down'">
          近5年上涨概率低于历史均值，说明该效应近期在<span class="trend-down">减弱</span>，可能逐渐失效。
        </template>
        <template v-else>
          近5年上涨概率与历史均值接近，说明该效应<span class="trend-stable">仍然稳定</span>。
        </template>
      </div>
    </div>

    <!-- 卡片6: 连涨跌 -->
    <div class="card" v-if="calendarEffects.this_month.streaks">
      <div class="card-title">🔗 连涨跌天数</div>
      <div class="streak-stats">
        <div class="streak-item">
          <span class="streak-num streak-up">{{ calendarEffects.this_month.streaks.avg_up_streak }}</span>
          <span class="streak-label">平均连涨天数</span>
        </div>
        <div class="streak-divider"></div>
        <div class="streak-item">
          <span class="streak-num streak-down">{{ calendarEffects.this_month.streaks.avg_down_streak }}</span>
          <span class="streak-label">平均连跌天数</span>
        </div>
      </div>
      <div class="streak-extremes" v-if="calendarEffects.this_month.streaks.max_up_streak > 0">
        最长连涨 {{ calendarEffects.this_month.streaks.max_up_streak }} 天 / 最长连跌 {{ calendarEffects.this_month.streaks.max_down_streak }} 天
      </div>
      <div class="stat-explain">
        <template v-if="streakDesc === '涨势延续性强'">
          本月历史上连涨天数多于连跌，说明一旦开始上涨，<span class="trend-up">涨势容易延续</span>。
        </template>
        <template v-else-if="streakDesc === '跌势延续性强'">
          本月历史上连跌天数多于连涨，说明一旦开始下跌，<span class="trend-down">跌势容易延续</span>。
        </template>
        <template v-else>
          本月涨跌交替较频繁，<span class="trend-stable">趋势延续性不强</span>，适合短线操作。
        </template>
      </div>
    </div>

    <!-- 卡片7-9: 三大指数评分图 -->
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
  gap: 12px;
}

.card {
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.card-title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  margin-bottom: 12px;
}

/* 概率概览 */
.two-columns { display: flex; gap: 12px; }
.column { flex: 1; background: #fafafa; border-radius: 8px; padding: 10px 12px; }
.column-today { border-left: 3px solid #ff9800; }
.column-label { font-size: 11px; color: #888; margin-bottom: 6px; font-weight: 500; }
.column-main { font-size: 13px; font-weight: 600; line-height: 1.4; margin-bottom: 2px; }
.column-sub { font-size: 12px; font-weight: 500; margin-bottom: 6px; }
.column-tag { font-size: 10px; color: #ff9800; margin-top: 4px; font-weight: 500; }
.bar-track { height: 6px; background: #e8e8e8; border-radius: 3px; overflow: hidden; margin-bottom: 4px; }
.bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
.bar-up { background: #e74c3c; }
.bar-down { background: #27ae60; }
.bar-neutral { background: #95a5a6; }

/* 全年走势 */
.yearly-bars { display: flex; flex-direction: column; gap: 6px; }
.bar-row { display: flex; align-items: center; gap: 8px; }
.bar-row.is-current { background: #fff8e1; border-radius: 4px; padding: 2px 4px; margin: 0 -4px; }
.bar-label { font-size: 11px; color: #888; width: 32px; flex-shrink: 0; }
.bar-wrapper { flex: 1; height: 8px; background: #f0f0f0; border-radius: 4px; overflow: hidden; }
.bar-value { font-size: 11px; font-weight: 600; width: 36px; text-align: right; flex-shrink: 0; }
.bar-tag { font-size: 9px; color: #ff9800; margin-left: 4px; white-space: nowrap; }
.yearly-summary { display: flex; justify-content: space-between; margin-top: 12px; font-size: 11px; padding-top: 8px; border-top: 1px solid #f0f0f0; }
.summary-best { color: #e74c3c; }
.summary-worst { color: #27ae60; }

/* 统计高亮（波动率） */
.stat-highlight {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 10px;
}
.stat-value {
  font-size: 28px;
  font-weight: 700;
}
.vol-high { color: #e74c3c; }
.vol-medium { color: #fa8c16; }
.vol-low { color: #52c41a; }
.stat-rank {
  font-size: 12px;
  color: #999;
}

/* 衰减检测 */
.decay-bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}
.decay-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.decay-label {
  font-size: 11px;
  color: #888;
  width: 48px;
  flex-shrink: 0;
}
.decay-value {
  font-size: 12px;
  font-weight: 600;
  width: 36px;
  text-align: right;
  flex-shrink: 0;
}

/* 连涨跌 */
.streak-stats {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  margin-bottom: 8px;
}
.streak-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.streak-num {
  font-size: 28px;
  font-weight: 700;
}
.streak-up { color: #e74c3c; }
.streak-down { color: #27ae60; }
.streak-label {
  font-size: 11px;
  color: #888;
}
.streak-divider {
  width: 1px;
  height: 40px;
  background: #e8e8e8;
}
.streak-extremes {
  text-align: center;
  font-size: 11px;
  color: #999;
  margin-bottom: 8px;
}

/* 解释文字 */
.stat-explain {
  font-size: 11px;
  color: #888;
  line-height: 1.5;
  padding: 8px 10px;
  background: #f9f9f9;
  border-radius: 6px;
}
.trend-up { color: #e74c3c; font-weight: 600; }
.trend-down { color: #27ae60; font-weight: 600; }
.trend-stable { color: #666; font-weight: 600; }

/* 三大指数评分图 */
.v-chart {
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  height: auto;
  padding: 4px;
  gap: 2px;
  background: #fafafa;
  border-radius: 8px;
}
.v-bar-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 2px;
  border-radius: 6px;
  min-height: 70px;
}
.v-bar-item.is-current {
  border: 2px solid #ff9800;
}
.v-bar-rating {
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
}
.v-bar-rating.rating-excellent { color: #c41e3a; }
.v-bar-rating.rating-good { color: #e74c3c; }
.v-bar-rating.rating-neutral { color: #666; }
.v-bar-rating.rating-poor { color: #27ae60; }
.v-bar-rating.rating-terrible { color: #1a7a42; }
.v-bar-emoji {
  font-size: 12px;
  margin: 2px 0;
}
.v-bar-pct {
  font-size: 9px;
  color: #888;
}
.v-bar-label {
  font-size: 9px;
  color: #888;
  margin-top: 4px;
}
.v-bar-item.is-current .v-bar-label {
  color: #ff9800;
  font-weight: 700;
}

/* 特殊窗口 */
.effect-details { display: flex; flex-direction: column; gap: 10px; }
.effect-item { display: flex; gap: 10px; padding: 8px; background: #fafafa; border-radius: 8px; }
.effect-icon { font-size: 20px; flex-shrink: 0; }
.effect-content { flex: 1; }
.effect-name { font-size: 12px; font-weight: 600; color: #333; margin-bottom: 4px; }
.effect-data { font-size: 11px; color: #666; line-height: 1.4; }

/* 评分显示 */
.rating-display {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.rating-emoji {
  font-size: 24px;
}
.rating-info {
  display: flex;
  flex-direction: column;
}
.rating-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
}
.rating-label {
  font-size: 11px;
  color: #888;
  margin-top: 2px;
}
.rating-value.rating-excellent { color: #c41e3a; }
.rating-value.rating-good { color: #e74c3c; }
.rating-value.rating-neutral { color: #666; }
.rating-value.rating-poor { color: #27ae60; }
.rating-value.rating-terrible { color: #1a7a42; }

.rating-bar {
  height: 6px;
  background: #f0f0f0;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 6px;
}
.rating-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s;
}
.rating-bar-fill.rating-excellent { background: #c41e3a; }
.rating-bar-fill.rating-good { background: #e74c3c; }
.rating-bar-fill.rating-neutral { background: #95a5a6; }
.rating-bar-fill.rating-poor { background: #27ae60; }
.rating-bar-fill.rating-terrible { background: #1a7a42; }

.disclaimer { text-align: center; font-size: 10px; color: #ccc; padding: 8px 0; }
</style>
