import { createRouter, createWebHistory } from 'vue-router'
import HomePage from './pages/HomePage.vue'

const DetailPage = () => import('./pages/DetailPage.vue')

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomePage,
    },
    {
      path: '/detail/:date?',
      name: 'detail',
      component: DetailPage,
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router
