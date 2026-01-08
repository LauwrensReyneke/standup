import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import App from './App.vue'
import { routes } from './router'
import './styles.css'
import './lib/icons'
import { refreshSession, sessionUser } from './lib/session'

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Ensure we have session/role info early and protect manager routes.
let hydrated = false
router.beforeEach(async (to) => {
  if (!hydrated) {
    hydrated = true
    try {
      await refreshSession()
    } catch {
      // ignore; Shell will show backend hint if needed
    }
  }

  if (to.path === '/manager') {
    if (!sessionUser.value) return '/login'
    if (sessionUser.value.role !== 'manager') return '/today'
  }
})

createApp(App).component('FontAwesomeIcon', FontAwesomeIcon).use(router).mount('#app')
