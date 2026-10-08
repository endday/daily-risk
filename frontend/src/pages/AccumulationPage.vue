<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchIndexAccumulation } from '../services/api'
import type { IndexAccumulationItem, IndexAccumulationResponse } from '../services/api'

const data = ref<IndexAccumulationResponse | null>(null)
const loading = ref(true)
const error = ref('')
const selectedCode = ref('000922')

const selected = computed(() => data.value?.items.find((item) => item.code === selectedCode.value) || data.value?.items[0] || null)
const points = computed<any[]>(() => (selected.value as any)?.chart_points || [])
const overlayPoints = computed(() => points.value.map((point, index, all) => {
  const window = all.slice(Math.max(0, index - 19), index + 1).map((item) => Number(item.close)).filter(Number.isFinite)
  if (window.length < 2) return { ...point, bollingerMiddle: null, bollingerUpper: null, bollingerLower: null }
  const mean = window.reduce((sum, value) => sum + value, 0) / window.length
  const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / window.length
  const deviation = Math.sqrt(variance)
  return { ...point, bollingerMiddle: mean, bollingerUpper: mean + deviation * 2, bollingerLower: mean - deviation * 2 }
}))
const asOf = computed(() => data.value?.trade_date?.replace(/-/g, '.') || '--')

function format(value: number | null, suffix = '') {
  return value == null ? '--' : `${value.toFixed(1)}${suffix}`
}
function signalClass(item: IndexAccumulationItem | null) {
  return item?.signal === 'strong_buy' || item?.signal === 'buy' ? 'add' : item?.signal === 'wait' ? 'wait' : 'hold'
}
function signalLabel(signal: string | undefined) {
  return signal === 'strong_buy' ? '多项指标共振，可分批加仓' : signal === 'buy' ? '趋势改善，可以开始关注' : signal === 'wait' ? '等待更好位置' : '观察为主'
}
function maLabel(item: IndexAccumulationItem) { return item.ma_signal === 'golden_cross' ? '金叉 · 开始关注' : item.ma_signal === 'death_cross' ? '死叉 · 控制节奏' : item.ma_signal === 'above' ? '站上长期均线' : item.ma_signal === 'below' ? '长期均线下方' : '样本不足' }
function rsiLabel(value: number | null) { return value == null ? '待接入' : value <= 30 ? '超卖 · 关注机会' : value >= 70 ? '超买 · 避免追涨' : '中性区间' }
function ddLabel(value: number | null) { return value == null ? '待接入' : value <= -20 ? '深度回撤 · 分批观察' : value <= -10 ? '回撤中 · 等待确认' : '回撤有限' }
function linePath(key: string, min?: number, max?: number) {
  const values = points.value.map((p) => Number(p[key])).filter(Number.isFinite)
  if (values.length < 2) return ''
  const lo = min ?? Math.min(...values); const hi = max ?? Math.max(...values); const span = hi - lo || 1
  return points.value.map((p, i) => { const v = Number(p[key]); if (!Number.isFinite(v)) return ''; const x = i / (points.value.length - 1) * 100; const y = 94 - (v - lo) / span * 84; return `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}` }).filter(Boolean).join(' ')
}
function overlayPath(key: string) {
  const values = overlayPoints.value.flatMap((point) => Number.isFinite(Number(point[key])) ? [Number(point[key])] : [])
  if (values.length < 2) return ''
  const lo = Math.min(...overlayPoints.value.map((point) => Number(point.close)).filter(Number.isFinite))
  const hi = Math.max(...overlayPoints.value.map((point) => Number(point.close)).filter(Number.isFinite))
  const span = hi - lo || 1
  return overlayPoints.value.map((point, index) => {
    const value = Number(point[key]); if (!Number.isFinite(value)) return ''
    const x = index / Math.max(overlayPoints.value.length - 1, 1) * 100
    const y = 94 - (value - lo) / span * 84
    return `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`
  }).filter(Boolean).join(' ')
}
function eventText(key: string) { const item = selected.value as any; if (key === 'ma') return maLabel(item); if (key === 'rsi') return rsiLabel(item?.rsi14); return ddLabel(item?.drawdown52w) }
async function load() {
  loading.value = true
  error.value = ''
  try { data.value = await fetchIndexAccumulation() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '指标数据加载失败' }
  finally { loading.value = false }
}
onMounted(() => void load())
</script>

