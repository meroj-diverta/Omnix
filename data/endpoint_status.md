# Endpoint reality check — meroj.g.kuroco.app/rcms-api

Probed directly over HTTP on **2026-07-30**. Supersedes the 2026-07-29 version of
this file, whose headline conclusion ("nothing the frontend calls resolves
today") is **no longer true** — the missing endpoints have since been created.

There is still no public endpoint listing (`/_openapi`, `/swagger`, `/docs` all
404), so this is HTTP probing only. Every probe below used an empty body or a
deliberately invalid email, so nothing was created and no mail was sent.

How to read the codes: **400/422** means the endpoint exists and rejected the
input. **401** means it exists and wants credentials. **405** means it exists but
not for that method. **404 with `[GW] API using this path does not exist`** means
it was never created.

## What exists

| Path | Probe result | Notes |
|---|---|---|
| `7/chat_contents_search` | 400 on empty body | exists — the app's chat route |
| `7/notes/list` | 405 on POST | exists, GET-only; the app calls it with GET |
| `7/auth/login` | 401 + `The password or e-mail (Login ID) is incorrect.` | exists |
| `7/auth/logout` | 400 | exists |
| `7/auth/profile` | 405 on POST | exists, GET-only; the app calls it with GET |
| `10/auth/invite` | see contract below | exists — both signup steps |
| `10/auth/register` | 400 listing required fields | exists |

`7/auth/email-verification` (the old `Member::invite` on api 7) now **404s** —
signup moved to api 10.

## `10/auth/invite` — the request contract, established by probing

The schema is a **`oneOf` with two branches** and `additionalProperties: false`.
Which branch the validator reports depends on what you send, which makes the
errors misleading if you only ever send one shape:

| Branch | Body | Behaviour |
|---|---|---|
| A | `{email, ext_info?}` | creates the provisional member, mails the code. `ext_info` is a free-form object. |
| B | `{email_hash}` | verifies that code. **`email_hash` is the code itself** — the key from the invite mail, not a hash of the address. |

Verified specifics:

- `{"email_hash":"<bogus>"}` alone → **422 `Invalid URL`**. It validated and
  reached the lookup; that message is what a bad or expired key produces.
- `{"email":"not-an-email"}` → 422 `Invalid E-mail`.
- **No `otp` field exists on either branch.** `otp`, `otp_pwd`, `otp_code`,
  `code`, `token`, `auth_code`, `temp_pwd`, `invite_token` are all rejected with
  `Additional properties not allowed`. The code goes back as `email_hash`.
- Sending `email` *and* `email_hash` together pins branch A, so it re-issues the
  invite and mints a new code instead of verifying the one in hand.
- GET is not allowed (405). POST only.

Kuroco's own tutorial (`implementing-two-step-verification-on-registration-form`)
describes a **different, three-endpoint** flow that layers a separate 6-digit OTP
on top of this key, via two `Api::request_api_post` custom functions
(`set_and_send_otp`, `check_otp_and_regist`). **We are not using it** — neither
custom function exists on this site (both 404 on api 7 and api 10), and the
invite key serves as the code directly.

## `10/auth/register`

Required, per the empty-body response: `login_pwd`, `name1`, `email`.

Two things worth knowing:

- **Its schema is permissive** — unlike `invite`, unknown properties are accepted
  and silently ignored (probed with `otp`, `token`, `invite_token`, `email_hash`,
  `nickname`, `login_id`, `tel1`, `zip1`; all passed schema validation). So a
  mistyped field name here fails silently rather than erroring.
- **It requires no proof of verification.** No `otp`, `email_hash` or token is
  demanded, so on this evidence the invite/verify steps are bypassable by posting
  straight to register. Not confirmed end-to-end — that would mean creating a
  member — and whether `Member::insert` behind it would *honour* an `email_hash`
  if supplied is not observable from outside. Check the parameter list at
  `management/rcms_api/api_info/?api_id=10`. See the open items in
  `CLAUDE_SESSION_FINDINGS.md` §12.

## What does not exist on api 10

`auth/login`, `auth/logout`, `auth/profile`, `auth/email-verification`,
`auth/invite-verify`, `auth/verify`, `auth/otp`, `auth/invite_confirm`,
`chat_contents_search`, `notes/list` — all 404. Api 10 holds exactly the two
signup routes; session and content routes stay on api 7.

## CORS — fixed, verified by preflight

An `OPTIONS` preflight from `Origin: http://localhost:3000` with
`Access-Control-Request-Method: POST` now returns **200** on api 7 and api 10:

```
access-control-allow-origin: http://localhost:3000
access-control-allow-credentials: true
access-control-allow-methods: GET, POST, OPTIONS
access-control-allow-headers: *, content-type, x-rcms-api-access-token, x-requested-with
```

This was the blocker described in `kuroco_frontend_endpoints.md` §1. Local dev
against the live backend is unblocked, and cookie auth has the
`allowCredentials` it needs.

## Still unresolved

**Per-member scoping for `notes/list`.** Unchanged from the previous version:
`Topics::list` has no "only my rows" parameter — `has_permissions` is admin
resource auth and `writer_groups` (`topics_list.php:1322-1370`), not row
ownership. Enforce it with a preprocess custom function injecting
`filter: member_id = <session member>`. The `assertOwnership` tripwire in
`useNotes.ts` only makes a failure visible; it cannot prevent one.
