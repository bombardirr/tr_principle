import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'projects',
      component: () => import('@/pages/ProjectsPage.vue'),
    },
    {
      path: '/project/:id',
      name: 'editor',
      component: () => import('@/pages/EditorPage.vue'),
      props: true,
    },
  ],
})

export default router
