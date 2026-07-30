<template>
  <div class="input-area">
    <!--
      Mode picker. Each option is a different Kuroco AI operation, so asking the
      same question twice in two modes is a direct comparison of retrieval vs
      generation behaviour.
    -->
    <div class="modes" role="radiogroup" aria-label="Answer mode">
      <button
        v-for="m in modes"
        :key="m.key"
        type="button"
        role="radio"
        :aria-checked="m.key === mode"
        :class="{ on: m.key === mode }"
        :title="`${m.hint} — ${m.operation}`"
        @click="emit('update:mode', m.key)"
      >
        {{ m.label }}
      </button>
    </div>

    <form class="chat-input" @submit.prevent="submit">
      <textarea
        v-model="draft"
        rows="1"
        placeholder="e.g. What does QoP mean? Who is Faceless Void?"
        :disabled="isLoading"
        @keydown.enter.exact.prevent="submit"
      />
      <button type="submit" :disabled="isLoading || !draft.trim()">
        <span v-if="isLoading">...</span>
        <span v-else>Ask ☗</span>
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
import type { ChatMode, ChatModeInfo } from '~/types/chat'

const props = defineProps<{ isLoading: boolean; mode: ChatMode; modes: ChatModeInfo[] }>()
const emit = defineEmits<{ ask: [query: string]; 'update:mode': [mode: ChatMode] }>()

const draft = ref('')

function submit() {
  if (props.isLoading || !draft.value.trim()) return
  emit('ask', draft.value)
  draft.value = ''
}
</script>

<style scoped>
.input-area {
  border-top: 1px solid var(--color-border);
  background: var(--color-void-2);
}

.modes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding: 0.6rem 1rem 0;
}

.modes button {
  padding: 0.25rem 0.6rem;
  font-size: 0.72rem;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.modes button.on {
  border-color: var(--color-fel);
  color: var(--color-fel-bright);
}

.chat-input {
  display: flex;
  gap: 0.6rem;
  padding: 0.6rem 1rem 1rem;
}

textarea {
  flex: 1;
  resize: none;
  background: var(--color-void-3);
  border: 1px solid var(--color-border);
  border-radius: 0.6rem;
  padding: 0.65rem 0.85rem;
  color: var(--color-parchment);
  font-family: var(--font-body);
  font-size: 0.95rem;
  min-height: 3.4rem;
  overflow-y: auto;
}

textarea:focus {
  outline: none;
  border-color: var(--color-fel);
}

button {
  flex-shrink: 0;
  padding: 0 1.2rem;
  border-radius: 0.6rem;
  border: 1px solid var(--color-gold);
  background: linear-gradient(135deg, #2a2210, var(--color-void-3));
  color: var(--color-gold);
  font-family: var(--font-display);
  font-weight: 700;
  cursor: pointer;
  transition: box-shadow 0.15s ease;
}

button:hover:not(:disabled) {
  box-shadow: 0 0 14px rgba(201, 162, 39, 0.4);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
