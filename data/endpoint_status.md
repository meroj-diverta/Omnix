# Endpoint reality check — meroj.g.kuroco.app/rcms-api

Probed directly over HTTP on 2026-07-29. There is **no** public endpoint listing
(`/_openapi`, `/swagger`, `/docs` all 404), so this is HTTP probing plus the
admin `api_list_uri` read taken before the MCP session dropped.

How to read the codes: **401** means the endpoint exists and wants credentials.
**400** means it exists and rejected an empty body. **404 with
`[GW] API using this path does not exist`** means it was never created.

## What exists

| Path | Result | Meaning |
|---|---|---|
| `6/chat_contents_search` | 401 `[GW] Access Token is required` | exists, needs a token |
| `6/chat_supplementary_search` | 401 `[GW] Access Token is required` | exists, needs a token |
| `7/auth/email-verification` | 400 `Required property missing: email` | exists (`Member::invite`) |

## What the app expects but does not exist

| Path | Result |
|---|---|
| `7/chat_contents_search` | 404 |
| `7/auth/login` | 404 |
| `7/auth/profile` | 404 |
| `7/notes/list` | 404 |
| `7/auth/logout`, `7/notes/create|update|delete` | not created either |

## The bind

The only working chat endpoint lives on **api 6, which is `static_token`** — it
requires a token. The app was just changed to cookie-only auth, on purpose, so
that no secret ships in a static bundle. Those two facts are currently
incompatible: **nothing the frontend calls resolves today.**

Two ways out.

### A. Recreate the endpoints on api 7 (recommended)

Keeps cookie-only auth and ships no secret. Everything below goes on api 7
(`security: cookie`), and `http://localhost:3000` needs adding to its CORS
origins for local dev.

| Path | Method | Model::method | Notes |
|---|---|---|---|
| `chat_contents_search` | POST | `OpenAI::chat_contents_search` | copy `model_method_params` from api 6 uri 109: `{"cnt":10,"model":"gpt-5.6","topics_group_id":[17,20]}` — drop the retired 18/19 |
| `chat_supplementary_search` | POST | `OpenAI::chat_supplementary_search` | from api 6 uri 122: `{"cnt":5,"model":"gpt-5.6","topics_group_id":[12]}` |
| `auth/login` | POST | `Login::login_challenge` | sets the session cookie |
| `auth/logout` | POST | `Login::logout` | |
| `auth/profile` | GET | `Login::profile` | |
| `notes/list` | GET | `Topics::list` | pin `topics_group_id`; scope to member — see below |
| `notes/create` | POST | `Topics::insert` | pin `topics_group_id` |
| `notes/update` | POST | `Topics::update` | pin `topics_group_id` |
| `notes/delete` | POST | `Topics::delete` | pin `topics_group_id` |

Cost: chat then requires login. That matches the earlier "login required for
everything" decision, but it does rule out anonymous browsing.

### B. Point chat back at api 6 and restore the token

Two `.env` values (`NUXT_PUBLIC_KUROCO_API_ID=6`) plus reinstating the token
header in `useKuroco.ts`. Chat works immediately, but the token is readable by
every visitor, and api 6's CORS also needs `x-rcms-api-access-token` added to
its empty `headers` list and localhost added to origins.

Reasonable as a short-term demo unblock. Not a place to stop.

## Also still unresolved

Per-member scoping for `notes/list`. `Topics::list` has no "only my rows"
parameter — `has_permissions` is admin resource auth and `writer_groups`
(`topics_list.php:1322-1370`), not row ownership. Enforce it with a preprocess
custom function injecting `filter: member_id = <session member>`. The
`assertOwnership` check in `useNotes.ts` only makes a failure visible; it cannot
prevent one.
