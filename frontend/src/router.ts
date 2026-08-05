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
      path: '/temperature/:dimensionKey',
      name: 'temperature-dimension',
      component: defineAsyncComponent(() => import('./pages/TemperatureDimensionPage.vue')),
    },
    {
      path: '/temperature',
      name: 'temperature',
      redirect: '/temperature/advance_decline',
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
      path: '/valuation',
      redirect: (to) => ({ path: '/trends', query: { ...to.query, view: 'valuation' } }),
    },
    {
      path: '/:tab(trends|events|stats)?',
      name: 'home',
      component: HomePage,
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router
