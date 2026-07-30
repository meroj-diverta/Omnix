# Omnix — Plan, 2026-07-30

## Why this file exists

Two sessions ran in parallel on 2026-07-30 and a lot changed on both sides —
the frontend gained a working signup page, and the Kuroco site's content model
and API structures were reshaped. `CLAUDE_SESSION_FINDINGS.md` §12 and
`data/endpoint_status.md` cover parts of it; neither covers the live API/content
state as it actually stands right now. This file re-establishes that from direct
inspection, answers the registration question that was left open, and puts the
remaining work in priority order.

Everything in "Verified state" below was read live from the site or from source
today, not carried over from memory. Where something is *unverified*, it says so.

---

## 1. Verified state

### 1.1 Content — the merge shipped, and it worked

| Group | Name | Rows | Embedding | Notes |
|---|---|---|---|---|
| **17** | Dota2: Hero+Lore | **127, all published** | `use_openai:1`, `text-embedding-3-small` | one row per hero |
| **20** | Dota2: Guides | **0** | on | empty — never authored |
| **12** | Dota2: Supplementary Content | ~3.9k crawled | on, `use_search_template:1` | AI post-process rule **enabled** |
| **23** | Omnix: My Notes | **0** | off | `writer_groups:['User']`, `my_topics_only_limit_groups:['User']` |

Groups **13, 18, 19 and 22 are gone.** The plan to merge `hero_abilities` and
`hero_lore` into `hero_master` was executed and group 17 renamed accordingly.
Its `ext_1`/`ext_2`/`ext_3` (Primary Attribute / Roles / Attack Type) were
deleted as planned; `ext_4` Icon and `ext_5` External ID remain.

Spot-checked `topics_id 10807` (Anti-Mage, imported 2026-07-29 19:19): one
`contents` blob holding attribute + roles prose, the full base-stats block,
public/pro pick rates, **all five abilities with per-level mana and cooldown
values**, and the complete lore paragraph. This is exactly the shape the merge
was supposed to produce, and it means every fact is now inside the one field the
embedding template actually reads.

`ext_4` (Icon) is empty on the sampled row — worth confirming across the set.

### 1.2 API structures

| api | Title | Security | State |
|---|---|---|---|
| 5 | Omnix: Registration | **none** | 1 uri, `auth/register` → `Member::`**`invite`** — mislabelled, unused |
| 6 | Dota2: Endpoints | static_token | hosts the admin MCP server; the eval's target |
| 7 | Omnix User Authentication Endpoints | **cookie** | chat + session + notes + a duplicate `register`; see P0.2 — cookie sessions unproven |
| 8 | TEMP AI Agent memory test | **privileged_static_token** | still live |
| 9 | checkbox_api_struct | **privileged_static_token** | still live |
| 10 | Omnix: pre-register endpoints | cookie | `auth/invite`, `auth/register` — what the app calls |

**api 7 endpoints** (all `open_flg:1`):

| uri | Method | Path | Model | Params |
|---|---|---|---|---|
| 125 | POST | `auth/login` | `Login::login_challenge` | — |
| 132 | POST | `auth/token` | `Login::token` | `allowed_group_ids:[104]` |
| 126 | GET | `auth/profile` | `Login::profile` | — |
| 127 | POST | `auth/logout` | `Login::logout` | — |
| 123 | POST | `chat_contents_search` | `OpenAI::chat_contents_search` | `cnt:10, model:gpt-5.6, topics_group_id:[17]` |
| 124 | POST | `chat_supplementary_search` | same | `cnt:5, topics_group_id:[12]` |
| 128 | GET | `notes/list` | `Topics::list` | `cnt:200, topics_group_id:[23]`, auth `GroupAuth [104]` |
| 129/130/131 | POST | `notes/create|update|delete` | `Topics::insert|update|delete` | `topics_group_id:23`, auth `GroupAuth [104]` |
| 135 | POST | `register` | `Member::insert` | `login_ok_flg:true, default_group_id:[104]` |

**api 6**: uri 109 `chat_contents_search` → `topics_group_id:[17]`, 122
supplementary → `[12]`, 108 `rag_search` → `[12]`, 110 `chat`, 107
`content_topics_list`. No stale references to the deleted groups — already clean.

