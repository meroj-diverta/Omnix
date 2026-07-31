/**
 * Shapes returned by the Kuroco endpoints Omnix talks to.
 *
 * Only the fields we actually consume are declared. Kuroco returns a good deal
 * more (pageInfo, server_timings, etc.) and adding it here would just create
 * maintenance debt.
 */

/** Every rcms-api response carries `errors`, even on HTTP 200. */
export interface KurocoEnvelope {
  errors?: unknown[]
  messages?: string[]
}

/** One retrieved row from rag_search / chat_contents_search. */
export interface KurocoSearchHit {
  subject?: string
  slug?: string
  topics_group_id?: number
  vector_distance?: number
  contents_type_nm?: string
  image?: string
}

export interface KurocoChatResponse extends KurocoEnvelope {
  reply?: string
  question?: string
  list?: KurocoSearchHit[]
}

/**
 * Login::login_challenge — the *first* of two login calls. It sets no session;
 * `grant_token` must be posted to Login::token to get one.
 */
export interface KurocoLoginChallenge extends KurocoEnvelope {
  grant_token?: string
  member_id?: number
  info?: { validUntil?: number }
}

/** Login::profile — the logged-in member. */
export interface KurocoProfile extends KurocoEnvelope {
  member_id?: number
  email?: string
  name1?: string
  name2?: string
  nickname?: string
  login_id?: string
}

/** A row from the member-owned notes structure. */
export interface KurocoTopic extends KurocoEnvelope {
  topics_id: number
  subject?: string
  contents?: string
  slug?: string
  open_flg?: number
  member_id?: number
  inst_ymdhi?: string
  update_ymdhi?: string
  [extCol: string]: unknown
}

export interface KurocoTopicsList extends KurocoEnvelope {
  list?: KurocoTopic[]
  /** Some endpoints name it `list`, the admin ones `topics_list`. */
  topics_list?: KurocoTopic[]
  pageInfo?: { totalCnt?: number; perPage?: number; pageNo?: number }
}

/**
 * Why a request failed.
 *
 * `network` is called out separately because in the browser a blocked CORS
 * preflight is indistinguishable from an offline host — fetch rejects with an
 * opaque TypeError either way — and CORS misconfiguration is the likelier cause.
 *
 * `missing` means the endpoint is not defined on that API structure at all.
 * Kuroco answers with HTTP 404 and `[GW] API using this path does not exist`.
 * Worth its own kind: it is a "you haven't created this yet" problem, not a
 * runtime fault, and it is easy to mistake for an auth or routing bug.
 */
export type KurocoErrorKind = 'network' | 'auth' | 'missing' | 'http' | 'api'

export class KurocoError extends Error {
  kind: KurocoErrorKind
  status?: number
  detail?: unknown

  constructor(kind: KurocoErrorKind, message: string, status?: number, detail?: unknown) {
    super(message)
    this.name = 'KurocoError'
    this.kind = kind
    this.status = status
    this.detail = detail
  }
}
