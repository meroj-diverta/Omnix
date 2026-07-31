import type { KurocoEnvelope } from '~/types/kuroco'
import { KurocoError } from '~/types/kuroco'

/**
 * Browser-direct Kuroco client.
 *
 * Replaces the old `server/api/omnix.post.ts` proxy. That route was dead code in
 * production: the app deploys via `nuxt generate` with only `.output/public`
 * shipped, so there is no Nitro server to host it — every call to /api/omnix
 * 404'd on the deployed site while working fine in `nuxt dev`.
 *
 * Calling Kuroco straight from the browser has two consequences worth knowing:
 *
 * 1. CORS is enforced, and it is configured per *API structure* (api_id), not
 *    per endpoint. An origin or request header missing from that structure's
 *    CORS config fails at preflight, before any handler runs.
 *
 * 2. **Auth is the member's session cookie — nothing else.** There is no API
 *    token in this app. A statically generated site has no server to keep a
 *    secret in, so any token here would be readable by every visitor. Every
 *    endpoint the frontend calls must therefore live on an API structure in
 *    `cookie` security mode, and the member signs in like a normal user.
 */

/**
 * `{apiId}/{path}` — everything after `/rcms-api/`. The api id is part of the
 * route because it is part of the URL, and it is what selects the structure's
 * security mode and CORS config (point 1 above).
 */
export type KurocoRoute = `${number}/${string}`

/**
 * Every Kuroco endpoint this app calls.
 *
 * Hardcoded rather than read from `runtimeConfig`/env on purpose: `public`
 * runtimeConfig is baked in at `nuxt generate` time on a static deploy, so an
 * env var is no more changeable at runtime than a literal here — it only spread
 * one URL across three files. Moving an endpoint to another structure is a
 * rebuild either way, so make it an edit to this table.
 *
 * 7  = "Omnix User Authentication Endpoints" (security: cookie) — chat, session
 *      and notes.
 * 10  = signup. Both routes are the same `Member::invite` endpoint plus the
 *      register endpoint; see useAuth.ts for the two-step body contract.
 * 6   = static_token and hosts the admin MCP server, so it is deliberately not
 *      called from the browser — that would mean shipping a token in the bundle.
 */
export const KUROCO_ROUTES = {
  // The four single-shot AI operations, one per chat mode. Verified live
  // 2026-07-30: chat_contents_search and chat_supplementary_search exist on
  // api 7; rag_search and chat exist only on api 6, which is static_token and
  // therefore unusable from a browser. Listed here anyway so the mode selector
  // is complete — until they are created on api 7 the client reports exactly
  // which path is missing on which structure, which is the useful failure.
  chat: '7/chat_contents_search',
  chatSupplementary: '7/chat_supplementary_search',
  ragSearch: '7/rag_search',
  chatPlain: '7/chat',

  login: '7/auth/login',
  // Second half of the login handshake — login returns a grant_token, this
  // exchanges it for a session. Both calls are required; see useAuth.signIn.
  token: '7/auth/token',
  logout: '7/auth/logout',
  profile: '7/auth/profile',

  // Signup. emailValidate is called twice with different bodies: `{email,
  // ext_info}` issues the code, `{email_hash}` verifies it.
  emailValidate: '10/auth/invite',
  register: '10/auth/register',

  notesList: '7/notes/list',
  notesCreate: '7/notes/create',
  notesUpdate: '7/notes/update',
  notesDelete: '7/notes/delete'
} as const satisfies Record<string, KurocoRoute>

export type KurocoRouteName = keyof typeof KUROCO_ROUTES

export interface KurocoRequestOptions {
  method?: 'GET' | 'POST'
  body?: Record<string, unknown>
  query?: Record<string, string | number | undefined>
}

/**
 * Kuroco returns content titles HTML-entity-encoded (e.g. "Roshan&#x27;s
 * Banner"). Moved here from the deleted server route.
 */