**Note that both chat endpoints search group 17 only.** Group 20 is not wired
into retrieval at all, on either structure.

### 1.3 Members

8 total. `6` Alice and `7` Bob are the scoping-test accounts. `9`
(merojjy@gmail.com), `10` (test@example.jp, **named "Unverified account"**) and
`11` (linebuggy@gmail.com) came from registration testing.

---

## 2. The registration question, answered

The open question was how the emailed key binds to account creation. It doesn't.
Confirmed from source today, not inferred:

- **`Member::invite` is dual-purpose**, branching on `email_hash`
  (`nfs/lib/modules/member/classes/member_invite.php:48` and the API wrapper at
  `nfs/lib/modules/member/api/v1/Member.php:277`). Without it: create the
  provisional row, mail the key. With it: call
  `MemberProvisional::getMemberData($hash)` and **return the row** — a validity
  check that produces no state change.
- **`email_hash` is the key itself.** The mail template builds the link as
  `{$smarty.const.ROOT_URL}/?key={$preregist_key}`
  (`nfs/templates/member/mail/pre_regist_thanks.txt:10`), so the `?key=` value
  from the mail *is* the `email_hash` to post back. This confirms empirically
  what §12.4 found by probing.
- **`Member::insert` never reads `email_hash` or `pre_member_id`.** Its
  signature (`api/v1/Member.php:489`) is `default_group_id`, `login_ok_flg`,
  `use_columns`, `unuse_columns`, `require_columns`, `validate_only`,
  `send_email_flg`, `not_login_after_insert`, `ignore_force_chpwd`,
  `allow_ec_point`. Nothing about provisional members.
- **No API path consumes or retires a provisional row**, so a key stays usable
  until `expire_ymdhi` regardless of how many accounts were created with it.

**Therefore: `10/auth/register` creates a real member in group 104 for any
email, with no proof of ownership, and `use_recaptcha` is off on both it and
`auth/invite`.** The three-step UI is honest about intent but enforces nothing.
Member 10, named "Unverified account", is evidence this path was already
exercised deliberately.

### 2.1 The secure flow exists — but only outside the API

This is the part that reframes everything: **Kuroco already implements verified
registration correctly**, in `nfs/lib/modules/login/admin/regist.php`. It is a
Smarty page controller reached at `/login/regist/?k=<key>`, not an rcms_api
operation, which is why probing the API surface never found it.

What it enforces that `Member::insert` does not:

| Property | `login/regist.php` | `Member::insert` |
|---|---|---|
| Which email the account gets | `$email_hash_data["email"]` — from the **verified provisional row** (`:129`) | `email` from the request body, caller's choice |
| Key is single-use | guard `if(!$email_hash_data["member_id"])` (`:38`) **and** write-back `UPDATE t_pre_member_header SET member_id=… WHERE member_id IS NULL AND key=…` (`:167-169`) | never touches the table |
| Group membership | `default_group_ids` read off the provisional row (`:39-40`) | `default_group_id` from endpoint config |
| Expiry | `getMemberData()` requires `expire_ymdhi >= CURRENT_TIMESTAMP` | n/a |
| Atomicity | `dbBegin`/`dbCommit` around insert + write-back | n/a |

So the earlier claim that `member_id` is never written was **wrong** — it is
written, at `:167-169`. The conclusion is unchanged and sharper: the binding
logic exists, and none of it is reachable from the REST API. An integrator
wiring the two operations the admin UI actually offers (`Member::invite` +
`Member::insert`) gets a signup flow that looks verified and isn't.

This also fixes the recommendation below: rather than inventing validation, the
preprocess function should reproduce these five properties, and `regist.php` is
the reference to copy from.

This is not a Kuroco defect — invite and insert are independent operations and
binding them is the integrator's job. Also worth knowing: api 10's `auth/invite`
has `model_method_params: {}`, so the `default_group_ids` on the provisional row
is empty; it is `auth/register`'s `default_group_id:[104]` that decides group
membership.

