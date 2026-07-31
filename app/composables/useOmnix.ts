import type { ChatMessage, ChatMode, ChatModeInfo, OmnixResponse } from '~/types/chat'
import type { KurocoChatResponse, KurocoSearchHit } from '~/types/kuroco'
import { KurocoError } from '~/types/kuroco'

/**
 * The four single-shot Kuroco AI operations, as selectable chat modes.
 *
 * They differ in whether they retrieve, whether they generate, or both:
 *
 *   answer        retrieval + generation   OpenAI::chat_contents_search
 *   supplementary retrieval + generation   OpenAI::chat_supplementary_search
 *   sources       retrieval only           OpenAI::rag_search
 *   raw           generation only          OpenAI::chat
 *
 * `sources` and `raw` currently exist only on api 6, which is static_token and
 * cannot be called from a browser. Selecting them reports which path is missing
 * on which structure — see KUROCO_ROUTES.
 */
export const CHAT_MODES: ChatModeInfo[] = [
  { key: 'answer', label: 'Answer', hint: 'Retrieve + generate — the normal mode', operation: 'chat_contents_search' },
  { key: 'supplementary', label: 'Supplementary', hint: 'Retrieve + generate over the supplementary source', operation: 'chat_supplementary_search' },
  { key: 'sources', label: 'Sources only', hint: 'Retrieve, no generated answer', operation: 'rag_search' },
  { key: 'raw', label: 'No retrieval', hint: 'Plain model answer, ignores indexed content', operation: 'chat' }
]

export function useOmnix() {
  const { request, routes, decodeEntities } = useKuroco()
  const conversation = useConversations()

  const { isSignedIn } = useAuth()

  const messages = useState<ChatMessage[]>('omnix-messages', () => [])
  const isLoading = useState('omnix-loading', () => false)
  const mode = useState<ChatMode>('omnix-mode', () => 'answer')

  function pushMessage(message: Omit<ChatMessage, 'id' | 'createdAt'>) {
    messages.value.push({
      ...message,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now()
    })
  }

  function toSources(hits: KurocoSearchHit[]) {
    return hits
      .filter((h) => h.subject || h.slug)
      .map((h) => ({ subject: decodeEntities(String(h.subject ?? '')), slug: String(h.slug ?? '') }))
  }

  function toImages(hits: KurocoSearchHit[]) {
    return hits
      .filter((h) => h.image)
      .map((h) => ({ url: String(h.image), alt: decodeEntities(String(h.subject ?? '')) }))
  }

  /**
   * `rag_search` returns matches with no generated answer, so the retrieved text
   * itself becomes the reply body. It is rendered as-is: nothing is summarised
   * or paraphrased here, because the point of this mode is seeing what retrieval
   * actually returned before a model touches it.
   */
  function retrievalOnlyBody(hits: KurocoSearchHit[]): string {
    if (!hits.length) return ''
    return hits
      .map((h, i) => {
        const title = decodeEntities(String(h.subject ?? `Match ${i + 1}`))
        const distance = typeof h.vector_distance === 'number' ? ` _(distance ${h.vector_distance.toFixed(3)})_` : ''
        const body = decodeEntities(String((h as Record<string, unknown>).contents ?? '')).trim()
        return `**${title}**${distance}${body ? `\n\n${body}` : ''}`
      })
      .join('\n\n---\n\n')
  }

  function normalise(res: KurocoChatResponse, forMode: ChatMode): OmnixResponse {
    const hits = res.list ?? []
    const answer = forMode === 'sources' ? retrievalOnlyBody(hits) : res.reply || res.messages?.[0] || ''
    return { answer, sources: toSources(hits), images: toImages(hits) }
  }

  async function ask(query: string, asMode: ChatMode = mode.value) {
    const trimmed = query.trim()
    if (!trimmed || isLoading.value) return

    pushMessage({ role: 'user', text: trimmed })

    // Persist the turn and pick up conversational context. Only meaningful for a
    // signed-in member — the structures are member-owned — so an anonymous chat
    // still works, just without history. Failures here are recorded in
    // conversation.error and never block answering the question.
    let sessionId = conversation.currentId.value
    if (isSignedIn.value) {
      if (!sessionId) sessionId = await conversation.startSession(trimmed)
      if (sessionId) await conversation.addMessage(sessionId, 'user', trimmed, asMode)
    }

    // The stateless operations get the last few questions prepended so follow-ups
    // resolve; see HISTORY_TURNS.
    const outgoing = isSignedIn.value ? conversation.withHistory(trimmed) : trimmed

    // No sign-in gate: verified 2026-07-29 that a cookie-mode API structure
    // answers unauthenticated requests unless the endpoint itself carries an
    // `auth` restriction, and the chat endpoints deliberately carry none. Only
    // the notes endpoints require a member.
    //
    // Nothing is faked here either. Canned replies used to stand in when
    // unconfigured, which made a broken setup look like a working product — the
    // worst failure mode for a tool whose entire job is being trusted on facts.
    isLoading.value = true
    try {
      // rag_search takes its query on the query string, not in a JSON body —
      // confirmed against the live endpoint on api 6. The other three take
      // {text} by POST.
      const res =
        asMode === 'sources'
          ? await request<KurocoChatResponse>(routes.ragSearch, { method: 'GET', query: { query: outgoing } })
          : await request<KurocoChatResponse>(routeFor(asMode), { method: 'POST', body: { text: outgoing } })

      const response = normalise(res, asMode)

      if (!response.answer) {
        // A 200 with an empty reply is a real outcome: retrieval found nothing,
        // or the model returned nothing. Report it as such — do not paper over it.
        pushMessage({
          role: 'omnix',
          mode: asMode,
          text: 'Kuroco answered, but returned no text for that question. There may be nothing in the indexed content that matches it.',
          sources: response.sources,
          isError: true
        })
        return
      }

      pushMessage({
        role: 'omnix',
        mode: asMode,
        text: response.answer,
        images: response.images,
        sources: response.sources
      })

      if (sessionId) await conversation.addMessage(sessionId, 'omnix', response.answer, asMode)
    } catch (error) {
      // Name the failing layer. A catch-all "connection failed" cost real
      // debugging time, because from inside the browser a blocked CORS preflight
      // is indistinguishable from an unreachable host.
      pushMessage({ role: 'omnix', mode: asMode, text: explain(error), isError: true })
    } finally {
      isLoading.value = false
    }
  }

  function routeFor(m: ChatMode) {
    switch (m) {
      case 'supplementary':
        return routes.chatSupplementary
      case 'raw':
        return routes.chatPlain
      case 'sources':
        return routes.ragSearch
      default:
        return routes.chat
    }
  }

  return { messages, isLoading, mode, modes: CHAT_MODES, ask, conversation }
}

function explain(error: unknown): string {
  if (error instanceof KurocoError) {
    switch (error.kind) {
      case 'network':
        return `Omnix could not reach Kuroco. ${error.message}`
      case 'auth':
        return 'Your Kuroco session was rejected or has expired. Sign in again from the panel on the right.'
      case 'missing':
        return `That mode's endpoint does not exist yet. ${error.message}`
      case 'api':
        return `Kuroco rejected the question: ${error.message}`
      default:
        return `Kuroco returned an error${error.status ? ` (HTTP ${error.status})` : ''}. ${error.message}`
    }
  }
  return `Something unexpected went wrong: ${error instanceof Error ? error.message : String(error)}`
}
