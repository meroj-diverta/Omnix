# Kuroco feedback log

Rough edges found while building Omnix, recorded for feeding back to Kuroco.
Omnix is the vehicle; **this file is the deliverable.**

Each entry: what was expected, what happened, what it cost, and a concrete
suggestion. Entries are written to be liftable into an issue with minimal
editing. Anything unverified is labelled as such — a finding that turns out to
be wrong costs more credibility than it buys.

Status values: `open` (not reported), `filed` (issue submitted), `fixed`.

---

## F1 — `oneOf` validation errors report only one branch, hiding valid fields

**Status:** open · **Area:** API gateway, request validation · **Severity:** medium

`Member::invite` accepts two body shapes: `{email, ext_info}` to issue an invite,
and `{email_hash}` to verify the returned code. Sending `email` and `email_hash`
together answers:

```json
{"errors":[{"code":"invalid","message":"No valid results for oneOf {\n 0: Additional properties not allowed: email_hash at #->oneOf[0]\n}"}]}
```

Only branch 0 is reported. The message therefore states that a **valid,
documented property is not allowed**, because the validator picked the branch
where it isn't.

**Cost:** led to a firmly stated, wrong conclusion — that the endpoint had no
verification shape at all and that a separate custom-function endpoint pair was
required. Roughly an hour of work planned on a false premise, corrected only
after probing `{email_hash}` alone.

**Suggestion:** report every branch's failure, or name the branch that matched
most closely, e.g. `oneOf branch 1 expects {email_hash}; you sent email +
email_hash`. Listing the accepted shapes on failure would be better still.

---

## F2 — "API request restriction" gates reads; writes are gated elsewhere

**Status:** open · **Area:** endpoint settings, docs · **Severity:** high (most time lost of anything here)

`Topics::insert` returned `403 Insufficient permissions to perform this action.`
for a logged-in member. The natural fix — add the member's group to the
endpoint's **API request restriction** — has no effect, because that setting
governs *response* access. Writes are governed by **Edit restriction** on the
content structure, and per-row writes by **Edit restriction limited to owned
content**.

Two settings, different screens, different names, and the one named "API request
restriction" sounds like it covers all API requests.

**Cost:** the largest single time sink in the project. The user's own summary:
"I assumed restriction carries white-listing meaning."

**Suggestion:** rename toward the actual effect (e.g. "API read restriction"),
and/or when a write is refused, say which setting refused it. See F3.

---

## F3 — `403 Insufficient permissions` names neither the layer nor the setting

**Status:** open · **Area:** error messages · **Severity:** high

Per Kuroco's own FAQ, API request restriction is evaluated at five layers: API
IP restriction → endpoint → content structure → content category → individual
content. Add the separate edit-restriction axis and there are more. The 403
identifies none of them.

**Suggestion:** include the deciding layer and setting in the error, at least
for authenticated callers — `denied by: content structure "my_notes" → edit
restriction`. This one change would have saved most of F2's cost.

---

## F4 — `Api::request_api_post` fails silently: `data: null` with no diagnostics

**Status:** open · **Area:** custom functions · **Severity:** high

A custom function whose internal `api_internal` call fails returns:

```json
{"errors":[],"messages":[],"data":null}
```

HTTP 200, empty `errors`. Indistinguishable between: function not found, function
disabled, function ran but assigned nothing, or function ran and its internal
call failed. There is no way from the response to tell whether the function
executed at all.

**Cost:** the only way found to prove the function was running was **timing the
request** — 330ms consistently, versus 130ms for endpoints on the same site that
run no function. That is not a diagnostic anyone should need.

**Suggestion:** distinguish "no function bound to this name" from "function
returned no data" — the first is a configuration error and deserves a non-200.
Optionally an opt-in debug mode surfacing internal call status per
`api_internal`.

---

## F5 — Plugin reference and official samples disagree on the internal path form

**Status:** open · **Area:** docs · **Severity:** low, but pure friction

