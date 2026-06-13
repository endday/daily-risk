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

// 选中日期的详情
const selectedDayStat = ref<CalendarDayStat | null>(null)

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
    selectedDayStat.value = stat
    const m = String(month).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    emit('selectDay', `${year}-${m}-${d}`)
  }
}

// 只展示当前月份（通过 min/max-date 限制为单月范围）
const minDate = computed(() => new Date(props.year, props.month - 1, 1)) // 当月1号
const maxDate = computed(() => new Date(props.year, props.month, 0)) // 当月最后一天

function formatPct(prob: number): string {
  return `${Math.round(prob * 100)}%`
}

function formatChange(pct: number): string {
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

function changeClass(pct: number): string {
  if (pct > 0) return 'change-up'
  if (pct < 0) return 'change-down'
  return ''
}

function ratingClass(rating: number | undefined): string {
  if (rating === undefined) return ''
  if (rating >= 8) return 'rating-excellent'
  if (rating >= 6) return 'rating-good'
  if (rating >= 4) return 'rating-neutral'
  if (rating >= 2) return 'rating-poor'
  return 'rating-terrible'
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
      color="#1A1A1A"
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

    <!-- 选中日期详情 -->
    <div class="day-detail" v-if="selectedDayStat">
      <div class="day-detail-header">
        <span class="day-detail-title">每月{{ selectedDayStat.day }}日 · 历史统计</span>
        <span class="day-detail-rating" :class="ratingClass(selectedDayStat.rating)">{{ selectedDayStat.rating?.toFixed(1) }}分</span>
      </div>
      <div class="day-detail-stats">
        <span>上涨概率 <strong>{{ formatPct(selectedDayStat.up_probability) }}</strong></span>
        <span>平均涨跌 <strong :class="changeClass(selectedDayStat.avg_change_pct)">{{ formatChange(selectedDayStat.avg_change_pct) }}</strong></span>
        <span class="day-detail-sample">样本 n={{ selectedDayStat.sample_count }}</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
@use '../styles/theme' as *;
@use '../styles/mixins' as *;

// Vant 4 Calendar 全局覆盖（报纸风）
.calendar-wrapper .van-calendar {
  background: transparent;
  border-radius: 0;
  box-shadow: none;
  width: 100%;
  min-width: 0;
}

.van-calendar__month-title { display: none; }

.calendar-wrapper .van-calendar__header {
  box-shadow: none;
  padding: $space-sm 0;
}

.calendar-wrapper .van-calendar__title {
  font-family: $font-serif;
  font-size: $text-md;
  font-weight: $weight-bold;
  color: $text-primary;
}

.calendar-wrapper .van-calendar__subtitle {
  font-family: $font-sans;
  font-size: $text-md;
  font-weight: $weight-semibold;
  color: $text-primary;
  height: auto;
  padding: $space-xs 0;
}

.calendar-wrapper .van-calendar__weekdays { padding: 0; }

.calendar-wrapper .van-calendar__weekday {
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-tertiary;
  height: 32px;
}

.calendar-wrapper .van-calendar__body {
  min-height: auto;
  overflow: visible;
  padding: 0;
}

.calendar-wrapper .van-calendar__month { padding: 0; }

.calendar-wrapper .van-calendar__day {
  border-radius: 0;
  background-clip: padding-box;
}

.calendar-wrapper .van-calendar__day--selected {
  background: transparent !important;
  border-radius: 0;
  color: $text-primary;
}

// 热力图背景色
.calendar-wrapper .van-calendar__day.heat-5 { background: rgba(232, 71, 76, 0.25) !important; }
.calendar-wrapper .van-calendar__day.heat-4 { background: rgba(232, 71, 76, 0.12) !important; }
.calendar-wrapper .van-calendar__day.heat-3 { background: rgba(156, 163, 175, 0.08) !important; }
.calendar-wrapper .van-calendar__day.heat-2 { background: rgba(46, 175, 125, 0.12) !important; }
.calendar-wrapper .van-calendar__day.heat-1 { background: rgba(46, 175, 125, 0.25) !important; }

// 今日标记：黑底白字反色
.calendar-wrapper .van-calendar__day.is-today {
  background: $border-heavy !important;
  border: none;
}

.calendar-wrapper .van-calendar__day-text {
  font-size: $text-sm;
  color: $text-secondary;
  @include tabular-nums;
  line-height: 1;
}

.calendar-wrapper .van-calendar__day--selected .van-calendar__day-text {
  color: $text-primary;
}

.calendar-wrapper .van-calendar__day.is-today .van-calendar__day-text {
  color: $text-inverse;
}

.calendar-wrapper .van-calendar__day-bottom-info {
  font-family: $font-sans;
  font-size: $text-sm - 1;
  font-weight: $weight-semibold;
  color: $text-primary;
  opacity: 0.7;
  @include tabular-nums;
  line-height: 1;
  position: static;
  margin-top: 2px;
}

.calendar-wrapper .van-calendar__day--selected .van-calendar__day-bottom-info {
  color: $text-primary;
}

.calendar-wrapper .van-calendar__day.is-today .van-calendar__day-bottom-info {
  color: rgba(255, 255, 255, 0.8);
}

.calendar-wrapper .van-calendar__day-top-info {
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-primary;
  font-weight: $weight-bold;
  line-height: 1;
  position: static;
  margin-bottom: 2px;
}

.calendar-wrapper .van-calendar__day.is-today .van-calendar__day-top-info {
  color: rgba(255, 255, 255, 0.9);
}

.calendar-wrapper .van-calendar__day--disabled {
  background: $bg-muted !important;
  color: $text-disabled;
}

.calendar-wrapper .van-calendar__day--disabled .van-calendar__day-text {
  color: $text-disabled;
}
</style>

<style lang="scss" scoped>
@use '../styles/theme' as *;
@use '../styles/mixins' as *;

.calendar-wrapper {
  padding: $space-sm 0;
}

.grid-legend {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: $space-sm;
  margin-top: $space-sm;
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-tertiary;
  flex-wrap: wrap;
}

.legend-heatmap {
  color: $text-secondary;
  font-weight: $weight-medium;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 2px;

  &.heatmap-strong-up { color: $color-up-dark; }
  &.heatmap-weak-up { color: $color-up; }
  &.heatmap-neutral { color: $text-tertiary; }
  &.heatmap-weak-down { color: $color-down; }
  &.heatmap-strong-down { color: $color-down-dark; }
}

.grid-note {
  text-align: center;
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-tertiary;
  margin-top: $space-sm;
  line-height: $leading-normal;
}

// === 选中日期详情 ===
.day-detail {
  margin-top: $space-md;
  padding: $space-sm 0;
  border-top: $rule-thin;
}

.day-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: $space-xs;
}

.day-detail-title {
  font-family: $font-sans;
  font-size: $text-sm;
  font-weight: $weight-semibold;
  color: $text-primary;
}

.day-detail-rating {
  font-family: $font-serif;
  font-size: $text-md;
  font-weight: $weight-bold;
  @include tabular-nums;

  &.rating-excellent { color: $color-up-dark; }
  &.rating-good { color: $color-up; }
  &.rating-neutral { color: $text-secondary; }
  &.rating-poor { color: $color-down; }
  &.rating-terrible { color: $color-down-dark; }
}

.day-detail-stats {
  display: flex;
  gap: $space-md;
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-secondary;
  flex-wrap: wrap;

  strong {
    font-weight: $weight-semibold;
    @include tabular-nums;
  }
}

.change-up { color: $color-up; }
.change-down { color: $color-down; }

.day-detail-sample {
  color: $text-tertiary;
}
</style>