**Why the original "the invite endpoint does not accept the key" symptom
happened.** That was api 5 uri 134 — `{model: Member, operation: invite,
default_group_ids: [104]}`, still live and still named `auth/register` despite
being the invite operation. Posting `{email_hash}` there is schema-valid and
does reach the lookup; when the key is wrong, already consumed or expired,
`member_invite.php` answers `$this->translate('/msg/invalid_error', "URL")` —
which surfaces as **422 `Invalid URL`**. That message names the wrong thing and
reads like a rejected request shape, but it means *bad or expired key*, and
`MemberProvisional::getMemberData()` also requires
`expire_ymdhi >= CURRENT_TIMESTAMP`. So the endpoint was accepting the field and
failing the lookup. Two things make this easy to hit: keys expire on
`PRE_REGISTER_EXPIRE`, and sending `email` alongside `email_hash` pins the
create branch, re-issuing the invite and minting a *new* key — which silently
invalidates the one in hand.

### How to bind them — recommended

Do all of **(a)** now, then **(b)**; keep **(c)** as the fallback.

**(a) Config-only hardening, no code.** One registration surface: delete api 5
and api 7 uri 135, keep api 10. Set `use_recaptcha: true` on `auth/invite` and
`auth/register`. Pin `use_columns` on register to
`["email","login_pwd","name1","name2"]` so no other member column can be set by
a caller — right now the schema is permissive and silently ignores unknown
properties, so it is an open member-creation primitive.

**(b) A `preprocess` custom function on `auth/register`.** Every uri has a
`preprocess` slot (null on uri 136 today) and custom functions are creatable via
`custom_function-create`. Port the checks from `regist.php` (§2.1): resolve
`email_hash` via `MemberProvisional::getMemberData()`, reject if the row already
carries a `member_id`, **overwrite the request's `email` with the provisional
row's address** rather than merely comparing them, and abort otherwise. Cheapest
real enforcement: one place, no extra round-trip, no new API structure.

Two things to verify before relying on it: that a preprocess function can abort
the request and runs before the model call, and that it can *mutate* the request
body — if it can only inspect, comparing `email` to the provisional address is
the fallback, which is equivalent as long as the comparison is exact. Note that
even then nothing writes `member_id` back, so the key stays reusable until
expiry unless the function does that write itself. If preprocess can't abort, go
to (c).

**(c) Kuroco's tutorial pattern.** A public custom-function endpoint verifies
the key, then calls `Member::insert` on an internal API structure via
`Api::request_api_post`. More moving parts, but the register primitive stops
being publicly reachable at all, which is strictly stronger. Neither of the
tutorial's functions (`set_and_send_otp`, `check_otp_and_regist`) exists on this
site.

---

## 3. Priorities

### P0 — resolve before anything else

1. **Delete api 8 and api 9.** Both are `privileged_static_token`, which
   re-authenticates a bound admin member on every request — a permanent
   impersonation credential. Both are published, both are leftover test
   scaffolding. This is the single worst item on the list and it is a two-call
   fix.
2. **Prove api 7's cookie session actually works.** Its live config is `cookie`.
   It previously carried a description saying it had been switched to
   `dynamic_token` *because* cookie mode emitted no `Set-Cookie` for the
   `login_challenge` + `token` flow — that description has since been removed, so
   the contradiction in the record is gone, but **the underlying question is not
   answered**: nobody has confirmed a cookie session is established. The frontend
   (`useKuroco.ts`) sends no token and relies entirely on cookies, so if that
   earlier observation was right, login silently fails and every notes call 401s.
   Resolve empirically: log in with a real member, inspect response headers for
   `Set-Cookie`, then call `auth/profile`. If no cookie appears, switch to
   `dynamic_token` and send `X-RCMS-API-ACCESS-TOKEN` from the two-step
   `auth/login` → `auth/token` exchange (uri 125 → 132, `allowed_group_ids:[104]`
   already set). **Nothing else about auth can be trusted until this is settled
   one way or the other.**
3. **Bind verification to registration** — §2, steps (a) then (b).

### P1 — make it answer well (the actual product)

4. **Re-run the eval for a true post-merge baseline.** Nothing blocks this:
   `.env` has `KUROCO_ACCESS_TOKEN`, and api 6 uri 109 is clean.
   ```bash
   cd ~/Omnix/Omnix && python3 eval/run_eval.py --compare eval/results/20260729T103543Z.json
   ```
   The last run scored **13/45**, but its case set had just been rewritten from
   36 cases to 45 with slug-level scoring, so it is not comparable to the 25/36
   before it. Treat 13/45 as unexplained rather than as a regression, and get a
   clean number before changing retrieval config.
