import { createRouter, createWebHistory } from 'vue-router'
import DefaultLayout from '@/layouts/default.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: DefaultLayout,
      children: [
        {
          path: '',
          name: 'home',
          component: () => import('@/pages/index.vue'),
        },
      ],
    },
  ],
})

export default router

