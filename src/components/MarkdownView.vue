<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '../lib/markdown'

type Props = {
  value: string
  empty?: string
}

const props = defineProps<Props>()

const html = computed(() => renderMarkdown(props.value))
</script>

<template>
  <div v-if="!value" class="text-sm text-slate-400">{{ empty ?? '—' }}</div>
  <div v-else class="markdown" v-html="html" />
</template>

