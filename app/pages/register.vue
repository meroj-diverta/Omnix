<template>
  <div class="register">
    <article class="card">
      <h2>Create your account</h2>
      <p class="lede">
        Omnix keeps your notes and preferences against your own account. Registration runs in three
        steps: your details, a code we mail you, then a password.
      </p>

      <ol class="steps">
        <li :class="{ on: step === 1, done: step > 1 }"><span>1</span> Details</li>
        <li :class="{ on: step === 2, done: step > 2 }"><span>2</span> Verify email</li>
        <li :class="{ on: step === 3, done: step > 3 }"><span>3</span> Password</li>
      </ol>

      <!-- Landing here with a live session: nothing to do. -->
      <section v-if="isSignedIn && step === 1" class="body">
        <p>You are already signed in as <strong>{{ displayName }}</strong>.</p>
        <NuxtLink class="link-btn" to="/">Back to Omnix</NuxtLink>
      </section>

      <!-- Step 1 — Member::invite, which creates a provisional member and mails the code. -->
      <form v-else-if="step === 1" class="body" @submit.prevent="submitDetails">
        <label>
          Email
          <input v-model.trim="email" type="email" autocomplete="email" required />
        </label>
        <div class="pair">
          <label>
            First name
            <input v-model.trim="name1" autocomplete="given-name" required />
          </label>
          <label>
            Last name
            <input v-model.trim="name2" autocomplete="family-name" />
          </label>
        </div>
        <button type="submit" :disabled="isChecking">
          {{ isChecking ? 'Sending...' : 'Send me a code' }}
        </button>
        <p class="foot">
          Already have an account? <NuxtLink to="/">Sign in from the codex pane</NuxtLink>.
        </p>
      </form>

      <!-- Step 2 — the same endpoint, keyed on email_hash instead of email. -->
      <form v-else-if="step === 2" class="body" @submit.prevent="submitCode">
        <p class="sent">
          We mailed a code to <strong>{{ email }}</strong>. Paste it below — it is a long key, not a
          short PIN, so copy the whole thing.
        </p>
        <label>
          Code from the email
          <input v-model.trim="code" autocomplete="one-time-code" spellcheck="false" class="mono" required />
        </label>
        <button type="submit" :disabled="isChecking">
          {{ isChecking ? 'Checking...' : 'Verify' }}
        </button>
        <div class="alt">
          <!-- Both of these re-issue the invite, which mints a fresh code and
               retires the one already mailed. Say so rather than surprising them. -->
          <button type="button" class="ghost" :disabled="isChecking" @click="resendCode">
            Send a new code
          </button>
          <button type="button" class="ghost" :disabled="isChecking" @click="step = 1">
            Change email
          </button>
        </div>
      </form>

      <!-- Step 3 — the register endpoint, with the details from step 1. -->
      <form v-else-if="step === 3" class="body" @submit.prevent="submitPassword">
        <p class="sent">
          <strong>{{ email }}</strong> is verified. Choose a password to finish.
        </p>
        <label>
          Password
          <input v-model="password" type="password" autocomplete="new-password" required />
        </label>
        <label>
          Confirm password
          <input v-model="passwordConfirm" type="password" autocomplete="new-password" required />
        </label>
        <button type="submit" :disabled="isChecking">
          {{ isChecking ? 'Creating account...' : 'Create account' }}
        </button>
      </form>

      <!-- Registered, but the automatic sign-in that follows it did not take. -->
      <section v-else class="body">
        <p>Your account was created for <strong>{{ email }}</strong>.</p>
        <p class="foot">Sign in from the codex pane on the main page to start using it.</p>
        <NuxtLink class="link-btn" to="/">Back to Omnix</NuxtLink>
      </section>

      <!-- Kuroco's own wording, verbatim. See describeFailure in useAuth.ts. -->
      <p v-if="authError" class="error" role="alert" aria-live="polite">{{ authError }}</p>
    </article>
  </div>
</template>

