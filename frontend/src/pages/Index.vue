<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
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

// 初始化 — 只加载今天的数据
onMounted(async () => {
  const today = getToday()
  baseMonday.value = getMonday(today)
  selectedDate.value = today
  await fetchDateEvents(today)
  if (dateCalendarMap.value[today]) {
    lastCalendar.value = dateCalendarMap.value[today]
  }
})
</script>

<template>
  <div class="page">
    <!-- 标题 -->
    <div class="header">
      <h1 class="title">明日风险榜</h1>
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

      <!-- 加载 -->
      <div v-if="loadingDay" class="loading">加载中...</div>

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

<style scoped>
.page {
  max-width: 600px;
  margin: 0 auto;
  padding: var(--space-lg);
  min-height: 100vh;
}

.header {
  text-align: center;
  margin-bottom: var(--space-md);
}

.title {
  font-size: var(--text-xl);
  font-weight: var(--font-bold);
  margin: 0;
  color: var(--text-primary);
}

/* 日期条 */
.date-strip-wrapper {
  position: relative;
  margin-bottom: var(--space-sm);
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: var(--space-sm) var(--space-xl);
  box-shadow: var(--shadow-md);
}

/* Tab 栏 */
.tab-bar {
  display: flex;
  gap: 0;
  margin-bottom: var(--space-lg);
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: var(--space-xs);
  box-shadow: var(--shadow-md);
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: var(--space-sm) 0;
  font-size: var(--text-md);
  font-weight: var(--font-medium);
  color: var(--text-tertiary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--duration-fast) var(--ease-out);
  position: relative;
}

.tab-item.active {
  background: var(--text-primary);
  color: #fff;
}

.tab-badge {
  display: inline-block;
  background: var(--color-up);
  color: #fff;
  font-size: var(--text-sm);
  font-weight: var(--font-bold);
  padding: 1px 6px;
  border-radius: var(--radius-full);
  margin-left: var(--space-xs);
  vertical-align: middle;
}

.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  font-size: var(--text-lg);
  color: var(--text-secondary);
  cursor: pointer;
  padding: var(--space-sm) var(--space-xs);
  line-height: 1;
  z-index: 10;
  transition: color var(--duration-fast) var(--ease-out);
}

.nav-btn:active {
  color: var(--text-primary);
  background: var(--bg-muted);
}

.nav-prev { left: var(--space-xs); }
.nav-next { right: var(--space-xs); }

.date-strip {
  display: flex;
  justify-content: center;
  gap: 0;
}

.date-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  cursor: pointer;
  min-width: 40px;
  position: relative;
  transition: all var(--duration-fast) var(--ease-out);
}

.date-item:active {
  background: var(--bg-muted);
  transform: scale(0.95);
}

.date-item.active {
  background: var(--text-primary);
  color: #fff;
}

.date-day {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  margin-bottom: 1px;
  white-space: nowrap;
  line-height: var(--leading-tight);
}

.date-item.active .date-day { color: rgba(255,255,255,0.65); }
.date-item.today .date-day { color: var(--color-up); }
.date-item.active.today .date-day { color: rgba(232, 71, 76, 0.8); }

.date-num {
  font-size: var(--text-sm);
  font-weight: var(--font-bold);
  color: var(--text-primary);
  line-height: var(--leading-tight);
  font-variant-numeric: tabular-nums;
}

.date-item.active .date-num { color: #fff; }

.date-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  margin-top: var(--space-xs);
}

.date-dot.red { background: var(--color-up); }
.date-dot.orange { background: var(--color-warn); }
.date-dot.yellow { background: #E8C847; }

/* 风险指数 */
.risk-section {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  margin-bottom: var(--space-lg);
  box-shadow: var(--shadow-md);
}

.risk-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-sm);
}

.risk-title {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.risk-value {
  font-size: var(--text-xl);
  font-weight: var(--font-bold);
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.risk-value.red { color: var(--color-up); }
.risk-value.orange { color: var(--color-warn); }
.risk-value.yellow { color: #C4980A; }

.risk-bar {
  height: 5px;
  background: var(--bg-muted);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.risk-fill {
  height: 100%;
  border-radius: var(--radius-sm);
  transition: width var(--duration-normal) var(--ease-out);
}

.risk-fill.red { background: var(--color-up); }
.risk-fill.orange { background: var(--color-warn); }
.risk-fill.yellow { background: #E8C847; }

/* 事件卡片 */
.event-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.event-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  box-shadow: var(--shadow-md);
}

.event-card.estimated {
  opacity: 0.8;
  border-left: 3px solid var(--color-warn);
}

.confidence-badge {
  display: inline-block;
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--color-warn);
  background: var(--color-warn-light);
  border: 1px solid rgba(245, 166, 35, 0.3);
  border-radius: var(--radius-sm);
  padding: 1px 6px;
  margin-left: var(--space-sm);
  vertical-align: middle;
}

.event-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md);
}

.event-name {
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
}

.event-score {
  font-size: var(--text-lg);
  font-weight: var(--font-bold);
  padding: 3px 12px;
  border-radius: var(--radius-full);
  color: #fff;
  min-width: 32px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.event-score.red { background: var(--color-up); }
.event-score.orange { background: var(--color-warn); }
.event-score.yellow { background: #E8C847; color: var(--text-primary); }
.event-score.gray { background: var(--color-neutral-light); color: var(--text-secondary); }

.event-values {
  display: flex;
  gap: 0;
  margin-bottom: var(--space-md);
  border-top: 1px solid var(--border-light);
  border-bottom: 1px solid var(--border-light);
  padding: var(--space-sm) 0;
}

.val {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
}

.val-label {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

.val-num {
  font-size: var(--text-md);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.event-bottom {
  display: flex;
  gap: var(--space-lg);
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  flex-wrap: wrap;
}

.event-time {
  font-weight: var(--font-medium);
  color: var(--text-secondary);
}

/* 空状态 */
.empty {
  text-align: center;
  padding: 60px 0;
  color: var(--text-disabled);
}

.empty-icon {
  font-size: 40px;
  margin-bottom: var(--space-md);
  opacity: 0.4;
}

.loading {
  text-align: center;
  padding: 48px 0;
  color: var(--text-tertiary);
}
</style>
