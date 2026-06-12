<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CalendarDayStat } from '../services/api'

const props = defineProps<{
  dailyCalendar: CalendarDayStat[]
  todayDay: number
  month: number
  year: number
}>()

const emit = defineEmits<{
  (e: 'selectDay', dateStr: string): void
}>()

// 当前显示的日期（用于 Vant Calendar 定位）
const currentDate = ref(new Date(props.year, props.month - 1, props.todayDay))

// 当 props 变化时同步
watch(() => [props.year, props.month, props.todayDay], () => {
  currentDate.value = new Date(props.year, props.month - 1, props.todayDay)
})

// 将 dailyCalendar 转为按日期索引的 Map
const ratingMap = computed(() => {
  const map = new Map<number, CalendarDayStat>()
  for (const stat of props.dailyCalendar) {
    map.set(stat.day, stat)
  }
  return map
})

// 日期格式化函数 — 为每个日期格子添加评分数据
function dayFormatter(day: any) {
  const dayNum = day.date.getDate()
  const dayOfWeek = day.date.getDay() // 0=Sunday, 6=Saturday
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
  const month = day.date.getMonth() + 1
  const year = day.date.getFullYear()
  const isDataMonth = month === props.month && year === props.year

  // 周末标记为 disabled（不可点击，灰色背景）
  if (isWeekend) {
    day.type = 'disabled'
    day.className = (day.className || '') + ' is-weekend'
    return day
  }

  // 非当前数据月份的日期不显示评分
  if (!isDataMonth) {
    return day
  }

  const stat = ratingMap.value.get(dayNum)

  if (stat) {
    const rating = stat.rating ?? 5
    let heatClass = 'heat-3'
    if (rating >= 8) heatClass = 'heat-5'
    else if (rating >= 6) heatClass = 'heat-4'
    else if (rating >= 4) heatClass = 'heat-3'
    else if (rating >= 2) heatClass = 'heat-2'
    else heatClass = 'heat-1'

    day.className = (day.className || '') + ' ' + heatClass
    day.bottomInfo = rating.toFixed(1)
  }

  // 标记今天
  if (dayNum === props.todayDay) {
    day.className = (day.className || '') + ' is-today'
    day.topInfo = '今'
  }

  return day
}

// 日期选择处理
function onSelect(date: Date) {
  const day = date.getDate()
  const month = date.getMonth() + 1
  const year = date.getFullYear()

  // 只处理有评分数据的工作日
  const stat = ratingMap.value.get(day)
  if (stat && month === props.month) {
    const m = String(month).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    emit('selectDay', `${year}-${m}-${d}`)
  }
}

// 只展示当前月份（通过 min/max-date 限制为单月范围）
const minDate = computed(() => new Date(props.year, props.month - 1, 1)) // 当月1号
const maxDate = computed(() => new Date(props.year, props.month, 0)) // 当月最后一天

function formatRating(rating: number | undefined): string {
  if (rating === undefined) return ''
  return rating.toFixed(1)
}
</script>

<template>
  <div class="calendar-wrapper">
    <van-calendar
      type="single"
      :poppable="false"
      :show-confirm="false"
      :show-title="false"
      :show-subtitle="false"
      :first-day-of-week="1"
      :min-date="minDate"
      :max-date="maxDate"
      :default-date="currentDate"
      :formatter="dayFormatter"
      color="var(--color-warn)"
      :row-height="50"
      @select="onSelect"
    />

    <div class="grid-legend">
      <span class="legend-heatmap">评分图：</span>
      <span class="legend-item heatmap-strong-up">●强利好</span>
      <span class="legend-item heatmap-weak-up">●弱利好</span>
      <span class="legend-item heatmap-neutral">●中性</span>
      <span class="legend-item heatmap-weak-down">●弱利空</span>
      <span class="legend-item heatmap-strong-down">●强利空</span>
    </div>
    <div class="grid-note">评分基于近20年历史涨跌概率，不代表未来表现</div>
  </div>
</template>

