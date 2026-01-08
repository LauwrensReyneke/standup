import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import App from './App.vue'
import { routes } from './router'
import './styles.css'
import './lib/icons'

const router = createRouter({
  history: createWebHistory(),
  routes,
})

createApp(App).component('FontAwesomeIcon', FontAwesomeIcon).use(router).mount('#app')
