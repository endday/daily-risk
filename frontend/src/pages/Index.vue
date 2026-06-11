<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import CalendarStatsView from '../components/CalendarStatsView.vue'
import type { CalendarEffects, RiskEvent } from '../services/api'
import { fetchEventsByDate } from '../services/api'

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

// 获取今天
function getToday(): string {
  const now = new Date()
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  return `${beijing.getUTCFullYear()}-${String(beijing.getUTCMonth() + 1).padStart(2, '0')}-${String(beijing.getUTCDate()).padStart(2, '0')}`
}

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
  // 预加载新一周的数据
  const dates: string[] = []
  for (let i = 0; i < 7; i++) dates.push(offsetDate(baseMonday.value, i))
  Promise.all(dates.map(d => fetchDateEvents(d)))
}

// 选中日期的事件
const selectedEvents = computed(() => {
  return dateEventsMap.value[selectedDate.value] || []
})

const selectedRisk = computed(() => {
  return dateRiskMap.value[selectedDate.value] || 0
})

const selectedCalendar = computed(() => {
  return dateCalendarMap.value[selectedDate.value] || null
})


// 加载某天的数据
async function fetchDateEvents(date: string) {
  if (dateEventsMap.value[date] !== undefined) return // 已缓存
  try {
    const data = await fetchEventsByDate(date)
    dateEventsMap.value[date] = data.events || []
    dateRiskMap.value[date] = data.risk_index || 0
    dateCalendarMap.value[date] = data.calendar_effects || null
  } catch (e) {
    console.error(`Failed to fetch ${date}:`, e)
    dateEventsMap.value[date] = []
    dateRiskMap.value[date] = 0
    dateCalendarMap.value[date] = null
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

// 预加载前后各一周（方便快速切换）
async function preloadAdjacentWeeks() {
  const dates: string[] = []
  for (let w = -1; w <= 1; w++) {
    for (let i = 0; i < 7; i++) {
      const [y, m, d] = baseMonday.value.split('-').map(Number)
      const dt = new Date(Date.UTC(y, m - 1, d + w * 7 + i))
      dates.push(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`)
    }
  }
  await Promise.all(dates.map(d => fetchDateEvents(d)))
}

// 颜色
function scoreColor(score: number): string {
  if (score >= 9) return 'red'
  if (score >= 7) return 'orange'
  if (score >= 5) return 'yellow'
  return 'gray'
}

// 初始化
onMounted(async () => {
  const today = getToday()
  baseMonday.value = getMonday(today)
  selectedDate.value = today
  // 预加载前后各一周
  await preloadAdjacentWeeks()
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
  padding: 16px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #f5f5f5;
  min-height: 100vh;
}

.header {
  text-align: center;
  margin-bottom: 12px;
}

.title {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
  color: #1a1a1a;
}

/* 日期条 */
.date-strip-wrapper {
  position: relative;
  margin-bottom: 8px;
  background: #fff;
  border-radius: 12px;
  padding: 8px 24px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

/* Tab 栏 */
.tab-bar {
  display: flex;
  gap: 0;
  margin-bottom: 16px;
  background: #fff;
  border-radius: 10px;
  padding: 4px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: 8px 0;
  font-size: 14px;
  font-weight: 500;
  color: #888;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s;
  position: relative;
}

.tab-item.active {
  background: #1a1a2e;
  color: #fff;
}

.tab-badge {
  display: inline-block;
  background: #ff4d4f;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 8px;
  margin-left: 4px;
  vertical-align: middle;
}

.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  font-size: 16px;
  color: #666;
  cursor: pointer;
  padding: 8px 6px;
  line-height: 1;
  z-index: 10;
}

.nav-btn:active {
  color: #333;
}

.nav-prev {
  left: 4px;
}

.nav-next {
  right: 4px;
}

.nav-btn:active {
  background: #f0f0f0;
  color: #333;
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
  padding: 4px 6px;
  border-radius: 8px;
  cursor: pointer;
  min-width: 40px;
  position: relative;
  transition: all 0.2s;
}

.date-item:active {
  background: #f0f0f0;
}

.date-item.active {
  background: #1a1a2e;
  color: #fff;
}

.date-day {
  font-size: 9px;
  color: #999;
  margin-bottom: 1px;
  white-space: nowrap;
  line-height: 1.2;
}

.date-item.active .date-day {
  color: rgba(255,255,255,0.7);
}

.date-item.today .date-day {
  color: #ff6b6b;
}

.date-item.active.today .date-day {
  color: #ff8a8a;
}

.date-num {
  font-size: 12px;
  font-weight: 700;
  color: #333;
  line-height: 1.2;
}

.date-item.active .date-num {
  color: #fff;
}

.date-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-top: 4px;
}

.date-dot.red { background: #ff4d4f; }
.date-dot.orange { background: #fa8c16; }
.date-dot.yellow { background: #fadb14; }

/* 风险指数 */
.risk-section {
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.risk-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.risk-title {
  font-size: 13px;
  color: #888;
}

.risk-value {
  font-size: 20px;
  font-weight: 700;
  color: #1a1a1a;
}

.risk-value.red { color: #ff4d4f; }
.risk-value.orange { color: #fa8c16; }
.risk-value.yellow { color: #d4a800; }

.risk-bar {
  height: 6px;
  background: #e8e8e8;
  border-radius: 3px;
  overflow: hidden;
}

.risk-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s;
}

.risk-fill.red { background: #ff4d4f; }
.risk-fill.orange { background: #fa8c16; }
.risk-fill.yellow { background: #fadb14; }

/* 事件卡片 */
.event-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.event-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.event-card.estimated {
  opacity: 0.75;
  border-left: 3px solid #faad14;
}

.confidence-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 500;
  color: #faad14;
  background: #fffbe6;
  border: 1px solid #ffe58f;
  border-radius: 4px;
  padding: 1px 5px;
  margin-left: 6px;
  vertical-align: middle;
}

.event-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.event-name {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
}

.event-score {
  font-size: 18px;
  font-weight: 700;
  padding: 3px 12px;
  border-radius: 14px;
  color: #fff;
  min-width: 32px;
  text-align: center;
}

.event-score.red { background: #ff4d4f; }
.event-score.orange { background: #fa8c16; }
.event-score.yellow { background: #fadb14; color: #333; }
.event-score.gray { background: #d9d9d9; color: #666; }

.event-values {
  display: flex;
  gap: 0;
  margin-bottom: 12px;
  border-top: 1px solid #f0f0f0;
  border-bottom: 1px solid #f0f0f0;
  padding: 10px 0;
}

.val {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.val-label {
  font-size: 11px;
  color: #bbb;
}

.val-num {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
}

.event-bottom {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #999;
  flex-wrap: wrap;
}

.event-time {
  font-weight: 500;
  color: #666;
}

/* 空状态 */
.empty {
  text-align: center;
  padding: 60px 0;
  color: #ccc;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.loading {
  text-align: center;
  padding: 48px 0;
  color: #999;
}
</style>
