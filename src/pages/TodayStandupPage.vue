<script setup lang="ts">
import { computed, onMounted, ref, onBeforeUnmount } from 'vue'
import dayjs from 'dayjs'
import { apiFetch, ApiError } from '../lib/apiClient'
import { calcStatus, statusLabel, type StandupStatus } from '../lib/standup'
import RichTextEditor from '../components/RichTextEditor.vue'

type Row = {
  userId: string
  name: string
  yesterday: string
  today: string
  blockers: string
  status: StandupStatus
  overriddenBy?: string
  version?: number
}

type TodayResponse = {
  date: string
  cutoffAt: string
  editable: boolean
  etag: string
  rows: Row[]
  teamName: string
  viewer: { userId: string; role: 'manager' | 'member' }
}

const loading = ref(true)
const error = ref<string | null>(null)
const data = ref<TodayResponse | null>(null)
const saving = ref(false)
const saveError = ref<string | null>(null)

const dateLabel = computed(() => (data.value ? dayjs(data.value.date).format('ddd, MMM D') : ''))

const canEditRow = (row: Row) => {
  if (!data.value?.editable) return false
  if (data.value.viewer.role === 'manager') return true
  return data.value.viewer.userId === row.userId
}

async function load() {
  loading.value = true
  error.value = null
  try {
    data.value = await apiFetch<TodayResponse>('/api/standup?op=today', { method: 'GET' })
  } catch (e: any) {
    error.value = e?.body?.error || 'Failed to load'
  } finally {
    loading.value = false
  }
}

// Tracks rows the user has touched recently so polling can't clobber them.
const dirtyRowUserIds = ref(new Set<string>())

function markDirty(userId: string) {
  dirtyRowUserIds.value.add(userId)
}

function clearDirty(userId: string) {
  dirtyRowUserIds.value.delete(userId)
}

function mergeLatestIntoCurrent(current: TodayResponse, latest: TodayResponse) {
  // Preserve any locally edited rows; otherwise take server rows.
  const latestById = new Map(latest.rows.map((r) => [r.userId, r]))

  const mergedRows = current.rows.map((r) => {
    if (dirtyRowUserIds.value.has(r.userId)) return r
    const fromServer = latestById.get(r.userId)
    return fromServer ? fromServer : r
  })

  // If the server introduced new rows (new team member), add them.
  for (const [userId, row] of latestById) {
    if (!mergedRows.some((x) => x.userId === userId)) mergedRows.push(row)
  }

  // Keep current object identity stable where possible (helps editors).
  current.date = latest.date
  current.cutoffAt = latest.cutoffAt
  current.editable = latest.editable
  current.etag = latest.etag
  current.teamName = latest.teamName
  current.viewer = latest.viewer
  current.rows = mergedRows
}

function updateRow(row: Row, patch: Partial<Pick<Row, 'yesterday' | 'today' | 'blockers'>>): Row {
  markDirty(row.userId)
  const next = { ...row, ...patch }
  next.status = calcStatus(next)
  return next
}

async function save(row: Row) {
  if (!data.value) return
  saving.value = true
  saveError.value = null
  try {
    const isManager = data.value.viewer.role === 'manager'
    const ifMatch = isManager ? data.value.etag : String(row.version ?? 0)

    const next = await apiFetch<TodayResponse>('/api/standup?op=update', {
      method: 'PUT',
      headers: { 'if-match': ifMatch },
      body: JSON.stringify({
        date: data.value.date,
        userId: row.userId,
        yesterday: row.yesterday,
        today: row.today,
        blockers: row.blockers,
      }),
    })

    // Apply server state, but keep the currently edited row stable.
    mergeLatestIntoCurrent(data.value, next)
    clearDirty(row.userId)
  } catch (e: any) {
    if (e instanceof ApiError && e.status === 409) {
      saveError.value = 'This row was updated elsewhere. Please reload and try again.'
    } else {
      saveError.value = e?.body?.error || 'Save failed'
    }
  } finally {
    saving.value = false
  }
}

const sortedRows = computed(() => {
  if (!data.value) return [] as Row[]
  return [...data.value.rows].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))
})

const polling = ref(true)
const focusedRowUserId = ref<string | null>(null)
let pollTimer: number | null = null
let pollIntervalMs = 8000

function isTabVisible() {
  return typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
}

