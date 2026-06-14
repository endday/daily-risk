<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { fetchEventsByDate } from '../services/api'
import { getToday } from '../../../shared/date-utils'
import type { CalendarEffects, RiskEvent } from '../services/api'
import CalendarStatsView from '../components/CalendarStatsView.vue'

// ============================================
// 共享状态
// ============================================

const today = getToday()
const [year, month, day] = today.split('-').map(Number)
const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const currentWeekday = new Date(year, month - 1, day).getDay()

const activeTab = ref<'overview' | 'events' | 'stats'>('overview')

// ============================================
// 数据层：按日期缓存
// ============================================

const dateEventsMap = ref<Record<string, RiskEvent[]>>({})
const dateRiskMap = ref<Record<string, number>>({})
const dateCalendarMap = ref<Record<string, CalendarEffects | null>>({})
const selectedDate = ref(today)
const loadingDay = ref(false)
const lastCalendar = ref<CalendarEffects | null>(null)

async function fetchDateEvents(date: string) {
  if (dateEventsMap.value[date] !== undefined) return
  try {
    const data = await fetchEventsByDate(date)
    dateEventsMap.value[date] = data.events || []
    dateRiskMap.value[date] = data.risk_index || 0
    if (data.calendar_effects) {
      dateCalendarMap.value[date] = data.calendar_effects
      lastCalendar.value = data.calendar_effects
    }
  } catch (e) {
    console.error(`Failed to fetch ${date}:`, e)
    dateEventsMap.value[date] = []
    dateRiskMap.value[date] = 0
  }
}

async function selectDate(date: string) {
  selectedDate.value = date
  loadingDay.value = true
  await fetchDateEvents(date)
  loadingDay.value = false
}

async function handleCalendarDateSelect(date: string) {
  await selectDate(date)
}

onMounted(() => {
  fetchDateEvents(today)
})

// ============================================
// 概览 Tab 数据（始终用今天）
// ============================================

const calendar = computed(() => dateCalendarMap.value[today] ?? null)

const shortRating = computed(() => calendar.value?.almanac?.short_term?.rating ?? null)
const shortLabel = computed(() => calendar.value?.almanac?.short_term?.signal?.label ?? '--')
const shortDesc = computed(() => calendar.value?.almanac?.short_term?.signal?.description ?? '--')
const swingRating = computed(() => calendar.value?.almanac?.swing?.rating ?? null)
const swingLabel = computed(() => calendar.value?.almanac?.swing?.signal?.label ?? '--')
const advice = computed(() => calendar.value?.almanac?.advice ?? '--')
const upProb = computed(() => calendar.value?.today?.up_probability ?? null)
const sampleCount = computed(() => calendar.value?.today?.sample_count ?? null)

const dayRatingMap = computed(() => {
  const ce = calendar.value
  if (!ce?.daily_calendar) return {} as Record<number, number>
  const map: Record<number, number> = {}
  for (const stat of ce.daily_calendar) {
    if (stat.rating !== undefined) map[stat.day] = stat.rating
  }
  return map
})

const daysInMonth = computed(() => new Date(year, month, 0).getDate())

const gridOffset = computed(() => {
  const dow = new Date(year, month - 1, 1).getDay()
  return (dow + 6) % 7
})

const nextMonthProb = computed(() => {
  const ce = calendar.value
  if (!ce) return null
  const idxData = ce.almanac_by_index?.['000001']
  if (idxData?.next_month_prob !== undefined) return idxData.next_month_prob
  const nextMonthNum = month === 12 ? 1 : month + 1
  const nextMonthStat = ce.all_months?.find(m => m.month === nextMonthNum)
  if (nextMonthStat?.up_probability !== undefined) return nextMonthStat.up_probability
  return null
})

// 概览：今日事件摘要（取前 2 条最重要的）
const todayEvents = computed(() => dateEventsMap.value[today] || [])
const topEvents = computed(() => todayEvents.value.slice(0, 2))

// ============================================
// 事件 Tab 数据（用 selectedDate）
// ============================================