`reference/smarty-plugin.md` documents `api_internal` with
`endpoint='/rcms_api/1/sample'` — **underscore**. The official sample functions
(`sample_code/custom_function/request_api_post/*.txt` in `diverta/kuroco-documents`)
use `endpoint='/rcms-api/1/2step_member_invite'` — **hyphen**, matching the public
URL form.

**Suggestion:** make the reference match the samples, and state whether both are
accepted.

---

## F6 — The custom-function contract is only discoverable from GitHub samples

**Status:** open · **Area:** docs · **Severity:** medium

Three things a custom function author must know, none of which appear on the
custom-function or endpoint reference pages:

1. **Output is `{assign var=data ...}`**, not printed. Printing produces
   `data: null` — see F4.
2. **The request body is `$smarty.post`**, not `$ext_data`. The editor labels the
   test box "Input JSON data as `$ext_data` for the test", which strongly implies
   `$ext_data` is the input in production too. It is not.
3. **Errors are `{assign_array var=errors}` + `{append var=errors ...}`.**

All three were learned by reading raw sample files on GitHub.

**Suggestion:** put the input/output variable contract on the custom-function
documentation page, ideally in the editor UI next to the Process field.

---

## F7 — Kuroco Smarty rejects array literals, with an unhelpful message

**Status:** open · **Area:** Smarty · **Severity:** low

```smarty
{assign var='out' value=['errors' => [['message' => 'insert failed']]]}
```
→ `An error occurred in Smarty. [line 9]: syntax error: invalid attribute name: '='`

The working form is `assign_array` plus dotted keys. Separately, inline JSON in a
template errors with `unrecognized tag: "errors":[{"message"...` because `{`
opens a tag — correct behaviour, but the message doesn't hint at `{literal}`.

**Suggestion:** either support `=>` literals, or have the error name
`assign_array` as the alternative.

---

## F8 — Two different 404 bodies, undocumented, and the difference matters

**Status:** open · **Area:** API gateway · **Severity:** medium

| Body | Actual meaning |
|---|---|
| `[GW] API using this path does not exist` | the API structure exists, that path does not |
| `{"code":"not_found","message":"Current URL could not be mapped"}` | the API structure has nothing published on it |

Undocumented, and easy to read as the same thing. Once known, it is genuinely
useful: probing `POST /rcms-api/{id}/zzz` across ids maps which structures exist,
which is how the real internal API (id 5) was located after the configured path
pointed at a structure with nothing published.

**Suggestion:** document both, and make the second one say so — "no published
endpoints on API structure 11" rather than "Current URL could not be mapped".

---

## F9 — New URIs default to unpublished, and the failure looks like nonexistence

**Status:** open · **Area:** endpoint settings · **Severity:** medium

A URI created via API/MCP defaults to `open_flg: 0`. An unpublished URI answers
with F8's second body — identical to a structure that was never created. So the
common beginner mistake (forgot to publish) presents as the alarming one (nothing
exists).

**Suggestion:** distinct message for "exists but unpublished", visible to
authenticated admin callers at minimum.

---

## F10 — "Custom function" is unfindable in the admin by that name

**Status:** open · **Area:** admin IA · **Severity:** medium

The editor lives at `/management/staticcontents/staticcontents_edit/` and the
list at `staticcontents_list`. The page title *is* "Custom function editor", but
the URL, breadcrumb and menu path all say static contents. Compounding it, the
endpoint's Operation dropdown has no "custom processing" entry — the operation
you need is named `request_api_post`.

**Cost:** the user searched the Operation dropdown, concluded the feature was
missing, and asked whether static contents was the right page at all.

**Suggestion:** surface custom functions under their own menu label, and mention
`request_api_post` in the Operation dropdown's help text.

---

## F11 — adminMCP writes checkbox values correctly but cannot read them back

**Status:** filed · **Area:** adminMCP, extension fields

Full write-up in `bug_adminmcp_checkbox_data_loss.txt` (filename is a misnomer —
there is no data loss). Controlled two-round test: UI-written values read back
correctly, adminMCP-written values read back as `[[""]]` while the admin UI and
keyword search both show the correct values. Checkbox-specific; a text field in
the same request round-tripped fine.

