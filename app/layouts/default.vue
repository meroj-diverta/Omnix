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
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  max-width: 42rem;
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
