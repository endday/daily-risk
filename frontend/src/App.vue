<script setup lang="ts">
import IndexPage from './pages/Index.vue'
</script>

<template>
  <div id="app">
    <IndexPage />
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background-color: #f5f5f5;
  color: #333;
}

#app {
  max-width: 600px;
  margin: 0 auto;
}
</style>
