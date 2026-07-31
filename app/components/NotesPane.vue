<template>
  <aside class="notes-pane">
    <header class="pane-head">
      <h2>Your Codex</h2>
      <p v-if="isSignedIn" class="who">{{ displayName }}</p>
    </header>

    <!-- Signed out: the pane is the sign-in surface, since notes are member-owned -->
    <div v-if="!isSignedIn" class="signin">
      <p class="hint">Sign in to keep your own notes and preferences. Omnix can read them back to you in chat.</p>
      <form @submit.prevent="doSignIn">
        <input v-model="email" type="email" placeholder="Email" autocomplete="username" required />
        <input v-model="password" type="password" placeholder="Password" autocomplete="current-password" required />
        <button type="submit" :disabled="isChecking">{{ isChecking ? 'Signing in...' : 'Sign in' }}</button>
      </form>
      <p v-if="authError" class="error">{{ authError }}</p>
      <p class="hint">No account yet? <NuxtLink to="/register">Create one</NuxtLink>.</p>
    </div>

    <template v-else>
      <p v-if="leakWarning" class="leak">⚠ {{ leakWarning }}</p>
      <p v-if="error" class="error">{{ error }}</p>

      <div class="tabs">
        <button :class="{ on: tab === 'note' }" @click="tab = 'note'">
          Notes <span class="count">{{ myNotes.length }}</span>
        </button>
        <button :class="{ on: tab === 'preference' }" @click="tab = 'preference'">
          Preferences <span class="count">{{ myPreferences.length }}</span>
        </button>
      </div>

      <!-- Create -->
      <form class="composer" @submit.prevent="doCreate">
        <input v-model="draftTitle" :placeholder="tab === 'note' ? 'Note title' : 'Preference name'" />
        <textarea
          v-model="draftBody"
          rows="2"
          :placeholder="tab === 'note' ? 'What did you learn?' : 'e.g. I play position 5 support'"
        />
        <button type="submit" :disabled="isSaving || (!draftTitle.trim() && !draftBody.trim())">
          {{ isSaving ? 'Saving...' : 'Add' }}
        </button>
      </form>

      <div class="list">
        <p v-if="isLoading" class="muted">Loading...</p>
        <p v-else-if="!visible.length" class="muted">
          Nothing here yet. Add your first {{ tab === 'note' ? 'note' : 'preference' }} above.
        </p>

        <article v-for="note in visible" :key="note.id" class="note">
          <!-- Edit in place -->
          <template v-if="editingId === note.id">
            <input v-model="editTitle" />
            <textarea v-model="editBody" rows="3" />
            <div class="row">
              <button class="ok" :disabled="isSaving" @click="doSave(note)">Save</button>
              <button class="ghost" @click="cancelEdit">Cancel</button>
            </div>
          </template>

          <template v-else>
            <h3>{{ note.title }}</h3>
            <p v-if="note.body" class="body">{{ note.body }}</p>
            <div class="row">
              <button class="ghost" @click="startEdit(note)">Edit</button>
              <button class="danger" :disabled="isSaving" @click="doRemove(note)">Delete</button>
            </div>
          </template>
        </article>
      </div>

      <button class="signout" @click="signOut">Sign out</button>
    </template>
  </aside>
</template>

<script setup lang="ts">
import type { Note, NoteKind } from '~/composables/useNotes'

const { isSignedIn, displayName, isChecking, authError, signIn, signOut, refresh } = useAuth()
const {
  myNotes, myPreferences, isLoading, isSaving, error, leakWarning,
  load, create, update, remove
} = useNotes()

const tab = ref<NoteKind>('note')
const email = ref('')
const password = ref('')

const draftTitle = ref('')
const draftBody = ref('')

const editingId = ref<number | null>(null)
const editTitle = ref('')
const editBody = ref('')

const visible = computed(() => (tab.value === 'note' ? myNotes.value : myPreferences.value))

onMounted(async () => {
  await refresh()
  if (isSignedIn.value) await load()
})

