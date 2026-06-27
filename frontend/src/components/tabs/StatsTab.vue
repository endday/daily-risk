<script setup lang="ts">
import CalendarStatsView from '../CalendarStatsView.vue'
import type { CalendarEffects } from '../../services/api'
import type { HolidayEntry } from '../../../../shared/types'

defineProps<{
  holidays: Record<string, HolidayEntry>
  selectedCalendar: CalendarEffects | null
  selectedDate: string
}>()

const emit = defineEmits<{
  selectDate: [date: string]
}>()
</script>

<template>
  <div class="tab-panel">
    <CalendarStatsView
      v-if="selectedCalendar"
      :calendarEffects="selectedCalendar"
      :date="selectedDate"
      :holidays="holidays"
      @selectDate="emit('selectDate', $event)"
    />
    <div v-else class="empty">
      <div class="empty-icon">📊</div>
      <div>暂无历史统计数据</div>
    </div>
  </div>
</template>
