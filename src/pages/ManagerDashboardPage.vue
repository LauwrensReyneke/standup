<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { apiFetch } from '../lib/apiClient'

type TeamSummary = { id: string; name: string; standupCutoffTime: string; memberCount: number; teamCode: string | null }

type TeamMembersResponse = {
  teamId: string
  teamName: string
  standupCutoffTime: string
  members: Array<{ userId: string; name: string; email: string; role: 'manager' | 'member' }>
}

type TeamsResponse = { activeTeamId: string; teams: TeamSummary[] }

const loading = ref(true)
const error = ref<string | null>(null)

const teams = ref<TeamSummary[]>([])
const activeTeamId = ref<string>('')

const teamConfig = ref<TeamMembersResponse | null>(null)

const editingTeamName = ref('')
const creatingTeamName = ref('')
const creatingTeamCutoff = ref('09:30')

const newMemberEmail = ref('')
const newMemberName = ref('')
const newMemberRole = ref<'manager' | 'member'>('member')

const savingUserId = ref<string | null>(null)

const subscribeTeamCode = ref('')

const activeTeam = computed(() => teams.value.find((t) => t.id === activeTeamId.value) || null)

async function loadTeams() {
  const res = await apiFetch('/api/manager/teams', { method: 'GET' })
  const data = res as TeamsResponse
  teams.value = data.teams
  activeTeamId.value = data.activeTeamId
}

async function loadTeamMembers() {
  teamConfig.value = await apiFetch('/api/manager/team-members', { method: 'GET' })
  if (teamConfig.value) editingTeamName.value = teamConfig.value.teamName
}

async function loadAll() {
  loading.value = true
  error.value = null
  try {
    await loadTeams()
    await loadTeamMembers()
  } catch (e: any) {
    error.value = e?.body?.error || 'Failed to load'
  } finally {
    loading.value = false
  }
}

async function selectTeam(teamId: string) {
  if (!teamId) return
  loading.value = true
  error.value = null
  try {
    await apiFetch('/api/teams/select', { method: 'POST', body: JSON.stringify({ teamId }) })
    activeTeamId.value = teamId
    await loadTeams()
    await loadTeamMembers()
  } catch (e: any) {
    error.value = e?.body?.error || 'Failed to switch team'
  } finally {
    loading.value = false
  }
}

async function createTeam() {
  if (!creatingTeamName.value.trim()) return
  loading.value = true
  error.value = null
  try {
    const res = (await apiFetch('/api/manager/teams', {
      method: 'POST',
      body: JSON.stringify({ name: creatingTeamName.value.trim(), standupCutoffTime: creatingTeamCutoff.value }),
    })) as TeamsResponse

    teams.value = res.teams
    activeTeamId.value = res.activeTeamId

    creatingTeamName.value = ''
    await loadTeamMembers()
  } catch (e: any) {
    error.value = e?.body?.error || 'Failed to create team'
  } finally {
    loading.value = false
  }
}

async function setTeamName(name: string) {
  if (!teamConfig.value) return
  editingTeamName.value = name
  teamConfig.value = await apiFetch('/api/manager/team', {
    method: 'PUT',
    body: JSON.stringify({ teamName: name }),
  })
  editingTeamName.value = teamConfig.value.teamName
  // team list might need refresh
  await loadTeams()
}

async function setCutoff(time: string) {
  teamConfig.value = await apiFetch('/api/manager/team', {
    method: 'PUT',
    body: JSON.stringify({ standupCutoffTime: time }),
  })
  await loadTeams()
}

async function addMember() {
  teamConfig.value = await apiFetch('/api/manager/team-members', {
    method: 'POST',
    body: JSON.stringify({ email: newMemberEmail.value, name: newMemberName.value, role: newMemberRole.value }),
  })
  newMemberEmail.value = ''
  newMemberName.value = ''
  newMemberRole.value = 'member'
  await loadTeams()
}

async function removeMember(userId: string) {
  teamConfig.value = await apiFetch('/api/manager/team-members', {
    method: 'DELETE',
    body: JSON.stringify({ userId }),
  })
  await loadTeams()
}

async function setRole(userId: string, role: 'manager' | 'member') {
  teamConfig.value = await apiFetch('/api/manager/team-members', {
    method: 'PUT',
    body: JSON.stringify({ userId, role }),
  })
}

async function saveUser(userId: string, patch: { name?: string; email?: string }) {
  savingUserId.value = userId
  try {
    await apiFetch('/api/manager/users', {
      method: 'PATCH',
      body: JSON.stringify({ userId, ...patch }),
    })
    // Reload members so we display canonical data
    await loadTeamMembers()
  } finally {
    savingUserId.value = null
  }
}

async function subscribeToTeam() {
  if (!subscribeTeamCode.value.trim()) return
  loading.value = true
  error.value = null
  try {
    const res = (await apiFetch('/api/manager/subscribe', {
      method: 'POST',
      body: JSON.stringify({ teamCode: subscribeTeamCode.value.trim() }),
    })) as TeamsResponse

    teams.value = res.teams
    activeTeamId.value = res.activeTeamId
    subscribeTeamCode.value = ''
    await loadTeamMembers()
  } catch (e: any) {
    error.value = e?.body?.error || 'Failed to subscribe'
  } finally {
    loading.value = false
  }
}

