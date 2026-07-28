export interface ChatImage {
  url: string
  alt: string
}

export interface ChatSource {
  subject: string
  slug: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'omnix'
  text: string
  images?: ChatImage[]
  sources?: ChatSource[]
  createdAt: number
  isError?: boolean
}

export interface OmnixResponse {
  answer: string
  images?: ChatImage[]
  sources?: ChatSource[]
}
