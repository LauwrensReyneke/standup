<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { useEditor } from '@milkdown/vue'
import { nord } from '@milkdown/theme-nord'

const props = defineProps<{ modelValue: string; disabled?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const container = ref<HTMLDivElement | null>(null)

// We keep an internal value so we can sync in both directions.
const internal = ref(props.modelValue || '')
watch(
  () => props.modelValue,
  (v) => {
    if (v !== internal.value) internal.value = v || ''
  }
)

// Basic editor styling + prevent form input oddities
const viewOptions = computed(() => ({
  attributes: {
    class:
      'milkdown-editor min-h-16 rounded-2xl border border-slate-900/10 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none focus-within:border-slate-900/20 focus-within:ring-4 focus-within:ring-slate-900/5',
  },
}))

// Milkdown Vue hook
const { get } = useEditor((root) => {
  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, internal.value)
      ctx.set(editorViewOptionsCtx, viewOptions.value)
    })
    .config(nord)
    .use(commonmark)
})

// Emit markdown on updates
let destroy: null | (() => void) = null

onMounted(async () => {
  const editor = await get()
  if (!editor) return

  // Listen to doc changes; serialize back to markdown using Milkdown's internal serializer.
  // Milkdown exposes a getMarkdown() helper via commands in newer versions, but not consistently.
  // We'll use the view's state and the commonmark serializer.
  const el = (editor as any)?.ctx?.get?.(rootCtx)
  void el

  const view = (editor as any)?.editorView
  const mdSerializer = (editor as any)?.ctx?.get?.('serializer')

  if (view && mdSerializer) {
    const handler = () => {
      try {
        const next = mdSerializer(view.state.doc)
        if (typeof next === 'string' && next !== internal.value) {
          internal.value = next
          emit('update:modelValue', next)
        }
      } catch {
        // ignore
      }
    }

    view.setProps({
      handleDOMEvents: {
        input: () => {
          handler()
          return false
        },
        blur: () => {
          handler()
          return false
        },
      },
    })

    destroy = () => {
      try {
        view.setProps({ handleDOMEvents: {} })
      } catch {
        // ignore
      }
    }
  }
})

onBeforeUnmount(() => {
  destroy?.()
})
</script>

<template>
  <div ref="container">
    <!-- Milkdown mounts into the provided root from useEditor -->
    <component :is="container" />
  </div>
</template>

