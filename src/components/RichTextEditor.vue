<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { Editor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'

type Props = {
  modelValue: string
  disabled?: boolean
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
})

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const editor = new Editor({
  editable: !props.disabled,
  extensions: [
    StarterKit,
    Placeholder.configure({
      placeholder: props.placeholder || '',
      emptyEditorClass: 'is-editor-empty',
    }),
    Link.configure({
      openOnClick: true,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: {
        rel: 'noopener noreferrer nofollow',
        target: '_blank',
      },
    }),
  ],
  editorProps: {
    attributes: {
      class: 'rte-prose',
      spellcheck: 'true',
    },
  },
  content: props.modelValue || '',
  onUpdate: ({ editor }) => {
    emit('update:modelValue', editor.getHTML())
  },
})

watch(
  () => props.disabled,
  (disabled) => {
    editor.setEditable(!disabled)
  }
)

watch(
  () => props.placeholder,
  (placeholder) => {
    // Placeholder extension reads its option from the extension; simplest is to update editorProps attr.
    // This keeps styling consistent even if placeholder changes.
    editor.view.dom.setAttribute('data-placeholder', placeholder || '')
  },
  { immediate: true }
)

watch(
  () => props.modelValue,
  (value) => {
    const current = editor.getHTML()
    if ((value || '') === current) return
    editor.commands.setContent(value || '', { emitUpdate: false })
  }
)

onBeforeUnmount(() => {
  editor.destroy()
})
</script>

<template>
  <div class="rte-root" :class="disabled ? 'opacity-70' : ''">

    <EditorContent :editor="editor" class="rte-surface" />
  </div>
</template>
