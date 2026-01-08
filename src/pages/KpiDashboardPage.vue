<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { apiFetch } from '../lib/apiClient'

type TeamKpi = {
  teamName: string
  teamCompliancePercent: number
  users: Array<{
    userId: string
    name: string
    prepared: number
    partial: number
    missing: number
    weeklyAveragePercent: number
    missingStreak: number
  }>
}

const loading = ref(true)
const error = ref<string | null>(null)
const data = ref<TeamKpi | null>(null)

const sortedUsers = computed(() => {
  if (!data.value) return []
  return [...data.value.users].sort((a, b) => b.weeklyAveragePercent - a.weeklyAveragePercent)
})

onMounted(async () => {
  loading.value = true
  try {
    data.value = await apiFetch('/api/kpi?op=team', { method: 'GET' })
  } catch (e: any) {
    error.value = e?.body?.error || 'Failed to load'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div v-if="loading" class="card p-6">Loading KPIs…</div>
  <div v-else-if="error" class="card border-rose-200 bg-rose-50 p-6 text-rose-900">{{ error }}</div>

  <div v-else-if="data" class="space-y-6">
    <div class="card p-6">
      <div class="card-header">
        <div>
          <h1 class="text-2xl font-semibold">KPI Dashboard</h1>
          <p class="mt-2 text-sm text-slate-600">{{ data.teamName }}</p>
        </div>
      </div>

      <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="metric">
          <div class="metric-label">Team compliance</div>
          <div class="metric-value">{{ data.teamCompliancePercent.toFixed(0) }}%</div>
        </div>
        <div class="metric">
          <div class="metric-label">People</div>
          <div class="metric-value">{{ data.users.length }}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Top weekly avg</div>
          <div class="metric-value">{{ sortedUsers[0] ? sortedUsers[0].weeklyAveragePercent.toFixed(0) + '%' : '—' }}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Worst streak</div>
          <div class="metric-value">{{ Math.max(0, ...sortedUsers.map(u => u.missingStreak)) }}</div>
        </div>
      </div>
    </div>

    <div class="card p-0">
      <div class="table-wrap border-0 shadow-none ring-0 overflow-x-auto">
        <table class="table">
          <thead class="thead">
            <tr>
              <th class="th">Person</th>
              <th class="th text-right">Weekly avg</th>
              <th class="th text-right">
                <span class="inline-flex items-center gap-2"><span class="dot dot-green"></span>Prepared</span>
              </th>
              <th class="th text-right">
                <span class="inline-flex items-center gap-2"><span class="dot dot-amber"></span>Partial</span>
              </th>
              <th class="th text-right">
                <span class="inline-flex items-center gap-2"><span class="dot dot-red"></span>Missing</span>
              </th>
              <th class="th text-right">Missing streak</th>
            </tr>
          </thead>
          <tbody class="tbody-hover">
            <tr v-for="u in sortedUsers" :key="u.userId" class="tr">
              <td class="td font-semibold">
                <div class="min-w-0">
                  <div class="truncate">{{ u.name }}</div>
                </div>
              </td>
              <td class="td text-right text-slate-600 tabular-nums">{{ u.weeklyAveragePercent.toFixed(0) }}%</td>
              <td class="td text-right text-slate-600 tabular-nums">{{ u.prepared }}</td>
              <td class="td text-right text-slate-600 tabular-nums">{{ u.partial }}</td>
              <td class="td text-right text-slate-600 tabular-nums">{{ u.missing }}</td>
              <td class="td text-right tabular-nums">
                <span
                  class="pill"
                  :class="u.missingStreak === 0 ? 'pill-green' : u.missingStreak <= 2 ? 'pill-amber' : 'pill-red'"
                >
                  {{ u.missingStreak }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <p class="text-xs text-slate-600">
      Scoring: 🟢 = 100, 🟠 = 50, 🔴 = 0. “Weekly avg” is computed over each user’s last 7 submitted standups (from the last 30 days).
    </p>
  </div>
</template>

