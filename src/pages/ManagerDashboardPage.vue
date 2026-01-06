<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { apiFetch } from '../lib/apiClient'

type TeamConfig = {
  teamId: string
  teamName: string
  standupCutoffTime: string
  members: Array<{ userId: string; name: string; email: string; role: 'manager' | 'member' }>
}

const loading = ref(true)
const error = ref<string | null>(null)
const data = ref<TeamConfig | null>(null)

const newMemberEmail = ref('')
const newMemberName = ref('')

async function load() {
  loading.value = true
  error.value = null
  try {
    data.value = await apiFetch('/api/manager/team', { method: 'GET' })
  } catch (e: any) {
    error.value = e?.body?.error || 'Failed to load'
  } finally {
    loading.value = false
  }
}

async function setCutoff(time: string) {
  data.value = await apiFetch('/api/manager/cutoff', {
    method: 'PUT',
    body: JSON.stringify({ standupCutoffTime: time }),
  })
}

async function addMember() {
  data.value = await apiFetch('/api/manager/team', {
    method: 'POST',
    body: JSON.stringify({ email: newMemberEmail.value, name: newMemberName.value }),
  })
  newMemberEmail.value = ''
  newMemberName.value = ''
}

async function removeMember(userId: string) {
  data.value = await apiFetch('/api/manager/team', {
    method: 'DELETE',
    body: JSON.stringify({ userId }),
  })
}

onMounted(load)
</script>

<template>
  <div v-if="loading" class="card p-6">Loading manager…</div>
  <div v-else-if="error" class="card border-rose-200 bg-rose-50 p-6 text-rose-900">{{ error }}</div>

  <div v-else-if="data" class="space-y-6">
    <div class="card p-6">
      <h1 class="text-2xl font-semibold">Manager Dashboard</h1>
      <p class="mt-2 text-sm text-slate-600">Lock the table structure by controlling membership and cutoff time.</p>
    </div>

    <div class="grid gap-6 md:grid-cols-2">
      <div class="card p-6">
        <h2 class="text-sm font-semibold text-slate-900">Standup cutoff time</h2>
        <p class="mt-1 text-xs text-slate-600">After this time, edits are locked for everyone.</p>

        <input
          :value="data.standupCutoffTime"
          type="time"
          class="input mt-4"
          @change="setCutoff(($event.target as HTMLInputElement).value)"
        />
      </div>

      <div class="card p-6">
        <h2 class="text-sm font-semibold text-slate-900">Add team member</h2>
        <div class="mt-4 grid gap-3">
          <input v-model="newMemberName" placeholder="Full name" class="input" />
          <input v-model="newMemberEmail" type="email" placeholder="Email" class="input" />
          <button class="btn btn-primary" @click="addMember">Add</button>
        </div>
      </div>
    </div>

    <div class="card p-6">
      <h2 class="text-sm font-semibold text-slate-900">Team members</h2>
      <div class="mt-4 table-wrap">
        <table class="table">
          <thead class="thead">
            <tr>
              <th class="th">Name</th>
              <th class="th">Email</th>
              <th class="th">Role</th>
              <th class="th"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in data.members" :key="m.userId" class="tr">
              <td class="td font-semibold">{{ m.name }}</td>
              <td class="td text-slate-600">{{ m.email }}</td>
              <td class="td text-slate-600">{{ m.role }}</td>
              <td class="td">
                <button class="btn btn-ghost px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50" @click="removeMember(m.userId)">
                  Remove
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

