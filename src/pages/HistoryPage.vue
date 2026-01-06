<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { apiFetch } from '../lib/apiClient'
import { statusLabel, type StandupStatus } from '../lib/standup'

type HistoryDay = {
  date: string
  rows: Array<{ userId: string; name: string; status: StandupStatus }>
}

const loading = ref(true)
const error = ref<string | null>(null)
const days = ref<HistoryDay[]>([])

const last10 = computed(() => days.value.slice(0, 10))

onMounted(async () => {
  loading.value = true
  try {
    const res = await apiFetch<{ days: HistoryDay[] }>('/api/standup/history?limit=14', { method: 'GET' })
    days.value = res.days
  } catch (e: any) {
    error.value = e?.body?.error || 'Failed to load'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div v-if="loading" class="card p-6">Loading history…</div>
  <div v-else-if="error" class="card border-rose-200 bg-rose-50 p-6 text-rose-900">{{ error }}</div>

  <div v-else class="space-y-6">
    <div class="card p-6">
      <h1 class="text-2xl font-semibold">History</h1>
      <p class="mt-2 text-sm text-slate-600">Read-only. Recent days first.</p>
    </div>

    <div class="space-y-4">
      <div v-for="d in last10" :key="d.date" class="card p-6">
        <div class="text-sm font-semibold text-slate-900">{{ dayjs(d.date).format('ddd, MMM D YYYY') }}</div>
        <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="r in d.rows" :key="r.userId" class="rounded-2xl border border-slate-900/10 bg-white px-4 py-3 shadow-sm">
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <div class="truncate font-semibold text-slate-900">{{ r.name }}</div>
              </div>
              <span
                class="pill"
                :class="r.status === 'prepared' ? 'pill-green' : r.status === 'partial' ? 'pill-amber' : 'pill-red'"
              >
                <span>{{ r.status === 'prepared' ? '🟢' : r.status === 'partial' ? '🟠' : '🔴' }}</span>
                <span>{{ statusLabel(r.status) }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

