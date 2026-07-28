interface KurocoChatResponse {
  errors: string[]
  reply: string
  messages: string[]
  list: { subject: string; slug: string; image?: string }[]
}

// Kuroco content titles come HTML-entity-encoded (e.g. "Roshan&#x27;s Banner")
function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const { text } = await readBody<{ text: string }>(event)

  if (!config.kurocoAccessToken) {
    throw createError({ statusCode: 501, statusMessage: 'Kuroco access token not configured' })
  }

  const kurocoResponse = await $fetch<KurocoChatResponse>(
    `${config.public.kurocoApiBase}/rcms-api/${config.public.kurocoApiId}/${config.public.omnixEndpoint}`,
    {
      method: 'POST',
      headers: { 'X-RCMS-API-ACCESS-TOKEN': config.kurocoAccessToken },
      body: { text }
    }
  )

  if (kurocoResponse.errors?.length) {
    throw createError({ statusCode: 502, statusMessage: kurocoResponse.errors.join(', ') })
  }

  return {
    answer: kurocoResponse.reply || kurocoResponse.messages?.[0] || "Omnix has nothing to say about that.",
    sources: kurocoResponse.list?.map((item) => ({ subject: decodeEntities(item.subject), slug: item.slug })),
    images: kurocoResponse.list
      ?.filter((item) => item.image)
      .map((item) => ({ url: item.image as string, alt: decodeEntities(item.subject) }))
  }
})
