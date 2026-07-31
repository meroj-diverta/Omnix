import type { ChatMode } from '~/types/chat'
import type { KurocoTopic, KurocoTopicsList } from '~/types/kuroco'
import { KurocoError } from '~/types/kuroco'

/**
 * Conversation history, stored in our own content structures.
 *
 * Kuroco's AI Agent sessions are the only tier that keeps history server-side,
 * but they were rejected deliberately (2026-07-31): tool grants live on the
 * agent rather than per-caller, so prompt injection against an exposed agent
 * escalates to whatever that agent can do — and separately, `ai_session_id`
 * ownership is not enforced, so transcripts leak between members. Owning the
 * history avoids both, at the cost of replaying context on every request
 * because the single-shot operations are stateless.
 *
 * Two structures:
 *   omnix_sessions  — one row per conversation
 *   omnix_messages  — one row per turn, carrying session_id / role / seq / mode
 *
 * Messages are append-only: create and list, no update or delete.
 */

/**
 * How many earlier **user** questions ride along with a new one.
 *
 * Deliberately the questions only, not the answers: they carry the referent that
 * makes a follow-up like "what about his other ability?" resolvable, at a
 * fraction of the tokens, and without pasting generated prose back into a vector
 * search — which dilutes retrieval more than it helps. Three is a starting
 * guess, chosen to be easy to change once we can measure it.
 */
export const HISTORY_TURNS = 3

export interface ConversationMessage {
  id: number
  role: 'user' | 'omnix'
  body: string
  seq: number
  mode?: string
}

export interface ConversationSummary {
  id: number
  title: string
  updatedAt?: string
}

export function useConversations() {
  const { request, routes, decodeEntities } = useKuroco()
  const { member, isSignedIn } = useAuth()

  const sessions = useState<ConversationSummary[]>('omnix-sessions', () => [])
  const currentId = useState<number | null>('omnix-session-current', () => null)
  const history = useState<ConversationMessage[]>('omnix-session-history', () => [])
  const error = useState<string | null>('omnix-session-error', () => null)

  /** Per member, so switching accounts doesn't resume someone else's thread. */
  const storageKey = computed(() => `omnix.conversation.${member.value?.member_id ?? 'anon'}`)

  function restore(): void {
    if (!import.meta.client) return
    const raw = window.localStorage.getItem(storageKey.value)
    currentId.value = raw ? Number(raw) || null : null
  }

  function remember(id: number | null): void {
    currentId.value = id
    if (!import.meta.client) return
    if (id) window.localStorage.setItem(storageKey.value, String(id))
    else window.localStorage.removeItem(storageKey.value)
  }

  /**
   * Extension values come back either under their slug or as `ext_col_NN`
   * depending on the site's response format, and this site has been seen using
   * both. Read whichever is present rather than betting on one.
   */
  function ext(row: KurocoTopic, slug: string, col: string): string {
    const v = row[slug] ?? row[col]
    return v === undefined || v === null ? '' : String(v)
  }

  function toMessage(row: KurocoTopic): ConversationMessage {
    const role = ext(row, 'role', 'ext_col_02').toLowerCase() === 'omnix' ? 'omnix' : 'user'
    return {
      id: Number(row.topics_id),
      role,
      body: decodeEntities(String(row.contents ?? '')),
      seq: Number(ext(row, 'seq', 'ext_col_03') || 0),
      mode: ext(row, 'mode', 'ext_col_04') || undefined
    }
  }

  async function listSessions(): Promise<void> {
    if (!isSignedIn.value) {
      sessions.value = []
      return
    }
    try {
      const res = await request<KurocoTopicsList>(routes.sessionsList, {
        method: 'GET',
        query: { cnt: 50 }
      })
      sessions.value = (res.list ?? res.topics_list ?? []).map((r) => ({
        id: Number(r.topics_id),
        title: decodeEntities(String(r.subject ?? 'Untitled')),
        updatedAt: r.update_ymdhi
      }))
    } catch (e) {
      error.value = describe(e)
    }
  }

  /** Start a conversation. The title is the opening question, trimmed to fit. */
  async function startSession(firstQuestion: string): Promise<number | null> {
    try {
      const title = firstQuestion.trim().slice(0, 80) || 'New conversation'
      const res = await request<KurocoTopic & { id?: number }>(routes.sessionsCreate, {
        method: 'POST',
        // open_flg is what makes the row visible to list at all — without it the
        // insert succeeds, returns an id, and the row is invisible (F22).
        body: { subject: title, contents: '', open_flg: 1 }
      })
      const id = Number(res?.id ?? res?.topics_id)
      if (!id) {
        error.value = 'Kuroco created the conversation but returned no id.'
        return null
      }
      remember(id)
      history.value = []
      await listSessions()
      return id
    } catch (e) {
      error.value = describe(e)
      return null
    }
  }

  async function loadMessages(sessionId: number): Promise<void> {
    try {
      const res = await request<KurocoTopicsList>(routes.messagesList, {
        method: 'GET',
        // Filtered server-side where the endpoint allows it, and again on the
        // client: the filter key depends on the site's ext response format, so
        // the second pass guarantees correctness even if the first is ignored.
        query: { cnt: 200, filter: `ext_col_01 eq ${sessionId}` }
      })
      const rows = res.list ?? res.topics_list ?? []
      history.value = rows
        .filter((r) => Number(ext(r, 'session_id', 'ext_col_01')) === sessionId)
        .map(toMessage)
        .sort((a, b) => a.seq - b.seq)
    } catch (e) {
      error.value = describe(e)
    }
  }

  /** Append one turn. Sessions are append-only, so there is no update path. */
  async function addMessage(
    sessionId: number,
    role: 'user' | 'omnix',
    body: string,
    mode?: ChatMode
  ): Promise<void> {
    const seq = (history.value.at(-1)?.seq ?? -1) + 1
    // Optimistic: the transcript on screen should not wait on a round trip, and
    // a failed save is reported rather than silently dropping the turn.
    history.value = [...history.value, { id: -seq, role, body, seq, mode }]
    try {
      await request(routes.messagesCreate, {
        method: 'POST',
        body: {
          subject: `${role} #${seq}`,
          contents: body,
          session_id: String(sessionId),
          role,
          seq,
          mode: mode ?? '',
          open_flg: 1
        }
      })
    } catch (e) {
      error.value = `That turn was not saved: ${describe(e)}`
    }
  }

  /**
   * The question, with recent context prepended so follow-ups resolve.
   *
   * Only the user's own earlier questions are included — see HISTORY_TURNS. The
   * marker text is plain and short, because whatever is added here also lands in
   * the vector search.
   */
  function withHistory(question: string): string {
    const earlier = history.value
      .filter((m) => m.role === 'user')
      .slice(-HISTORY_TURNS)
      .map((m) => m.body.trim())
      .filter(Boolean)
    if (!earlier.length) return question
    return `Earlier questions in this conversation:\n${earlier.map((q) => `- ${q}`).join('\n')}\n\nCurrent question: ${question}`
  }

  function clearCurrent(): void {
    remember(null)
    history.value = []
  }

  return {
    sessions,
    currentId,
    history,
    error,
    restore,
    listSessions,
    startSession,
    loadMessages,
    addMessage,
    withHistory,
    clearCurrent
  }
}

function describe(e: unknown): string {
  if (e instanceof KurocoError) return e.message
  return 'Something went wrong.'
}
