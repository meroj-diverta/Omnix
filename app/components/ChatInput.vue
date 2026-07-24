<template>
  <form class="chat-input" @submit.prevent="submit">
    <textarea
      v-model="draft"
      rows="1"
      placeholder="e.g. What does BKB mean? Who is Faceless Void?"
      :disabled="isLoading"
      @keydown.enter.exact.prevent="submit"
    />
    <button type="submit" :disabled="isLoading || !draft.trim()">
      <span v-if="isLoading">...</span>
      <span v-else>Ask ☗</span>
    </button>
  </form>
</template>

<script setup lang="ts">
const props = defineProps<{ isLoading: boolean }>()
const emit = defineEmits<{ ask: [query: string] }>()

const draft = ref('')

function submit() {
  if (props.isLoading || !draft.value.trim()) return
  emit('ask', draft.value)
  draft.value = ''
}
</script>

<style scoped>
.chat-input {
  display: flex;
  gap: 0.6rem;
  padding: 1rem;
  border-top: 1px solid var(--color-border);
  background: var(--color-void-2);
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