<template>
  <main class="accumulation-page">
    <header class="page-head">
      <div>
        <a class="back-link" href="/trends">← 返回趋势</a>
        <p class="eyebrow">宽基研究 · 加仓观察</p>
        <h1>什么时候适合加仓</h1>
        <p class="dek">把趋势、动量和回撤放在同一张桌面上，给定投一个可复盘的依据。</p>
      </div>
      <span class="as-of">截至 {{ asOf }}</span>
    </header>

    <p v-if="loading" class="state">正在读取指数日线…</p>
    <p v-else-if="error" class="state error">{{ error }}</p>
    <template v-else-if="data">
      <nav class="index-nav" aria-label="选择指数">
        <button v-for="item in data.items" :key="item.code" :class="{ active: item.code === selected?.code }" @click="selectedCode = item.code">
          <span>{{ item.name }}</span><small>{{ item.code }}</small>
        </button>
      </nav>

      <section v-if="selected" class="hero-signal" :class="signalClass(selected)">
        <div>
          <span class="hero-label">{{ selected.name }} · 综合判断</span>
          <strong>{{ signalLabel(selected.signal) }}</strong>
          <p>综合参考趋势、动量与回撤，当前信号用于安排分批节奏。</p>
        </div>
        <div class="score"><b>{{ selected.score ?? '--' }}</b><span>/ 100</span></div>
      </section>

      <section v-if="selected" class="metric-grid" aria-label="核心指标">
        <article><span>趋势位置</span><b>{{ format(selected.close) }}</b><small>MA50 {{ format(selected.ma50) }} · MA200 {{ format(selected.ma200) }}</small><em :class="selected.ma_signal">{{ maLabel(selected) }}</em></article>
        <article><span>动量 RSI(14)</span><b>{{ format(selected.rsi14) }}</b><small>20 日收益 {{ format(selected.return20d, '%') }}</small><em>{{ rsiLabel(selected.rsi14) }}</em></article>
        <article><span>一年回撤</span><b>{{ format(selected.drawdown52w, '%') }}</b><small>252 日收益 {{ format(selected.return252d, '%') }}</small><em>{{ ddLabel(selected.drawdown52w) }}</em></article>
      </section>

      <section class="charts" v-if="selected">
        <article class="chart-card chart-wide"><header><div><h2>多指标叠加</h2><p>价格轴：收盘价、均线与布林带（20 日 / 2 倍标准差）</p></div><strong>{{ selected.ma_signal === 'golden_cross' ? '趋势转强 · 关注' : selected.ma_signal === 'death_cross' ? '趋势转弱 · 控制仓位' : '看价格与通道位置' }}</strong></header><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="价格均线和布林带叠加图"><path class="gridline" d="M0 94H100M0 52H100M0 10H100"/><path class="bollinger-fill" :d="`${overlayPath('bollingerUpper')} L${overlayPoints.length ? '100,94' : '0,94'} L0,94 Z`"/><path class="bollinger" :d="overlayPath('bollingerUpper')"/><path class="bollinger-mid" :d="overlayPath('bollingerMiddle')"/><path class="bollinger" :d="overlayPath('bollingerLower')"/><path class="price" :d="overlayPath('close')"/><path class="ma200" :d="overlayPath('ma200')"/></svg><footer><span class="legend price-dot">收盘</span><span class="legend bollinger-mid-dot">布林中轨</span><span class="legend ma200-dot">MA200</span><span class="legend bollinger-dot">布林上下轨</span></footer></article>
        <article class="chart-card"><header><div><h2>趋势主图</h2><p>收盘价与 50 / 200 日均线</p></div><strong>{{ eventText('ma') }}</strong></header><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="价格和均线趋势图"><rect class="zone zone-green-soft" x="0" y="0" width="100" height="100"/><path class="gridline" d="M0 94H100M0 52H100M0 10H100"/><path class="price" :d="linePath('close')"/><path class="ma50" :d="linePath('ma50')"/><path class="ma200" :d="linePath('ma200')"/></svg><footer><span class="legend price-dot">收盘</span><span class="legend ma50-dot">MA50</span><span class="legend ma200-dot">MA200</span><span class="zone-key green-soft-key">趋势支持</span></footer></article>
        <article class="chart-card"><header><div><h2>RSI(14)</h2><p>超卖区 ≤30 · 超买区 ≥70</p></div><strong>{{ eventText('rsi') }}</strong></header><svg viewBox="0 0 100 100" preserveAspectRatio="none"><rect class="zone zone-green-deep" x="0" y="77.2" width="100" height="16.8"/><rect class="zone zone-green-soft" x="0" y="68.8" width="100" height="8.4"/><rect class="zone zone-red-soft" x="0" y="35.2" width="100" height="8.4"/><rect class="zone zone-red-deep" x="0" y="10" width="100" height="16.8"/><path class="band" d="M0 68.8H100M0 35.2H100"/><path class="rsi" :d="linePath('rsi14', 0, 100)"/></svg><footer><span class="zone-key green-deep-key">深度超卖</span><span class="zone-key green-soft-key">超卖</span><span class="zone-key red-soft-key">超买</span><span class="zone-key red-deep-key">深度超买</span></footer></article>
        <article class="chart-card"><header><div><h2>回撤曲线</h2><p>从近一年高点回落的幅度</p></div><strong>{{ eventText('dd') }}</strong></header><svg viewBox="0 0 100 100" preserveAspectRatio="none"><rect class="zone zone-green-deep" x="0" y="10" width="100" height="42"/><rect class="zone zone-green-soft" x="0" y="52" width="100" height="21"/><rect class="zone zone-red-soft" x="0" y="73" width="100" height="10.5"/><rect class="zone zone-red-deep" x="0" y="83.5" width="100" height="10.5"/><path class="gridline" d="M0 10H100M0 52H100M0 94H100"/><path class="drawdown" :d="linePath('drawdown', -40, 0)"/></svg><footer><span class="zone-key green-deep-key">深度回撤 · 机会区</span><span class="zone-key green-soft-key">正常回撤</span><span class="zone-key red-soft-key">高位</span></footer></article>
      </section>

      <section class="signal-list">
        <header><h2>指标逐项解读</h2><span>四项信号同向时，仓位动作更有把握</span></header>
        <div v-for="(signal, index) in selected?.signals" :key="index" class="signal-row">
          <span class="signal-mark" :class="{ add: /加仓|机会|金叉/.test(signal) }"></span><div><b>{{ signal }}</b><p>结合历史位置观察，等待指标确认后再执行分批动作。</p></div><strong>{{ /加仓|机会|金叉/.test(signal) ? '关注' : '观察' }}</strong>
        </div>
      </section>
      <section v-if="(selected as any).indicator_events?.length" class="event-list">
        <header><h2>历史提示</h2><span>最近出现的关键位置</span></header>
        <div v-for="event in (selected as any).indicator_events.slice(-8).reverse()" :key="`${event.date}-${event.type}`" class="event-row"><time>{{ event.date.replace(/-/g, '.') }}</time><span>{{ event.label }}</span><b>{{ event.type === 'golden_cross' || event.type === 'oversold' || event.type === 'deep_drawdown' ? '机会观察' : '风险提示' }}</b></div>
      </section>      <p class="footnote">指标用于建立纪律，不构成收益承诺。MA 交叉更适合判断趋势，RSI 与回撤更适合寻找分批节奏。</p>
    </template>
  </main>
