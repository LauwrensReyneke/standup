<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { verifyMagicLink } from '../lib/auth'

const route = useRoute()
const router = useRouter()

const token = computed(() => String(route.query.token || ''))
const error = ref<string | null>(null)

onMounted(async () => {
  if (!token.value) {
    error.value = 'Missing token'
    return
  }
  try {
    await verifyMagicLink(token.value)
    await router.replace('/today')
  } catch (e: any) {
    error.value = e?.body?.error || 'Verification failed'
  }
})
</script>

<template>
  <div class="mx-auto max-w-md">
    <div class="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-sm">
      <h1 class="text-xl font-semibold tracking-tight">Verifying…</h1>
      <p class="mt-2 text-sm text-slate-400">One moment.</p>

      <div v-if="error" class="mt-6 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
        {{ error }}
      </div>
    </div>
  </div>
</template>

