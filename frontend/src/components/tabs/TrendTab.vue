<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import IndustryTab from './IndustryTab.vue'
import StyleTab from './StyleTab.vue'

type TrendView = 'index' | 'industry'

const route = useRoute()
const router = useRouter()
const activeView = computed<TrendView>(() => route.query.view === 'industry' ? 'industry' : 'index')

function selectView(view: TrendView) {
  if (view === activeView.value) return
  void router.replace({
    path: '/trends',
    query: { ...route.query, view },
  })
}
</script>

<template>
  <section class="trend-shell">
    <nav class="trend-tabs" aria-label="趋势分类">
      <button
        type="button"
        :class="{ active: activeView === 'index' }"
        :aria-selected="activeView === 'index'"
        role="tab"
        @click="selectView('index')"
      >
        <span>指数</span>
      </button>
      <button
        type="button"
        :class="{ active: activeView === 'industry' }"
        :aria-selected="activeView === 'industry'"
        role="tab"
        @click="selectView('industry')"
      >
        <span>行业</span>
      </button>
    </nav>

    <StyleTab v-if="activeView === 'index'" />
    <IndustryTab v-else />
  </section>
</template>

<style lang="scss" scoped>
@use '../../styles/theme' as *;

.trend-shell {
  width: 100%;
  min-width: 0;
  max-width: 1080px;
  margin: 0 auto;
}

.trend-shell :deep(.style-page),
.trend-shell :deep(.rotation-page) {
  width: 100%;
  min-width: 0;
  padding-top: $space-lg;
  padding-bottom: $space-xl;
}

.trend-tabs {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  max-width: 1080px;
  border-bottom: 1px solid $border;
  background: $bg-page;
}

.trend-tabs button {
  position: relative;
  display: flex;
  align-items: baseline;
  justify-content: center;
  min-width: 0;
  min-height: 42px;
  line-height: 42px;
  padding: 0 $space-lg;
  border: 0;
  border-right: 1px solid $border;
  background: transparent;
  color: $text-tertiary;
  cursor: pointer;
  font-family: $font-sans;
}

.trend-tabs button:last-child { border-right: 0; }

.trend-tabs button::after {
  content: '';
  position: absolute;
  right: $space-lg;
  bottom: -1px;
  left: $space-lg;
  height: 3px;
  background: $text-primary;
  transform: scaleX(0);
  transform-origin: center;
  transition: transform $duration-fast $ease-out;
}

.trend-tabs button.active {
  color: $text-primary;
}

.trend-tabs button.active::after { transform: scaleX(1); }
.trend-tabs span { font-size: $text-md; font-weight: $weight-semibold; }

@media (max-width: 640px) {
  .trend-tabs button { min-height: 30px; line-height: 30px; padding: 0 $space-sm; }
  .trend-tabs button::after { right: $space-md; left: $space-md; }
  .trend-tabs span { font-size: $text-sm; }
  .trend-shell :deep(.style-page),
  .trend-shell :deep(.rotation-page) { padding-top: $space-md; padding-bottom: $space-xl; }
}
</style>
