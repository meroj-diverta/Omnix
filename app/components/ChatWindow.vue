<template>
  <div ref="scrollEl" class="chat-window">
    <div v-if="!messages.length" class="empty">
      <p>New to Dota 2? Ask what a term means, who a hero is, or what to do next — plain English, no jargon.</p>
      <div class="chips">
        <button v-for="prompt in SUGGESTED_PROMPTS" :key="prompt" type="button" class="chip" @click="emit('ask', prompt)">
          {{ prompt }}
        </button>
      </div>
    </div>
    <ChatBubble v-for="message in messages" :key="message.id" :message="message" />
    <div v-if="isLoading" class="bubble-row omnix">
      <div class="avatar">☗</div>
      <div class="bubble pending">Omnix consults the ancient runes...</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, watch } from 'vue'
import type { ChatMessage } from '~/types/chat'

const SUGGESTED_PROMPTS = [
  'What does BKB mean?',
  'Who is Faceless Void?',
  'What does CC mean?',
  'What is stacking?'
]

const props = defineProps<{ messages: ChatMessage[]; isLoading: boolean }>()
const emit = defineEmits<{ ask: [query: string] }>()
const scrollEl = ref<HTMLElement | null>(null)

watch(
  () => [props.messages.length, props.isLoading],
  async () => {
    await nextTick()
    scrollEl.value?.scrollTo({ top: scrollEl.value.scrollHeight, behavior: 'smooth' })
  }
)
</script>

<style scoped>
/*
 * The layout shell widened to 72rem to make room for the codex pane, so the
 * reading measure is held here instead — otherwise answer prose stretches to
 * full width on a desktop screen.
 */
.chat-window {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  width: 100%;
  max-width: 42rem;
  margin: 0 auto;
}

.empty {
  margin: auto;
  text-align: center;
  color: var(--color-text-muted);
  max-width: 26rem;
}

.chips {
  margin-top: 1.1rem;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
}

.chip {
  padding: 0.45rem 0.9rem;
  border-radius: 999px;
  border: 1px solid var(--color-fel);
  background: var(--color-void-2);
  color: var(--color-fel-bright);
  font-family: var(--font-body);
  font-size: 0.82rem;
  cursor: pointer;
  transition: box-shadow 0.15s ease, background 0.15s ease;
}

.chip:hover {
  background: var(--color-void-3);
  box-shadow: 0 0 10px rgba(158, 230, 106, 0.35);
}

.avatar {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--color-void-3);
  border: 1px solid var(--color-fel);
  color: var(--color-fel-bright);
}

.bubble-row {
  display: flex;
  gap: 0.6rem;
  align-items: flex-end;
}

.bubble.pending {
  background: var(--color-void-2);
  border: 1px solid var(--color-border);
  border-bottom-left-radius: 0.2rem;
  padding: 0.75rem 1rem;
  border-radius: 0.9rem;
  color: var(--color-text-muted);
  font-style: italic;
}
</style>