5. **Add the persona / "answer in English" `prompt`** to api 6 uri 109 and api 7
   uri 123. Config-only, and it is the fix for answers coming back in Japanese
   when Japanese sources are retrieved.
6. **Decide group 20's fate.** It is empty, so every guides and jargon eval case
   fails by construction — and it is not in either chat endpoint's
   `topics_group_id`, so authoring content there changes nothing until the
   endpoint list includes it. Either commit to writing the ~60–80 jargon entries
   plus guides *and* wire group 20 in, or drop those cases from the eval. Do not
   leave it half-wired.
7. **Jargon AI dictionary.** `data/jargon_dict_probe.csv` and
   `jargon_dict_full.csv` are generated and waiting. Upload the probe first and
   settle the two unknowns (case sensitivity / word boundaries, and what the
   `class` column does) before committing the full list.

### P2 — the notes feature, end to end

8. **Verify `my_topics_only_limit_groups` actually scopes `notes/list` over
   REST.** Group 23 has it set to `['User']`, which is the native per-member
   mechanism, but group 23 has **0 rows** so this has never once been exercised.
   Test with two members, one note each. This also re-tests the 403 that
   previously blocked note creation for both Alice and Bob — that failure is
   still unexplained and is the reason the group is empty.
9. **Fix `useNotes.ts`.** `update` and `remove` send `{topics_id}` in the body,
   but Kuroco's `Topics::update`/`delete` take the id in the path. Confirm
   against uri 130/131 and correct the calls.

### P3 — crawled content quality

10. **The group 12 post-process rule is enabled but misconfigured.** Three
    distinct problems, all in `ai_postprocess_settings`:
    - The prompt instructs the model to return `clean_guide` and
      `content_status`, but `output_fields` is `["contents"]`. The response
      schema is generated from `output_fields`, so those keys don't exist in it.
    - `input_fields` is `[]` while `output_fields` is `["contents"]`. Input and
      output must be disjoint or the input hash changes every pass and the rule
      never converges.
    - It fires on save, and Spider hardcodes `lightweight_mode: true`, so it
      never fires on a crawl at all. The scheduled re-save sweep that would
      trigger it was never built.

### P4 — housekeeping

11. Delete test members 6 (Alice) and 7 (Bob), and 10 ("Unverified account").
    Ask before touching 9 and 11 — those look like real addresses. Delete stale
    provisional rows.
12. Group 17's `ext_4` Icon is empty on the sampled row — populate it or delete
    the field.
13. Update `CLAUDE_SESSION_FINDINGS.md` §12 and `data/endpoint_status.md` with
    §1 and §2 of this file. Both are currently silent on api 5, api 7's
    duplicate register, api 7's mode contradiction, group 23's scoping config,
    and the source-level proof that register requires no verification.

### Still open, not scheduled

- **AI Agent session memory test** (§5.4/§5.5 of the findings doc) — blocked on
  an invalid Bedrock model id on `ai_agent_id 1`, untouched since 2026-07-27.
  It is a hard gate on the Stage 2 Planner design, not on anything above.
- **The mentor-feedback roadmap review** was researched but never delivered. The
  headline from that research: recommendation 3's chain breaks in two places.

---

## 4. Verification

- **Registration:** issue a key via `10/auth/invite`, read it from
  `member_provisional-list` rather than a mailbox, then confirm that
  `10/auth/register` **fails** without it and succeeds with it. Before the fix,
  confirm the bypass reproduces — the plan rests on that being real.
- **Auth mode:** `Set-Cookie` present on login, and `auth/profile` returning a
  `member_id` in a fresh browser context.
- **Notes scoping:** two members, one note each, each `notes/list` returning
  exactly one row. The `assertOwnership` tripwire in `useNotes.ts` should stay
  silent — it reports a scoping failure, it cannot prevent one.
- **Retrieval:** `run_eval.py --compare` against a baseline taken *after* P0, so
  auth changes can't be mistaken for retrieval changes. Check `list[]` for which
  group supplied the top hit; the answer text proves nothing, since the model
  answers from training knowledge regardless.
- **Group 12 rule:** one row's `ai_postprocess_state` plus
  `pre_embedding_text` — the authoritative record of what the index received.
