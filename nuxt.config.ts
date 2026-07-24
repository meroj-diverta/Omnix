// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'Oracle of the Ancient — Dota 2 Companion',
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Inter:wght@400;500;600&display=swap'
        }
      ]
    }
  },
  runtimeConfig: {
    kurocoAccessToken: process.env.KUROCO_ACCESS_TOKEN || '',
    public: {
      kurocoApiBase: process.env.NUXT_PUBLIC_KUROCO_API_BASE || 'https://meroj.g.kuroco.app',
      kurocoApiId: process.env.NUXT_PUBLIC_KUROCO_API_ID || '6',
      oracleEndpoint: process.env.NUXT_PUBLIC_ORACLE_ENDPOINT || 'chat_contents_search',
      oracleConfigured: Boolean(process.env.KUROCO_ACCESS_TOKEN)
    }
  }
})
