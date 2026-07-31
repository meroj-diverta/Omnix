export interface ChatImage {
  url: string
  alt: string
}

export interface ChatSource {
  subject: string
  slug: string
}

/**
 * Which Kuroco AI operation answers a question.
 *
 * Exposed in the UI on purpose: this project exists to exercise Kuroco's AI
 * features, and putting the four single-shot operations side by side in one
 * chat makes their differences observable instead of theoretical.
 */
export type ChatMode = 'answer' | 'supplementary' | 'sources' | 'raw' | 'agent'

export interface ChatModeInfo {
  key: ChatMode
  label: string
  /** Shown in the picker — what the operation actually does. */
  hint: string
  operation: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'omnix'
  text: string
  images?: ChatImage[]
  sources?: ChatSource[]
  createdAt: number
  isError?: boolean
  /** Which mode produced this reply, so answers stay comparable in one thread. */
  mode?: ChatMode
}

export interface OmnixResponse {
  answer: string
  images?: ChatImage[]
  sources?: ChatSource[]
}
