import { createRouter, createWebHistory } from 'vue-router'
import HomePage from './pages/HomePage.vue'
import ErpPage from './pages/ErpPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/erp',
      name: 'erp',
      component: ErpPage,
    },
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