---

## F12 — Trailing whitespace in a select/checkbox option key makes it unselectable

**Status:** filed · **Area:** extension fields

Asymmetric `trim()`: the label is trimmed, the key is not
(`nfs/lib/modules/topics/class/extension.php:2075`).

---

## F13 — Spider cannot populate custom fields, and nothing says so up front

**Status:** open · **Area:** Spider · **Severity:** medium (design-level)

Flagging a content structure as a crawl target materialises a fixed 18-field
"webpage" preset, and the crawl payload only ever writes into that preset by
slug. A custom `select`/`relation`/`number` field on a crawled structure can
never be filled by the crawler. Confirmed by source reading, not documented
where a user would look.

Worse in combination: the documented workaround is AI post-processing, which the
crawler also skips — see F14.

**Suggestion:** state the limitation on the Spider settings screen, and warn when
a crawl target has custom fields that can never be filled.

---

## F14 — The crawler skips AI post-processing, unreachably

**Status:** open · **Area:** Spider + AI post-processing · **Severity:** high (design-level)

`Topics::insert()` takes `lightweight_mode`, documented as *"skips the execution
of post-processing batches, but improves performance instead."* The crawler
passes it as `true`, hardcoded and not configurable
(`spider_upsert.php:87-96`). Every AI post-processing dispatch site sits inside a
`if (!lightweight_mode)` guard, so **AI post-processing can never run on crawled
content** — the exact case where it is most wanted (cleaning scraped pages).

Nothing errors. The rule is simply never read, and the logs stay silent. There is
also no fallback sweep: the post-processing batch is a queue consumer, not a
scanner, so rows never queued are never processed.

Workaround: re-save the rows via CSV upload with lightweight mode **off** and "AI
post-processing → Force run". This is a full re-import of the corpus to run a
feature that appears to be configured already.

**Suggestion:** make `lightweight_mode` configurable per Spider config, or run
post-processing asynchronously for crawled rows. At minimum, warn on the content
structure screen when post-processing rules exist on a crawler-fed structure —
currently that configuration looks correct and does nothing.

---

## F15 — Unenforced `ai_session_id` ownership on the AI Agent REST path

**Status:** open · **Area:** AI Agents · **Severity:** high (security)

Verified against source. `AiAgent::send_message` casts a caller-supplied
`ai_session_id`, rejects only `0`, and proxies on: no member check, no group
check, no `hasAuth` (`nfs/lib/modules/ai/api/v1/AiAgent.php:108-125`). Session
lookup is by id alone (`ai_session_view.php:29-30`). `t_ai_session.member_id`
exists and is written but never read on this path. The equivalent check *does*
exist elsewhere — `verifySessionOwnership()` in `ai_agent_assist.php:124-131` —
which suggests omission rather than intent.

Session ids are sequential integers, and the `send_message` response includes the
full harness transcript (`events`), so a single call both injects into and
exfiltrates another member's conversation.

**Caveat:** whether `RCMSAdminAction::execute()` imposes an admin gate further up
cannot be confirmed — that file is ionCube-encrypted.

**Suggestion:** enforce `session.member_id === session member` on the REST path,
as `ai_agent_assist.php` already does.

---

## F16 — Tool grants are per-agent, so any exposed agent shares its full powers

**Status:** open · **Area:** AI Agents · **Severity:** high (security, design-level)

Grants live on `t_ai_agent`, not per-session or per-caller. Grantable tools
include `bash`, `read`, `write`, `edit`, `glob`, `grep`, `web_fetch`,
`web_search`, GitHub MCP via a stored PAT, and Admin MCP modules. So exposing an
agent endpoint to end users hands every caller that agent's full capability, and
prompt injection becomes privilege escalation up to shell access.

Mitigations exist (`permission_policy: always_ask`, environment sandbox,
`admin_mcp_readonly`) but the default shape invites the mistake.

