import type { ChatMessage } from '~/types/chat'
import type { KurocoAgentEvent, KurocoAgentReply, KurocoAgentSession } from '~/types/kuroco'
import { KurocoError } from '~/types/kuroco'

/**
 * The Kuroco AI Agent chat — a *separate* surface from the RAG chat.
 *
 * How it differs from useOmnix(), and why it is its own composable:
 *
 * - **Stateful.** The single-shot operations (`chat_contents_search` &c.) are
 *   context-free — every question starts from nothing, which is why useOmnix
 *   bolts on its own history (the 24/25 rows, three-question replay). An agent
 *   *session* is a server-side thread, so "what about his other ability?" works.
 *   `ai_session_id` IS the memory. It is NOT the 24/25 "session"/"message" rows
 *   the RAG chat groups its turns into — a different thing entirely.
 *
 * - **Asynchronous.** send_message does not return the reply. It hands the turn
 *   to the agent harness and returns "updated". The reply arrives later as
 *   session *events* (`agent.message`), and the session's status reaches `idle`
 *   when the agent is done. A turn is: send → poll the event stream until idle →
 *   read the new agent.message(s). (Verified against source; see feedback log.)
 *
 * ---
 *
 * ⚠️ TWO SECURITY EXPOSURES — read before this ever faces real users.
 *
 * 1. **Compliance / tools.** An agent does what it is asked, destructive requests
 *    included, with whatever tools it was granted. Client code cannot contain
 *    that — a cookie-authed browser call is trivially replayable. The only real
 *    containment is server-side: the endpoint pins ONE dedicated `ai_agent_id`
 *    (so a member cannot target an arbitrary, powerful agent), and that agent is
 *    configured with **no destructive tools**. This composable assumes that
 *    setup; if the agent still asks to run a tool we surface it as blocked
 *    (requiresAction below) rather than confirming it — there is deliberately no
 *    tool-confirmation call here.
 *
 * 2. **Session ownership (F15).** Kuroco does no authorization on a
 *    caller-supplied `ai_session_id` in the send_message path: ids are
 *    sequential, `t_ai_session.member_id` is written but never checked, and the
 *    snapshot carries the full transcript. On a statically generated site there
 *    is no server to map member → session, so the id necessarily lives in the
 *    browser. Accepted for a test site with test members to get a real
 *    two-account reproduction; it does NOT survive contact with real users.
 */

/** Poll cadence for the async reply. ~60s ceiling before we give up on a turn. */
const POLL_INTERVAL_MS = 1500
const POLL_MAX_ATTEMPTS = 40

/**
 * The agent's Bedrock harness provisions asynchronously. Right after the agent
 * is created or its model is changed it sits in CREATING/UPDATING and rejects
 * sends with "Harness is not in an invokable state: CREATING". That clears on
 * its own, so retry a few times before telling the user it is warming up.
 */
const SEND_WARMUP_ATTEMPTS = 3
const WARMUP_RETRY_MS = 4000