const baseMonday = ref(getMonday(today))

function getMonday(anyDate: string): string {
  const [yStr, mStr, dStr] = anyDate.split('-')
  let y = parseInt(yStr), m = parseInt(mStr), d = parseInt(dStr)
  if (m < 3) { m += 12; y -= 1 }
  const K = y % 100, J = Math.floor(y / 100)
  const h = (d + Math.floor(13 * (m + 1) / 5) + K + Math.floor(K / 4) + Math.floor(J / 4) - 2 * J) % 7
  const dayOfWeek = ((h + 6) % 7)
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  d += diff
  const dim = [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  while (d < 1) { m--; if (m < 1) { m = 12; y-- } d += dim[m - 1] || 30 }
  while (d > (dim[m - 1] || 30)) { d -= dim[m - 1] || 30; m++; if (m > 12) { m = 1; y++ } }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function offsetDate(monday: string, offset: number): string {
  const [y, m, d] = monday.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + offset))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function dateLabel(dateStr: string): string {
  const labels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const [y, m, d] = dateStr.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return labels[day]
}

function dateShort(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${m}/${d}`
}

const dateStrip = computed(() => {
  const labels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  const items: { date: string; label: string; short: string; isToday: boolean }[] = []
  for (let i = 0; i < 7; i++) {
    const date = offsetDate(baseMonday.value, i)
    items.push({ date, label: labels[i], short: dateShort(date), isToday: date === today })
  }
  return items
})

function changeWeek(offset: number) {
  const [y, m, d] = baseMonday.value.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + offset * 7))
  baseMonday.value = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function goToday() {
  baseMonday.value = getMonday(today)
  selectDate(today)
}

const selectedEvents = computed(() => dateEventsMap.value[selectedDate.value] || [])
const selectedRisk = computed(() => dateRiskMap.value[selectedDate.value] || 0)
const selectedCalendar = computed(() => dateCalendarMap.value[selectedDate.value] ?? lastCalendar.value)

// ============================================
// 工具函数
// ============================================

function signalClass(rating: number | null): string {
  if (rating === null) return ''
  if (rating >= 6) return 'bullish'
  if (rating >= 4) return 'neutral'
  return 'bearish'
}

function scoreColor(score: number): string {
  if (score >= 9) return 'red'
  if (score >= 7) return 'orange'
  if (score >= 5) return 'yellow'
  return 'gray'
}

function ratingBg(rating: number | null): string {
  if (rating === null) return 'transparent'
  if (rating >= 8) return 'rgba(232, 71, 76, 0.15)'
  if (rating >= 6) return 'rgba(232, 71, 76, 0.07)'
  if (rating >= 4) return 'transparent'
  if (rating >= 2) return 'rgba(46, 175, 125, 0.07)'
  return 'rgba(46, 175, 125, 0.15)'
}

function fmtPct(v: number | null): string {
  return v !== null ? `${Math.round(v * 100)}%` : '--'
}

function fmtScore(v: number | null): string {
  return v !== null ? v.toFixed(1) : '--'
}

// 概览日历格子点击 → 切到事件 Tab 并选中该日期
function onGridDayClick(d: number) {
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  baseMonday.value = getMonday(dateStr)
  selectDate(dateStr)
  activeTab.value = 'events'
}
</script>

<template>
  <div class="editorial-home">
    <!-- 报头 -->
    <header class="masthead">
      <div class="mast-top">
        <span class="mast-date">{{ weekdays[currentWeekday] }}</span>
        <span class="mast-sep">|</span>
        <span class="mast-date">{{ year }}年{{ month }}月{{ day }}日</span>
      </div>
      <h1 class="mast-title">明日风险榜</h1>
      <div class="mast-sub">基于近20年A股历史涨跌统计 · 每日更新</div>
      <div class="mast-rule"></div>
    </header>

    <!-- Tab 栏 -->
    <div class="tab-bar">
      <div class="tab-item" :class="{ active: activeTab === 'overview' }" @click="activeTab = 'overview'">概览</div>
      <div class="tab-item" :class="{ active: activeTab === 'events' }" @click="activeTab = 'events'">
        事件
        <span v-if="todayEvents.length > 0" class="tab-badge">{{ todayEvents.length }}</span>
      </div>
      <div class="tab-item" :class="{ active: activeTab === 'stats' }" @click="activeTab = 'stats'">统计</div>
    </div>

    <!-- ============================================ -->
    <!-- Tab: 概览                                     -->
    <!-- ============================================ -->
    <div v-show="activeTab === 'overview'" class="tab-panel">
      <!-- 头条评分 -->
      <section class="headline">
        <div class="hl-label">今日研判</div>
        <div class="hl-score-row">
          <span class="hl-score" :class="signalClass(shortRating)">{{ fmtScore(shortRating) }}</span>
          <span class="hl-unit">/ 10</span>
        </div>
        <div class="hl-signal" :class="signalClass(shortRating)">
          <span class="hl-badge">{{ shortLabel }}</span>
          <span class="hl-signal-desc">{{ shortDesc }}</span>
        </div>
      </section>

      <div class="rule-thin"></div>

      <!-- 双栏数据 -->
      <section class="data-columns">
        <div class="data-col">
          <div class="col-head">短线 · 明日</div>
          <div class="col-score" :class="signalClass(shortRating)">{{ fmtScore(shortRating) }}</div>
          <div class="col-meta">
            <span class="meta-label">上涨概率</span>
            <span class="meta-value" :class="signalClass(shortRating)">{{ fmtPct(upProb) }}</span>
          </div>
          <div class="col-meta">
            <span class="meta-label">历史样本</span>
            <span class="meta-value">{{ sampleCount !== null ? `n=${sampleCount}` : '--' }}</span>
          </div>
        </div>
        <div class="col-divider"></div>
        <div class="data-col">
          <div class="col-head">波段 · {{ month + 1 > 12 ? 1 : month + 1 }}月</div>
          <div class="col-score" :class="signalClass(swingRating)">{{ fmtScore(swingRating) }}</div>
          <div class="col-meta">
            <span class="meta-label">上涨概率</span>
            <span class="meta-value" :class="signalClass(swingRating)">{{ fmtPct(nextMonthProb) }}</span>
          </div>
          <div class="col-meta">
            <span class="meta-label">操作信号</span>
            <span class="meta-value" :class="signalClass(swingRating)">{{ swingLabel }}</span>
          </div>
        </div>
      </section>

      <div class="rule-thin"></div>

      <!-- 综合研判 -->
      <section class="editorial-advice">
        <div class="advice-label">综合研判</div>
        <p class="advice-body">{{ advice }}</p>
      </section>

      <div class="rule-thin"></div>

      <!-- 今日要事 -->
      <section class="today-events" v-if="topEvents.length > 0">
        <div class="section-label">今日要事</div>
        <div v-for="evt in topEvents" :key="evt.event_key" class="event-brief">
          <span class="event-brief-name">{{ evt.display_name }}</span>
          <span class="event-brief-score" :class="scoreColor(evt.score)">{{ evt.score }}</span>
          <span v-if="evt.event_time" class="event-brief-time">{{ evt.event_time }}</span>
        </div>
        <div class="event-more" v-if="todayEvents.length > 2" @click="activeTab = 'events'">
          查看全部 {{ todayEvents.length }} 个事件 →
        </div>
      </section>

      <div class="rule-thin" v-if="topEvents.length > 0"></div>

      <!-- 月度日历表格 -->
      <section class="cal-table">
        <div class="cal-head">
          <span class="cal-title">{{ month }}月 · 每日历史评分一览</span>
        </div>
        <div class="cal-weekdays">
          <span v-for="w in ['一','二','三','四','五','六','日']" :key="w">{{ w }}</span>
        </div>
        <div class="cal-grid">
          <div v-for="i in gridOffset" :key="'e'+i" class="cal-cell empty"></div>
          <div
            v-for="d in daysInMonth"
            :key="d"
            class="cal-cell clickable"
            :class="{ 'is-today': d === day }"
            :style="{ backgroundColor: ratingBg(dayRatingMap[d] ?? null) }"
            @click="onGridDayClick(d)"
          >
            <span class="cell-day">{{ d }}</span>
            <span v-if="dayRatingMap[d] !== undefined" class="cell-score">{{ dayRatingMap[d]?.toFixed(1) }}</span>
          </div>
        </div>
        <div class="cal-footnote">
          评分范围 0-10，基于近20年同日上涨概率 Z-Score 计算。红色利好 / 绿色利空。点击日期查看详情。
        </div>
      </section>

      <!-- 底部 -->
      <footer class="editorial-footer">
        <div class="footer-rule"></div>
        <span>历史统计不代表未来表现 · 仅供参考，不构成投资建议</span>
      </footer>
    </div>

    <!-- ============================================ -->
    <!-- Tab: 事件                                     -->
    <!-- ============================================ -->
    <div v-show="activeTab === 'events'" class="tab-panel">
      <!-- 日期条 -->
      <div class="date-strip-wrapper">
        <button class="nav-btn nav-prev" @click="changeWeek(-1)">◀</button>
        <div class="date-strip">
          <div
            v-for="item in dateStrip"
            :key="item.date"
            class="date-item"
            :class="{ active: item.date === selectedDate, today: item.isToday }"
            @click="selectDate(item.date)"
          >
            <span class="date-day">{{ item.label }}</span>
            <span class="date-num">{{ item.short }}</span>
            <span v-if="dateRiskMap[item.date] && dateRiskMap[item.date] > 0" class="date-dot" :class="scoreColor(dateRiskMap[item.date])"></span>
          </div>
        </div>
        <button class="nav-btn nav-next" @click="changeWeek(1)">▶</button>
        <button v-if="selectedDate !== today" class="today-btn" @click="goToday">今天</button>
      </div>

      <!-- 风险指数 -->
      <div class="risk-section" v-if="selectedEvents.length > 0">
        <div class="risk-header">
          <span class="risk-title">{{ dateLabel(selectedDate) }} {{ dateShort(selectedDate) }} 风险指数</span>
          <span class="risk-value" :class="scoreColor(selectedRisk)">{{ selectedRisk.toFixed(1) }} / 10</span>
        </div>
        <div class="risk-bar">
          <div class="risk-fill" :class="scoreColor(selectedRisk)" :style="{ width: selectedRisk * 10 + '%' }"></div>
        </div>
      </div>

      <!-- 操作信号摘要 -->
      <div class="signal-summary" v-if="selectedCalendar?.almanac">
        <div class="signal-item">
          <span class="signal-label">短线</span>
          <span class="signal-badge" :class="'signal-' + selectedCalendar.almanac.short_term.signal.action">
            {{ selectedCalendar.almanac.short_term.signal.label }}
          </span>
          <span class="signal-rating">{{ selectedCalendar.almanac.short_term.rating.toFixed(1) }}</span>
        </div>
        <div class="signal-divider"></div>
        <div class="signal-item">
          <span class="signal-label">波段</span>
          <span class="signal-badge" :class="'signal-' + selectedCalendar.almanac.swing.signal.action">
            {{ selectedCalendar.almanac.swing.signal.label }}
          </span>
          <span class="signal-rating">{{ selectedCalendar.almanac.swing.rating.toFixed(1) }}</span>
        </div>
      </div>

      <!-- 加载 -->
      <div v-if="loadingDay" class="skeleton-list">
        <div class="skeleton-card">
          <div class="skeleton-line short"></div>
          <div class="skeleton-line medium"></div>
          <div class="skeleton-line"></div>
        </div>
        <div class="skeleton-card">
          <div class="skeleton-line short"></div>
          <div class="skeleton-line medium"></div>
          <div class="skeleton-line"></div>
        </div>
      </div>

      <!-- 事件列表 -->
      <div v-else-if="selectedEvents.length === 0" class="empty">
        <div class="empty-icon">📭</div>
        <div>{{ dateLabel(selectedDate) }} {{ dateShort(selectedDate) }} 无重大风险事件</div>
      </div>

      <div v-else class="event-list">
        <div v-for="event in selectedEvents" :key="event.event_key" class="event-card" :class="{ estimated: event.confidence === 'estimated' }">
          <div class="event-top">
            <span class="event-name">
              {{ event.display_name }}
              <span v-if="event.confidence === 'estimated'" class="confidence-badge" title="发布日期为推算，可能与实际不符">推算</span>
            </span>
            <span class="event-score" :class="scoreColor(event.score)">{{ event.score }}</span>
          </div>
          <div class="event-values">
            <div class="val">
              <span class="val-label">前值</span>
              <span class="val-num">{{ event.previous_value || '--' }}</span>
            </div>
            <div class="val">
              <span class="val-label">预测值</span>
              <span class="val-num">{{ event.forecast_value || '--' }}</span>
            </div>
            <div class="val">
              <span class="val-label">公布值</span>
              <span class="val-num">{{ event.actual_value || '--' }}</span>
            </div>
          </div>
          <div class="event-bottom">
            <span v-if="event.event_time" class="event-time">🕐 {{ event.event_time }}</span>
            <span v-if="event.market_impact?.length" class="event-impact">影响: {{ event.market_impact.join(' / ') }}</span>
            <span class="event-history-link" @click="activeTab = 'stats'">📊 历史</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================ -->
    <!-- Tab: 统计                                     -->
    <!-- ============================================ -->
    <div v-show="activeTab === 'stats'" class="tab-panel">
      <CalendarStatsView
        v-if="selectedCalendar"
        :calendarEffects="selectedCalendar"
        :date="selectedDate"
        @selectDate="handleCalendarDateSelect"
      />
      <div v-else class="empty">
        <div class="empty-icon">📊</div>
        <div>暂无历史统计数据</div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '../styles/theme' as *;
@use '../styles/mixins' as *;

.editorial-home {
  min-height: 100vh;
  padding: 0 $space-xl $space-2xl;
  background: $bg-page;
  color: $text-primary;
  font-family: $font-serif;
}

// === 报头 ===
.masthead {
  text-align: center;
  padding: $space-lg 0 0;
}

.mast-top {
  font-size: $text-xs + 1;
  color: $text-secondary;
  letter-spacing: 1px;
  margin-bottom: $space-sm;
  font-family: $font-sans;
}

.mast-sep {
  margin: 0 $space-sm;
  color: $border;
}

.mast-title {
  font-size: $text-2xl + 4;
  font-weight: $weight-black;
  color: $text-primary;
  letter-spacing: 4px;
  margin: 0;
  line-height: $leading-tight;
}

.mast-sub {
  font-size: $text-sm;
  color: $text-secondary;
  margin-top: $space-xs + 2;
  font-family: $font-sans;
  letter-spacing: 0.5px;
}

.mast-rule {
  margin-top: $space-md + 2;
  height: 3px;
  background: $border-heavy;
}

// === Tab 栏 ===
.tab-bar {
  display: flex;
  gap: 0;
  margin-bottom: 0;
  background: transparent;
  padding: 0;
  border-bottom: 2px solid $border-heavy;
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: $space-sm 0;
  font-family: $font-sans;
  font-size: $text-md;
  font-weight: $weight-semibold;
  color: $text-tertiary;
  cursor: pointer;
  border-radius: 0;
  transition: color $duration-fast $ease-out;
  position: relative;

  &.active {
    background: transparent;
    color: $text-primary;

    &::after {
      content: '';
      position: absolute;
      bottom: -2px;
      left: 0;
      right: 0;
      height: 2px;
      background: $text-primary;
    }
  }
}

.tab-badge {
  display: inline-block;
  background: $color-up;
  color: $text-inverse;
  font-size: $text-sm - 1;
  font-weight: $weight-bold;
  padding: 1px 6px;
  border-radius: $radius-sm;
  margin-left: $space-xs;
  vertical-align: middle;
}

.tab-panel {
  // min-height placeholder so tabs don't jump
}

// === 分割线 ===
.rule-thin {
  height: 1px;
  background: $border;
}

// === 头条 ===
.headline {
  text-align: center;
  padding: $space-xl 0 $space-xl - 4;
}

.hl-label {
  @include editorial-label;
  margin-bottom: $space-sm;
}

.hl-score-row {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: $space-xs;
  margin-bottom: $space-md;
}

.hl-score {
  font-size: $text-hero;
  font-weight: $weight-black;
  line-height: 1;
  letter-spacing: -2px;

  &.bullish { color: $color-up; }
  &.neutral { color: $color-neutral; }
  &.bearish { color: $color-down; }
}

.hl-unit {
  font-size: $text-xl;
  font-weight: $weight-normal;
  color: $text-secondary;
}

.hl-signal {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-md - 2;
  flex-wrap: wrap;
}

.hl-badge {
  display: inline-block;
  font-size: $text-md - 1;
  font-weight: $weight-bold;
  padding: 3px $space-md;
  border-radius: $radius-sm;
  letter-spacing: 2px;

  .bullish & { background: $color-up; color: $text-inverse; }
  .neutral & { background: $color-neutral; color: $text-inverse; }
  .bearish & { background: $color-down; color: $text-inverse; }
}

.hl-signal-desc {
  font-size: $text-md - 1;
  color: $text-secondary;
  font-family: $font-sans;
}

// === 双栏数据 ===
.data-columns {
  display: flex;
  align-items: stretch;
  padding: $space-xl - 4 0;
}

.data-col {
  flex: 1;
  text-align: center;
}

.col-head {
  @include editorial-label;
  margin-bottom: $space-sm;
}

.col-score {
  font-size: $text-3xl;
  font-weight: $weight-bold + 100;
  line-height: 1;
  margin-bottom: $space-md;

  &.bullish { color: $color-up; }
  &.neutral { color: $color-neutral; }
  &.bearish { color: $color-down; }
}

.col-divider {
  width: 1px;
  background: $border;
  margin: 0 $space-lg;
}

.col-meta {
  display: flex;
  justify-content: space-between;
  padding: $space-xs $space-md;
  font-size: $text-sm;
  font-family: $font-sans;
}

.meta-label {
  color: $text-secondary;
}

.meta-value {
  font-weight: $weight-semibold;
  color: $text-primary;
  @include tabular-nums;

  &.bullish { color: $color-up; }
  &.neutral { color: $color-neutral; }
  &.bearish { color: $color-down; }
}

// === 综合研判 ===
.editorial-advice {
  padding: $space-xl - 4 $space-sm;
}

.advice-label {
  @include editorial-label;
  margin-bottom: $space-sm;
}

.advice-body {
  font-size: 15px;
  line-height: $leading-article;
  color: $text-primary;
  margin: 0;
  text-indent: 2em;
}

// === 今日要事 ===
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

// === 日历表格 ===
.cal-table {
  padding: $space-xl - 4 0 0;
}

.cal-head {
  margin-bottom: $space-md;
}

.cal-title {
  @include editorial-title;
  font-size: $text-md;
}

.cal-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  padding-bottom: $space-xs + 2;
  border-bottom: 2px solid $border-heavy;
  margin-bottom: 2px;

  span {
    font-size: $text-xs + 1;
    font-weight: $weight-bold;
    color: $text-primary;
    font-family: $font-sans;
    letter-spacing: 1px;
  }
}

.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  background: $border;
  border: 1px solid $border;
}

.cal-cell {
  background: $bg-card;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: $space-xs + 2 2px;
  gap: 2px;

  &.empty { background: $bg-muted; }
  &.clickable { cursor: pointer; }
  &.clickable:active { opacity: 0.7; }
}

.cell-day {
  font-size: $text-sm;
  font-weight: $weight-bold;
  color: $text-primary;
  line-height: 1;
}

.cell-score {
  font-size: 9px;
  color: $text-secondary;
  @include tabular-nums;
  font-family: $font-sans;
  line-height: 1;
}

.is-today {
  background: $border-heavy !important;

  .cell-day { color: $text-inverse; }
  .cell-score { color: rgba(255, 255, 255, 0.7); }
}

.cal-footnote {
  font-size: $text-xs;
  color: $text-tertiary;
  margin-top: $space-sm;
  font-family: $font-sans;
  line-height: $leading-normal;
}

// === 底部 ===
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

// ============================================
// 事件 Tab 样式
// ============================================

.date-strip-wrapper {
  position: relative;
  margin-bottom: $space-sm;
  background: $bg-card;
  border-radius: 0;
  padding: $space-sm $space-xl;
  border-bottom: $rule-thin;
}

.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  font-size: $text-lg;
  color: $text-secondary;
  cursor: pointer;
  padding: $space-sm $space-xs;
  line-height: 1;
  z-index: 10;

  &:active { color: $text-primary; }
}

.nav-prev { left: $space-xs; }
.nav-next { right: $space-xs; }

.today-btn {
  position: absolute;
  top: -6px;
  right: $space-sm;
  background: $text-primary;
  color: $text-inverse;
  border: none;
  font-size: $text-sm;
  font-weight: $weight-medium;
  padding: 2px $space-sm;
  border-radius: $radius-sm;
  cursor: pointer;
  z-index: 10;

  &:active { opacity: 0.7; }
}

.date-strip {
  display: flex;
  justify-content: center;
  gap: 0;
}

.date-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: $space-xs $space-sm;
  border-radius: 0;
  cursor: pointer;
  min-width: 40px;
  position: relative;

  &:active { background: $bg-muted; }
  &.active { background: $text-primary; color: $text-inverse; }
}

.date-day {
  font-size: $text-sm;
  font-family: $font-sans;
  color: $text-tertiary;
  margin-bottom: 1px;
  white-space: nowrap;
  line-height: $leading-tight;

  .date-item.active & { color: rgba(255, 255, 255, 0.65); }
  .date-item.today & { color: $color-up; }
  .date-item.active.today & { color: rgba(232, 71, 76, 0.8); }
}

.date-num {
  font-size: $text-sm;
  font-weight: $weight-bold;
  color: $text-primary;
  line-height: $leading-tight;
  @include tabular-nums;

  .date-item.active & { color: $text-inverse; }
}

.date-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  margin-top: $space-xs;

  &.red { background: $color-up; }
  &.orange { background: $color-warn; }
  &.yellow { background: $color-neutral; }
}

// === 风险指数 ===
.risk-section {
  background: $bg-card;
  border-radius: 0;
  padding: $space-lg 0;
  margin-bottom: 0;
  border-bottom: $rule-thin;
}

.risk-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: $space-sm;
}

.risk-title {
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-secondary;
}

.risk-value {
  font-family: $font-serif;
  font-size: $text-xl;
  font-weight: $weight-bold;
  color: $text-primary;
  @include tabular-nums;

  &.red { color: $color-up; }
  &.orange { color: $color-warn; }
  &.yellow { color: $color-neutral; }
}

.risk-bar {
  height: 4px;
  background: $bg-muted;
  border-radius: 0;
  overflow: hidden;
}

.risk-fill {
  height: 100%;
  border-radius: 0;
  transition: width $duration-normal $ease-out;

  &.red { background: $color-up; }
  &.orange { background: $color-warn; }
  &.yellow { background: $color-neutral; }
}

// === 操作信号摘要 ===
.signal-summary {
  display: flex;
  align-items: center;
  gap: $space-md;
  background: $bg-card;
  border-radius: 0;
  padding: $space-md 0;
  margin-bottom: 0;
  border-bottom: $rule-thin;
}

.signal-item {
  flex: 1;
  display: flex;
  align-items: center;
  gap: $space-sm;
}

.signal-label {
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-tertiary;
  font-weight: $weight-medium;
}

.signal-badge {
  font-family: $font-sans;
  font-size: $text-sm;
  font-weight: $weight-semibold;
  padding: 2px $space-sm;
  border-radius: $radius-sm;

  &.signal-add { background: $color-up-light; color: $color-up-dark; }
  &.signal-hold { background: $color-neutral-light; color: $color-neutral; }
  &.signal-reduce { background: $color-down-light; color: $color-down-dark; }
}

.signal-rating {
  font-family: $font-serif;
  font-size: $text-md;
  font-weight: $weight-bold;
  color: $text-primary;
  @include tabular-nums;
}

.signal-divider {
  width: 1px;
  height: 20px;
  background: $border;
}

// === 事件卡片 ===
.event-list {
  display: flex;
  flex-direction: column;
}

.event-card {
  background: $bg-card;
  border-radius: 0;
  padding: $space-lg 0;
  border-bottom: $rule-thin;

  &:last-child { border-bottom: none; }
  &.estimated { opacity: 0.75; border-left: 3px solid $color-warn; padding-left: $space-md; }
}

.confidence-badge {
  display: inline-block;
  font-size: $text-sm - 1;
  font-weight: $weight-medium;
  color: $color-warn;
  background: $color-neutral-light;
  border: 1px solid rgba(184, 134, 11, 0.2);
  border-radius: $radius-sm;
  padding: 1px 6px;
  margin-left: $space-sm;
  vertical-align: middle;
  font-family: $font-sans;
}

.event-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: $space-md;
}

.event-name {
  font-family: $font-serif;
  font-size: $text-lg;
  font-weight: $weight-semibold;
  color: $text-primary;
}

.event-score {
  font-family: $font-serif;
  font-size: $text-lg;
  font-weight: $weight-bold;
  padding: 3px 12px;
  border-radius: $radius-sm;
  color: $text-inverse;
  min-width: 32px;
  text-align: center;
  @include tabular-nums;

  &.red { background: $color-up; }
  &.orange { background: $color-warn; }
  &.yellow { background: $color-neutral; color: $text-primary; }
  &.gray { background: $text-disabled; color: $text-secondary; }
}

.event-values {
  display: flex;
  gap: 0;
  margin-bottom: $space-md;
  border-top: $rule-thin;
  border-bottom: $rule-thin;
  padding: $space-sm 0;
}

.val {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $space-xs;
}

.val-label {
  font-size: $text-sm;
  color: $text-tertiary;
  font-family: $font-sans;
}

.val-num {
  font-size: $text-md;
  font-weight: $weight-semibold;
  color: $text-primary;
  @include tabular-nums;
}

.event-bottom {
  display: flex;
  gap: $space-lg;
  font-size: $text-sm;
  font-family: $font-sans;
  color: $text-tertiary;
  flex-wrap: wrap;
}

.event-time {
  font-weight: $weight-medium;
  color: $text-secondary;
}

.event-impact {
  flex: 1;
}

.event-history-link {
  margin-left: auto;
  color: $color-info;
  cursor: pointer;
  font-weight: $weight-medium;

  &:active { opacity: 0.6; }
}

// === Skeleton ===
.skeleton-list {
  display: flex;
  flex-direction: column;
}

.skeleton-card {
  background: $bg-card;
  border-radius: 0;
  padding: $space-lg 0;
  border-bottom: $rule-thin;
}

.skeleton-line {
  height: 14px;
  background: linear-gradient(90deg, $bg-muted 25%, $bg-hover 50%, $bg-muted 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 0;
  margin-bottom: $space-sm;

  &.short { width: 60%; }
  &.medium { width: 80%; }
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

// === 空状态 ===
.empty {
  text-align: center;
  padding: 60px 0;
  color: $text-disabled;
  font-family: $font-sans;
}

.empty-icon {
  font-size: 40px;
  margin-bottom: $space-md;
  opacity: 0.4;
}
</style>
