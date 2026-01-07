<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { verifyMagicLink } from '../lib/auth'

const route = useRoute()
const router = useRouter()

const token = computed(() => String(route.query.token || ''))
const error = ref<string | null>(null)
const verifying = ref(true)

onMounted(async () => {
  verifying.value = true
  if (!token.value) {
    error.value = 'Missing token'
    verifying.value = false
    return
  }
  try {
    await verifyMagicLink(token.value)
    await router.replace('/today')
  } catch (e: any) {
    error.value = e?.body?.error || 'Verification failed'
  } finally {
    verifying.value = false
  }
})
</script>

<template>
  <div class="mx-auto max-w-md">
    <div class="rounded-2xl border border-slate-900/10 bg-white/60 p-8 shadow-sm ring-1 ring-slate-900/10 backdrop-blur-xl">
      <h1 class="text-2xl font-semibold tracking-tight text-slate-900">
        {{ verifying ? 'Verifying…' : error ? 'Link not valid' : 'Verified' }}
      </h1>
      <p class="mt-2 text-sm text-slate-600">
        {{ verifying ? 'One moment while we sign you in.' : 'Magic links expire quickly for security.' }}
      </p>

      <div v-if="error" class="mt-6 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-800">
        {{ error }}
      </div>

      <div class="mt-6 flex flex-col gap-3">
        <RouterLink
          v-if="error"
          to="/login"
          class="w-full rounded-2xl bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
        >
          Request a new link
        </RouterLink>

        <RouterLink
          to="/login"
          class="w-full rounded-2xl border border-slate-900/10 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
        >
          Back to sign in
        </RouterLink>
      </div>

      <p class="mt-6 text-xs text-slate-500">
        If this keeps happening, request a new link and open it quickly (or check your device clock).
      </p>
    </div>
  </div>
</template>