async function pollOnce() {
  if (!polling.value) return
  if (!isTabVisible()) return
  if (saving.value) return
  if (focusedRowUserId.value) return
  if (!data.value) return

  try {
    const latest = await apiFetch<TodayResponse>('/api/standup?op=today', { method: 'GET' })

    if (latest.etag !== data.value.etag) {
      mergeLatestIntoCurrent(data.value, latest)
    }

    // If things are stable, back off a bit (less load).
    pollIntervalMs = Math.min(30000, Math.floor(pollIntervalMs * 1.15))
  } catch {
    // If polling fails, back off more aggressively.
    pollIntervalMs = Math.min(60000, Math.floor(pollIntervalMs * 1.5))
  } finally {
    // Re-schedule dynamically.
    if (pollTimer) window.clearTimeout(pollTimer)
    pollTimer = window.setTimeout(pollOnce, pollIntervalMs)
  }
}

function startPolling() {
  stopPolling()
  pollIntervalMs = 8000
  pollTimer = window.setTimeout(pollOnce, pollIntervalMs)
}

function stopPolling() {
  if (pollTimer) {
    window.clearTimeout(pollTimer)
    pollTimer = null
  }
}

function markFocus(row: Row, isFocused: boolean) {
  if (!canEditRow(row)) return
  focusedRowUserId.value = isFocused ? row.userId : null
  if (!isFocused) {
    // When user stops editing, restart polling with a short delay.
    startPolling()
  } else {
    // Don't poll while editing.
    stopPolling()
  }
}

function onVisibilityChange() {
  if (isTabVisible()) startPolling()
  else stopPolling()
}

onMounted(() => {
  load()
  document.addEventListener('visibilitychange', onVisibilityChange)
  startPolling()
})

onBeforeUnmount(() => {
  stopPolling()
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<template>
  <div v-if="loading" class="card p-6">Loading today…</div>

  <div v-else-if="error" class="card border-rose-200 bg-rose-50 p-6 text-rose-900">
    {{ error }}
  </div>

  <div v-else-if="data" class="space-y-6">
    <div class="card p-6">
      <div class="card-header">
        <div>
          <h1 class="text-2xl font-semibold">Today’s Standup</h1>
          <p class="mt-2 text-sm text-slate-600">
            {{ data.teamName }} · {{ dateLabel }} · Cutoff {{ dayjs(data.cutoffAt).format('HH:mm') }} ·
            <span :class="data.editable ? 'text-emerald-700' : 'text-rose-700'">{{ data.editable ? 'Open' : 'Locked' }}</span>
          </p>
        </div>

        <button class="btn btn-ghost" @click="load">Reload</button>
      </div>

      <div v-if="saveError" class="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        {{ saveError }}
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
              <th class="th w-28"></th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="row in sortedRows" :key="row.userId" class="tr">
              <td class="td">
                <div class="font-semibold text-slate-900">{{ row.name }}</div>
                <div v-if="row.overriddenBy" class="mt-1 text-[11px] font-medium text-amber-700">Overridden by {{ row.overriddenBy }}</div>
              </td>

              <td class="td">
                <RichTextEditor
                  :disabled="!canEditRow(row)"
                  :model-value="row.yesterday"
                  placeholder="Type '-' for a list, '# ' for a heading"
                  @focus="markFocus(row, true)"
                  @blur="markFocus(row, false)"
                  @update:model-value="data.rows[data.rows.findIndex((r) => r.userId === row.userId)] = updateRow(row, { yesterday: $event })"
                />
              </td>

              <td class="td">
                <RichTextEditor
                  :disabled="!canEditRow(row)"
                  :model-value="row.today"
                  placeholder="What's next?"
                  @focus="markFocus(row, true)"
                  @blur="markFocus(row, false)"
                  @update:model-value="data.rows[data.rows.findIndex((r) => r.userId === row.userId)] = updateRow(row, { today: $event })"
                />
              </td>

              <td class="td">
                <RichTextEditor
                  :disabled="!canEditRow(row)"
                  :model-value="row.blockers"
                  placeholder="Blockers (or 'None')"
                  @focus="markFocus(row, true)"
                  @blur="markFocus(row, false)"
                  @update:model-value="data.rows[data.rows.findIndex((r) => r.userId === row.userId)] = updateRow(row, { blockers: $event })"
                />
              </td>

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
                  <span>
                    {{ row.status === 'prepared' ? '🟢' : row.status === 'partial' ? '🟠' : '🔴' }}
                  </span>
                  <span>{{ statusLabel(row.status) }}</span>
                </span>
              </td>

              <td class="td">
                <button
                  :disabled="saving || !canEditRow(row)"
                  class="btn btn-secondary w-full"
                  @click="save(row)"
                >
                  Save
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-5 text-xs text-slate-600">
        Strict rules: 🟢 requires Yesterday, Today, Blockers ("None" ok). After cutoff, edits lock.
      </div>
    </div>
  </div>
</template>

