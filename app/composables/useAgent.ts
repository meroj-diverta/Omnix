import type { KurocoAgentReply, KurocoAgentSession } from '~/types/kuroco'
import { KurocoError } from '~/types/kuroco'

/**
 * Kuroco AI Agent sessions — the only tier that carries conversation history.
 *
 * The single-shot operations (`chat_contents_search` and friends) are stateless:
 * every question starts from nothing. An agent session is a server-side thread,
 * so follow-up questions like "what about his other ability?" can work. That is
 * the whole reason for this composable.
 *
 * ---
 *
 * ⚠️ KNOWN, ACCEPTED SECURITY EXPOSURE — read before shipping this to real users.
 *
 * Kuroco performs **no authorization** on a caller-supplied `ai_session_id` in
 * the `send_message` REST path (verified against source; see
 * CLAUDE_SESSION_FINDINGS §7.5 and feedback log F15):
 *
 *   - session ids are sequential integers, so they are trivially enumerable;
 *   - `t_ai_session.member_id` exists and is written, but is never checked on
 *     this path;
 *   - the response carries the full transcript, so a single call both injects
 *     into and exfiltrates another member's conversation.
 *
 * The usual mitigation is a server that maps authenticated member → session id
 * and never accepts one from the client. This app is statically generated, so
 * there is no such server: the id necessarily lives in the browser.
 *
 * It is deliberate here. This project exists to exercise Kuroco's AI features
 * and report what needs improving, and a working two-member reproduction of the
 * ownership gap is worth more than a source-reading argument. That reasoning
 * holds for a test site with test members and **does not** survive contact with
 * real users. Do not ship this shape.
 */
export function useAgent() {
  const { request, routes } = useKuroco()
  const { member } = useAuth()

  const sessionId = useState<number | null>('omnix-agent-session', () => null)
  const isBusy = useState('omnix-agent-busy', () => false)
  const error = useState<string | null>('omnix-agent-error', () => null)

  /** Per-member, so switching accounts doesn't inherit someone else's thread. */
  const storageKey = computed(() => `omnix.agent.session.${member.value?.member_id ?? 'anon'}`)

  /**
   * Sessions outlive a page load, so the id is kept in localStorage. It is not a
   * secret in any meaningful sense — see the exposure note above — but it is the
   * only handle on an existing conversation, and losing it strands the thread
   * server-side with no way back to it.
   */
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

  /** Start a fresh thread. The agent is pinned server-side via ai_agent_id. */
  async function startSession(): Promise<number | null> {
    isBusy.value = true
    error.value = null
    try {
      const res = await request<KurocoAgentSession>(routes.agentCreateSession, {
        method: 'POST',
        body: {}
      })
      // ai_agent_id is deliberately NOT sent: it has to be pinned in the
      // endpoint's own params, and passing it per-request is rejected.
      const id = Number(res?.ai_session_id)
      if (!id) {
        error.value = 'Kuroco created no session id, so there is nothing to talk to.'
        return null
      }
      remember(id)
      return id
    } catch (e) {
      error.value = describe(e)
      return null
    } finally {
      isBusy.value = false
    }
  }

  /** Forget the current thread locally. The server-side session is left alone. */
  function endSession(): void {
    remember(null)
    error.value = null
  }

  /**
   * Send one turn, starting a session first if there isn't one. Returns the
   * agent's reply text, or null when the call failed (`error` explains).
   */
  async function send(message: string): Promise<string | null> {
    const id = sessionId.value ?? (await startSession())
    if (!id) return null

    isBusy.value = true
    error.value = null
    try {
      const res = await request<KurocoAgentReply>(routes.agentSendMessage, {
        method: 'POST',
        body: { ai_session_id: id, message }
      })
      return readReply(res)
    } catch (e) {
      error.value = describe(e)
      return null
    } finally {
      isBusy.value = false
    }
  }

  return { sessionId, isBusy, error, restore, startSession, endSession, send }
}

/**
 * The agent reply shape is not documented and was never observed working — the
 * one attempt died on a Bedrock model id. So look in the plausible places rather
 * than assume a field, and say plainly when nothing resembles a reply, instead
 * of rendering "undefined" as though the agent had answered.
 */
function readReply(res: KurocoAgentReply): string {
  const candidates = [res?.reply, res?.message, res?.text, res?.content, res?.data?.message, res?.data?.reply]
  const found = candidates.find((c) => typeof c === 'string' && c.trim())
  if (found) return found as string
  return `The agent replied, but in a shape this app does not recognise yet. Raw response: ${JSON.stringify(res).slice(0, 400)}`
}

function describe(error: unknown): string {
  if (error instanceof KurocoError) return error.message
  return 'Something went wrong.'
}
