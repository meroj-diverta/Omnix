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
 * 7 = "Omnix User Authentication Endpoints" (security: cookie). Api 6 is
 * static_token and hosts the admin MCP server, so it is deliberately not called
 * from the browser — that would mean shipping a token in the bundle.
 */
export const KUROCO_ROUTES = {
  chat: '7/chat_contents_search',
  login: '7/auth/login',
  logout: '7/auth/logout',
  // Signup. Api 7 currently has only `auth/email-verification` (Member::invite,
  // the step that mails the token), so this needs creating alongside the rest.
  register: '7/auth/register',
  profile: '7/auth/profile',
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

    // Content-Type is the only header we set. Deliberate: it keeps the request
    // "simple" enough that the only CORS requirements are the origin and
    // allowCredentials — no custom header needs allow-listing per structure.
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }

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

    if (response.status === 401 || response.status === 403) {
      throw new KurocoError('auth', 'Not signed in, or the session expired.', response.status)
    }

    // Kuroco returns 404 + "[GW] API using this path does not exist" for a path
    // that was never defined on that structure. Name both so the fix is obvious;
    // otherwise this reads like a routing or auth bug.
    if (response.status === 404) {
      throw new KurocoError(
        'missing',
        `No endpoint "${path}" on Kuroco API structure ${apiId}. It has to be created in the ` +
          `admin UI (API > structure ${apiId} > add endpoint) before the app can call it.`,
        404
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

    if (!response.ok) {
      throw new KurocoError('http', `Kuroco returned HTTP ${response.status}.`, response.status, payload)
    }

    // A 200 with a populated `errors` array is a normal Kuroco failure mode.
    if (Array.isArray(payload.errors) && payload.errors.length) {
      throw new KurocoError('api', summariseErrors(payload.errors), response.status, payload.errors)
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
