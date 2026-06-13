<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { fetchEventsByDate } from '../services/api'
import { getToday } from '../../../shared/date-utils'
import type { CalendarEffects } from '../services/api'

const today = getToday()
const calendar = ref<CalendarEffects | null>(null)

const [year, month, day] = today.split('-').map(Number)
const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const currentWeekday = new Date(year, month - 1, day).getDay()

function ratingBg(rating: number | null): string {
  if (rating === null) return 'transparent'
  if (rating >= 8) return 'rgba(232, 71, 76, 0.15)'
  if (rating >= 6) return 'rgba(232, 71, 76, 0.07)'
  if (rating >= 4) return 'transparent'
  if (rating >= 2) return 'rgba(46, 175, 125, 0.07)'
  return 'rgba(46, 175, 125, 0.15)'
}

onMounted(async () => {
  try {
    const data = await fetchEventsByDate(today)
    calendar.value = data.calendar_effects || null
  } catch {
    // fallback
  }
})

const shortRating = computed(() => calendar.value?.almanac?.short_term?.rating ?? null)
const shortLabel = computed(() => calendar.value?.almanac?.short_term?.signal?.label ?? '--')
const shortDesc = computed(() => calendar.value?.almanac?.short_term?.signal?.description ?? '--')
const swingRating = computed(() => calendar.value?.almanac?.swing?.rating ?? null)
const swingLabel = computed(() => calendar.value?.almanac?.swing?.signal?.label ?? '--')
const advice = computed(() => calendar.value?.almanac?.advice ?? '--')
const upProb = computed(() => calendar.value?.today?.up_probability ?? null)
const sampleCount = computed(() => calendar.value?.today?.sample_count ?? null)

// P0: 从 daily_calendar 构建 day→rating 映射
const dayRatingMap = computed(() => {
  const ce = calendar.value
  if (!ce?.daily_calendar) return {} as Record<number, number>
  const map: Record<number, number> = {}
  for (const stat of ce.daily_calendar) {
    if (stat.rating !== undefined) map[stat.day] = stat.rating
  }
  return map
})

// 本月天数
const daysInMonth = computed(() => new Date(year, month, 0).getDate())

// 本月1号是周几 → 网格偏移 (周一=0, 周日=6)
const gridOffset = computed(() => {
  const dow = new Date(year, month - 1, 1).getDay()
  return (dow + 6) % 7
})

// P1: 波段栏使用下月上涨概率
const nextMonthProb = computed(() => {
  const ce = calendar.value
  if (!ce) return null
  const idxData = ce.almanac_by_index?.['000001']
  if (idxData?.next_month_prob !== undefined) return idxData.next_month_prob
  const nextMonthNum = month === 12 ? 1 : month + 1
  const nextMonthStat = ce.all_months?.find(m => m.month === nextMonthNum)
  if (nextMonthStat?.up_probability !== undefined) return nextMonthStat.up_probability
  return null
})

function signalClass(rating: number | null): string {
  if (rating === null) return ''
  if (rating >= 6) return 'bullish'
  if (rating >= 4) return 'neutral'
  return 'bearish'
}

function fmtPct(v: number | null): string {
  return v !== null ? `${Math.round(v * 100)}%` : '--'
}

function fmtScore(v: number | null): string {
  return v !== null ? v.toFixed(1) : '--'
}

const router = useRouter()

function goDetail() {
  router.push(`/detail/${today}`)
}
</script>

