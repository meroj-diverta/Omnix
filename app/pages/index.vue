<template>
  <div class="workspace">
    <section class="chat-col">
      <ChatWindow :messages="messages" :is-loading="isLoading" @ask="ask" />
      <ChatInput :is-loading="isLoading" @ask="ask" />
    </section>

    <button class="pane-toggle" :aria-expanded="paneOpen" @click="paneOpen = !paneOpen">
      {{ paneOpen ? 'Hide codex ›' : '‹ Your codex' }}
    </button>

    <section v-show="paneOpen" class="notes-col">
      <NotesPane />
    </section>
  </div>
</template>

<script setup lang="ts">
const { messages, isLoading, ask } = useOmnix()

// Open by default on wide screens; the toggle keeps chat usable on narrow ones.
const paneOpen = ref(true)
</script>

<style scoped>
.workspace {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 20rem;
  min-height: 0;
  position: relative;
}

.chat-col {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}



.notes-col {
  min-height: 0;
  overflow: hidden;
}

.pane-toggle {
  display: none;
}

/* Below ~900px the codex becomes an overlay so chat keeps full width. */
@media (max-width: 900px) {
  .workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .pane-toggle {
    display: block;
    position: absolute;
    top: 0.4rem;
    right: 0.5rem;
    z-index: 2;
    padding: 0.3rem 0.6rem;
    font-size: 0.72rem;
    border-radius: 0.4rem;
    border: 1px solid var(--color-border);
    background: var(--color-void-3);
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .notes-col {
    position: absolute;
    inset: 0 0 0 auto;
    width: min(20rem, 88vw);
    z-index: 1;
    box-shadow: -12px 0 24px rgba(0, 0, 0, 0.45);
  }
}
</style>
