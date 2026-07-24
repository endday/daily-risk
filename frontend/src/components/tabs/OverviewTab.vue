<script setup lang="ts">
import type { CalendarEffects, MarketTemperatureResponse, RiskEvent } from '../../services/api'
import { signalClass, scoreColor } from '../../utils/display'
import DecisionPanel from '../DecisionPanel.vue'
import MarketPulse from '../MarketPulse.vue'
import AlmanacCard from '../AlmanacCard.vue'
import ConfidenceSummary from '../ConfidenceSummary.vue'

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
  today: string
  topEvents: RiskEvent[]
}>()

const emit = defineEmits<{
  showEvents: []
}>()
</script>

<template>
  <div class="tab-panel">
    <section class="headline">
      <div class="hl-label">今日研判</div>
      <div class="hl-signal" :class="signalClass(shortRating)">
        <span class="hl-badge">{{ shortLabel }}</span>
      </div>
      <p class="hl-desc">{{ shortDesc }}</p>
    </section>

    <div class="rule-thin"></div>

    <ConfidenceSummary
      :nextDayProb="calendar?.next_trading_day?.up_probability ?? null"
      :nextDaySampleCount="calendar?.next_trading_day?.sample_count ?? null"
      :swingProb="calendar?.this_month?.up_probability ?? null"
      :swingSampleCount="calendar?.next_trading_day?.sample_count ?? null"
      :shortRating="shortRating"
    />

    <div class="rule-thin"></div>

    <DecisionPanel
      :dailyCalendar="dailyCalendar"
      :calendar="calendar"
      :events="selectedDayEvents"
      :today="today"
      :selectedDate="selectedDate"
      :marketTemperature="temperature"
    />

    <div class="rule-thin"></div>

    <MarketPulse
      v-if="temperature"
      :derived="temperature.derived"
      :latest="temperature.latest"
    />

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

    <div v-if="topEvents.length > 0" class="rule-thin"></div>

    <AlmanacCard
      v-if="calendar?.almanac_by_index"
      :almanacByIndex="calendar.almanac_by_index"
      :nextMonthName="nextMonthName"
      :nextDayShort="nextDayShort"
    />

    <footer class="editorial-footer">
      <div class="footer-rule"></div>
      <span>历史统计不代表未来表现 · 仅供参考，不构成投资建议</span>
    </footer>
  </div>
</template>

<style lang="scss" scoped>
@use '../../styles/theme' as *;
@use '../../styles/mixins' as *;

.headline {
  text-align: center;
  padding: $space-xl 0 $space-lg-xl;
}

.hl-label {
  @include editorial-label;
  margin-bottom: $space-sm;
}

.hl-signal {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: $space-sm;
}

.hl-badge {
  display: inline-block;
  font-size: $text-lg;
  font-weight: $weight-bold;
  padding: $space-xs $space-xl;
  border-radius: $radius-sm;
  letter-spacing: 3px;

  .bullish & { background: $color-up; color: $text-inverse; }
  .neutral & { background: $color-neutral; color: $text-inverse; }
  .bearish & { background: $color-down; color: $text-inverse; }
}

.hl-desc {
  font-family: $font-serif;
  font-size: $text-md;
  line-height: $leading-relaxed;
  color: $text-secondary;
  text-align: center;
  margin: 0;
}

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
