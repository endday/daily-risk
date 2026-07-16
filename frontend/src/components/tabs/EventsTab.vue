<script setup lang="ts">
import type { RiskEvent } from '../../services/api'
import { computeDelta, scoreColor } from '../../utils/display'
import { dateLabel, dateShort } from '../../../../shared/date-utils'

defineProps<{
  loadingDay: boolean
  selectedDate: string
  selectedEvents: RiskEvent[]
  selectedRisk: number
}>()

const emit = defineEmits<{
  showStats: []
}>()
</script>

<template>
  <div class="tab-panel">
    <div v-if="selectedEvents.length > 0" class="risk-section">
      <div class="risk-header">
        <span class="risk-title">{{ dateLabel(selectedDate) }} {{ dateShort(selectedDate) }} 风险指数</span>
        <span class="risk-value" :class="scoreColor(selectedRisk)">{{ selectedRisk.toFixed(1) }} / 10</span>
      </div>
      <div class="risk-bar">
        <div class="risk-fill" :class="scoreColor(selectedRisk)" :style="{ width: selectedRisk * 10 + '%' }"></div>
      </div>
    </div>

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
            <span
              v-if="computeDelta(event.previous_value, event.actual_value)"
              class="val-delta"
              :class="computeDelta(event.previous_value, event.actual_value)?.class"
            >
              {{ computeDelta(event.previous_value, event.actual_value)?.text }}
            </span>
          </div>
        </div>
        <div class="event-bottom">
          <span v-if="event.event_time" class="event-time">🕐 {{ event.event_time }}</span>
          <span v-if="event.market_impact?.length" class="event-impact">影响: {{ event.market_impact.join(' / ') }}</span>
          <span class="event-history-link" @click="emit('showStats')">📊 历史</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '../../styles/theme' as *;
@use '../../styles/mixins' as *;

.risk-section {
  @include editorial-card;
  margin-bottom: 0;
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
  @include progress-track;
}

.risk-fill {
  @include progress-fill;

  &.red { background: $color-up; }
  &.orange { background: $color-warn; }
  &.yellow { background: $color-neutral; }
}

.event-list {
  display: flex;
  flex-direction: column;
}

.event-card {
  @include editorial-card;

  &:last-child { border-bottom: none; }

  &.estimated {
    opacity: 0.75;
    border-left: 3px solid $color-warn;
    padding-left: $space-md;
  }
}

.confidence-badge {
  display: inline-block;
  font-size: $text-sm - 1;
  font-weight: $weight-medium;
  color: $color-warn;
  background: $color-neutral-light;
  border: 1px solid rgba($color-neutral, 0.2);
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
  gap: $space-md;
  margin-bottom: $space-md;
}

.event-name {
  min-width: 0;
  font-family: $font-serif;
  font-size: $text-lg;
  font-weight: $weight-semibold;
  color: $text-primary;
}

.event-score {
  flex: 0 0 auto;
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
  min-width: 0;
}

.val-label {
  font-size: $text-sm;
  color: $text-tertiary;
  font-family: $font-sans;
}

.val-num {
  max-width: 100%;
  overflow-wrap: anywhere;
  font-size: $text-md;
  font-weight: $weight-semibold;
  color: $text-primary;
  @include tabular-nums;
}

.val-delta {
  display: block;
  font-size: $text-xs;
  font-weight: $weight-medium;
  margin-top: 1px;
  @include tabular-nums;

  &.delta-up { color: $color-up; }
  &.delta-down { color: $color-down; }
  &.delta-flat { color: $text-tertiary; }
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
  flex: 1 1 180px;
  min-width: 0;
}

.event-history-link {
  margin-left: auto;
  color: $color-info;
  cursor: pointer;
  font-weight: $weight-medium;

  &:active { opacity: 0.6; }
}

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

@media (max-width: 520px) {
  .event-top {
    align-items: flex-start;
  }

  .event-name {
    font-size: $text-md;
    line-height: $leading-normal;
  }

  .event-score {
    font-size: $text-md;
    padding-inline: 9px;
  }

  .event-bottom {
    gap: $space-sm $space-md;
  }

  .event-history-link {
    margin-left: 0;
  }
}
</style>
