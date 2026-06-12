<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Almanac, AlmanacByIndex } from '../services/api'

const props = defineProps<{
  almanacByIndex?: AlmanacByIndex
  nextMonthName: string
  nextDayShort: string
}>()

const indexCodes = ['000001', '000300', '000905'] as const
const activeIndex = ref<string>('000001')

// 当前选中指数的黄历数据
const currentData = computed(() => {
  if (props.almanacByIndex) {
    return props.almanacByIndex[activeIndex.value as keyof AlmanacByIndex] ?? null
  }
  return null
})

const currentAlmanac = computed<Almanac | null>(() => {
  return currentData.value?.almanac ?? null
})

const indexName = computed(() => {
  return currentData.value?.name ?? ''
})

function formatPct(prob: number): string {
  return `${Math.round(prob * 100)}%`
}

function probColor(prob: number): string {
  if (prob > 0.55) return '#E8474C'
  if (prob < 0.45) return '#2EAF7D'
  return '#8C8C8C'
}

function scenarioLabel(currentProb: number, nextProb: number): string {
  const delta = nextProb - currentProb
  if (currentProb < 0.48 && delta > 0.05) return '逢低入场'
  if (currentProb > 0.52 && delta < -0.05) return '冲高回落'
  if (currentProb > 0.52 && nextProb > 0.52) return '多头延续'
  if (currentProb < 0.48 && nextProb < 0.48) return '空头延续'
  return '方向不明'
}

function scenarioColor(currentProb: number, nextProb: number): string {
  const label = scenarioLabel(currentProb, nextProb)
  if (label === '逢低入场' || label === '多头延续') return '#E8474C'
  if (label === '冲高回落' || label === '空头延续') return '#2EAF7D'
  return '#8C8C8C'
}

function signalColor(action: string): string {
  if (action === 'add') return 'signal-add'
  if (action === 'reduce') return 'signal-reduce'
  return 'signal-hold'
}

function scoreClass(score: number): string {
  if (score >= 6) return 'score-add'
  if (score >= 4) return 'score-hold'
  return 'score-reduce'
}

</script>

<template>
  <div class="almanac-card">
    <div class="almanac-header">
      <span class="almanac-icon">📅</span>
      <div class="almanac-title-group">
        <span class="almanac-title">黄历</span>
        <span class="almanac-subtitle">近20年历史统计</span>
      </div>
    </div>

    <!-- 指数 Tab 切换 -->
    <div class="index-tabs">
      <div
        v-for="code in indexCodes"
        :key="code"
        class="index-tab"
        :class="{ active: activeIndex === code }"
        @click="activeIndex = code"
      >
        {{ almanacByIndex?.[code]?.name ?? code }}
      </div>
    </div>

    <template v-if="currentData && currentAlmanac">
      <!-- 短线 -->
      <div class="dimension" :class="signalColor(currentAlmanac.short_term.signal.action)">
        <div class="dim-header">
          <span class="dim-label">短线</span>
          <span class="dim-sub">明日 {{ nextDayShort }}</span>
        </div>
        <div class="dim-body">
          <span class="dim-score" :class="scoreClass(currentAlmanac.short_term.rating)">
            {{ currentAlmanac.short_term.rating.toFixed(1) }}
          </span>
          <span class="dim-signal" :class="signalColor(currentAlmanac.short_term.signal.action)">
            {{ currentAlmanac.short_term.signal.label }}
          </span>
        </div>
        <div class="dim-desc">{{ currentAlmanac.short_term.signal.description }}</div>
        <div class="dim-stats">
          今日上涨概率 <span :style="{ color: probColor(currentData.today_prob) }">{{ formatPct(currentData.today_prob) }}</span>
          · 明日 <span :style="{ color: probColor(currentData.next_day_prob) }">{{ formatPct(currentData.next_day_prob) }}</span>
          <span class="dim-scenario" :style="{ color: scenarioColor(currentData.today_prob, currentData.next_day_prob) }">
            {{ scenarioLabel(currentData.today_prob, currentData.next_day_prob) }}
          </span>
        </div>
      </div>

      <!-- 波段 -->
      <div class="dimension" :class="signalColor(currentAlmanac.swing.signal.action)">
        <div class="dim-header">
          <span class="dim-label">波段</span>
          <span class="dim-sub">{{ nextMonthName }}</span>
        </div>
        <div class="dim-body">
          <span class="dim-score" :class="scoreClass(currentAlmanac.swing.rating)">
            {{ currentAlmanac.swing.rating.toFixed(1) }}
          </span>
          <span class="dim-signal" :class="signalColor(currentAlmanac.swing.signal.action)">
            {{ currentAlmanac.swing.signal.label }}
          </span>
        </div>
        <div class="dim-desc">{{ currentAlmanac.swing.signal.description }}</div>
        <div class="dim-stats">
          本月上涨概率 <span :style="{ color: probColor(currentData.this_month_prob) }">{{ formatPct(currentData.this_month_prob) }}</span>
          · 下月 <span :style="{ color: probColor(currentData.next_month_prob) }">{{ formatPct(currentData.next_month_prob) }}</span>
          <span class="dim-scenario" :style="{ color: scenarioColor(currentData.this_month_prob, currentData.next_month_prob) }">
            {{ scenarioLabel(currentData.this_month_prob, currentData.next_month_prob) }}
          </span>
        </div>
      </div>

      <!-- 综合建议 -->
      <div class="almanac-advice">
        {{ currentAlmanac.advice }}
      </div>
    </template>

    <div v-else class="almanac-empty">暂无该指数的历史统计数据</div>
  </div>
