<template>
  <div class="agent-workspace">
    <section class="chat-col">
      <header class="masthead">
        <div class="titles">
          <NuxtLink to="/" class="back">‹ Guide</NuxtLink>
          <h1>Omnix Assistant <span class="tag">experimental</span></h1>
        </div>
        <button v-if="messages.length || sessionId" type="button" class="reset" @click="reset">New session</button>
      </header>

      <!--
        The warning is not decoration. Unlike the guide chat, this talks to a
        stateful AI Agent that acts on what it is told. The real containment is
        server-side (a pinned, tool-less agent) — this banner is the honest
        disclosure that it is an agent, not a search.
      -->
      <p class="warning">
        ⚠ This is a live AI agent with conversation memory, not a lookup. It will attempt to do what you ask.
        Tools are disabled, so it can only talk — but treat it as experimental.
      </p>

      <ChatWindow :messages="messages" :is-loading="isLoading" @ask="ask" />

      <form class="composer" @submit.prevent="submit">
        <textarea
          v-model="draft"
          rows="1"
          placeholder="Ask the assistant — it remembers this conversation"
          :disabled="isLoading"
          @keydown.enter.exact.prevent="submit"
        />
        <button type="submit" :disabled="isLoading || !draft.trim()">
          <span v-if="isLoading">...</span>
          <span v-else>Send ☗</span>
        </button>
      </form>

      <footer class="disclaimer">Unofficial fan project — not affiliated with Valve Corporation.</footer>
    </section>
  </div>
</template>

<script setup lang="ts">
// Owns its own viewport height, same as index.vue and for the same reason: a
// layout whose scoped CSS is not live collapses the grid. See index.vue.
definePageMeta({ layout: false })

const { messages, sessionId, isLoading, ask, reset, restore } = useAgent()

const draft = ref('')

onMounted(() => {
  restore()
})

function submit() {
  if (isLoading.value || !draft.value.trim()) return
  ask(draft.value)
  draft.value = ''
}
</script>

<style scoped>
.agent-workspace {
  height: 100vh;
  height: 100dvh;
  min-height: 100dvh;
  overflow: hidden;
  display: flex;
  justify-content: center;
}

.chat-col {
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
  max-width: 52rem;
}

.masthead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.8rem 1rem 0.4rem;
}

.titles {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.back {
  font-size: 0.72rem;
  color: var(--color-text-muted);
  text-decoration: none;
}

.back:hover {
  color: var(--color-fel-bright);
}

.masthead h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.1rem, 2.6vw, 1.45rem);
  color: var(--color-gold);
}

.tag {
  font-family: var(--font-body);
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  vertical-align: middle;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  border: 1px solid var(--color-fel);
  color: var(--color-fel-bright);
}

.reset {
  flex-shrink: 0;
  padding: 0.3rem 0.6rem;
  font-size: 0.72rem;
  border-radius: 0.4rem;
  border: 1px solid var(--color-border);
  background: var(--color-void-3);
  color: var(--color-text-muted);
  cursor: pointer;
}

.reset:hover {
  color: var(--color-parchment);
  border-color: var(--color-gold);
}

.warning {
  margin: 0 1rem 0.4rem;
  padding: 0.5rem 0.7rem;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--color-parchment);
  background: rgba(201, 162, 39, 0.12);
  border: 1px solid var(--color-gold);
  border-radius: 0.45rem;
}

.composer {
  display: flex;
  gap: 0.6rem;
  padding: 0.6rem 1rem 1rem;
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

.composer button {
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

.composer button:hover:not(:disabled) {
  box-shadow: 0 0 14px rgba(201, 162, 39, 0.4);
}

.composer button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.disclaimer {
  text-align: center;
  font-size: 0.7rem;
  color: var(--color-text-muted);
  padding: 0.75rem;
  border-top: 1px solid var(--color-border);
}
</style>
