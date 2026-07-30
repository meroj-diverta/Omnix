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
 * Widened from 42rem to fit the chat column alongside the codex pane. The 42rem
 * reading measure is preserved on the chat column itself (see ChatWindow), so
 * prose does not stretch on wide screens.
 */
.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  max-width: 72rem;
  width: 100%;
  margin: 0 auto;
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
