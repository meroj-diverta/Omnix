# Kuroco config needed by the browser-direct frontend

The frontend no longer proxies through a Nuxt server route — it calls Kuroco
directly. Three things are needed on the Kuroco side. Item 1 is the bug that
made the earlier calls fail.

---

## 1. CORS on api_id 6 — this is why the calls failed

Current config, from `rcms_api-api_list_api`:

```json
"cors": {
  "maxAge": 0,
  "headers": [],                                    // <-- empty
  "methods": ["GET", "POST", "OPTIONS"],
  "origins": ["https://meroj.g.kuroco-mng.app",
              "https://meroj.g.kuroco-front.app"],  // <-- no localhost
  "allowCredentials": true
}
"config": { "security": "static_token", "mcp_server_enabled": true }
```

Two independent blockers:

- **`headers` is empty.** A `static_token` structure needs the request to carry
  `X-RCMS-API-ACCESS-TOKEN`. Any non-simple request header must be named in the
  CORS allow-list or the browser's preflight `OPTIONS` is rejected *before* the
  request reaches Kuroco. Compare api_id 1 and 4, which both list
  `"headers": ["x-rcms-api-access-token"]`. Api 6 does not.
- **`http://localhost:3000` is not an allowed origin,** so `nuxt dev` is blocked
  regardless. Api 1 and 2 both list it; api 6 does not.

This is also why the failure looked like a network error rather than an auth
error: a blocked preflight surfaces in the browser as an opaque `TypeError`,
indistinguishable from an unreachable host. The new client says so explicitly
instead of reporting "connection failed".

**To fix, on api_id 6 → CORS:**
- add `x-rcms-api-access-token` to allowed headers
- add `http://localhost:3000` to origins (plus whatever the deployed front origin is)
- leave `allowCredentials: true` as-is

Do **not** change api 6's `security` mode — it also hosts the MCP server
(`mcp_server_enabled: true`, `mcp_oauth_idp_id: 2`), and switching it would
affect the admin MCP connection.

### The security caveat, stated plainly

A static token used from a browser is readable by anyone who opens the JS
bundle. There is no server to hide it in — the site is `nuxt generate`'d and
only `.output/public` deploys. So this is a stopgap, and it should be a
read-only search token, never a privileged one.

The durable fix is to serve chat from a **cookie**-mode structure so no token
ships to the client at all. That is a bigger change (chat then requires login),
which is consistent with the earlier decision to require login for everything —
so it may be worth doing directly rather than via the token stopgap.

---

## 2. api_id 7 — the auth endpoints don't exist yet

Api 7 ("Omnix User Authentication Endpoints", `security: cookie`) currently has
exactly **one** endpoint: `auth/email-verification` → `Member::invite`.

The frontend expects three more. Model methods are in
`nfs/lib/modules/login/api/v1/Login.php`:

| Path | Method | Model::method | Notes |
|---|---|---|---|
| `auth/login` | POST | `Login::login_challenge` | sets the session cookie |
| `auth/logout` | POST | `Login::logout` | |
| `auth/profile` | GET | `Login::profile` | returns the current member |

CORS on api 7 also needs `http://localhost:3000` added for local dev. It
already has `allowCredentials: true`, which cookie auth requires.

Cookie notes: cross-origin cookies need `SameSite=None; Secure`. Browsers treat
`http://localhost` as trustworthy so this works in dev, but a non-localhost
plain-HTTP origin will silently fail to store the session. If sign-in appears
to succeed but `auth/profile` still returns nothing, that is the cause — the
frontend detects this case and says so rather than looping.

---

## 3. Notes structure + CRUD endpoints

### Content structure

A new topics group, e.g. `my_notes`. Fields:

| ext_slug | Title | Type | Purpose |
|---|---|---|---|
| `note_kind` | Kind | **text** | `note` or `preference` |

Title goes in `subject`, body in `contents`. `note_kind` must be **text**, not a
select — the frontend writes it directly, and keeping it text also leaves it
eligible for the embedding template if these notes are later made searchable.

Enable `use_openai: 1` + `embedding_model` only when you actually want notes in
the RAG index. That is the interesting experiment, and it is also where the
leak risk lives — see below.

### Endpoints on api_id 7 (cookie auth)

| Path | Method | Model::method |
|---|---|---|
| `notes/list` | GET | `Topics::list` |
| `notes/create` | POST | `Topics::insert` |
| `notes/update` | POST | `Topics::update` |
| `notes/delete` | POST | `Topics::delete` |

Pin `topics_group_id` in each endpoint's `model_method_params` so the client
cannot point them at another structure.

### The unsolved part: per-member scoping

**`Topics::list` has no "only my rows" parameter.** I checked: `has_permissions`
looks like the candidate but is about admin resource auth and the group's
`writer_groups` (`topics_list.php:1322-1370`), not per-row ownership.

So scoping has to be enforced deliberately. Options, in order of preference:

1. A **preprocess custom function** on each notes endpoint that injects
   `filter: member_id = <session member_id>`. Endpoints expose a `preprocess`
   hook, and this keeps the rule server-side where the client cannot alter it.
2. `secure_level` / `MemberCustomSearchAuth` — rows already carry a
   `secure_level_jsonb` column, so the mechanism exists; how it applies to the
   public Topics API needs verifying.
3. A pinned `filter` in `model_method_params` — rejected: the filter needs the
   *current* member id, and I found no session placeholder in the filter DSL.

**Do not rely on the client.** `useNotes.ts` includes an `assertOwnership`
tripwire that warns loudly in the UI if returned rows carry another member's
`member_id`. That exists to make a scoping failure *visible*, not to prevent
one — it cannot protect anything.

### Related finding worth testing separately

There are **zero** references to `secure_level` or `member_id` anywhere in
`nfs/lib/modules/ai/api/v1/OpenAI.php`. The vector search SQL filters on
`t_topics_header` via a caller-supplied where clause, and the AI endpoints do
not appear to add a member restriction. So if `my_notes` is vectorised and
included in a `chat_contents_search` group list, one member's private notes may
well surface in another member's chat.

That is worth testing on purpose with two accounts — it is the most valuable
finding available from this feature, and it needs to be known before notes are
ever added to a shared search endpoint.

---

## Verification order

1. Fix api 6 CORS → `yarn dev`, ask a question, confirm a real answer instead of
   the canned one. Set `NUXT_PUBLIC_KUROCO_BROWSER_TOKEN` first; with it unset
   the UI intentionally serves mock answers and makes no calls.
2. Add the three auth endpoints → sign in from the right pane, confirm the
   member name appears.
3. Add the notes group + four endpoints → create, edit and delete a note.
4. With two member accounts, confirm neither sees the other's notes in the pane
   (that exercises endpoint scoping) and then in chat if the group is vectorised
   (that exercises the AI-path question above).