export function useAgent() {
  const { request, routes, decodeEntities } = useKuroco()
  const { member, isSignedIn } = useAuth()

  const messages = useState<ChatMessage[]>('omnix-agent-messages', () => [])
  const sessionId = useState<number | null>('omnix-agent-session', () => null)
  const isLoading = useState('omnix-agent-loading', () => false)
  const error = useState<string | null>('omnix-agent-error', () => null)

  /** Per-member, so switching accounts never inherits someone else's thread. */
  const storageKey = computed(() => `omnix.agent.session.${member.value?.member_id ?? 'anon'}`)

  function pushMessage(message: Omit<ChatMessage, 'id' | 'createdAt'>) {
    messages.value.push({
      ...message,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now()
    })
  }

  /** Resume the session id across reloads — the only handle on an existing thread. */
  function restore(): void {
    if (!import.meta.client) return
    const raw = window.localStorage.getItem(storageKey.value)
    sessionId.value = raw ? Number(raw) || null : null
  }

  function remember(id: number | null): void {
    sessionId.value = id
    if (!import.meta.client) return
    if (id) window.localStorage.setItem(storageKey.value, String(id))
    else window.localStorage.removeItem(storageKey.value)
  }

  /**
   * Open a session against the dedicated Omnix agent, once. `ai_agent_id` is
   * pinned in the endpoint's own params and is deliberately NOT sent from here
   * (see exposure note 1); passing it per-request is rejected anyway.
   */
  async function ensureSession(): Promise<number> {
    if (sessionId.value) return sessionId.value
    const res = await request<KurocoAgentSession>(routes.agentCreateSession, { method: 'POST', body: {} })
    const id = Number(res?.ai_session_id ?? 0)
    if (!id) throw new KurocoError('api', 'Kuroco created no agent session (no ai_session_id returned).')
    remember(id)
    return id
  }

  /**
   * Read-only poll of the session: an empty message skips the send (the
   * controller only dispatches when the message is non-empty) but still returns
   * the current event list and status.
   */
  async function pollOnce(id: number): Promise<KurocoAgentReply> {
    return request<KurocoAgentReply>(routes.agentSendMessage, {
      method: 'POST',
      body: { ai_session_id: id, message: '' }
    })
  }

  async function ask(text: string) {
    const trimmed = text.trim()
    if (!trimmed || isLoading.value) return
    if (!isSignedIn.value) {
      pushMessage({
        role: 'omnix',
        text: 'The assistant needs you signed in — its session is member-scoped. Sign in from the codex on the main chat, then come back.',
        isError: true
      })
      return
    }

    pushMessage({ role: 'user', text: trimmed })
    isLoading.value = true
    error.value = null

    try {
      const id = await ensureSession()

      // Snapshot the event count before sending, so we can tell the agent's
      // answer to THIS turn from the whole transcript. Tolerant of a warming
      // harness: if the read itself is rejected we simply start from zero.
      let before: KurocoAgentReply = { events: [], session_status: '' }
      try {
        before = await pollOnce(id)
      } catch (e) {
        if (!isHarnessWarming(e)) throw e
      }
      const baseline = (before.events ?? []).length

      // Send, retrying while the harness is still coming online.
      let sent = false
      for (let attempt = 0; attempt < SEND_WARMUP_ATTEMPTS; attempt++) {
        try {
          await request<KurocoAgentReply>(routes.agentSendMessage, {
            method: 'POST',
            body: { ai_session_id: id, message: trimmed }
          })
          sent = true
          break
        } catch (e) {
          if (!isHarnessWarming(e)) throw e
          if (attempt < SEND_WARMUP_ATTEMPTS - 1) await sleep(WARMUP_RETRY_MS)
        }
      }
      if (!sent) {
        pushMessage({
          role: 'omnix',
          text: 'The assistant is still warming up — its model was just set, so the agent takes a minute to come online. Give it a moment and try again.',
          isError: true
        })
        return
      }

      let last: KurocoAgentReply = before
      for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
        await sleep(POLL_INTERVAL_MS)
        last = await pollOnce(id)
        if (String(last.session_status ?? '') === 'idle') break
      }

      const events = last.events ?? []

      // Surface a harness/model error verbatim — e.g. an invalid Bedrock model
      // id shows up as a type:"error" event, not an agent.message, and silently
      // rendering "no answer" would hide the real cause. Confirmed shape.
      const failure = errorSince(events, baseline)
      if (failure) {
        pushMessage({ role: 'omnix', text: `The agent could not answer: ${failure}`, isError: true })
        return
      }

      if (requiresAction(events)) {
        pushMessage({
          role: 'omnix',
          text: 'The assistant tried to run a tool. Tools are disabled for this chat, so nothing was carried out. (If you did not expect this, the agent is mis-configured — the Omnix agent should have no tools.)',
          isError: true
        })
        return
      }

      const reply = decodeEntities(replySince(events, baseline))
      if (!reply) {
        pushMessage({
          role: 'omnix',
          text: 'The assistant returned no answer for that. It may still be thinking, or the session may have stalled — try again.',
          isError: true
        })
        return
      }

      pushMessage({ role: 'omnix', text: reply })
    } catch (e) {
      const text = isHarnessWarming(e)
        ? 'The assistant is still warming up — its model was just set, so the agent takes a minute to come online. Give it a moment and try again.'
        : explain(e)
      pushMessage({ role: 'omnix', text, isError: true })
    } finally {
      isLoading.value = false
    }
  }

  /** Drop the current session and transcript. The next question opens a new one. */
  function reset(): void {
    remember(null)
    messages.value = []
    error.value = null
  }

  return { messages, sessionId, isLoading, error, ask, reset, restore }
}

/**
 * The reply text produced *after* the given event count — the agent's response
 * to the turn just sent. Concatenates consecutive agent.message events so a
 * multi-part answer reads as one reply.
 */
function replySince(events: KurocoAgentEvent[], baseline: number): string {
  return events
    .slice(baseline)
    .filter((e) => (e.type ?? '') === 'agent.message')
    .map(eventText)
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

/** The first harness/model error raised after the turn was sent, if any. */
function errorSince(events: KurocoAgentEvent[], baseline: number): string {
  const e = events.slice(baseline).find((ev) => (ev.type ?? '') === 'error')
  if (!e) return ''
  return (e.error?.message ?? eventText(e) ?? 'unknown error').trim()
}

/** Pull readable text out of one event, whatever shape it arrived in. */
function eventText(e: KurocoAgentEvent): string {
  if (Array.isArray(e.content)) {
    const joined = e.content
      .filter((b) => (b.type ?? 'text') === 'text' && b.text)
      .map((b) => b.text as string)
      .join('\n')
      .trim()
    if (joined) return joined
  }
  return String(e.text ?? e.message ?? '').trim()
}

/**
 * True when the agent is idle but waiting to run a tool. With a properly
 * locked-down (tool-less) agent this never happens; if it does, the containment
 * assumption is broken and we surface it instead of confirming the tool.
 */
function requiresAction(events: KurocoAgentEvent[]): boolean {
  return events.some(
    (e) =>
      (e.type === 'session.status_idle' || e.type === 'session.thread_status_idle') &&
      e.stop_reason?.type === 'requires_action'
  )
}

/**
 * The transient "the agent's backend is still provisioning" error. Kuroco
 * raises a ValidationException reading "Harness is not in an invokable state:
 * CREATING" (or UPDATING) while the Bedrock harness comes online after the
 * agent is created or its model changes; it clears on its own.
 */
function isHarnessWarming(e: unknown): boolean {
  const msg = e instanceof KurocoError ? e.message : e instanceof Error ? e.message : String(e)
  return /invokable state|\bCREATING\b|\bUPDATING\b/i.test(msg)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function explain(error: unknown): string {
  if (error instanceof KurocoError) {
    switch (error.kind) {
      case 'network':
        return `Omnix could not reach the agent. ${error.message}`
      case 'auth':
        return 'Your session was rejected or has expired. Sign in again from the main chat.'
      case 'missing':
        return `The agent endpoint does not exist yet. ${error.message}`
      case 'api':
        return `Kuroco rejected the request: ${error.message}`
      default:
        return `Kuroco returned an error${error.status ? ` (HTTP ${error.status})` : ''}. ${error.message}`
    }
  }
  return `Something unexpected went wrong: ${error instanceof Error ? error.message : String(error)}`
}
