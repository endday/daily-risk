<script setup lang="ts">
import { computed } from 'vue'
import type { CalendarDayStat } from '../services/api'

const props = defineProps<{
  dailyCalendar: CalendarDayStat[]
  todayDay: number
  month: number
  year: number
}>()

const emit = defineEmits<{
  (e: 'selectDay', day: number): void
}>()

interface GridCell {
  day: number
  stat: CalendarDayStat | null
  isWeekend: boolean
}

// 构建日历网格数据
const calendarGrid = computed(() => {
  const daysInMonth = new Date(props.year, props.month, 0).getDate()
  const firstDayWeekday = new Date(props.year, props.month - 1, 1).getDay()
  const startOffset = (firstDayWeekday + 6) % 7

  const weeks: (GridCell | null)[][] = []
  let currentWeek: (GridCell | null)[] = []

  // 填充月初空白
  for (let i = 0; i < startOffset; i++) {
    currentWeek.push(null)
  }

  // 填充每天数据
  for (let day = 1; day <= daysInMonth; day++) {
    const dayOfWeek = (startOffset + day - 1) % 7
    const isWeekend = dayOfWeek >= 5

    const stat = props.dailyCalendar.find(d => d.day === day) || null
    currentWeek.push({ day, stat, isWeekend })

    if (currentWeek.length === 7) {
      weeks.push(currentWeek)
      currentWeek = []
    }
  }

  // 填充月末空白
  while (currentWeek.length > 0 && currentWeek.length < 7) {
    currentWeek.push(null)
  }
  if (currentWeek.length > 0) {
    weeks.push(currentWeek)
  }

  return weeks
})

// 热力图背景色（基于评分 0-10）
function heatmapBg(rating: number | undefined): string {
  if (rating === undefined) return 'transparent'
  if (rating >= 9) return 'rgba(196, 30, 58, 0.8)'   // 深红 - 极强利好
  if (rating >= 8) return 'rgba(231, 76, 60, 0.7)'   // 红色 - 强利好
  if (rating >= 7) return 'rgba(248, 118, 100, 0.6)' // 浅红 - 利好
  if (rating >= 6) return 'rgba(255, 179, 179, 0.5)' // 淡红 - 弱利好
  if (rating >= 4) return 'rgba(240, 240, 240, 0.5)' // 灰色 - 中性
  if (rating >= 3) return 'rgba(184, 230, 184, 0.5)' // 淡绿 - 弱利空
  if (rating >= 2) return 'rgba(125, 205, 125, 0.6)' // 浅绿 - 利空
  return 'rgba(39, 174, 96, 0.7)'                    // 绿色 - 强利空
}

function formatRating(rating: number | undefined): string {
  if (rating === undefined) return ''
  return rating.toFixed(1)
}
</script>

<template>
  <div class="calendar-grid">
    <div class="grid-header">
      <span v-for="label in ['一', '二', '三', '四', '五', '六', '日']" :key="label" class="header-cell">
        {{ label }}
      </span>
    </div>

    <div v-for="(week, wi) in calendarGrid" :key="wi" class="grid-row">
      <div
        v-for="(cell, ci) in week"
        :key="ci"
        class="grid-cell"
        :class="{
          'cell-empty': !cell,
          'cell-weekend': cell?.isWeekend,
          'cell-today': cell && cell.day === todayDay && !cell.isWeekend,
          'cell-clickable': cell && !cell.isWeekend && cell.stat,
        }"
        :style="cell && !cell.isWeekend && cell.stat ? { backgroundColor: heatmapBg(cell.stat.rating) } : {}"
        @click="cell && !cell.isWeekend && cell.stat ? emit('selectDay', cell.day) : null"
      >
        <template v-if="cell">
          <span class="cell-day">{{ cell.day }}</span>
          <span v-if="!cell.isWeekend && cell.stat" class="cell-rating">
            {{ formatRating(cell.stat.rating) }}
          </span>
          <span v-else-if="cell.isWeekend" class="cell-rest">休</span>
          <span v-else class="cell-empty-mark">--</span>
        </template>
      </div>
    </div>

    <div class="grid-legend">
      <span class="legend-heatmap">评分图：</span>
      <span class="legend-item heatmap-strong-up">●强利好</span>
      <span class="legend-item heatmap-weak-up">●弱利好</span>
      <span class="legend-item heatmap-neutral">●中性</span>
      <span class="legend-item heatmap-weak-down">●弱利空</span>
      <span class="legend-item heatmap-strong-down">●强利空</span>
    </div>
  </div>
</template>

<style scoped>
.calendar-grid {
  padding: 8px 0;
}

.grid-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  margin-bottom: 4px;
}

.header-cell {
  text-align: center;
  font-size: 10px;
  color: #999;
  padding: 2px 0;
}

.grid-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  margin-bottom: 2px;
}

.grid-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4px 2px;
  border-radius: 4px;
  min-height: 32px;
  transition: background 0.2s;
}

.cell-empty {
  opacity: 0.3;
}

.cell-weekend {
  background: #f8f8f8;
}

.cell-clickable {
  cursor: pointer;
  transition: transform 0.1s, box-shadow 0.1s;
}

.cell-clickable:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.cell-clickable:active {
  transform: scale(0.95);
}

.cell-today {
  background: #fff3e0 !important;
  border: 1.5px solid #ff9800;
}

.cell-day {
  font-size: 10px;
  color: #666;
  line-height: 1;
}

.cell-weekend .cell-day {
  color: #bbb;
}

.cell-prob {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
}

.cell-rating {
  font-size: 9px;
  font-weight: 600;
  line-height: 1.2;
  color: #333;
  opacity: 0.8;
}

.cell-rest {
  font-size: 9px;
  color: #ccc;
}

.cell-empty-mark {
  font-size: 9px;
  color: #ccc;
}

.color-up .cell-prob { color: #e74c3c; }
.color-up .cell-day { color: #e74c3c; }
.color-down .cell-prob { color: #27ae60; }
.color-down .cell-day { color: #27ae60; }
.color-neutral .cell-prob { color: #95a5a6; }

.grid-legend {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 9px;
  color: #999;
  flex-wrap: wrap;
}

.legend-heatmap {
  color: #666;
  font-weight: 500;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 2px;
}

.legend-item.heatmap-strong-up { color: #c41e3a; }
.legend-item.heatmap-weak-up { color: #e74c3c; }
.legend-item.heatmap-neutral { color: #95a5a6; }
.legend-item.heatmap-weak-down { color: #27ae60; }
.legend-item.heatmap-strong-down { color: #1a7a42; }
</style>