</template>

<style scoped>
.almanac-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  box-shadow: var(--shadow-md);
}

.almanac-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-sm);
}

.almanac-icon { font-size: var(--text-lg); }

.almanac-title-group {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.almanac-title {
  font-size: var(--text-md);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  letter-spacing: 0.5px;
}

.almanac-subtitle {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  font-weight: var(--font-normal);
}

/* 指数 Tab */
.index-tabs {
  display: flex;
  gap: 0;
  background: var(--bg-muted);
  border-radius: var(--radius-md);
  padding: 3px;
  margin-bottom: var(--space-md);
}

.index-tab {
  flex: 1;
  text-align: center;
  padding: var(--space-xs) 0;
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--text-tertiary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.index-tab.active {
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}

.index-tab:active {
  transform: scale(0.97);
}

/* 维度卡片 */
.dimension {
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
  margin-bottom: var(--space-sm);
}

.dimension.signal-add {
  background: var(--color-up-light);
  border-left: 3px solid var(--color-up);
}

.dimension.signal-hold {
  background: var(--bg-muted);
  border-left: 3px solid var(--color-neutral-light);
}

.dimension.signal-reduce {
  background: var(--color-down-light);
  border-left: 3px solid var(--color-down);
}

.dim-header {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  margin-bottom: var(--space-xs);
}

.dim-label {
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  color: var(--text-secondary);
}

.dim-sub {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

.dim-body {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  margin-bottom: var(--space-xs);
}

.dim-score {
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.dim-score.score-add { color: var(--color-up); }
.dim-score.score-hold { color: var(--color-neutral); }
.dim-score.score-reduce { color: var(--color-down); }

.dim-signal {
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  padding: 2px var(--space-sm);
  border-radius: var(--radius-sm);
}

.dim-signal.signal-add {
  background: var(--color-up-muted);
  color: var(--color-up-dark);
}

.dim-signal.signal-hold {
  background: rgba(140, 140, 140, 0.1);
  color: var(--text-secondary);
}

.dim-signal.signal-reduce {
  background: var(--color-down-muted);
  color: var(--color-down-dark);
}

.dim-desc {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: var(--leading-normal);
}

.dim-stats {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  margin-top: var(--space-xs);
  color: var(--text-secondary);
}

.dim-scenario {
  font-weight: var(--font-semibold);
  margin-left: var(--space-xs);
}

/* 综合建议 */
.almanac-advice {
  margin-top: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-muted);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: var(--leading-relaxed);
  text-align: center;
}

.almanac-empty {
  text-align: center;
  padding: var(--space-2xl) 0;
  color: var(--text-disabled);
  font-size: var(--text-sm);
}
</style>
