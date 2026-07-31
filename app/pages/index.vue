<template>
  <div class="workspace" :class="{ 'no-history': !historyOpen, 'no-codex': !paneOpen }">
    <section v-show="historyOpen" id="history-pane" class="history-col">
      <ConversationsPane />
    </section>

    <section class="chat-col">
      <!--
        The two toggles sit in a normal-flow strip at the top of the centre
        column, not absolutely over the panes. Floating them over the panes put
        "‹ Hide" straight on top of the "Conversations" heading. Keeping them
        here also keeps both controls visible when their pane is closed, which
        is the property that matters — a toggle that disappears with its pane
        leaves no way back.
      -->
      <div class="pane-controls">
        <button
          class="pane-toggle"
          :aria-expanded="historyOpen"
          aria-controls="history-pane"
          @click="historyOpen = !historyOpen"
        >
          {{ historyOpen ? '‹ Hide conversations' : 'Conversations ›' }}
        </button>

        <button
          class="pane-toggle"
          :aria-expanded="paneOpen"
          aria-controls="codex-pane"
          @click="paneOpen = !paneOpen"
        >
          {{ paneOpen ? 'Hide codex ›' : '‹ Your codex' }}
        </button>
      </div>

      <AppHeader />

      <ChatWindow :messages="messages" :is-loading="isLoading" @ask="ask" />
      <ChatInput :is-loading="isLoading" :mode="mode" :modes="modes" @ask="ask" @update:mode="mode = $event" />

      <footer class="disclaimer">Unofficial fan project — not affiliated with Valve Corporation.</footer>
    </section>

    <section v-show="paneOpen" id="codex-pane" class="notes-col">
      <NotesPane />
    </section>
  </div>
</template>

<script setup lang="ts">
/*
 * No layout at all: this page is the whole screen.
 *
 * `default.vue` renders the header and disclaimer as full-width bands, which
 * clipped the side rails top and bottom and made them read as short floating
 * boxes — so the workspace renders them inside its own centre column instead.
 * Going through a second custom layout to achieve that turned out to be a
 * liability: the page's height came from the layout's `.shell`, and when that
 * layout's scoped CSS was not live (a stale dev server did exactly this) the
 * grid had nothing to size against, collapsed to content height, and left the
 * bottom of the window empty. Owning the height here removes that dependency.
 * /register keeps the default layout.
 */
definePageMeta({ layout: false })

const { messages, isLoading, mode, modes, ask } = useOmnix()

// Both open by default on wide screens; the toggles keep chat usable on narrow
// ones.
const paneOpen = ref(true)
const historyOpen = ref(true)

/*
 * Below the breakpoint both panes are overlays, so opening both by default
 * buried the chat under them — and the control strip with it, which left no way
 * to close either. Collapse them on a narrow viewport instead. Client-side
 * because a static build prerenders at no particular width.
 */
onMounted(() => {
  if (window.innerWidth <= 900) {
    historyOpen.value = false
    paneOpen.value = false
  }
})
</script>

<style scoped>
/*
 * The viewport, owned here rather than inherited. `height` pins it so the rails
 * and the transcript scroll internally; `min-height` is the belt-and-braces
 * copy that still applies if this ever ends up inside a flex parent, where
 * `flex-basis` would otherwise win over `height`.
 */
.workspace {
  height: 100vh;
  height: 100dvh;
  min-height: 100dvh;
  overflow: hidden;
  display: grid;
  grid-template-columns: 16rem minmax(0, 1fr) 20rem;
  position: relative;
}

/*
 * Hiding a pane has to give its column back too, or the chat goes on laying
 * itself out against a strip of nothing.
 */
.workspace.no-history {
  grid-template-columns: minmax(0, 1fr) 20rem;
}

.workspace.no-codex {
  grid-template-columns: 16rem minmax(0, 1fr);
}

.workspace.no-history.no-codex {
  grid-template-columns: minmax(0, 1fr);
}

.chat-col {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}

.history-col,
.notes-col {
  min-height: 0;
  overflow: hidden;
}


/*
 * Above the panes in the stacking order. Below the breakpoint they become
 * overlays, and a toggle you cannot reach because its own pane covers it is the
 * bug this control strip exists to avoid.
 */
.pane-controls {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.3rem 0.5rem 0.1rem;
}

.pane-toggle {
  padding: 0.3rem 0.6rem;
  font-size: 0.72rem;
  border-radius: 0.4rem;
  border: 1px solid var(--color-border);
  background: var(--color-void-3);
  color: var(--color-text-muted);
  cursor: pointer;
}

.pane-toggle:hover {
  color: var(--color-parchment);
  border-color: var(--color-gold);
}

.disclaimer {
  text-align: center;
  font-size: 0.7rem;
  color: var(--color-text-muted);
  padding: 0.75rem;
  border-top: 1px solid var(--color-border);
}

/* Below ~900px both side panes become overlays so chat keeps full width. */
@media (max-width: 900px) {
  .workspace,
  .workspace.no-history,
  .workspace.no-codex,
  .workspace.no-history.no-codex {
    grid-template-columns: minmax(0, 1fr);
  }

  .history-col,
  .notes-col {
    position: absolute;
    inset: 0 auto 0 0;
    width: min(18rem, 88vw);
    z-index: 1;
  }

  .history-col {
    box-shadow: 12px 0 24px rgba(0, 0, 0, 0.45);
  }

  .notes-col {
    inset: 0 0 0 auto;
    width: min(20rem, 88vw);
    box-shadow: -12px 0 24px rgba(0, 0, 0, 0.45);
  }
}
</style>