**Suggestion:** per-endpoint or per-session grant narrowing, so a user-facing
endpoint can expose a subset of an agent's tools; and a warning when an agent
holding `bash`/`write` is bound to an endpoint on a non-privileged API.

---

## F17 — OPTIONS preflight 404s for missing paths, so browsers can never see the real error

**Status:** open · **Area:** API gateway, CORS · **Severity:** medium–high

Measured 2026-07-30 on api 7:

| Preflight target | Response |
|---|---|
| `OPTIONS /rcms-api/7/chat_contents_search` (exists) | `200`, with `access-control-allow-origin` |
| `OPTIONS /rcms-api/7/chat` (never created) | **`404`**, with `access-control-allow-origin` |

A preflight must be a 2xx for the browser to proceed. Because the gateway 404s
the *preflight* rather than the request, the browser aborts with an opaque
`TypeError` and the actual `404 [GW] API using this path does not exist` never
reaches JavaScript. Every not-yet-created POST endpoint therefore presents to a
browser client as "host unreachable / CORS misconfigured".

**Cost:** sends developers to audit CORS settings — origins, allowed headers,
credentials — when the real fix is "create the endpoint". Reproduced live in this
project: a chat mode pointed at an uncreated `chat` endpoint reported a CORS
diagnosis, while the same missing endpoint reached by GET (no preflight)
correctly reported "endpoint does not exist on structure 7".

**Suggestion:** answer OPTIONS with 200/204 whenever the API structure exists,
independent of whether the path does. Preflight is a CORS negotiation, not a
resource fetch — the 404 belongs on the actual request, where a client can read
it.

