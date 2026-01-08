import type { RouteRecordRaw } from 'vue-router'
import LoginPage from './pages/LoginPage.vue'
import TodayStandupPage from './pages/TodayStandupPage.vue'
import ManagerDashboardPage from './pages/ManagerDashboardPage.vue'
import KpiDashboardPage from './pages/KpiDashboardPage.vue'
import HistoryPage from './pages/HistoryPage.vue'
import VerifyPage from './pages/VerifyPage.vue'
import StandupDayPage from './pages/StandupDayPage.vue'

export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/today' },
  { path: '/login', component: LoginPage },
  { path: '/login/verify', component: VerifyPage },
  { path: '/today', component: TodayStandupPage },
  { path: '/manager', component: ManagerDashboardPage },
  { path: '/kpi', component: KpiDashboardPage },
  { path: '/history', component: HistoryPage },
  { path: '/history/:date', component: StandupDayPage },
]
