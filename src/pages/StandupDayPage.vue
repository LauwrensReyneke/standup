<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { apiFetch } from '../lib/apiClient'
import { statusLabel, type StandupStatus } from '../lib/standup'

type Row = {
  userId: string
  name: string
  yesterday: string
  today: string
  blockers: string
  status: StandupStatus
  overriddenBy?: string
}

type DayResponse = {
  date: string
  cutoffAt: string
  editable: false
  etag: string
  rows: Row[]
  teamName: string
  viewer: { userId: string; role: 'manager' | 'member' }
}

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const error = ref<string | null>(null)
const data = ref<DayResponse | null>(null)

const dateParam = computed(() => String(route.params.date || ''))
const dateLabel = computed(() => (data.value ? dayjs(data.value.date).format('ddd, MMM D YYYY') : ''))

async function load() {
  loading.value = true
  error.value = null
  data.value = null

  try {
    const date = dateParam.value
    const res = await apiFetch<DayResponse>(`/api/standup/day?date=${encodeURIComponent(date)}`, { method: 'GET' })
    data.value = res
  } catch (e: any) {
    error.value = e?.body?.error || 'Failed to load'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div v-if="loading" class="card p-6">Loading standup • {{ dateParam }}</div>

  <div v-else-if="error" class="card border-rose-200 bg-rose-50 p-6 text-rose-900">
    <div class="font-semibold">Couldn't load this day</div>
    <div class="mt-2">{{ error }}</div>
    <div class="mt-4 flex gap-2">
      <button class="btn btn-ghost" @click="router.push('/history')">Back to History</button>
      <button class="btn btn-secondary" @click="load">Retry</button>
    </div>
  </div>

  <div v-else-if="data" class="space-y-6">
    <div class="card p-6">
      <div class="card-header">
        <div>
          <h1 class="text-2xl font-semibold">Standup » {{ dateLabel }}</h1>
          <p class="mt-2 text-sm text-slate-600">{{ data.teamName }} • Read-only snapshot</p>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-ghost" @click="load">Reload</button>
          <button class="btn btn-ghost" @click="router.push('/history')">Back</button>
        </div>
      </div>

      <div class="mt-6 table-wrap">
        <table class="table table-fixed">
          <thead class="thead">
            <tr>
              <th class="th w-44">Name</th>
              <th class="th">Yesterday</th>
              <th class="th">Today</th>
              <th class="th">Blockers</th>
              <th class="th w-44">Status</th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="row in data.rows" :key="row.userId" class="tr">
              <td class="td">
                <div class="font-semibold text-slate-900">{{ row.name }}</div>
                <div v-if="row.overriddenBy" class="mt-1 text-[11px] font-medium text-amber-700">Overridden by {{ row.overriddenBy }}</div>
              </td>
              <td class="td"><div class="whitespace-pre-wrap text-sm text-slate-800">{{ row.yesterday || '—' }}</div></td>
              <td class="td"><div class="whitespace-pre-wrap text-sm text-slate-800">{{ row.today || '—' }}</div></td>
              <td class="td"><div class="whitespace-pre-wrap text-sm text-slate-800">{{ row.blockers || '—' }}</div></td>
              <td class="td">
                <span
                  class="pill"
                  :class="
                    row.status === 'prepared'
                      ? 'pill-green'
                      : row.status === 'partial'
                        ? 'pill-amber'
                        : 'pill-red'
                  "
                >
                  <span>{{ row.status === 'prepared' ? '🟢' : row.status === 'partial' ? '🟠' : '🔴' }}</span>
                  <span>{{ statusLabel(row.status) }}</span>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
