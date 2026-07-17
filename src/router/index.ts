import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router'
import { bootstrapAuth, useAuth } from '@/auth/session'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    requiresAuth?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'landing',
      component: () => import('@/pages/LandingPage.vue'),
      meta: { public: true },
    },
    {
      path: '/projects',
      name: 'projects',
      component: () => import('@/pages/ProjectsPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/project/:id',
      name: 'editor',
      component: () => import('@/pages/EditorPage.vue'),
      props: true,
      meta: { requiresAuth: true },
    },
    {
      path: '/job-invite/:token',
      name: 'job-invite',
      component: () => import('@/pages/JobInviteAcceptPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/jobs/:id',
      name: 'job-hub',
      component: () => import('@/pages/JobHubPage.vue'),
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach(async (to: RouteLocationNormalized) => {
  await bootstrapAuth()
  const { isAuthenticated } = useAuth()
  if (to.meta.requiresAuth && !isAuthenticated.value) {
    return { name: 'landing', query: { next: to.fullPath } }
  }
  if (to.name === 'landing' && isAuthenticated.value) {
    const next = typeof to.query.next === 'string' ? to.query.next : '/projects'
    return next.startsWith('/') ? next : '/projects'
  }
  return true
})

export default router
