import type { ChatMessage, OracleResponse } from '~/types/chat'

const MOCK_ANSWERS = [
  '"BKB" is short for Black King Bar — an item that makes you immune to most magic and disables for a few seconds. Think of it as a panic button for surviving a gank.',
  '"CC" means crowd control — anything that stuns, roots, slows, or silences a hero so they can\'t act freely. If you hear "he has no CC," it means the enemy can\'t lock you down.',
  'Faceless Void is a Radiant hero who bends time itself. His ultimate, Chronosphere, freezes everyone inside a bubble except him — a great tool for picking off an entire enemy team at once.',
  '"Stacking" means pulling a jungle camp to another spot right before it respawns, so an extra set of creeps spawns there for later — a classic trick for earning bonus gold.',
  '"Buyback" lets you pay gold to respawn instantly after dying, instead of waiting out the timer — useful for stopping the enemy from destroying your base while your team is down a player.'
]

let mockId = 0
function nextMockAnswer(query: string): OracleResponse {
  const answer = MOCK_ANSWERS[mockId % MOCK_ANSWERS.length]
  mockId += 1
  return {
    answer: `${answer}\n\n(This is a placeholder answer — the real Kuroco/RAG endpoint hasn't been wired up yet for: "${query}")`
  }
}

export function useOracle() {
  const config = useRuntimeConfig()

  const messages = useState<ChatMessage[]>('oracle-messages', () => [])
  const isLoading = useState('oracle-loading', () => false)

  function pushMessage(message: Omit<ChatMessage, 'id' | 'createdAt'>) {
    messages.value.push({
      ...message,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now()
    })
  }

  async function ask(query: string) {
    const trimmed = query.trim()
    if (!trimmed || isLoading.value) return

    pushMessage({ role: 'user', text: trimmed })
    isLoading.value = true

    try {
      let response: OracleResponse

      if (config.public.oracleConfigured) {
        response = await $fetch<OracleResponse>('/api/oracle', {
          method: 'POST',
          body: { text: trimmed }
        })
      } else {
        await new Promise((resolve) => setTimeout(resolve, 700))
        response = nextMockAnswer(trimmed)
      }

      pushMessage({ role: 'oracle', text: response.answer, images: response.images, sources: response.sources })
    } catch {
      pushMessage({
        role: 'oracle',
        text: 'The Ancients are silent... the connection to the Oracle failed. Try again.',
        isError: true
      })
    } finally {
      isLoading.value = false
    }
  }

  return { messages, isLoading, ask }
}
