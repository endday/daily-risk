<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { TemperatureDerived, MarketSnapshot } from '../services/api'
import { erpToTemperaturePosition, erpColorClass } from '../utils/temperature'
import { formatTurnover } from '../utils/display'

const props = defineProps<{
  derived: TemperatureDerived
  latest: MarketSnapshot[]
}>()

const router = useRouter()

const erpPosition = computed(() =>
  props.derived.erp != null ? erpToTemperaturePosition(props.derived.erp) : null,
)

const erpColor = computed(() =>
  props.derived.erp != null ? erpColorClass(props.derived.erp) : '',
)

const hasData = computed(() => props.derived.erp != null || props.derived.pe_ttm != null)
const asOf = computed(() => props.latest[0]?.trade_date ?? null)
const turnoverDisplay = computed(() => formatTurnover(props.derived.turnover_5d_avg))

const breadthLabel = computed(() => props.derived.advance_decline_label || '--')
const turnoverLabel = computed(() => props.derived.turnover_trend || '--')

function goToErp() {
  void router.push('/erp')
}
</script>

<template>
  <section class="market-pulse" aria-label="市场体温">
    <header class="pulse-header">
      <span class="pulse-label">市场体温</span>
      <span v-if="asOf" class="pulse-date">截至 {{ asOf }}</span>
    </header>

    <div v-if="!hasData" class="pulse-empty">估值数据积累中</div>

    <template v-else>
      <button class="erp-section" type="button" @click="goToErp">
        <span class="erp-kicker">沪深300 股债利差</span>
        <span class="erp-headline">
          <strong :class="erpColor">{{ derived.erp_label || '估值待确认' }}</strong>
          <b v-if="derived.erp != null">{{ derived.erp.toFixed(2) }}%</b>
        </span>
        <span class="erp-context">盈利收益率 - 10年期国债收益率</span>
        <span class="erp-track" aria-hidden="true">
          <i v-if="erpPosition != null" :class="erpColor" :style="{ left: `${erpPosition}%` }"></i>
        </span>
        <span class="erp-scale"><span>估值偏高</span><span>合理</span><span>估值偏低</span></span>
      </button>

      <div class="status-grid">
        <div v-if="derived.pe_ttm != null" class="status-item">
          <span>沪深300 PE</span>
          <b>{{ derived.pe_ttm.toFixed(1) }}</b>
          <small>TTM</small>
        </div>
        <div v-if="derived.advance_decline_ratio != null" class="status-item">
          <span>上证上涨占比</span>
          <b>{{ derived.advance_decline_ratio.toFixed(0) }}%</b>
          <small>{{ breadthLabel }}</small>
        </div>
        <div v-if="derived.turnover_5d_avg != null" class="status-item">
          <span>近5日成交</span>
          <b>{{ turnoverDisplay }}</b>
          <small>{{ turnoverLabel }}</small>
        </div>
      </div>
    </template>
  </section>
</template>

<style lang="scss" scoped>
@use '../styles/theme' as *;
@use '../styles/mixins' as *;

.market-pulse { padding: $space-lg 0; }
.pulse-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: $space-md; }
.pulse-label { @include editorial-label; }
.pulse-date { color: $text-tertiary; font-family: $font-sans; font-size: $text-xs; }
.pulse-empty { padding: $space-lg 0; color: $text-disabled; font-family: $font-sans; font-size: $text-sm; text-align: center; }

.erp-section {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: $text-primary;
  cursor: pointer;
  font-family: inherit;
  text-align: left;

  &:active { opacity: .72; }
}

.erp-kicker { display: block; color: $text-tertiary; font-family: $font-sans; font-size: $text-xs; }
.erp-headline { display: flex; align-items: baseline; justify-content: space-between; gap: $space-md; margin-top: 3px; }
.erp-headline strong { font-family: $font-serif; font-size: $text-xl; letter-spacing: 0; }
.erp-headline b { font-family: $font-serif; font-size: 30px; font-variant-numeric: tabular-nums; }
.erp-context { display: block; margin-top: 2px; color: $text-tertiary; font-family: $font-sans; font-size: $text-xs; }
.erp-track { position: relative; display: block; height: 7px; margin-top: $space-md; background: linear-gradient(to right, $color-down, $color-neutral 50%, $color-up); }
.erp-track i { position: absolute; top: -4px; width: 3px; height: 15px; background: $text-primary; transform: translateX(-50%); }
.erp-scale { display: flex; justify-content: space-between; margin-top: $space-xs; color: $text-tertiary; font-family: $font-sans; font-size: 10px; }
.erp-scale span:first-child { color: $color-down-dark; }
.erp-scale span:last-child { color: $color-up-dark; }

.status-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: $space-lg; border-top: $rule-thin; border-bottom: $rule-thin; }
.status-item { display: flex; min-width: 0; flex-direction: column; gap: 4px; padding: $space-md $space-sm; border-right: $rule-thin; font-family: $font-sans; }
.status-item:first-child { padding-left: 0; }
.status-item:last-child { border-right: 0; padding-right: 0; }
.status-item span, .status-item small { overflow: hidden; color: $text-tertiary; font-size: $text-xs; text-overflow: ellipsis; white-space: nowrap; }
.status-item b { font-family: $font-serif; font-size: $text-lg; font-variant-numeric: tabular-nums; }

.erp-extreme-cheap, .erp-cheap { color: $color-up; }
.erp-fair { color: $color-neutral; }
.erp-expensive, .erp-extreme-expensive { color: $color-down; }

@media (max-width: 480px) {
  .erp-headline strong { font-size: $text-lg; }
  .erp-headline b { font-size: $text-2xl; }
  .status-item { padding-top: $space-sm; padding-bottom: $space-sm; }
  .status-item b { font-size: $text-md; }
}
</style>