onMounted(loadAll)
</script>

<template>
  <div v-if="loading" class="card p-6">Loading manager…</div>
  <div v-else-if="error" class="card border-rose-200 bg-rose-50 p-6 text-rose-900">{{ error }}</div>

  <div v-else class="space-y-6">
    <div class="card p-6">
      <h1 class="text-2xl font-semibold">Manager Dashboard</h1>
      <p class="mt-2 text-sm text-slate-600">Manage teams, memberships, and user roles.</p>

      <div class="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <label class="text-xs font-semibold text-slate-700">Active team</label>
          <select class="input mt-2" :value="activeTeamId" @change="selectTeam(($event.target as HTMLSelectElement).value)">
            <option v-for="t in teams" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
          <p v-if="activeTeam" class="mt-2 text-xs text-slate-500">
            {{ activeTeam.memberCount }} members · Cutoff {{ activeTeam.standupCutoffTime }}
          </p>
        </div>

        <div>
          <label class="text-xs font-semibold text-slate-700">Create new team</label>
          <div class="mt-2 grid gap-2">
            <input v-model="creatingTeamName" class="input" placeholder="Team name" />
            <div class="flex gap-2">
              <input v-model="creatingTeamCutoff" type="time" class="input" />
              <button class="btn btn-primary" @click="createTeam">Create</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="teamConfig" class="card p-6">
      <h2 class="text-sm font-semibold text-slate-900">Team settings</h2>

      <div class="mt-4">
        <label class="text-xs font-semibold text-slate-700">Team name</label>
        <div class="mt-2 flex gap-2">
          <input v-model="editingTeamName" class="input" placeholder="Team name" />
          <button class="btn btn-primary" @click="setTeamName(editingTeamName)">Save</button>
        </div>
      </div>

      <div class="mt-4">
        <label class="text-xs font-semibold text-slate-700">Standup cutoff time</label>
        <input
          :value="teamConfig.standupCutoffTime"
          type="time"
          class="input mt-2"
          @change="setCutoff(($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <div class="grid gap-6 md:grid-cols-2">
      <div class="card p-6">
        <h2 class="text-sm font-semibold text-slate-900">Add team member</h2>
        <div class="mt-4 grid gap-3">
          <input v-model="newMemberName" placeholder="Full name" class="input" />
          <input v-model="newMemberEmail" type="email" placeholder="Email" class="input" />
          <select v-model="newMemberRole" class="input">
            <option value="member">Member</option>
            <option value="manager">Manager</option>
          </select>
          <button class="btn btn-primary" @click="addMember">Add</button>
        </div>
      </div>

      <div class="card p-6">
        <h2 class="text-sm font-semibold text-slate-900">Quick actions</h2>
        <p class="mt-2 text-xs text-slate-600">Edits apply to the active team unless stated otherwise.</p>
      </div>
    </div>

    <div v-if="teamConfig" class="card p-6">
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
            <tr v-for="m in teamConfig.members" :key="m.userId" class="tr">
              <td class="td">
                <input
                  class="input"
                  :value="m.name"
                  @change="saveUser(m.userId, { name: ($event.target as HTMLInputElement).value })"
                />
              </td>
              <td class="td">
                <input
                  class="input"
                  type="email"
                  :value="m.email"
                  @change="saveUser(m.userId, { email: ($event.target as HTMLInputElement).value })"
                />
              </td>
              <td class="td">
                <select class="input" :value="m.role" @change="setRole(m.userId, ($event.target as HTMLSelectElement).value as any)">
                  <option value="member">member</option>
                  <option value="manager">manager</option>
                </select>
              </td>
              <td class="td">
                <button
                  class="btn btn-ghost px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50"
                  :disabled="savingUserId === m.userId"
                  @click="removeMember(m.userId)"
                >
                  Remove
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="activeTeam?.teamCode" class="card p-6">
      <h2 class="text-sm font-semibold text-slate-900">Team share code</h2>
      <p class="mt-2 text-xs text-slate-600">Share this code with another manager so they can subscribe to this team.</p>
      <div class="mt-3 flex items-center gap-2">
        <input class="input" :value="activeTeam.teamCode" readonly />
      </div>
    </div>

    <div v-if="teamConfig" class="card p-6">
      <h2 class="text-sm font-semibold text-slate-900">Subscribe to existing team</h2>
      <div class="mt-4">
        <label class="text-xs font-semibold text-slate-700">By team code</label>
        <div class="mt-2 flex gap-2">
          <input v-model="subscribeTeamCode" class="input" placeholder="Team code" />
          <button class="btn btn-primary" @click="subscribeToTeam">Subscribe</button>
        </div>
        <p class="mt-2 text-xs text-slate-500">Teams are manager-created only. Ask another manager for their team code.</p>
      </div>
    </div>
  </div>
</template>

