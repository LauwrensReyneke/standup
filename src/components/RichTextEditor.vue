<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { BubbleMenu, Editor, EditorContent } from '@tiptap/vue-3'
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

const canShowBubble = computed(() => {
  return editor.isEditable && !editor.state.selection.empty
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
    editor.commands.setContent(value || '', false)
  }
)

onBeforeUnmount(() => {
  editor.destroy()
})
</script>

<template>
  <div class="rte-root" :class="disabled ? 'opacity-70' : ''">
    <BubbleMenu v-if="editor" :editor="editor" :tippy-options="{ duration: 120 }">
      <div v-show="canShowBubble" class="rte-bubble">
        <button
          class="rte-bubble-btn"
          :class="editor.isActive('bold') ? 'is-active' : ''"
          type="button"
          @click="editor.chain().focus().toggleBold().run()"
        >
          B
        </button>
        <button
          class="rte-bubble-btn italic"
          :class="editor.isActive('italic') ? 'is-active' : ''"
          type="button"
          @click="editor.chain().focus().toggleItalic().run()"
        >
          I
        </button>
        <button
          class="rte-bubble-btn"
          :class="editor.isActive('code') ? 'is-active' : ''"
          type="button"
          @click="editor.chain().focus().toggleCode().run()"
        >
          <span class="font-mono">&lt;/&gt;</span>
        </button>
      </div>
    </BubbleMenu>

    <EditorContent :editor="editor" class="rte-surface" />
  </div>
</template>
