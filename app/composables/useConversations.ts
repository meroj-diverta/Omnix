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
   * Extension fields on group 25 carry no slug, so both the request body and the
   * list response name them `ext_1`..`ext_4` — verified against api 7's OpenAPI
   * document, not guessed. An earlier version read `ext_col_NN`, which does not
   * appear anywhere in the schema and would have read empty forever.
   */
  function ext(row: KurocoTopic, col: string): string {
    const v = row[col]
    return v === undefined || v === null ? '' : String(v)
  }

  /**
   * `ext_1` (session_id) is a *relation* field, so it is written as a plain
   * integer but reads back as `{module_type, module_id}`. Accept either, so the
   * field can later be changed to plain text without touching this code.
   */
  function readSessionId(row: KurocoTopic): number {
    const raw = row.ext_1 as unknown
    if (raw && typeof raw === 'object') {
      const rel = raw as { module_id?: number | string; topics_id?: number | string }
      return Number(rel.module_id ?? rel.topics_id ?? 0)
    }
    return Number(raw ?? 0)
  }

  function toMessage(row: KurocoTopic): ConversationMessage {
    const role = ext(row, 'ext_2').toLowerCase() === 'omnix' ? 'omnix' : 'user'
    return {
      id: Number(row.topics_id),
      role,
      body: decodeEntities(String(row.contents ?? '')),
      seq: Number(ext(row, 'ext_3') || 0),
      mode: ext(row, 'ext_4') || undefined
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
      // Sorted here rather than by a pinned `order_query` on the endpoint: the
      // ordering is presentation, and keeping it client-side means it can be
      // changed without an admin round trip.
      sessions.value = (res.list ?? res.topics_list ?? [])
        .map((r) => ({
          id: Number(r.topics_id),
          title: decodeEntities(String(r.subject ?? 'Untitled')),
          updatedAt: r.update_ymdhi
        }))
        .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
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
      // No server-side `filter` is sent. The endpoint's allow-list does name
      // ext_1, but ext_1 is a relation column and whether the filter DSL matches
      // one by bare id is unverified — a malformed filter fails the whole
      // request, whereas `my_own_list` + this client-side pass cannot. The cost
      // is that a member with more than 200 turns in total loses the oldest;
      // turn the server filter on once it has been exercised in a browser.
      const res = await request<KurocoTopicsList>(routes.messagesList, {
        method: 'GET',
        query: { cnt: 200 }
      })
      const rows = res.list ?? res.topics_list ?? []
      history.value = rows
        .filter((r) => readSessionId(r) === sessionId)
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
        // ext_1..ext_4 are the property names the endpoint actually accepts —
        // the fields have no slug, so their titles (session_id/role/seq/mode)
        // are not valid keys and would be silently ignored.
        body: {
          subject: `${role} #${seq}`,
          contents: body,
          ext_1: sessionId,
          ext_2: role,
          ext_3: seq,
          ext_4: mode ?? '',
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

  /** Switch to an existing conversation and load its turns. */
  async function openSession(sessionId: number): Promise<void> {
    remember(sessionId)
    history.value = []
    await loadMessages(sessionId)
  }

  /**
   * Delete a conversation. The id goes in the path, not the body — the bare
   * path 404s. Ownership is Kuroco's to enforce (owned-content edit
   * restriction), so another member's row comes back 403 rather than deleting.
   *
   * The message rows are left behind: there is no bulk delete on an append-only
   * structure, and they are unreachable once the session is gone.
   */
  async function deleteSession(sessionId: number): Promise<void> {
    try {
      await request(`${routes.sessionsDelete}/${sessionId}`, { method: 'POST' })
      sessions.value = sessions.value.filter((s) => s.id !== sessionId)
      if (currentId.value === sessionId) clearCurrent()
    } catch (e) {
      error.value = describe(e)
    }
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
    openSession,
    deleteSession,
    addMessage,
    withHistory,
    clearCurrent
  }
}

function describe(e: unknown): string {
  if (e instanceof KurocoError) return e.message
  return 'Something went wrong.'
}
