<script setup lang="ts">
import { ref } from 'vue'
import { requestMagicLink } from '../lib/auth'

const email = ref('')
const sent = ref(false)
const error = ref<string | null>(null)
const loading = ref(false)

async function submit() {
  error.value = null
  loading.value = true
  try {
    await requestMagicLink(email.value)
    sent.value = true
  } catch (e: any) {
    error.value = e?.body?.error || 'Failed to send link'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-md">
    <div class="rounded-2xl border border-slate-900/10 bg-white/60 p-8 shadow-sm ring-1 ring-slate-900/10 backdrop-blur-xl">
      <h1 class="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h1>
      <p class="mt-2 text-sm text-slate-600">Email + magic link. No passwords.</p>

      <div
        v-if="sent"
        class="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-800"
      >
        Magic link sent. Check your inbox.
      </div>

      <form v-else class="mt-6 space-y-4" @submit.prevent="submit">
        <div>
          <label class="text-sm font-medium text-slate-700">Work email</label>
          <input
            v-model="email"
            type="email"
            required
            autocomplete="email"
            placeholder="you@company.com"
            class="mt-2 w-full rounded-2xl border border-slate-900/10 bg-white/70 px-4 py-3 text-slate-900 outline-none placeholder:text-slate-400 shadow-sm focus:border-slate-900/20 focus:ring-4 focus:ring-slate-900/5"
          />
        </div>

        <div v-if="error" class="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-800">
          {{ error }}
        </div>

        <button
          :disabled="loading"
          class="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
        >
          {{ loading ? 'Sending…' : 'Send magic link' }}
        </button>
      </form>

<!--      <p class="mt-6 text-xs text-slate-500">-->
<!--        Tip: in dev you can enable <span class="font-mono">DEV_EMAIL_MODE=log</span> to print the link to server logs.-->
<!--      </p>-->
    </div>
  </div>
</template>

