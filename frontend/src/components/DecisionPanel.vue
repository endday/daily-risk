<script setup lang="ts">
import { ref, computed } from 'vue'
import type { CalendarDayStat, CalendarEffects, RiskEvent } from '../services/api'
import { recommend, type Intent, type DateRange, type Recommendation } from '../utils/decision'
import { formatScore, signalClass } from '../utils/display'

const props = defineProps<{
  dailyCalendar: CalendarDayStat[]
  calendar: CalendarEffects | null
  events: RiskEvent[]
  today: string
  selectedDate: string
}>()

const emit = defineEmits<{
  activate: [active: boolean]
}>()

// ============================================
// 状态
// ============================================

const activeIntent = ref<Intent | null>(null)
const dateRange = ref<DateRange>('month')

// ============================================
// 推荐结果
// ============================================

const recommendation = computed<Recommendation | null>(() => {
  if (!activeIntent.value || !props.dailyCalendar) return null
  return recommend(
    activeIntent.value,
    dateRange.value,
    props.dailyCalendar,
    props.selectedDate,
  )
})

// ============================================
// 交互
// ============================================

function setIntent(intent: Intent) {
  if (activeIntent.value === intent) {
    // 再次点击已激活的按钮 → 关闭
    closeDecision()
    return
  }
  activeIntent.value = intent
  emit('activate', true)
}

function closeDecision() {
  activeIntent.value = null
  emit('activate', false)
}

function setRange(range: DateRange) {
  dateRange.value = range
}

// ============================================
// 显示辅助
// ============================================

const rangeLabels: Record<DateRange, string> = {
  '3d': '3天内',
  '7d': '7天内',
  'month': '本月',
}

const intentLabel = computed(() =>
  activeIntent.value === 'buy' ? '买入' : '卖出'
)

const recRatingClass = computed(() => {
  if (!recommendation.value) return ''
  return signalClass(recommendation.value.rating)
})
</script>

<template>
  <!-- 默认态：两个按钮 -->
  <div v-if="!activeIntent" class="decision-entry">
    <button class="decision-btn buy-btn" @click="setIntent('buy')">
      <span class="btn-icon">↑</span>
      <span class="btn-text">我想买</span>
    </button>
    <button class="decision-btn sell-btn" @click="setIntent('sell')">
      <span class="btn-icon">↓</span>
      <span class="btn-text">我想卖</span>
    </button>
  </div>

  <!-- 激活态：推荐视图 -->
  <div v-else class="decision-active">
    <!-- 顶部控制栏 -->
    <div class="decision-header">
      <div class="intent-switcher">
        <button
          class="intent-btn"
          :class="{ active: activeIntent === 'buy', 'buy-active': activeIntent === 'buy' }"
          @click="setIntent('buy')"
        >我想买</button>
        <button
          class="intent-btn"
          :class="{ active: activeIntent === 'sell', 'sell-active': activeIntent === 'sell' }"
          @click="setIntent('sell')"
        >我想卖</button>
      </div>
      <button class="close-btn" @click="closeDecision">返回概览</button>
    </div>

    <!-- 时间范围 chips -->
    <div class="range-chips">
      <button
        v-for="(label, key) in rangeLabels"
        :key="key"
        class="range-chip"
        :class="{ active: dateRange === key }"
        @click="setRange(key as DateRange)"
      >{{ label }}</button>
    </div>

    <!-- 推荐结果 -->
    <div v-if="recommendation" class="rec-result">
      <!-- 推荐日期 -->
      <div class="rec-date-row">
        <span class="rec-label">推荐{{ intentLabel }}日期</span>
      </div>
      <div class="rec-date">
        <span class="rec-day">{{ recommendation.dayLabel }}</span>
      </div>

      <!-- 评分 + 概率 -->
      <div class="rec-stats">
        <div class="rec-stat">
          <span class="stat-label">评分</span>
          <span class="stat-value" :class="recRatingClass">{{ formatScore(recommendation.rating) }}</span>
        </div>
        <div class="rec-stat">
          <span class="stat-label">上涨概率</span>
          <span class="stat-value" :class="recRatingClass">{{ Math.round(recommendation.upProbability * 100) }}%</span>
        </div>
      </div>

      <div class="rec-divider"></div>

      <!-- 支持论据 -->
      <div class="rec-reasons">
        <div class="reasons-title">{{ intentLabel }}理由</div>
        <ul class="reasons-list">
          <li v-for="(reason, i) in recommendation.reasons" :key="i" class="reason-item">
            {{ reason }}
          </li>
        </ul>
      </div>

      <!-- 反面提醒 -->
      <div v-if="recommendation.caveats.length" class="rec-caveats">
        <div class="caveats-title">但你可能想知道</div>
        <ul class="caveats-list">
          <li v-for="(caveat, i) in recommendation.caveats" :key="i" class="caveat-item">
            {{ caveat }}
          </li>
        </ul>
      </div>
    </div>

    <!-- 无数据 -->
    <div v-else class="rec-empty">
      当前范围内暂无有效交易日数据
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '../styles/theme' as *;
@use '../styles/mixins' as *;

