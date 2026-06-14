import { createRouter, createWebHistory } from 'vue-router'
import HomePage from './pages/HomePage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/:tab(events|stats)?',
      name: 'home',
      component: HomePage,
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router