<template>
  <div class="editorial-home">
    <!-- 报头 -->
    <header class="masthead">
      <div class="mast-top">
        <span class="mast-date">{{ weekdays[currentWeekday] }}</span>
        <span class="mast-sep">|</span>
        <span class="mast-date">{{ year }}年{{ month }}月{{ day }}日</span>
      </div>
      <h1 class="mast-title">明日风险榜</h1>
      <div class="mast-sub">基于近20年A股历史涨跌统计 · 每日更新</div>
      <div class="mast-rule"></div>
    </header>

    <!-- 头条评分 -->
    <section class="headline">
      <div class="hl-label">今日研判</div>
      <div class="hl-score-row">
        <span class="hl-score" :class="signalClass(shortRating)">{{ fmtScore(shortRating) }}</span>
        <span class="hl-unit">/ 10</span>
      </div>
      <div class="hl-signal" :class="signalClass(shortRating)">
        <span class="hl-badge">{{ shortLabel }}</span>
        <span class="hl-signal-desc">{{ shortDesc }}</span>
      </div>
    </section>

    <div class="rule-thin"></div>

    <!-- 双栏数据 -->
    <section class="data-columns">
      <div class="data-col">
        <div class="col-head">短线 · 明日</div>
        <div class="col-score" :class="signalClass(shortRating)">{{ fmtScore(shortRating) }}</div>
        <div class="col-meta">
          <span class="meta-label">上涨概率</span>
          <span class="meta-value" :class="signalClass(shortRating)">{{ fmtPct(upProb) }}</span>
        </div>
        <div class="col-meta">
          <span class="meta-label">历史样本</span>
          <span class="meta-value">{{ sampleCount !== null ? `n=${sampleCount}` : '--' }}</span>
        </div>
      </div>
      <div class="col-divider"></div>
      <div class="data-col">
        <div class="col-head">波段 · {{ month + 1 > 12 ? 1 : month + 1 }}月</div>
        <div class="col-score" :class="signalClass(swingRating)">{{ fmtScore(swingRating) }}</div>
        <div class="col-meta">
          <span class="meta-label">上涨概率</span>
          <span class="meta-value" :class="signalClass(swingRating)">{{ fmtPct(nextMonthProb) }}</span>
        </div>
        <div class="col-meta">
          <span class="meta-label">操作信号</span>
          <span class="meta-value" :class="signalClass(swingRating)">{{ swingLabel }}</span>
        </div>
      </div>
    </section>

    <div class="rule-thin"></div>

    <!-- 编辑建议 -->
    <section class="editorial-advice">
      <div class="advice-label">综合研判</div>
      <p class="advice-body">{{ advice }}</p>
    </section>

    <div class="rule-thin"></div>

    <!-- 月度日历表格 -->
    <section class="cal-table">
      <div class="cal-head">
        <span class="cal-title">{{ month }}月 · 每日历史评分一览</span>
      </div>
      <div class="cal-weekdays">
        <span v-for="w in ['一','二','三','四','五','六','日']" :key="w">{{ w }}</span>
      </div>
      <div class="cal-grid">
        <div v-for="i in gridOffset" :key="'e'+i" class="cal-cell empty"></div>
        <div
          v-for="d in daysInMonth"
          :key="d"
          class="cal-cell"
          :class="{ 'is-today': d === day }"
          :style="{ backgroundColor: ratingBg(dayRatingMap[d] ?? null) }"
        >
          <span class="cell-day">{{ d }}</span>
          <span v-if="dayRatingMap[d] !== undefined" class="cell-score">{{ dayRatingMap[d]?.toFixed(1) }}</span>
        </div>
      </div>
      <div class="cal-footnote">
        评分范围 0-10，基于近20年同日上涨概率 Z-Score 计算。红色利好 / 绿色利空。
      </div>
    </section>

    <!-- 按钮 -->
    <div class="action-row">
      <button class="btn-filled" @click="goDetail">查看详情 →</button>
      <button class="btn-outline">分享今日黄历</button>
    </div>

    <!-- 底部 -->
    <footer class="editorial-footer">
      <div class="footer-rule"></div>
      <span>历史统计不代表未来表现 · 仅供参考，不构成投资建议</span>
    </footer>
  </div>
</template>

<style lang="scss" scoped>
@use '../styles/theme' as *;
@use '../styles/mixins' as *;

.editorial-home {
  min-height: 100vh;
  padding: 0 $space-xl $space-2xl;
  background: $bg-page;
  color: $text-primary;
  font-family: $font-serif;
}

// === 报头 ===
.masthead {
  text-align: center;
  padding: $space-lg 0 0;
}

.mast-top {
  font-size: $text-xs + 1;
  color: $text-secondary;
  letter-spacing: 1px;
  margin-bottom: $space-sm;
  font-family: $font-sans;
}

.mast-sep {
  margin: 0 $space-sm;
  color: $border;
}

.mast-title {
  font-size: $text-2xl + 4;
  font-weight: $weight-black;
  color: $text-primary;
  letter-spacing: 4px;
  margin: 0;
  line-height: $leading-tight;
}

.mast-sub {
  font-size: $text-sm;
  color: $text-secondary;
  margin-top: $space-xs + 2;
  font-family: $font-sans;
  letter-spacing: 0.5px;
}

.mast-rule {
  margin-top: $space-md + 2;
  height: 3px;
  background: $border-heavy;
}

// === 头条 ===
.headline {
  text-align: center;
  padding: $space-xl 0 $space-xl - 4;
}

.hl-label {
  @include editorial-label;
  margin-bottom: $space-sm;
}

.hl-score-row {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: $space-xs;
  margin-bottom: $space-md;
}

