<script setup lang="ts">
import type { CalendarEffects, MarketRiskResponse, MarketTemperatureResponse, RiskEvent } from '../../services/api'
import { scoreColor } from '../../utils/display'
import MarketTemperaturePanel from '../MarketTemperaturePanel.vue'
import TodayHotspotsPanel from '../TodayHotspotsPanel.vue'

defineProps<{
  calendar: CalendarEffects | null
  dailyCalendar: CalendarEffects['daily_calendar']
  nextDayShort: string
  nextMonthName: string
  selectedDate: string
  selectedDayEvents: RiskEvent[]
  shortDesc: string
  shortLabel: string
  shortRating: number | null
  temperature: MarketTemperatureResponse | null
  marketRisk: MarketRiskResponse | null
  today: string
  topEvents: RiskEvent[]
}>()

const emit = defineEmits<{
  showEvents: []
}>()
</script>

<template>
  <div class="tab-panel">
    <MarketTemperaturePanel
      v-if="marketRisk"
      :risk="marketRisk"
    />

    <div v-if="marketRisk" class="rule-thin"></div>

    <TodayHotspotsPanel />

    <div class="rule-thin"></div>

    <section v-if="topEvents.length > 0" class="today-events">
      <div class="section-label">今日要事</div>
      <div v-for="evt in topEvents" :key="evt.event_key" class="event-brief">
        <span class="event-brief-name">{{ evt.display_name }}</span>
        <span class="event-brief-score" :class="scoreColor(evt.score)">{{ evt.score }}</span>
        <span v-if="evt.event_time" class="event-brief-time">{{ evt.event_time }}</span>
      </div>
      <div v-if="selectedDayEvents.length > 2" class="event-more" @click="emit('showEvents')">
        查看全部 {{ selectedDayEvents.length }} 个事件 →
      </div>
    </section>

    <footer class="editorial-footer">
      <div class="footer-rule"></div>
      <span>历史统计不代表未来表现 · 仅供参考，不构成投资建议</span>
    </footer>
  </div>
</template>

<style lang="scss" scoped>
@use '../../styles/theme' as *;
@use '../../styles/mixins' as *;

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

.rule-thin {
  height: 1px;
  background: $border;
}
</style>