<style>
/* Vant 4 Calendar 全局覆盖 */
.calendar-wrapper .van-calendar {
  background: transparent;
  border-radius: 0;
  box-shadow: none;
  width: 100%;
  min-width: 0;
}

.van-calendar__month-title {
  display: none;
}

.calendar-wrapper .van-calendar__header {
  box-shadow: none;
  padding: var(--space-sm) 0;
}

.calendar-wrapper .van-calendar__title {
  font-size: var(--text-md);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
}

.calendar-wrapper .van-calendar__subtitle {
  font-size: var(--text-md);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  height: auto;
  padding: var(--space-xs) 0;
}

.calendar-wrapper .van-calendar__weekdays {
  padding: 0;
}

.calendar-wrapper .van-calendar__weekday {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  height: 32px;
}

.calendar-wrapper .van-calendar__body {
  min-height: auto;
  overflow: visible;
  padding: 0;
}

.calendar-wrapper .van-calendar__month {
  padding: 0;
}

.calendar-wrapper .van-calendar__days {
}

.calendar-wrapper .van-calendar__day {
  border-radius: var(--radius-sm);
  background-clip: padding-box;
}

/* 选中状态覆盖 */
.calendar-wrapper .van-calendar__day--selected {
  background: transparent !important;
  border-radius: var(--radius-sm);
  color: var(--text-primary);
}

/* 热力图背景色 — 加大不透明度让色块更明显 */
.calendar-wrapper .van-calendar__day.heat-5 {
  background: rgba(232, 71, 76, 0.30) !important;
}
.calendar-wrapper .van-calendar__day.heat-4 {
  background: rgba(232, 71, 76, 0.18) !important;
}
.calendar-wrapper .van-calendar__day.heat-3 {
  background: rgba(156, 163, 175, 0.12) !important;
}
.calendar-wrapper .van-calendar__day.heat-2 {
  background: rgba(46, 175, 125, 0.18) !important;
}
.calendar-wrapper .van-calendar__day.heat-1 {
  background: rgba(46, 175, 125, 0.30) !important;
}

/* 今日标记 */
.calendar-wrapper .van-calendar__day.is-today {
  border: 1.5px solid var(--color-warn);
}

/* 日期数字 */
.calendar-wrapper .van-calendar__day-text {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

/* 选中状态下的日期数字 */
.calendar-wrapper .van-calendar__day--selected .van-calendar__day-text {
  color: var(--text-primary);
}

/* 评分数字 (bottomInfo) */
.calendar-wrapper .van-calendar__day-bottom-info {
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  position: static;
  margin-top: 2px;
}

/* 选中状态下的评分 */
.calendar-wrapper .van-calendar__day--selected .van-calendar__day-bottom-info {
  color: var(--text-primary);
}

/* 今日顶部文字 */
.calendar-wrapper .van-calendar__day-top-info {
  font-size: var(--text-sm);
  color: var(--color-warn);
  font-weight: var(--font-semibold);
  line-height: 1;
  position: static;
  margin-bottom: 2px;
}

/* 周末灰色 */
.calendar-wrapper .van-calendar__day--disabled {
  background: var(--bg-muted) !important;
  color: var(--text-disabled);
}

.calendar-wrapper .van-calendar__day--disabled .van-calendar__day-text {
  color: var(--text-disabled);
}
</style>

<style scoped>
.calendar-wrapper {
  padding: var(--space-sm) 0;
}

.grid-legend {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--space-sm);
  margin-top: var(--space-sm);
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  flex-wrap: wrap;
}

.legend-heatmap {
  color: var(--text-secondary);
  font-weight: var(--font-medium);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 2px;
}

.legend-item.heatmap-strong-up { color: var(--color-up-dark); }
.legend-item.heatmap-weak-up { color: var(--color-up); }
.legend-item.heatmap-neutral { color: var(--color-neutral); }
.legend-item.heatmap-weak-down { color: var(--color-down); }
.legend-item.heatmap-strong-down { color: var(--color-down-dark); }

.grid-note {
  text-align: center;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  margin-top: var(--space-sm);
  line-height: var(--leading-normal);
}
</style>