// === 默认态：两个按钮 ===
.decision-entry {
  display: flex;
  gap: $space-md;
  padding: $space-lg 0;
}

.decision-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-xs;
  height: 36px;
  border: 1px solid $border-heavy;
  border-radius: $radius-sm;
  background: transparent;
  font-family: $font-sans;
  font-size: $text-sm;
  font-weight: $weight-semibold;
  color: $text-primary;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all $duration-fast $ease-out;

  &:active {
    transform: scale(0.97);
  }
}

.btn-icon {
  font-size: $text-sm;
  line-height: 1;
  font-weight: $weight-bold;
}

.buy-btn {
  color: $color-up-dark;
  border-color: $color-up;
  background: $color-up-light;

  .btn-icon { color: $color-up; }

  &:active {
    background: $color-up;
    color: $text-inverse;
  }
}

.sell-btn {
  color: $color-down-dark;
  border-color: $color-down;
  background: $color-down-light;

  .btn-icon { color: $color-down; }

  &:active {
    background: $color-down;
    color: $text-inverse;
  }
}

// === 激活态 ===
.decision-active {
  padding: $space-lg 0;
}

.decision-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: $space-lg;
}

.intent-switcher {
  display: flex;
  gap: $space-sm;
}

.intent-btn {
  padding: $space-xs $space-md;
  border: 1px solid $border;
  border-radius: $radius-sm;
  background: transparent;
  font-family: $font-sans;
  font-size: $text-sm;
  font-weight: $weight-medium;
  color: $text-tertiary;
  cursor: pointer;
  transition: all $duration-fast $ease-out;

  &.active.buy-active {
    background: $color-up;
    border-color: $color-up;
    color: $text-inverse;
  }

  &.active.sell-active {
    background: $color-down;
    border-color: $color-down;
    color: $text-inverse;
  }
}

.close-btn {
  background: none;
  border: none;
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-tertiary;
  cursor: pointer;
  padding: $space-xs $space-sm;

  &:active {
    color: $text-primary;
  }
}

// === 时间范围 chips ===
.range-chips {
  display: flex;
  gap: $space-sm;
  margin-bottom: $space-xl;
}

.range-chip {
  padding: $space-xs $space-md;
  border: 1px solid $border;
  border-radius: $radius-sm;
  background: transparent;
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-secondary;
  cursor: pointer;
  transition: all $duration-fast $ease-out;

  &.active {
    background: $text-primary;
    border-color: $text-primary;
    color: $text-inverse;
  }
}

// === 推荐结果 ===
.rec-result {
  @include anim-rise;
}

.rec-date-row {
  margin-bottom: $space-sm;
}

.rec-label {
  @include editorial-label;
}

.rec-date {
  margin-bottom: $space-lg;
}

.rec-day {
  font-family: $font-serif;
  font-size: $text-2xl;
  font-weight: $weight-bold;
  color: $text-primary;
  letter-spacing: 1px;
}

.rec-stats {
  display: flex;
  gap: $space-2xl;
  margin-bottom: $space-lg;
}

.rec-stat {
  display: flex;
  flex-direction: column;
  gap: $space-xs;
}

.stat-label {
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-secondary;
}

.stat-value {
  font-family: $font-serif;
  font-size: $text-xl;
  font-weight: $weight-bold;
  @include tabular-nums;

  &.bullish { color: $color-up; }
  &.neutral { color: $color-neutral; }
  &.bearish { color: $color-down; }
}

.rec-divider {
  height: 1px;
  background: $border;
  margin-bottom: $space-lg;
}

// === 论据 ===
.rec-reasons {
  margin-bottom: $space-lg;
}

.reasons-title {
  font-family: $font-sans;
  font-size: $text-sm;
  font-weight: $weight-semibold;
  color: $text-secondary;
  letter-spacing: 2px;
  margin-bottom: $space-md;
}

.reasons-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.reason-item {
  font-family: $font-sans;
  font-size: $text-md;
  color: $text-primary;
  line-height: $leading-relaxed;
  padding: $space-xs 0;
  padding-left: $space-lg;
  position: relative;

  &::before {
    content: '·';
    position: absolute;
    left: $space-sm;
    color: $text-tertiary;
    font-weight: $weight-bold;
  }
}

// === 反面提醒 ===
.rec-caveats {
  border-top: $rule-thin;
  padding-top: $space-md;
}

.caveats-title {
  font-family: $font-sans;
  font-size: $text-sm;
  font-weight: $weight-medium;
  color: $text-tertiary;
  margin-bottom: $space-sm;
}

.caveats-list {
  list-style: none;
  padding: 0;
  margin: 0;
  padding-top: $space-sm;
}

.caveat-item {
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-tertiary;
  line-height: $leading-relaxed;
  padding: $space-xs 0;
  padding-left: $space-lg;
  position: relative;

  &::before {
    content: '⚠';
    position: absolute;
    left: 0;
    font-size: $text-xs;
    opacity: 0.5;
  }
}

// === 空状态 ===
.rec-empty {
  text-align: center;
  padding: $space-2xl 0;
  color: $text-disabled;
  font-family: $font-sans;
  font-size: $text-md;
}
</style>
