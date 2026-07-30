import type { ChatMessage, OmnixResponse } from '~/types/chat'
import type { KurocoChatResponse } from '~/types/kuroco'
import { KurocoError } from '~/types/kuroco'

export function useOmnix() {
  const { request, routes, decodeEntities } = useKuroco()

  const messages = useState<ChatMessage[]>('omnix-messages', () => [])
  const isLoading = useState('omnix-loading', () => false)

  function pushMessage(message: Omit<ChatMessage, 'id' | 'createdAt'>) {
    messages.value.push({
      ...message,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now()
    })
  }

  function toOmnixResponse(res: KurocoChatResponse): OmnixResponse {
    const hits = res.list ?? []
    return {
      answer: res.reply || res.messages?.[0] || '',
      sources: hits
        .filter((h) => h.subject || h.slug)
        .map((h) => ({ subject: decodeEntities(String(h.subject ?? '')), slug: String(h.slug ?? '') })),
      images: hits
        .filter((h) => h.image)
        .map((h) => ({ url: String(h.image), alt: decodeEntities(String(h.subject ?? '')) }))
    }
  }

  async function ask(query: string) {
    const trimmed = query.trim()
    if (!trimmed || isLoading.value) return

    pushMessage({ role: 'user', text: trimmed })

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
      const res = await request<KurocoChatResponse>(routes.chat, {
        method: 'POST',
        body: { text: trimmed }
      })
      const response = toOmnixResponse(res)

      if (!response.answer) {
        // A 200 with an empty reply is a real outcome: retrieval found nothing,
        // or the model returned nothing. Report it as such — do not paper over it.
        pushMessage({
          role: 'omnix',
          text: 'Kuroco answered, but returned no text for that question. There may be nothing in the indexed content that matches it.',
          sources: response.sources,
          isError: true
        })
        return
      }

      pushMessage({
        role: 'omnix',
        text: response.answer,
        images: response.images,
        sources: response.sources
      })
    } catch (error) {
      // Name the failing layer. A catch-all "connection failed" cost real
      // debugging time, because from inside the browser a blocked CORS preflight
      // is indistinguishable from an unreachable host.
      pushMessage({ role: 'omnix', text: explain(error), isError: true })
    } finally {
      isLoading.value = false
    }
  }

  return { messages, isLoading, ask }
}

function explain(error: unknown): string {
  if (error instanceof KurocoError) {
    switch (error.kind) {
      case 'network':
        return `Omnix could not reach Kuroco. ${error.message}`
      case 'auth':
        return 'Your Kuroco session was rejected or has expired. Sign in again from the panel on the right.'
      case 'missing':
        return `Omnix is pointed at an endpoint that does not exist yet. ${error.message}`
      case 'api':
        return `Kuroco rejected the question: ${error.message}`
      default:
        return `Kuroco returned an error${error.status ? ` (HTTP ${error.status})` : ''}. ${error.message}`
    }
  }
  return `Something unexpected went wrong: ${error instanceof Error ? error.message : String(error)}`
}
