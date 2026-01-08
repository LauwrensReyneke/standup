<script setup lang="ts">
import { computed, ref } from 'vue'
import { renderMarkdown } from '../lib/markdown'

const props = defineProps<{ modelValue: string; disabled?: boolean; placeholder?: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const focused = ref(false)
const html = computed(() => renderMarkdown(props.modelValue || ''))
</script>

<template>
  <div class="relative">
    <!-- Rendered markdown layer (what you see) -->
    <div
      class="markdown-editor-view input min-h-16 whitespace-pre-wrap break-words"
      :class="props.disabled ? 'bg-slate-50 opacity-70' : 'bg-white'"
      v-html="props.modelValue ? html : ''"
    />

    <!-- Editable textarea layer (caret + typing). Transparent text, visible caret. -->
    <textarea
      :disabled="props.disabled"
      :value="props.modelValue"
      class="markdown-editor-input input absolute inset-0 min-h-16 resize-none bg-transparent caret-slate-900"
      :placeholder="props.placeholder"
      @focus="focused = true"
      @blur="focused = false"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />

    <!-- Empty state placeholder rendered nicely when no content and not focused -->
    <div
      v-if="!props.modelValue && !focused"
      class="pointer-events-none absolute inset-0 flex items-start p-4 text-sm text-slate-400"
    >
      {{ props.placeholder || '' }}
    </div>
  </div>
</template>

