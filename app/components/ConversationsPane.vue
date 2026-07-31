<template>
  <aside class="conversations-pane">
    <header class="pane-head">
      <h2>Conversations</h2>
      <button class="new" :disabled="!isSignedIn" title="Start a new conversation" @click="onNew">+ New</button>
    </header>

    <!--
      Signed out is not an error state. Conversations are member-owned rows, so
      there is nothing to list; the sign-in surface itself lives in the codex
      pane, so this only points at it rather than duplicating the form.
    -->
    <p v-if="!isSignedIn" class="muted">
      Sign in to keep your conversations. Omnix remembers your last
      {{ HISTORY_TURNS }} questions in a thread so follow-ups make sense.
    </p>

    <template v-else>
      <p v-if="error" class="error">{{ error }}</p>

      <p v-if="!sessions.length" class="muted">
        No conversations yet. Ask something and this list fills in.
      </p>

      <ul v-else class="list">
        <li v-for="session in sessions" :key="session.id">
          <button
            class="entry"
            :class="{ on: session.id === currentId }"
            :aria-current="session.id === currentId ? 'true' : undefined"
            @click="onOpen(session.id)"
          >
            <span class="title">{{ session.title }}</span>
            <span v-if="session.updatedAt" class="when">{{ shortDate(session.updatedAt) }}</span>
          </button>
          <button class="remove" title="Delete this conversation" @click="onDelete(session.id)">×</button>
        </li>
      </ul>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { HISTORY_TURNS } from '~/composables/useConversations'

const { conversation, openConversation, newConversation } = useOmnix()
const { isSignedIn } = useAuth()

const { sessions, currentId, error } = conversation

/**
 * Kuroco returns `2026-07-31 14:07:01.007137+09`, which `new Date()` does not
 * parse reliably across browsers (the space, and the microseconds). Take the
 * date part as text rather than risk an "Invalid Date" in the list.
 */
function shortDate(value: string): string {
  return String(value).slice(0, 10)
}

async function onOpen(id: number) {
  if (id === currentId.value) return
  await openConversation(id)
}

function onNew() {
  newConversation()
}

async function onDelete(id: number) {
  await conversation.deleteSession(id)
}

/**
 * Load the list and re-open the thread this member was last reading.
 *
 * `restore()` reads localStorage, so this only runs client-side — which is also
 * why it hangs off onMounted rather than an immediate watcher: on a static
 * build the component prerenders signed-out, and a fetch there would 401 for
 * nothing. NotesPane resolves the session (`refresh()`), so this just reacts.
 */
async function load() {
  conversation.restore()
  await conversation.listSessions()
  if (currentId.value) await openConversation(currentId.value)
}

onMounted(() => {
  if (isSignedIn.value) load()
})

watch(isSignedIn, (signedIn) => {
  if (signedIn) load()
  else conversation.clearCurrent()
})
</script>

<style scoped>
.conversations-pane {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  height: 100%;
  padding: 0.9rem 0.8rem;
  overflow-y: auto;
  border-right: 1px solid var(--color-border);
  background: var(--color-void-2, var(--color-void-3));
}

.pane-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.pane-head h2 {
  margin: 0;
  font-size: 0.82rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.new {
  padding: 0.25rem 0.5rem;
  font-size: 0.72rem;
  border-radius: 0.4rem;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.new:hover:not(:disabled) {
  color: var(--color-parchment);
  border-color: var(--color-gold);
}

.new:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.list li {
  display: flex;
  align-items: stretch;
  gap: 0.2rem;
}

.entry {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.4rem 0.5rem;
  text-align: left;
  border: 1px solid transparent;
  border-radius: 0.4rem;
  background: transparent;
  color: var(--color-parchment);
  cursor: pointer;
}

.entry:hover {
  border-color: var(--color-border);
}

.entry.on {
  border-color: var(--color-gold);
  background: var(--color-void-3);
}

.title {
  font-size: 0.8rem;
  /* One line: titles are the opening question, so they run long. */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.when {
  font-size: 0.66rem;
  color: var(--color-text-muted);
}

.remove {
  padding: 0 0.4rem;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.95rem;
  line-height: 1;
  cursor: pointer;
}

.remove:hover {
  color: var(--color-danger, #e06c75);
}

.muted {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.error {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-danger, #e06c75);
}
</style>