</template>

<style lang="scss" scoped>
@use '../styles/theme' as *;
.accumulation-page { min-height: 100vh; padding: $space-xl $space-xl 48px; background: #f7f8f6; font-family: $font-sans; color: $text-primary; }
.back-link { display:inline-block; margin-bottom:$space-md; color:$color-info; font-size:$text-sm; text-decoration:none; }
.page-head { display:flex; justify-content:space-between; gap:$space-lg; border-bottom:3px solid $text-primary; padding-bottom:$space-lg; }
.eyebrow { margin:0 0 $space-sm; color:$color-up-dark; font-size:$text-sm; font-weight:$weight-bold; letter-spacing:1px; }
h1 { font-family:$font-serif; font-size:clamp(28px, 8vw, 42px); line-height:1.1; margin:0; }
.dek { color:$text-secondary; margin:$space-md 0 0; line-height:1.6; max-width:480px; }
.as-of { color:$text-tertiary; font-size:$text-sm; white-space:nowrap; padding-top:$space-sm; }
.index-nav { display:flex; gap:0; overflow:auto; border-bottom:1px solid $border; margin-top:$space-lg; }
.index-nav button { border:0; border-bottom:3px solid transparent; background:transparent; padding:$space-md $space-lg; white-space:nowrap; color:$text-tertiary; cursor:pointer; font-weight:$weight-semibold; }
.index-nav button.active { color:$text-primary; border-bottom-color:$color-up; background:#fff; }.index-nav small { display:block; color:$text-disabled; font-size:10px; font-weight:400; margin-top:2px; }
.hero-signal { display:flex; justify-content:space-between; align-items:flex-end; gap:$space-lg; padding:$space-xl; margin-top:$space-lg; border-left:6px solid $color-neutral; background:#fff; }.hero-signal.add { border-color:$color-up; }.hero-signal.wait { border-color:$color-info; }.hero-signal strong { display:block; font-family:$font-serif; font-size:clamp(24px, 7vw, 38px); margin:$space-sm 0; }.hero-signal p { margin:0; color:$text-secondary; line-height:1.5; }.hero-label { color:$text-tertiary; font-size:$text-sm; }.score { text-align:right; white-space:nowrap; }.score b { font-size:42px; font-variant-numeric:tabular-nums; }.score span { color:$text-tertiary; }
.metric-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:1px; background:$border; margin-top:$space-lg; border:1px solid $border; }.metric-grid article { position:relative; background:#fff; padding:$space-lg; min-height:130px; }.metric-grid span,.metric-grid small { display:block; color:$text-secondary; font-size:$text-sm; }.metric-grid b { display:block; font-size:26px; margin:$space-sm 0; font-variant-numeric:tabular-nums; }.metric-grid em { display:inline-block; margin-top:$space-md; padding:2px 6px; background:$bg-muted; color:$text-secondary; font-style:normal; font-size:$text-xs; }.metric-grid em.add { color:$color-up-dark; background:$color-up-light; }.metric-grid em.oversold { color:$color-up-dark; background:$color-up-light; }
.signal-list { margin-top:$space-xl; background:#fff; border-top:3px solid $text-primary; }.signal-list header { display:flex; align-items:baseline; justify-content:space-between; gap:$space-md; padding:$space-lg; border-bottom:1px solid $border; }.signal-list h2 { margin:0; font-family:$font-serif; font-size:$text-xl; }.signal-list header span { color:$text-tertiary; font-size:$text-xs; }.signal-row { display:flex; align-items:center; gap:$space-md; padding:$space-md $space-lg; border-bottom:1px solid $border-light; }.signal-mark { width:9px;height:9px;border-radius:50%;background:$text-disabled; }.signal-mark.add { background:$color-up; }.signal-mark.warn { background:$color-neutral; }.signal-row div { flex:1; }.signal-row b { font-size:$text-md; }.signal-row p { margin:2px 0 0; color:$text-secondary; font-size:$text-sm; }.signal-row strong { color:$text-secondary; font-size:$text-sm; white-space:nowrap; }.footnote { color:$text-tertiary; font-size:$text-xs; line-height:1.6; margin-top:$space-lg; }
.charts { display:grid; grid-template-columns:repeat(2, 1fr); gap:$space-lg; margin-top:$space-xl; }
.chart-card { background:#fff; padding:$space-lg; border-top:3px solid $text-primary; }
.chart-card header { display:flex; justify-content:space-between; gap:$space-md; align-items:flex-start; }
.chart-card h2 { margin:0; font-family:$font-serif; font-size:$text-lg; }
.chart-card header p { color:$text-tertiary; font-size:$text-xs; margin:$space-xs 0 0; }
.chart-card header strong { color:$color-up-dark; font-size:$text-sm; white-space:nowrap; }
.chart-card svg { display:block; width:100%; height:150px; margin-top:$space-lg; }
.gridline,.band { fill:none; stroke:#e8ece9; stroke-width:.7; vector-effect:non-scaling-stroke; }
.band { stroke:#e0b3a9; stroke-dasharray:3 3; }.price,.ma50,.ma200,.rsi,.drawdown { fill:none; stroke-width:2; vector-effect:non-scaling-stroke; stroke-linejoin:round; stroke-linecap:round; }.price { stroke:#1a1a1a; }.ma50 { stroke:#d77b2d; }.ma200 { stroke:#487caa; }.rsi { stroke:#8c4d8f; }.drawdown { stroke:#2eaf7d; }.chart-card footer { display:flex; gap:$space-md; color:$text-tertiary; font-size:$text-xs; margin-top:$space-sm; }.legend::before { content:''; display:inline-block; width:12px; height:2px; vertical-align:middle; margin-right:4px; background:currentColor; }.price-dot { color:#1a1a1a; }.ma50-dot { color:#d77b2d; }.ma200-dot { color:#487caa; }
.zone { stroke:none; }.zone-green-soft { fill:rgba(46,175,125,.10); }.zone-green-deep { fill:rgba(26,122,66,.18); }.zone-red-soft { fill:rgba(232,71,76,.10); }.zone-red-deep { fill:rgba(196,30,58,.18); }.zone-key { display:inline-flex; align-items:center; gap:4px; }.zone-key::before { content:''; width:9px; height:9px; background:currentColor; opacity:.65; }.green-soft-key { color:#2eaf7d; }.green-deep-key { color:#1a7a42; }.red-soft-key { color:#e8474c; }.red-deep-key { color:#c41e3a; }
.chart-wide { grid-column:1 / -1; }.bollinger-fill { fill:rgba(74,144,217,.09); stroke:none; }.bollinger { fill:none; stroke:#4a90d9; stroke-width:1.2; stroke-dasharray:4 3; vector-effect:non-scaling-stroke; }.bollinger-mid { fill:none; stroke:#4a90d9; stroke-width:1.2; vector-effect:non-scaling-stroke; }.bollinger-dot,.bollinger-mid-dot { color:#4a90d9; }
.event-list { margin-top:$space-xl; background:#fff; border-top:3px solid $text-primary; }.event-list header { display:flex; justify-content:space-between; align-items:baseline; padding:$space-lg; border-bottom:1px solid $border; }.event-list h2 { margin:0; font-family:$font-serif; font-size:$text-xl; }.event-list header span { color:$text-tertiary; font-size:$text-xs; }.event-row { display:grid; grid-template-columns:92px 1fr auto; gap:$space-md; align-items:center; padding:$space-md $space-lg; border-bottom:1px solid $border-light; font-size:$text-sm; }.event-row time { color:$text-tertiary; font-variant-numeric:tabular-nums; }.event-row b { color:$color-up-dark; font-size:$text-xs; font-weight:$weight-medium; }.state { text-align:center; padding:$space-3xl 0; color:$text-tertiary; }.state.error { color:$color-down-dark; }
@media (max-width: 560px) { .accumulation-page { padding: $space-lg $space-md 40px; }.page-head { display:block; }.as-of { display:block; margin-top:$space-md; }.metric-grid,.charts { grid-template-columns:1fr; }.metric-grid article { min-height:0; }.hero-signal { padding:$space-lg; }.score b { font-size:32px; } }
</style>