export function decodeEntities(value: string): string {
  if (!value) return ''
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

export function useKuroco() {
  const config = useRuntimeConfig()
  const base = String(config.public.kurocoApiBase || '').replace(/\/$/, '')

  async function request<T extends KurocoEnvelope>(
    route: KurocoRoute,
    options: KurocoRequestOptions = {}
  ): Promise<T> {
    const method = options.method ?? 'POST'
    // Split only for the error messages below — the request itself uses the
    // route verbatim.
    const [apiId, ...rest] = route.split('/')
    const path = rest.join('/')

    const url = new URL(`${base}/rcms-api/${route}`)
    for (const [k, v] of Object.entries(options.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }

    // Content-Type is the only header we set, and only when there is a body.
    //
    // Setting it on a GET is not harmless: `application/json` is not a
    // CORS-safelisted value, so it forces a preflight, and a preflight against a
    // path that does not exist fails opaquely. The browser then reports an
    // indistinguishable network error instead of the 404 — which cost real
    // confusion once already, because the "endpoint not created on structure N"
    // message below never got a chance to fire. Without the header a GET is a
    // simple request, no preflight, and real statuses come through.
    const headers: Record<string, string> =
      method === 'GET' ? {} : { 'Content-Type': 'application/json' }

    let response: Response
    try {
      response = await fetch(url.toString(), {
        method,
        headers,
        // Required for cookie-mode auth. The structure must also set
        // allowCredentials: true, and the origin must be listed explicitly —
        // a wildcard origin is not permitted alongside credentials.
        credentials: 'include',
        body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {})
      })
    } catch (cause) {
      throw new KurocoError(
        'network',
        `Could not reach Kuroco at ${url.host}. If the host is up, this is almost ` +
          `certainly CORS: check that this origin (${globalThis.location?.origin ?? 'unknown'}) ` +
          `is listed on API structure ${apiId}, and that any custom request headers are allowed.`,
        undefined,
        cause
      )
    }

    const raw = await response.text()
    let payload: T
    try {
      payload = raw ? (JSON.parse(raw) as T) : ({} as T)
    } catch {
      throw new KurocoError(
        'http',
        `Kuroco returned a non-JSON response (HTTP ${response.status}).`,
        response.status,
        raw.slice(0, 300)
      )
    }

    // The body is read before any status branching, because Kuroco's own message
    // is the only text that describes the actual failure — "Invalid E-mail",
    // "Invalid URL", "Password is required", "The password or e-mail (Login ID)
    // is incorrect." — and it arrives in `errors` on 401/400/422 exactly as it
    // does on a 200. Pass it through verbatim wherever it exists: do not
    // paraphrase it, and do not substitute a guess about the cause. If Kuroco's
    // wording is unclear, unclear is the honest thing to show.
    const serverMessage =
      Array.isArray(payload.errors) && payload.errors.length ? summariseErrors(payload.errors) : ''

    // 401/403 keeps kind 'auth' whatever the message says — refresh() depends on
    // that to read "not signed in" as the expected answer rather than a fault.
    if (response.status === 401 || response.status === 403) {
      throw new KurocoError(
        'auth',
        // Flatly generic when Kuroco sent no text, so that a message written
        // here can never be mistaken for one written by the server.
        serverMessage || `Something went wrong (HTTP ${response.status}).`,
        response.status,
        payload.errors
      )
    }

    // 404 is the one case worth adding to rather than quoting: the gateway says
    // only "[GW] API using this path does not exist", which names neither the
    // path nor the structure the caller needs to go and create it on.
    if (response.status === 404) {
      throw new KurocoError(
        'missing',
        `No endpoint "${path}" on Kuroco API structure ${apiId}. It has to be created in the ` +
          `admin UI (API > structure ${apiId} > add endpoint) before the app can call it.` +
          (serverMessage ? ` Kuroco said: ${serverMessage}` : ''),
        404,
        payload.errors
      )
    }

    if (serverMessage) {
      throw new KurocoError('api', serverMessage, response.status, payload.errors)
    }

    if (!response.ok) {
      throw new KurocoError('http', `Something went wrong (HTTP ${response.status}).`, response.status, payload)
    }

    return payload
  }

  return { request, routes: KUROCO_ROUTES, base, decodeEntities }
}

/** Kuroco error entries are sometimes strings, sometimes {message}/{msg} objects. */
function summariseErrors(errors: unknown[]): string {
  const parts = errors.map((e) => {
    if (typeof e === 'string') return e
    if (e && typeof e === 'object') {
      const o = e as Record<string, unknown>
      return String(o.message ?? o.msg ?? JSON.stringify(o))
    }
    return String(e)
  })
  return parts.join('; ') || 'Kuroco reported an unspecified error.'
}
