<script setup lang="ts">
import { WEEKDAYS } from '../../../shared/date-utils'
import { scoreColor } from '../utils/display'
import OverviewTab from '../components/tabs/OverviewTab.vue'
import EventsTab from '../components/tabs/EventsTab.vue'
import StatsTab from '../components/tabs/StatsTab.vue'
import TrendTab from '../components/tabs/TrendTab.vue'
import PwaInstall from '../components/PwaInstall.vue'
import { useHomePage } from '../composables/useHomePage'

const {
  activeTab,
  calendar,
  changeWeek,
  dailyCalendar,
  dateRiskMap,
  dateStrip,
  displayDate,
  displayWeekday,
  goToday,
  handleCalendarDateSelect,
  holidayMap,
  loadingDay,
  nextDayShort,
  nextMonthName,
  selectDate,
  selectedCalendar,
  selectedDate,
  selectedDayEvents,
  selectedEvents,
  selectedRisk,
  setTab,
  shortDesc,
  shortLabel,
  shortRating,
  temperature,
  today,
  topEvents,
} = useHomePage()
</script>

<template>
  <div class="editorial-home">
    <!-- 报头 -->
    <header class="masthead">
      <span class="mast-date">{{ displayDate.month }}月{{ displayDate.day }}日 {{ WEEKDAYS[displayWeekday] }}</span>
      <span class="mast-sep">·</span>
      <span class="mast-title">投资黄历</span>
      <PwaInstall />
    </header>

    <!-- 日期条 (全局 sticky) -->
    <div v-if="activeTab !== 'trends'" class="date-strip-wrapper">
      <button class="nav-btn nav-prev" @click="changeWeek(-1)">◀</button>
      <div class="date-strip">
        <div
          v-for="item in dateStrip"
          :key="item.date"
          class="date-item"
          :class="{
            active: item.date === selectedDate,
            today: item.isToday,
            holiday: item.isHoliday,
          }"
          @click="selectDate(item.date)"
          :title="item.holidayName"
        >
          <span class="date-day">{{ item.label }}</span>
          <span class="date-num">{{ item.short }}</span>
          <span v-if="item.isHoliday && holidayMap[item.date]" class="date-badge">休</span>
          <span v-else-if="dateRiskMap[item.date] && dateRiskMap[item.date] > 0" class="date-dot" :class="scoreColor(dateRiskMap[item.date])"></span>
        </div>
      </div>
      <button class="nav-btn nav-next" @click="changeWeek(1)">▶</button>
      <button v-if="selectedDate !== today" class="today-btn" @click="goToday">今天</button>
    </div>

    <!-- ============================================ -->
    <!-- Tab: 概览                                     -->
    <!-- ============================================ -->
    <OverviewTab
      v-show="activeTab === 'overview'"
      :calendar="calendar"
      :dailyCalendar="dailyCalendar"
      :nextDayShort="nextDayShort"
      :nextMonthName="nextMonthName"
      :selectedDate="selectedDate"
      :selectedDayEvents="selectedDayEvents"
      :shortDesc="shortDesc"
      :shortLabel="shortLabel"
      :shortRating="shortRating"
      :temperature="temperature"
      :today="today"
      :topEvents="topEvents"
      @showEvents="setTab('events')"
    />

    <TrendTab v-if="activeTab === 'trends'" />

    <!-- ============================================ -->
    <!-- Tab: 事件                                     -->
    <!-- ============================================ -->
    <EventsTab
      v-show="activeTab === 'events'"
      :loadingDay="loadingDay"
      :selectedDate="selectedDate"
      :selectedEvents="selectedEvents"
      :selectedRisk="selectedRisk"
      @showStats="setTab('stats')"
    />

    <!-- ============================================ -->
    <!-- Tab: 统计                                     -->
    <!-- ============================================ -->
    <StatsTab
      v-show="activeTab === 'stats'"
      :holidays="holidayMap"
      :selectedCalendar="selectedCalendar"
      :selectedDate="selectedDate"
      @selectDate="handleCalendarDateSelect"
    />

    <!-- 底部 Tab 栏 -->
    <nav class="bottom-tab-bar">
      <div class="bottom-tab" :class="{ active: activeTab === 'overview' }" @click="setTab('overview')">今日</div>
      <div class="bottom-tab" :class="{ active: activeTab === 'trends' }" @click="setTab('trends')">趋势</div>
      <div class="bottom-tab" :class="{ active: activeTab === 'events' }" @click="setTab('events')">
        事件
        <span v-if="selectedDayEvents.length" class="tab-badge">{{ selectedDayEvents.length }}</span>
      </div>
      <div class="bottom-tab" :class="{ active: activeTab === 'stats' }" @click="setTab('stats')">统计</div>
    </nav>
  </div>
</template>

<style lang="scss" scoped>
@use '../styles/theme' as *;
@use '../styles/mixins' as *;