<script setup lang="ts">
/**
 * Three-step registration, one step per Kuroco call:
 *
 *   1. emailValidate `{email, ext_info:{name1, name2}}` -> provisional member + mailed code
 *   2. emailValidate `{email_hash}`                     -> verifies that code
 *   3. register      `{email, name1, name2, login_pwd}` -> the real member
 *
 * Steps 1 and 2 are the same endpoint; the body decides which branch runs. The
 * page holds email/name across all three because step 3 needs them again and
 * step 2 returns nothing the form can reuse.
 */
useHead({ title: 'Create your account — Omnix' })

const { isSignedIn, displayName, isChecking, authError, refresh, getEmailOtp, verifyEmailWithOtp, signUp, signIn } =
  useAuth()

/** 1 details, 2 verify, 3 password, 4 registered but not signed in. */
const step = ref<1 | 2 | 3 | 4>(1)

const email = ref('')
const name1 = ref('')
const name2 = ref('')
const code = ref('')
const password = ref('')
const passwordConfirm = ref('')

onMounted(refresh)

async function submitDetails() {
  if (await getEmailOtp(email.value, name1.value, name2.value)) step.value = 2
}

async function resendCode() {
  code.value = ''
  await getEmailOtp(email.value, name1.value, name2.value)
}

async function submitCode() {
  if (await verifyEmailWithOtp(code.value)) step.value = 3
}

async function submitPassword() {
  const registered = await signUp(email.value, password.value, passwordConfirm.value, name1.value, name2.value)
  if (!registered) return

  // Finish by signing them in, so registration ends in a usable session rather
  // than at a dead end. If that call fails the account still exists, so step 4
  // says so and points at the sign-in form instead of implying nothing happened.
  const signedIn = await signIn(email.value, password.value)
  password.value = ''
  passwordConfirm.value = ''
  if (signedIn) return navigateTo('/')
  step.value = 4
}
</script>

<style scoped>
.register {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 1.5rem 1rem 2.5rem;
}

.card {
  width: 100%;
  max-width: 30rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.5rem;
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  background: var(--color-void-2);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
}

h2 {
  margin: 0;
  font-size: 1.3rem;
  color: var(--color-gold);
}

.lede,
.foot,
.sent {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.55;
  color: var(--color-text-muted);
}

.sent strong,
.body strong {
  color: var(--color-parchment);
}

/* Step rail */
.steps {
  display: flex;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.steps li {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.5rem;
  font-size: 0.72rem;
  border-radius: 0.45rem;
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
}

.steps li span {
  display: grid;
  place-items: center;
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 50%;
  border: 1px solid currentColor;
  font-size: 0.65rem;
}

.steps li.on {
  border-color: var(--color-gold);
  color: var(--color-gold);
}

.steps li.done {
  border-color: var(--color-fel);
  color: var(--color-fel-bright);
}

.body {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
}

input {
  width: 100%;
  background: var(--color-void-3);
  border: 1px solid var(--color-border);
  border-radius: 0.45rem;
  padding: 0.5rem 0.6rem;
  color: var(--color-parchment);
  font-family: var(--font-body);
  font-size: 0.88rem;
}

input:focus {
  outline: none;
  border-color: var(--color-fel);
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8rem;
}

button,
.link-btn {
  font-family: var(--font-body);
  cursor: pointer;
}

.body > button[type='submit'],
.link-btn {
  padding: 0.55rem;
  border-radius: 0.45rem;
  border: 1px solid var(--color-gold);
  background: linear-gradient(135deg, #2a2210, var(--color-void-3));
  color: var(--color-gold);
  font-weight: 600;
  font-size: 0.88rem;
  text-align: center;
  text-decoration: none;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.alt {
  display: flex;
  gap: 0.4rem;
}

.ghost {
  flex: 1;
  padding: 0.35rem 0.5rem;
  font-size: 0.74rem;
  border-radius: 0.4rem;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
}

a {
  color: var(--color-fel-bright);
}

.error {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-blood-bright);
}

@media (max-width: 480px) {
  .pair {
    grid-template-columns: 1fr;
  }

  .steps li span {
    display: none;
  }
}
</style>
