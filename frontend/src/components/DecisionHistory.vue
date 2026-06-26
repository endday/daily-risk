<script setup lang="ts">
import { ref, computed } from 'vue'
import type { DecisionReviewItem } from '../utils/decision-journal'
import { getDecisionStats } from '../utils/decision-journal'

const INDEX_NAMES: Record<string, string> = {
  '000001': '上证指数',
  '000300': '沪深300',
  '000905': '中证500',
  '399006': '创业板指',
}

const props = defineProps<{
  decisions: DecisionReviewItem[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'clear'): void
}>()

const showConfirmClear = ref(false)

const stats = computed(() => getDecisionStats(props.decisions))

function intentText(intent: string): string {
  return intent === 'buy' ? '买入' : '卖出'
}

function daysText(days: number): string {
  if (days >= 5) return `${days}天前`
  if (days >= 3) return '3天前'
  if (days >= 1) return `${days}天前`
  return '今天'
}

function returnClass(r: number): string {
  if (r > 0.5) return 'positive'
  if (r < -0.5) return 'negative'
  return 'neutral'
}

function indexName(code: string): string {
  return INDEX_NAMES[code] ?? code
}

function handleClear() {
  if (showConfirmClear.value) {
    emit('clear')
    showConfirmClear.value = false
  } else {
    showConfirmClear.value = true
    setTimeout(() => { showConfirmClear.value = false }, 3000)
  }
}
</script>

<template>
  <div class="history-overlay" @click.self="emit('close')">
    <div class="history-modal">
      <!-- 头部 -->
      <div class="history-header">
        <span class="history-title">操作回看</span>
        <button class="history-close" @click="emit('close')">×</button>
      </div>

      <!-- 统计摘要 -->
      <div class="history-stats" v-if="stats.total > 0">
        <div class="stat-item">
          <span class="stat-num">{{ stats.total }}</span>
          <span class="stat-label">次决策</span>
        </div>
        <div class="stat-item">
          <span class="stat-num">{{ stats.wins }}</span>
          <span class="stat-label">次盈利</span>
        </div>
        <div class="stat-item">
          <span class="stat-num">{{ stats.winRate.toFixed(0) }}%</span>
          <span class="stat-label">胜率</span>
        </div>
      </div>

      <!-- 列表 -->
      <div class="history-list" v-if="decisions.length > 0">
        <div
          v-for="item in decisions"
          :key="item.id"
          class="history-item"
          :class="returnClass(item.returnPct)"
        >
          <div class="item-top">
            <span class="item-intent" :class="item.intent">{{ intentText(item.intent) }}</span>
            <span class="item-index">{{ indexName(item.indexCode) }}</span>
            <span class="item-when">{{ daysText(item.daysPassed) }}</span>
          </div>
          <div class="item-middle">
            <span class="item-price">{{ item.closePrice.toFixed(2) }}</span>
            <span class="item-arrow">→</span>
            <span class="item-price">{{ item.currentPrice.toFixed(2) }}</span>
            <span class="item-return" :class="returnClass(item.returnPct)">
              {{ item.returnPct >= 0 ? '+' : '' }}{{ item.returnPct.toFixed(2) }}%
            </span>
          </div>
          <div class="item-bottom">{{ item.returnText }}</div>
        </div>
      </div>

      <div v-else class="history-empty">
        <div class="empty-icon">📝</div>
        <div>暂无决策记录</div>
        <div class="empty-hint">点击"我想买/我想卖"开始记录</div>
      </div>

      <!-- 底部操作 -->
      <div class="history-footer" v-if="decisions.length > 0">
        <button
          class="clear-btn"
          :class="{ 'confirm-mode': showConfirmClear }"
          @click="handleClear"
        >
          {{ showConfirmClear ? '确认清空？' : '清空记录' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '../styles/theme' as *;
@use '../styles/mixins' as *;

.history-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.history-modal {
  background: $bg-page;
  width: 100%;
  max-width: 480px;
  max-height: 80vh;
  border-radius: $radius-md $radius-md 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $space-lg $space-xl;
  border-bottom: $rule-heavy;
}

.history-title {
  font-family: $font-serif;
  font-size: $text-lg;
  font-weight: $weight-bold;
  letter-spacing: 2px;
}

.history-close {
  background: none;
  border: none;
  font-size: $text-xl;
  color: $text-tertiary;
  cursor: pointer;
  padding: 0 $space-xs;
  line-height: 1;

  &:active { color: $text-primary; }
}

// === 统计摘要 ===
.history-stats {
  display: flex;
  border-bottom: $rule-thin;
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: $space-md 0;
}

.stat-num {
  font-family: $font-serif;
  font-size: $text-xl;
  font-weight: $weight-bold;
  @include tabular-nums;
}

.stat-label {
  font-family: $font-sans;
  font-size: $text-xs;
  color: $text-tertiary;
}

// === 列表 ===
.history-list {
  overflow-y: auto;
  flex: 1;
}

.history-item {
  padding: $space-md $space-xl;
  border-bottom: $rule-thin;

  &.positive { border-left: 3px solid $color-up; }
  &.negative { border-left: 3px solid $color-down; }
  &.neutral { border-left: 3px solid $border; }
}

.item-top {
  display: flex;
  align-items: center;
  gap: $space-sm;
  margin-bottom: $space-xs;
}

.item-intent {
  font-family: $font-sans;
  font-size: $text-sm;
  font-weight: $weight-semibold;
  padding: 1px 6px;
  border-radius: $radius-sm;

  &.buy { background: $color-up-light; color: $color-up-dark; }
  &.sell { background: $color-down-light; color: $color-down-dark; }
}

.item-index {
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-secondary;
  flex: 1;
}

.item-when {
  font-family: $font-sans;
  font-size: $text-xs;
  color: $text-tertiary;
}

.item-middle {
  display: flex;
  align-items: center;
  gap: $space-sm;
  margin-bottom: $space-xs;
  font-family: $font-serif;
}

.item-price {
  font-size: $text-md;
  font-weight: $weight-medium;
  @include tabular-nums;
}

.item-arrow {
  color: $text-tertiary;
  font-size: $text-sm;
}

.item-return {
  margin-left: auto;
  font-size: $text-md;
  font-weight: $weight-bold;
  @include tabular-nums;

  &.positive { color: $color-up; }
  &.negative { color: $color-down; }
  &.neutral { color: $text-secondary; }
}

.item-bottom {
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-tertiary;
}

// === 空状态 ===
.history-empty {
  text-align: center;
  padding: 60px 0;
  color: $text-disabled;
  font-family: $font-sans;
}

.empty-icon {
  font-size: 36px;
  margin-bottom: $space-md;
  opacity: 0.4;
}

.empty-hint {
  font-size: $text-sm;
  margin-top: $space-xs;
}

// === 底部操作 ===
.history-footer {
  padding: $space-md $space-xl;
  border-top: $rule-thin;
  text-align: center;
}

.clear-btn {
  background: none;
  border: 1px solid $border;
  border-radius: $radius-sm;
  font-family: $font-sans;
  font-size: $text-sm;
  color: $text-tertiary;
  padding: $space-xs $space-lg;
  cursor: pointer;

  &.confirm-mode {
    border-color: $color-down;
    color: $color-down;
  }

  &:active { opacity: 0.7; }
}
</style>