// Reload on every sign-in/out transition, not just sign-in. load() clears the
// list when signed out; firing only on sign-in left the previous member's
// notes on screen after they logged out — which, in a shared browser, reads
// exactly like notes leaking between members. The `omnix-notes` state is a
// single app-wide key, so it must be emptied on sign-out, not just refilled on
// the next sign-in.
watch(isSignedIn, () => {
  load()
})

async function doSignIn() {
  const ok = await signIn(email.value, password.value)
  password.value = ''
  if (ok) await load()
}

async function doCreate() {
  const ok = await create({ kind: tab.value, title: draftTitle.value, body: draftBody.value })
  if (ok) {
    draftTitle.value = ''
    draftBody.value = ''
  }
}

function startEdit(note: Note) {
  editingId.value = note.id
  editTitle.value = note.title
  editBody.value = note.body
}

function cancelEdit() {
  editingId.value = null
}

async function doSave(note: Note) {
  const ok = await update({ ...note, title: editTitle.value, body: editBody.value })
  if (ok) editingId.value = null
}

async function doRemove(note: Note) {
  // Deliberately confirm: there is no undo and no draft/trash state behind this.
  if (!globalThis.confirm?.(`Delete "${note.title}"?`)) return
  await remove(note.id)
}
</script>

<style scoped>
.notes-pane {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 1rem;
  border-left: 1px solid var(--color-border);
  background: var(--color-void-2);
  overflow-y: auto;
}

.pane-head h2 {
  margin: 0;
  font-size: 1.05rem;
  color: var(--color-gold);
}

.who {
  margin: 0.15rem 0 0;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.hint,
.muted {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.hint a {
  color: var(--color-fel-bright);
}

.error {
  font-size: 0.78rem;
  color: var(--color-blood-bright);
  margin: 0;
}

/* A scoping failure is a security signal, not a cosmetic warning — make it loud. */
.leak {
  font-size: 0.78rem;
  color: var(--color-void);
  background: var(--color-gold);
  border-radius: 0.4rem;
  padding: 0.5rem 0.6rem;
  margin: 0;
  font-weight: 600;
}

.tabs {
  display: flex;
  gap: 0.4rem;
}

.tabs button {
  flex: 1;
  padding: 0.4rem 0.5rem;
  font-size: 0.78rem;
  border-radius: 0.45rem;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.tabs button.on {
  border-color: var(--color-fel);
  color: var(--color-fel-bright);
}

.count {
  opacity: 0.7;
  font-size: 0.7rem;
}

form,
.composer {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

input,
textarea {
  width: 100%;
  background: var(--color-void-3);
  border: 1px solid var(--color-border);
  border-radius: 0.45rem;
  padding: 0.45rem 0.6rem;
  color: var(--color-parchment);
  font-family: var(--font-body);
  font-size: 0.85rem;
  resize: vertical;
}

input:focus,
textarea:focus {
  outline: none;
  border-color: var(--color-fel);
}

button {
  font-family: var(--font-body);
  cursor: pointer;
}

.composer button,
.signin button {
  padding: 0.45rem;
  border-radius: 0.45rem;
  border: 1px solid var(--color-gold);
  background: linear-gradient(135deg, #2a2210, var(--color-void-3));
  color: var(--color-gold);
  font-weight: 600;
  font-size: 0.85rem;
}

.composer button:disabled,
.signin button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
  min-height: 0;
}

.note {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.6rem;
  background: var(--color-void-3);
}

.note h3 {
  margin: 0;
  font-size: 0.88rem;
  color: var(--color-parchment);
}

.body {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
  white-space: pre-wrap;
  line-height: 1.45;
}

.row {
  display: flex;
  gap: 0.4rem;
}

.ghost,
.ok,
.danger {
  padding: 0.25rem 0.6rem;
  font-size: 0.75rem;
  border-radius: 0.35rem;
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
}

.ok {
  border-color: var(--color-fel);
  color: var(--color-fel-bright);
}

.danger {
  border-color: var(--color-blood);
  color: var(--color-blood-bright);
}

.signout {
  margin-top: auto;
  padding: 0.4rem;
  font-size: 0.75rem;
  border-radius: 0.4rem;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
}
</style>
