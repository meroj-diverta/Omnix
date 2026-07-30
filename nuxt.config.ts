// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'Omnix of the Ancient — Dota 2 Companion',
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
  // The site ships as a static bundle (`nuxt generate`, only .output/public is
  // deployed), so there is no server at runtime. Everything the app needs must
  // live in `public` and every API call goes browser-direct to Kuroco.
  runtimeConfig: {
    public: {
      // Only the host is configurable. The endpoints themselves — api structure
      // id and path — live in `KUROCO_ROUTES` in app/composables/useKuroco.ts,
      // because `public` runtimeConfig is baked in at generate time anyway, so
      // an env var here is no more changeable at runtime than a literal there.
      kurocoApiBase: process.env.NUXT_PUBLIC_KUROCO_API_BASE || 'https://meroj.g.kuroco.app'
    }
  }
})
