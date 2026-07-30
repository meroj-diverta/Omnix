<template>
  <div class="shell">
    <AppHeader />
    <main class="content">
      <slot />
    </main>
    <footer class="disclaimer">Unofficial fan project — not affiliated with Valve Corporation.</footer>
  </div>
</template>

<style scoped>
.shell {
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/*
 * Full-bleed on purpose, so the codex pane reaches the window edge. Capping this
 * at 72rem and centring it used to leave the pane floating in dead space —
 * 64px of it at 1280px wide, 224px at 1600px, growing with the viewport, since
 * the leftover margin lands to the right of the pane rather than around it.
 *
 * Width is owned per page instead: the chat column keeps a 42rem reading measure
 * (see ChatWindow) and the register card its own, so prose still does not
 * stretch on a wide screen.
 */
.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
}

.disclaimer {
  text-align: center;
  font-size: 0.7rem;
  color: var(--color-text-muted);
  padding: 0.75rem;
  border-top: 1px solid var(--color-border);
}
</style>
