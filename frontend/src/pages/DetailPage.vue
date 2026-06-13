<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
import CalendarStatsView from '../components/CalendarStatsView.vue'
import type { CalendarEffects, RiskEvent } from '../services/api'
import { fetchEventsByDate } from '../services/api'
import { getToday } from '../../../shared/date-utils'

// Tab 切换
const activeTab = ref<'events' | 'stats'>('events')

// 日期缓存：date -> events
const dateEventsMap = ref<Record<string, RiskEvent[]>>({})
const dateRiskMap = ref<Record<string, number>>({})
const dateCalendarMap = ref<Record<string, CalendarEffects | null>>({})

// 选中日期
const selectedDate = ref('')

// 日期条：固定显示一周 7 天，左右箭头切换周
// 基准日 = 当前显示周的周一
const baseMonday = ref('')

// 加载状态
const loadingDay = ref(false)


// 获取某天的周一（蔡勒公式）
function getMonday(anyDate: string): string {
  const [yStr, mStr, dStr] = anyDate.split('-')
  let y = parseInt(yStr), m = parseInt(mStr), d = parseInt(dStr)
  if (m < 3) { m += 12; y -= 1 }
  const K = y % 100, J = Math.floor(y / 100)
  const h = (d + Math.floor(13 * (m + 1) / 5) + K + Math.floor(K / 4) + Math.floor(J / 4) - 2 * J) % 7
  const dayOfWeek = ((h + 6) % 7) // 0=Sun, 1=Mon
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  d += diff
  const dim = [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  while (d < 1) { m--; if (m < 1) { m = 12; y-- } d += dim[m - 1] || 30 }
  while (d > (dim[m - 1] || 30)) { d -= dim[m - 1] || 30; m++; if (m > 12) { m = 1; y++ } }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// 从基准日偏移 N 天得到日期
function offsetDate(monday: string, offset: number): string {
  const [y, m, d] = monday.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + offset))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

// 获取日期标签
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

// 生成日期条列表：固定周一到周日 7 天
const dateStrip = computed(() => {
  const labels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  const items: { date: string; label: string; short: string; isToday: boolean }[] = []
  for (let i = 0; i < 7; i++) {
    const date = offsetDate(baseMonday.value, i)
    items.push({
      date,
      label: labels[i],
      short: dateShort(date),
      isToday: date === getToday(),
    })
  }
  return items
})

// 切换周
function changeWeek(offset: number) {
  const [y, m, d] = baseMonday.value.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + offset * 7))
  baseMonday.value = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
  // 不再预加载，选中时再加载
}

// 回到今天
function goToday() {
  const today = getToday()
  baseMonday.value = getMonday(today)
  selectDate(today)
}

// 选中日期的事件
const selectedEvents = computed(() => {
  return dateEventsMap.value[selectedDate.value] || []
})

const selectedRisk = computed(() => {
  return dateRiskMap.value[selectedDate.value] || 0
})

// 切换月份时保留上次数据，避免组件卸载导致页面跳动
const lastCalendar = ref<CalendarEffects | null>(null)

const selectedCalendar = computed(() => {
  return dateCalendarMap.value[selectedDate.value] ?? lastCalendar.value
})


// 加载某天的数据
async function fetchDateEvents(date: string) {
  if (dateEventsMap.value[date] !== undefined) return // 已缓存
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

// 选中某天
async function selectDate(date: string) {
  selectedDate.value = date
  loadingDay.value = true
  await fetchDateEvents(date)
  loadingDay.value = false
}

// 处理日历点击选择日期
async function handleCalendarDateSelect(date: string) {
  await selectDate(date)
}

// 风险评分颜色
function scoreColor(score: number): string {
  if (score >= 9) return 'red'
  if (score >= 7) return 'orange'
  if (score >= 5) return 'yellow'
  return 'gray'
}

// 初始化 — 从路由参数或今天开始
async function initDate(dateStr?: string) {
  const target = dateStr || getToday()
  baseMonday.value = getMonday(target)
  selectedDate.value = target
  await fetchDateEvents(target)
  if (dateCalendarMap.value[target]) {
    lastCalendar.value = dateCalendarMap.value[target]
  }
}

onMounted(() => {
  const dateParam = route.params.date as string | undefined
  initDate(dateParam)
})

// 路由参数变化时切换日期
watch(() => route.params.date, (newDate) => {
  if (newDate) initDate(newDate as string)
})
</script>

<template>
  <div class="page">
    <!-- 顶部导航 -->
    <div class="nav-bar">
      <button class="back-btn" @click="router.push('/')">← 首页</button>
      <span class="nav-title">明日风险榜</span>
      <span class="nav-spacer"></span>
    </div>

    <!-- 日期条 + 左右箭头 -->
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
      <button v-if="selectedDate !== getToday()" class="today-btn" @click="goToday">今天</button>
    </div>

    <!-- Tab 栏 -->
    <div class="tab-bar">
      <div
        class="tab-item"
        :class="{ active: activeTab === 'events' }"
        @click="activeTab = 'events'"
      >
        事件
        <span v-if="selectedEvents.length > 0" class="tab-badge">{{ selectedEvents.length }}</span>
      </div>
      <div
        class="tab-item"
        :class="{ active: activeTab === 'stats' }"
        @click="activeTab = 'stats'"
      >
        历史统计
      </div>
    </div>

    <!-- 事件 Tab -->
    <div v-show="activeTab === 'events'">
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

    <!-- 统计 Tab -->
    <div v-show="activeTab === 'stats'">
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

.page {
  max-width: 600px;
  margin: 0 auto;
  padding: 0 $space-lg $space-lg;
  min-height: 100vh;
  background: $bg-page;
}

// === 顶部导航 ===
.nav-bar {
  display: flex;
  align-items: center;
  padding: $space-md 0;
  border-bottom: $rule-heavy;
  margin-bottom: $space-md;
}

.back-btn {
  background: none;
  border: none;
  font-family: $font-sans;
  font-size: $text-sm;
  font-weight: $weight-semibold;
  color: $text-secondary;
  cursor: pointer;
  padding: $space-xs $space-sm;

  &:active { color: $text-primary; }
}

.nav-title {
  flex: 1;
  text-align: center;
  font-family: $font-serif;
  font-size: $text-md;
  font-weight: $weight-bold;
  color: $text-primary;
  letter-spacing: 2px;
}

.nav-spacer {
  width: 60px; // balance the back button
}

.header {
  text-align: center;
  margin-bottom: $space-md;
}

.title {
  font-family: $font-serif;
  font-size: $text-xl;
  font-weight: $weight-bold;
  margin: 0;
  color: $text-primary;
  letter-spacing: 2px;
}

// === 日期条 ===
.date-strip-wrapper {
  position: relative;
  margin-bottom: $space-sm;
  background: $bg-card;
  border-radius: 0;
  padding: $space-sm $space-xl;
  border-bottom: $rule-thin;
}

// === Tab 栏（报纸风：底部横线式）===
.tab-bar {
  display: flex;
  gap: 0;
  margin-bottom: $space-lg;
  background: $bg-card;
  border-radius: 0;
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

// === 事件卡片（报纸列表式）===
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

.loading {
  text-align: center;
  padding: 48px 0;
  color: $text-tertiary;
  font-family: $font-sans;
}
</style>
