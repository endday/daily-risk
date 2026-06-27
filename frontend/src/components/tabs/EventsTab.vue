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