.editorial-home {
  min-height: 100vh;
  padding: 0 $space-xl 68px;
  background: $bg-page;
  color: $text-primary;
  font-family: $font-serif;
}

// === 报头 (极简一行) ===
.masthead {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-sm;
  padding: $space-md 0;
  font-family: $font-sans;
}

.mast-date {
  font-size: $text-sm;
  color: $text-secondary;
}

.mast-sep {
  color: $text-disabled;
  font-size: $text-sm;
}

.mast-title {
  font-size: $text-sm;
  font-weight: $weight-bold;
  color: $text-primary;
  letter-spacing: 2px;
}

// === 日期条 (全局 sticky) ===
.date-strip-wrapper {
  position: sticky;
  top: 0;
  z-index: 100;
  background: $bg-page;
  margin-bottom: 0;
  padding: $space-sm $space-xl;
  border-bottom: $rule-thin;
}

// === 底部 Tab 栏 ===
.bottom-tab-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  width: 100%;
  max-width: 100vw;
  overflow-x: hidden;
  background: $bg-page;
  border-top: 1px solid $border;
  z-index: 200;
  padding-bottom: env(safe-area-inset-bottom);
}

.bottom-tab {
  flex: 1;
  min-width: 0;
  text-align: center;
  padding: $space-md 0;
  font-family: $font-sans;
  font-size: $text-md;
  font-weight: $weight-semibold;
  color: $text-tertiary;
  cursor: pointer;
  position: relative;
  transition: color $duration-fast $ease-out;

  &.active {
    color: $text-primary;
  }
}

.tab-badge {
  display: inline-block;
  background: $color-up;
  color: $text-inverse;
  font-size: $text-sm - 1;
  font-weight: $weight-bold;
  padding: 1px 6px;
  border-radius: $radius-sm;
  margin-left: $space-xs;
  vertical-align: middle;
}

.tab-panel {
  // min-height placeholder so tabs don't jump
}

// === 分割线 ===
.rule-thin {
  height: 1px;
  background: $border;
}

// === 头条 ===
.headline {
  text-align: center;
  padding: $space-xl 0 $space-lg-xl;
}

.hl-label {
  @include editorial-label;
  margin-bottom: $space-sm;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-md;
}

.hl-history-link {
  font-family: $font-sans;
  font-size: $text-xs;
  font-weight: $weight-medium;
  color: $color-info;
  letter-spacing: 0;
  cursor: pointer;

  &:active { opacity: 0.6; }
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

// === 今日要事 ===
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

// === 底部 ===
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

// ============================================
// 事件 Tab 样式
// ============================================


.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  font-size: $text-lg;
  color: $text-secondary;
  cursor: pointer;
  padding: $space-sm $space-xs;
  line-height: 1;
  z-index: 10;

  &:active { color: $text-primary; }
}

.nav-prev { left: $space-xs; }
.nav-next { right: $space-xs; }

.today-btn {
  position: absolute;
  top: -6px;
  right: $space-sm;
  background: $text-primary;
  color: $text-inverse;
  border: none;
  font-size: $text-sm;
  font-weight: $weight-medium;
  padding: 2px $space-sm;
  border-radius: $radius-sm;
  cursor: pointer;
  z-index: 10;

  &:active { opacity: 0.7; }
}

.date-strip {
  display: flex;
  justify-content: center;
  gap: 0;
}

.date-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: $space-xs $space-sm;
  border-radius: 0;
  cursor: pointer;
  min-width: 40px;
  position: relative;

  &:active { background: $bg-muted; }
  &.active { background: $text-primary; color: $text-inverse; }
}

.date-day {
  font-size: $text-sm;
  font-family: $font-sans;
  color: $text-tertiary;
  margin-bottom: 1px;
  white-space: nowrap;
  line-height: $leading-tight;

  .date-item.active & { color: $text-on-dark-muted; }
  .date-item.today & { color: $color-up; }
  .date-item.active.today & { color: $color-up; }
}

.date-num {
  font-size: $text-sm;
  font-weight: $weight-bold;
  color: $text-primary;
  line-height: $leading-tight;
  @include tabular-nums;

  .date-item.active & { color: $text-inverse; }
}

.date-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  margin-top: $space-xs;

  &.red { background: $color-up; }
  &.orange { background: $color-warn; }
  &.yellow { background: $color-neutral; }
}

// === 假日 / 调休 ===
.date-badge {
  font-size: 8px;
  font-weight: $weight-bold;
  color: $color-down-dark;
  background: $color-down-light;
  border-radius: $radius-sm;
  padding: 0 3px;
  margin-top: 2px;
  line-height: 14px;
  font-family: $font-sans;
}

.date-item.holiday {
  .date-day { color: $text-disabled; }
  .date-num { color: $text-disabled; }
}

</style>