.hl-score {
  font-size: $text-hero;
  font-weight: $weight-black;
  line-height: 1;
  letter-spacing: -2px;

  &.bullish { color: $color-up; }
  &.neutral { color: $color-neutral; }
  &.bearish { color: $color-down; }
}

.hl-unit {
  font-size: $text-xl;
  font-weight: $weight-normal;
  color: $text-secondary;
}

.hl-signal {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-md - 2;
  flex-wrap: wrap;
}

.hl-badge {
  display: inline-block;
  font-size: $text-md - 1;
  font-weight: $weight-bold;
  padding: 3px $space-md;
  border-radius: $radius-sm;
  letter-spacing: 2px;

  .bullish & { background: $color-up; color: $text-inverse; }
  .neutral & { background: $color-neutral; color: $text-inverse; }
  .bearish & { background: $color-down; color: $text-inverse; }
}

.hl-signal-desc {
  font-size: $text-md - 1;
  color: $text-secondary;
  font-family: $font-sans;
}

// === 分割线 ===
.rule-thin {
  height: 1px;
  background: $border;
}

// === 双栏数据 ===
.data-columns {
  display: flex;
  align-items: stretch;
  padding: $space-xl - 4 0;
}

.data-col {
  flex: 1;
  text-align: center;
}

.col-head {
  @include editorial-label;
  margin-bottom: $space-sm;
}

.col-score {
  font-size: $text-3xl;
  font-weight: $weight-bold + 100;
  line-height: 1;
  margin-bottom: $space-md;

  &.bullish { color: $color-up; }
  &.neutral { color: $color-neutral; }
  &.bearish { color: $color-down; }
}

.col-divider {
  width: 1px;
  background: $border;
  margin: 0 $space-lg;
}

.col-meta {
  display: flex;
  justify-content: space-between;
  padding: $space-xs $space-md;
  font-size: $text-sm;
  font-family: $font-sans;
}

.meta-label {
  color: $text-secondary;
}

.meta-value {
  font-weight: $weight-semibold;
  color: $text-primary;
  @include tabular-nums;

  &.bullish { color: $color-up; }
  &.neutral { color: $color-neutral; }
  &.bearish { color: $color-down; }
}

// === 编辑建议 ===
.editorial-advice {
  padding: $space-xl - 4 $space-sm;
}

.advice-label {
  @include editorial-label;
  margin-bottom: $space-sm;
}

.advice-body {
  font-size: 15px;
  line-height: $leading-article;
  color: $text-primary;
  margin: 0;
  text-indent: 2em;
}

// === 日历表格 ===
.cal-table {
  padding: $space-xl - 4 0 0;
}

.cal-head {
  margin-bottom: $space-md;
}

.cal-title {
  @include editorial-title;
  font-size: $text-md;
}

.cal-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  padding-bottom: $space-xs + 2;
  border-bottom: 2px solid $border-heavy;
  margin-bottom: 2px;

  span {
    font-size: $text-xs + 1;
    font-weight: $weight-bold;
    color: $text-primary;
    font-family: $font-sans;
    letter-spacing: 1px;
  }
}

.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  background: $border;
  border: 1px solid $border;
}

.cal-cell {
  background: $bg-card;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: $space-xs + 2 2px;
  gap: 2px;

  &.empty {
    background: $bg-muted;
  }
}

.cell-day {
  font-size: $text-sm;
  font-weight: $weight-bold;
  color: $text-primary;
  line-height: 1;
}

.cell-score {
  font-size: 9px;
  color: $text-secondary;
  @include tabular-nums;
  font-family: $font-sans;
  line-height: 1;
}

.is-today {
  background: $border-heavy !important;

  .cell-day { color: $text-inverse; }
  .cell-score { color: rgba(255, 255, 255, 0.7); }
}

.cal-footnote {
  font-size: $text-xs;
  color: $text-tertiary;
  margin-top: $space-sm;
  font-family: $font-sans;
  line-height: $leading-normal;
}

// === 按钮 ===
.action-row {
  display: flex;
  gap: $space-md - 2;
  margin-top: $space-xl;
  margin-bottom: $space-xl - 4;

  .btn-filled {
    @include btn-filled;
    flex: 1;
  }

  .btn-outline {
    @include btn-outline;
    flex: 1;
  }
}

// === 底部 ===
.editorial-footer {
  text-align: center;
  font-size: $text-xs;
  color: $text-tertiary;
  font-family: $font-sans;
}

.footer-rule {
  height: 1px;
  background: $border;
  margin-bottom: $space-md;
}
</style>
