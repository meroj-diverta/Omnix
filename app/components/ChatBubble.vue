<template>
  <div class="bubble-row" :class="message.role">
    <div class="avatar" v-if="message.role === 'omnix'">☗</div>
    <div class="bubble" :class="{ error: message.isError }">
      <!-- Which operation produced this, so mixed-mode threads stay comparable. -->
      <p v-if="modeLabel" class="mode-tag">{{ modeLabel }}</p>
      <p v-if="message.role === 'user'" class="text">{{ message.text }}</p>
      <div v-else class="markdown" v-html="renderedText" />
      <div class="images" v-if="message.images?.length">
        <img v-for="img in message.images" :key="img.url" :src="img.url" :alt="img.alt" loading="lazy" />
      </div>
      <div class="sources" v-if="message.sources?.length">
        Sources: <span v-for="(source, i) in message.sources" :key="source.slug">{{ source.subject }}<template v-if="i < message.sources.length - 1">, </template></span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import DOMPurify from 'isomorphic-dompurify'
import { marked } from 'marked'
import type { ChatMessage } from '~/types/chat'

const props = defineProps<{ message: ChatMessage }>()

const renderedText = computed(() => DOMPurify.sanitize(marked.parse(props.message.text, { async: false })))

/** Only tagged on replies, and only when the mode is not the default one. */
const modeLabel = computed(() => {
  if (props.message.role !== 'omnix' || !props.message.mode || props.message.mode === 'answer') return ''
  const info = CHAT_MODES.find((m) => m.key === props.message.mode)
  return info ? `${info.label} · ${info.operation}` : ''
})
</script>

<style scoped>
.bubble-row {
  display: flex;
  gap: 0.6rem;
  align-items: flex-end;
}

.bubble-row.user {
  justify-content: flex-end;
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

.bubble {
  max-width: min(32rem, 78vw);
  padding: 0.75rem 1rem;
  border-radius: 0.9rem;
  line-height: 1.5;
  font-size: 0.95rem;
}

.user .bubble {
  background: linear-gradient(135deg, var(--color-blood), var(--color-blood-bright));
  border: 1px solid var(--color-blood-bright);
  border-bottom-right-radius: 0.2rem;
  color: #fff0f0;
}

.omnix .bubble {
  background: var(--color-void-2);
  border: 1px solid var(--color-border);
  border-bottom-left-radius: 0.2rem;
}

.bubble.error {
  border-color: var(--color-blood-bright);
  color: var(--color-blood-bright);
}

.text {
  margin: 0;
  white-space: pre-wrap;
}

.mode-tag {
  margin: 0 0 0.4rem;
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-fel-bright);
  opacity: 0.85;
}

.markdown :deep(> *:first-child) {
  margin-top: 0;
}

.markdown :deep(> *:last-child) {
  margin-bottom: 0;
}

.markdown :deep(h1),
.markdown :deep(h2),
.markdown :deep(h3) {
  font-family: var(--font-display);
  color: var(--color-gold);
  font-size: 1.05rem;
  margin: 0.9rem 0 0.4rem;
}

.markdown :deep(p) {
  margin: 0.5rem 0;
}

.markdown :deep(ul),
.markdown :deep(ol) {
  margin: 0.5rem 0;
  padding-left: 1.3rem;
}

.markdown :deep(strong) {
  color: var(--color-gold);
}

.markdown :deep(table) {
  border-collapse: collapse;
  margin: 0.6rem 0;
  font-size: 0.85rem;
  width: 100%;
}

.markdown :deep(th),
.markdown :deep(td) {
  border: 1px solid var(--color-border);
  padding: 0.3rem 0.5rem;
  text-align: left;
}

.markdown :deep(th) {
  background: var(--color-void-3);
  color: var(--color-gold);
}

.markdown :deep(a) {
  color: var(--color-fel-bright);
}

.images {
  margin-top: 0.6rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.images img {
  max-width: 8rem;
  max-height: 8rem;
  border-radius: 0.5rem;
  border: 1px solid var(--color-border);
  object-fit: cover;
}

.sources {
  margin-top: 0.6rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border);
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
</style>
