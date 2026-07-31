<template>
  <header class="app-header">
    <div class="rune">☗</div>
    <div class="titles">
      <h1>Omnix of the Ancient</h1>
      <p>Your jargon-free Dota 2 coach — ask anything, no experience required.</p>
    </div>
    <div class="rune">☗</div>
  </header>
</template>

<style scoped>
/*
 * Kept deliberately shallow. This sits above the transcript inside the chat
 * column, so every pixel here is one the conversation does not get — and on a
 * laptop screen the old 1.75rem/2rem masthead took ~110px before a single
 * message appeared.
 */
.app-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 0.8rem 1rem 0.7rem;
  border-bottom: 1px solid var(--color-border);
  text-align: center;
}

.titles h1 {
  margin: 0;
  font-size: clamp(1.1rem, 2.6vw, 1.45rem);
  color: var(--color-gold);
  text-shadow: 0 0 18px rgba(201, 162, 39, 0.35);
}

.titles p {
  margin: 0.1rem 0 0;
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.rune {
  color: var(--color-fel-bright);
  font-size: 1.05rem;
  text-shadow: 0 0 10px rgba(158, 230, 106, 0.6);
}

@media (max-width: 480px) {
  .rune {
    display: none;
  }
}
</style>
