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
      kurocoApiBase: process.env.NUXT_PUBLIC_KUROCO_API_BASE || 'https://meroj.g.kuroco.app',

      // API structures. All three MUST be in `cookie` security mode: the app
      // authenticates with the member's session and ships no API token, because
      // a static bundle has nowhere to hide one. Default to 7 (cookie mode) for
      // all of them — note api 6 is static_token and also hosts the MCP server,
      // so it is deliberately NOT used from the browser.
      kurocoApiId: process.env.NUXT_PUBLIC_KUROCO_API_ID || '7',
      kurocoAuthApiId: process.env.NUXT_PUBLIC_KUROCO_AUTH_API_ID || '7',
      kurocoNotesApiId: process.env.NUXT_PUBLIC_KUROCO_NOTES_API_ID || '7',

      omnixEndpoint: process.env.NUXT_PUBLIC_OMNIX_ENDPOINT || 'chat_contents_search',

      authLoginPath: process.env.NUXT_PUBLIC_AUTH_LOGIN_PATH || 'auth/login',
      authLogoutPath: process.env.NUXT_PUBLIC_AUTH_LOGOUT_PATH || 'auth/logout',
      authProfilePath: process.env.NUXT_PUBLIC_AUTH_PROFILE_PATH || 'auth/profile',

      notesListPath: process.env.NUXT_PUBLIC_NOTES_LIST_PATH || 'notes/list',
      notesCreatePath: process.env.NUXT_PUBLIC_NOTES_CREATE_PATH || 'notes/create',
      notesUpdatePath: process.env.NUXT_PUBLIC_NOTES_UPDATE_PATH || 'notes/update',
      notesDeletePath: process.env.NUXT_PUBLIC_NOTES_DELETE_PATH || 'notes/delete'
    }
  }
})
