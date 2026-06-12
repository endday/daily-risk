<script setup lang="ts">
import IndexPage from './pages/Index.vue'
</script>

<template>
  <div id="app">
    <IndexPage />
  </div>
</template>

<style>
@import './styles/variables.css';

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  -webkit-text-size-adjust: 100%;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: var(--font-sans);
  font-size: var(--text-md);
  line-height: var(--leading-normal);
  background-color: var(--bg-page);
  color: var(--text-primary);
}

#app {
  max-width: 600px;
  margin: 0 auto;
}

/* 通用过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--duration-normal) var(--ease-out);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-up-enter-active {
  transition: all var(--duration-normal) var(--ease-out);
}
.slide-up-leave-active {
  transition: all var(--duration-fast) var(--ease-in-out);
}
.slide-up-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
