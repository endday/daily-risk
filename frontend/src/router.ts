import { createRouter, createWebHistory } from 'vue-router'
import { defineAsyncComponent } from 'vue'
import HomePage from './pages/HomePage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/erp',
      name: 'erp',
      component: defineAsyncComponent(() => import('./pages/ErpPage.vue')),
    },
    {
      path: '/styles',
      redirect: (to) => ({ path: '/trends', query: { ...to.query, view: 'index' } }),
    },
    {
      path: '/industries',
      redirect: (to) => ({ path: '/trends', query: { ...to.query, view: 'industry' } }),
    },
    {
      path: '/:tab(trends|valuation|events|stats)?',
      name: 'home',
      component: HomePage,
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router