**Related client-side lesson (ours, not Kuroco's):** sending
`Content-Type: application/json` on a **GET** forces a preflight for no reason,
and inherits this problem. `useKuroco.ts` now omits the header when there is no
body, which is why GET surfaces real statuses.

---

## F18 — Useful endpoint parameters are effectively undiscoverable

**Status:** open · **Area:** docs, endpoint settings UI · **Severity:** medium

`Topics::list` has a **`my_own_list`** parameter — "filter to your own content" —
which is exactly the per-member scoping this project needed for member-owned
notes. It appears only as one row in a very large parameter reference table, and
is not surfaced or hinted at on the endpoint edit screen.

**Cost:** this project concluded in writing, across two documents and a source
comment, that "`Topics::list` has no 'only my rows' parameter" and planned a
preprocess custom function to inject a `member_id` filter. The wrong conclusion
survived several sessions because `has_permissions` *looks* like the relevant
parameter and is about something else entirely (admin resource auth and
`writer_groups`).

**Suggestion:** group and label parameters by intent in the endpoint editor
(ownership / visibility / pagination), or at minimum flag the ownership-related
ones on the Topics list operation, where anyone building a member-owned feature
will look.

---

## F19 — Docs never say where in the pipeline an AI dictionary applies

**Status:** open · **Area:** AI dictionary, docs · **Severity:** medium

`management/ai-dictionary.md` documents the fields (Slug, Enable, Type, Regex,
Priority, Memo, CSV update) but never says **what the dictionary acts on**. A
Replace-type dictionary could plausibly rewrite: the user's query before
retrieval, the text sent to the embedding model at index time, the context handed
to the completion model, or the generated answer. Each has completely different
consequences, and the choice determines whether existing content must be
re-vectorised for a new dictionary to take effect.

**Determined empirically** on `OpenAI::chat_contents_search`, 2026-07-30 —
it rewrites **the query, before retrieval**:

| Query | Dictionary entry | Result |
|---|---|---|
| `Who is QoP?` | `QoP → Queen of Pain` | 7 hits, **top hit "Queen of Pain"** |
| `Who is Queen of Pain?` | (control) | 10 hits, same top hit |

"QoP" appears nowhere in the indexed content, so vector search could only have
matched Queen of Pain if the query text had already been substituted. No
re-vectorisation was performed, which also shows index-time content is not
involved.

**Suggestion:** state the application point on the AI dictionary page, and say
explicitly whether existing vectorised content needs re-embedding after a
dictionary change (from the above, it does not). One sentence would do.

**Related, same page:** the docs list the CSV-update control but not the required
CSV format. The format is only discoverable from an inline note on the upload
widget itself — `search,replace,class`, with `class` restricted to
Noun/Verb/Adjective/Adverb. That the class vocabulary is a part-of-speech set is
a strong hint the feature is tokenizer-level rather than a glossary, which is
worth saying out loud in the docs, since "AI dictionary" reads like the latter.

---

## F20 — AI dictionaries have no manual entry UI, and the CSV template 404s

**Status:** open · **Area:** AI dictionary, admin UI · **Severity:** medium

There is no way to add, edit or delete a single dictionary entry in the admin
screen. CSV upload is the only input path. The screen's own **Download** control
— the obvious way to obtain a correctly-shaped file — returns **"The requested
page was not found."**

So the only route in is a file format you cannot obtain from the tool that
demands it. It was recoverable here only because the upload widget carries an
inline note naming the headers.

**Cost:** blocked outright until the inline note was spotted; a first attempt to
enter terms by hand found no such affordance.

**Suggestion:** fix the Download endpoint (a template with headers is enough when
the dictionary is empty), and allow single-row add/edit — correcting one bad
replacement should not require re-uploading the whole dictionary.

---

## F21 — `chat_contents_search` answers from model knowledge when retrieval misses

**Status:** open · **Area:** AI / RAG · **Severity:** high (correctness)

Observed 2026-07-30. The operation's behaviour splits on hit count:

| Retrieval outcome | Behaviour |
|---|---|
| **0 hits** | Declines cleanly: *"I could not find any relevant content related to your question."* Confirmed with off-domain probes ("How do I bake sourdough bread?", "What is the capital of France?") and with an in-domain term absent from the corpus. |
| **Hits present but irrelevant** | **Answers from the model's own knowledge**, and returns the unrelated retrieved rows as `list` — i.e. as citations. |

Reproduction: `{"text":"Who is KotL?"}` returned 10 hits — **Kunkka, Slardar,
Lich** — none of them Keeper of the Light. The reply nonetheless described Keeper
of the Light (Ezalor) correctly and in detail. Correct answer, unsupported by any
retrieved row, presented alongside citations to rows that do not contain it.

**Why this matters beyond one wrong answer:**

1. A fluent, confident answer carrying citations that do not support it is worse
   than a refusal, particularly for a beginner-facing assistant that cannot judge
   the answer.
2. **Retrieval quality cannot be evaluated from replies.** Reply text stays good
   while retrieval degrades, so any eval must score `list`, not prose. Anyone
   tuning an embedding template by reading answers is flying blind.
3. There is no configuration surface on this tier for "answer only from the
   provided context" — no system prompt or persona field exists on the single-shot
   AI operations, so an integrator cannot impose grounding themselves.

**Suggestion:** either a per-endpoint strict-grounding parameter (answer only
from retrieved context; refuse otherwise), or a `max_distance`-style relevance
floor above which hits are discarded so the 0-hit refusal path takes over — plus
a response field indicating whether the answer was grounded in the returned rows.

---

## Reporting notes

- F11 and F12 are already filed.
- F2, F3, F4, F6, F10 are the highest-value cluster: all are
  *diagnosability* problems, and together they account for most of the time lost
  on this project. Worth reporting as a group with the timings from F4.
- **F21 is the single most consequential finding so far** — it is a correctness
  issue in the flagship RAG operation, not an ergonomics one, and it invalidates
  the obvious way of evaluating retrieval. Report it on its own, with the KotL
  reproduction, rather than bundled with the docs items.
- F19 and F20 are both AI-dictionary items and belong in one report: the feature
  works well (F19's finding is that it works and the docs omit how), but is hard
  to populate (F20).
- F14 and F13 pair up: the limitation plus the workaround that is also blocked.
- F15 and F16 are security findings and should go through whatever channel
  Diverta uses for those rather than a public issue.
