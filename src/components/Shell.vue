<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getSession, logout, type SessionUser } from '../lib/auth'
import { ApiError } from '../lib/apiClient'

const user = ref<SessionUser | null>(null)
const loading = ref(true)
const fatal = ref<string | null>(null)
const route = useRoute()
const router = useRouter()

const showBackendHint = computed(() => {
  // Only show this on non-public pages; public login page can still work without session.
  const publicRoutes = new Set(['/login', '/login/verify'])
  return !!fatal.value && !publicRoutes.has(route.path)
})

async function refresh() {
  loading.value = true
  fatal.value = null

  try {
    const { user: u } = await getSession()
    user.value = u

    const publicRoutes = new Set(['/login', '/login/verify'])
    if (!u && !publicRoutes.has(route.path)) await router.replace('/login')
    if (u && publicRoutes.has(route.path)) await router.replace('/today')
  } catch (e: any) {
    // Dev ergonomics: if the backend isn't running (proxy error) or returns 5xx,
    // don't crash the whole app.
    if (e instanceof ApiError) {
      fatal.value =
        typeof (e.body as any)?.error === 'string'
          ? (e.body as any).error
          : `Backend error (${e.status}). Is your API server running?`
    } else {
      fatal.value = 'Backend unreachable. Start `vercel dev --listen 3000` (or set VITE_API_TARGET).'
    }
    user.value = null
  } finally {
    loading.value = false
  }
}

onMounted(refresh)

async function doLogout() {
  await logout()
  await refresh()
}
</script>

<template>
  <div class="min-h-dvh">
    <header class="sticky top-0 z-10 border-b border-slate-900/10 bg-white/60 backdrop-blur-xl">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-2xl bg-white/70 shadow-sm ring-1 ring-slate-900/10"></div>
          <div>
            <div class="text-sm font-semibold tracking-tight text-slate-900">STRICT Standups</div>
            <div class="text-xs text-slate-500">Manager-first written accountability</div>
          </div>
        </div>

        <nav class="flex items-center gap-2 text-sm">
          <RouterLink class="rounded-xl px-3 py-2 text-slate-600 hover:bg-slate-900/5 hover:text-slate-900" to="/today">Today</RouterLink>
          <RouterLink class="rounded-xl px-3 py-2 text-slate-600 hover:bg-slate-900/5 hover:text-slate-900" to="/history">History</RouterLink>
          <RouterLink class="rounded-xl px-3 py-2 text-slate-600 hover:bg-slate-900/5 hover:text-slate-900" to="/kpi">KPIs</RouterLink>
          <RouterLink
            v-if="user?.role === 'manager'"
            class="rounded-xl px-3 py-2 text-slate-600 hover:bg-slate-900/5 hover:text-slate-900"
            to="/manager"
            >Manager</RouterLink
          >
        </nav>

        <div class="flex items-center gap-3">
          <div v-if="user" class="text-right">
            <div class="text-xs text-slate-700">{{ user.name }}</div>
            <div class="text-[11px] text-slate-500">{{ user.email }}</div>
          </div>
          <button
            v-if="user"
            class="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white shadow-sm hover:bg-slate-800"
            @click="doLogout"
          >
            Logout
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-6 py-8">
      <div
        v-if="showBackendHint"
        class="rounded-2xl border border-amber-500/20 bg-white/60 p-6 text-sm text-slate-800 shadow-sm ring-1 ring-slate-900/10 backdrop-blur-xl"
      >
        <div class="font-semibold">Backend not reachable</div>
        <div class="mt-2 text-slate-600">{{ fatal }}</div>
        <div class="mt-4 rounded-2xl bg-slate-900/5 p-4 text-xs text-slate-600">
          Local dev expects a functions server. Start:
          <div class="mt-2 font-mono text-slate-800">vercel dev --listen 3000</div>
          Or set <span class="font-mono text-slate-800">VITE_API_TARGET</span> to your backend URL.
        </div>

        <button class="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-sm hover:bg-slate-800" @click="refresh">
          Retry
        </button>
      </div>

      <div
        v-else-if="loading"
        class="rounded-2xl border border-slate-900/10 bg-white/60 p-6 text-slate-700 shadow-sm ring-1 ring-slate-900/10 backdrop-blur-xl"
      >
        Loading…
      </div>
      <slot v-else />
    </main>
  </div>
</template>

