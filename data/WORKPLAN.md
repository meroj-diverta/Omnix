# Omnix workplan — AI feature coverage + open issues

> **PRIORITY (standing, reaffirmed 2026-07-31).** Omnix's purpose is **Kuroco's
> improvement, not Omnix's** — Omnix is the lab rat, and `kuroco_feedback_log.md`
> is the deliverable. In every session and plan, rank work by **Kuroco-friction
> yield**, not product completeness or polish. Log findings the same session.
> This lens is the default; it does not override a direct product request from
> the user.

Working scratchpad, kept deliberately terse. Two parts:

- **§A** — the Kuroco AI feature coverage plan (agreed 2026-07-30). This is the
  actual project goal: exercise as many Kuroco AI features as possible and record
  where Kuroco can improve. Product fit is secondary.
- **§B** — every known open issue, so nothing is lost while we work on something
  else.

Companion docs: `../Plan_Jul30.md` (**authoritative on live site state** — content
groups, API structures, members), `KurocoAI_features.md` (what exists),
`kuroco_feedback_log.md` (findings to report — the deliverable),
`endpoint_status.md` (endpoint probes), `../CLAUDE_SESSION_FINDINGS.md`
(long-form history). This file does not restate site state; it tracks work.

---

## §A — AI feature coverage plan (the high-order plan)

**Why this exists, stated plainly:** the ultimate goal is **Kuroco's
improvement**, not Omnix's. Omnix is the lab rat. We work through every Kuroco AI
feature to find out which enhancement issues can be reported — so a feature that
is a mediocre fit for a Dota 2 guide is still worth building if it exercises
Kuroco and surfaces friction.

Consequences for how to work:

- **Coverage beats coherence.** Don't drop an item because it's an odd product
  fit; note the mismatch in one line and build it anyway.
- **The output of each item is a `kuroco_feedback_log.md` entry**, not a working
  Omnix feature. The feature is the means. Log friction *the same session* — error
  messages that misdirect, docs that contradict samples, settings whose names
  mislead, silent failures. It evaporates otherwise.
- **Record what worked cleanly too.** "This was straightforward" is a finding when
  the surrounding features weren't, and it stops the log reading as a hit piece.

Ordered by friction-yield per unit of effort. "Who": admin clicks (user) vs code
(Claude). Status: ☐ not started · ◐ in progress · ☑ done.

| # | Feature | Concrete build in Omnix | Who | Status | What we expect to learn |
|---|---|---|---|---|---|
| 1 | **AI dictionary** | Dota jargon dictionary (BKB, CC, stacking, buyback) applied to chat | user | ☑ working — 44-row pilot loaded; proven query-time (F19). Deferred 67 risky rows, see O22 | Whether dictionaries beat prompt-stuffing for term expansion, and how type/priority actually resolve. Baseline measured: **"BKB" returns 0 hits today** |
| 2 | **AI post-processing** | On note save: auto-summarise + auto-tag notes | user | ☐ | The happy path of the same feature that is *unreachable* from a crawl (F14) — does it behave when the save path is normal? |
| 3 | **AI validation rules** | Reject empty/garbage notes *before* save | user | ☐ | Pre-save vs post-save split; what the rejection surfaces to an API caller |
| 4 | **`ai_completion` in Smarty** | "Explain this term" custom-function endpoint | Claude writes, user pastes | ☐ | Model calls from inside Smarty; error/timeout behaviour when the model fails mid-template |
| 5 | **`rag_search` + `chat`** | Chat mode toggle: Answer / Supplementary / Sources-only / No-retrieval | Claude | ◐ UI done; two modes need endpoints (O9) | Already produced F17 (preflight 404s on uncreated paths) and one client bug of our own |
| 6 | **Embedding template + eval** | Change `search_template_vector`, re-run `eval/run_eval.py`, measure the delta | shared | ☐ | Whether template changes are observable in retrieval quality, and how re-embedding is triggered/queued |
| 7 | **Post-processing pilot on group 12** | 10-row `clean_guide` pilot, CSV upload with lightweight mode OFF + Force run. Spec: `ai_postprocess_group12.md` | user | ☐ | Confirms F14 end to end and prices the full sweep (~3,900 rows) |
| 8 | **Spider** | Crawl patch notes into a new structure, then fill custom fields via post-processing — the documented workaround for Spider's limitation | user | ☐ | F13 + F14 in combination: the limitation *and* its blocked workaround |
| 9 | **AI Agent tier** | **Now user-facing** — decision reversed 2026-08-03 (user wants a separate agent chat despite the danger). Frontend built contained; needs a dedicated tool-less agent. See §B "Agent chat" | shared | ◐ frontend done, backend blocked | Produced F15/F16 + F30/F31. Blocked on a valid-model, zero-tool agent (O15) |
| 10 | **Autonomous agent + mailbox** | Daily patch-notes summariser triggered by mail or cron | user | ☐ | The mail-triggers-an-agent path, loop guards, and what an unattended failure looks like |
| 11 | **RAG Quickstart + RAG log** | Use both throughout the above; log UX gaps | user | ☐ | Whether the built-in tooling is enough to debug retrieval without curl — this session needed curl constantly |

Not yet slotted, worth considering later: Slack/LINE inbound → agent; approval
workflow with AI; multi-language auto-translation via post-processing; AI-assisted
content editing in the admin (copilot).

---

## §B — Open issues

### Notes — ☑ DONE 2026-07-31, verified end to end

Native `omnix_user` group, no proxy. Verified with the test member in a real
browser: create 201, list 200, update "Updated", delete "Deleted", and deleting
**another member's** row correctly refused with `403 You are not authorized` —
so Kuroco enforces owned-content editing itself. O1, O2, O5, O6b, O8 all closed.

Two carried forward:

- **O6** — Orphaned rows from deleted members, incl. `topics_id 10809` and probe
  row `10812` ("PROBE published?"). Undeletable by the app (owned by absent
  members); remove from the admin.
- **O7** — Pin `open_flg: 1` in the `notes/create` endpoint's params. It works
  from the request body today, which also means a client can deliberately create
  hidden rows. Also confirm `my_own_list` is ticked on `notes/list`.

### Conversation history — ☑ BUILT 2026-07-31, not yet exercised in a browser

Structures **24** (`Omnix: sessions`) and **25** (`Omnix: messages`) exist, and the
five endpoints are live on api 7: **140** `sessions/list`, **141** `sessions/create`,
**142** `sessions/delete`, **143** `messages/list`, **144** `messages/create` — all
`GroupAuth [105]`, `open_flg: 1`. Both groups now carry `writer_groups` **and**
owned-content edit restriction = `omnix_user` (105), and neither is vectorised.
Group 25 was `content_input_type: 2` ("Custom — no body column") and is now `1`
(plain textarea), because the turn text lives in `contents`.

Frontend: `ConversationsPane.vue` is the left rail (list, switch, new, delete);
`useOmnix.openConversation/newConversation` hydrate the chat window from stored
turns. `yarn generate` passes and both panes prerender. There is no `vue-tsc` in
this project, so nothing is typechecked.

Three corrections to §C, all learned the hard way — see F26/F27/F28:

- Fields on group 25 have **no slug**, so the wire names are **`ext_1`..`ext_4`**,
  not the titles and not `ext_col_NN`. The titles are silently ignored on write.
- `ext_1` (session_id) is a **relation** field: written as an integer, read back
  as `{module_type, module_id}`.
- **`open_flg` cannot be pinned** on `sessions/create` / `messages/create` —
  `Topics::insert` has no such method param. The client sends it in the body.

Carried forward:

- **O30** — ☑ **Verified in a browser 2026-08-03.** Signed in on two separate
  accounts, asked questions on each: sessions and messages stored correctly per
  member, and notes are private to each user (no cross-member leak). Conversation
  history + notes-in-answer both confirmed live against real cookie sessions.
- **O31** — `messages/list` fetches up to 200 of the member's own turns and
  filters by session **client-side**; the endpoint's `filter_request_allow_list`
  names `ext_1` but no server filter is sent, because matching a relation column
  by bare id is unverified and a bad filter fails the whole request. A member
  with >200 turns in total loses the oldest. Fix by changing `session_id` to a
  plain number field in the admin UI, then turning the server filter on.
- **O32** — Deleting a session leaves its message rows orphaned (append-only
  structure, no bulk delete). Harmless but they accumulate.

### Notes in the answer — ☑ VERIFIED 2026-08-03 (two-account browser test)

**Product decision 2026-08-03: notes are excluded from RAG.** Group 23 is not
added to any shared chat/RAG retrieval endpoint — the F29 leak path is not shipped.
Notes stay member-private via the scoped `notes/list` endpoint only.


The member's own notes now ride along with each question:
`useNotes.noteContext()` prepends up to 3 preferences plus up to 2 notes matched
semantically against the question, each capped at 180 chars. `notes/list` (uri
128) now pins **`my_own_list: true`** — previously unpinned, which O7 flagged —
and group 23's vectorisation is used through **`?vector_search=`** on that
member-scoped endpoint.

**Group 23 is deliberately NOT added to `chat_contents_search`'s
`topics_group_id`.** That one-line config change is the tempting version and it
leaks: the AI operations apply no member filter, so any member could retrieve
another's notes. Written up as **F29**. Group 23 is vectorised (`use_openai: 1`)
but reachable only via the scoped endpoint — verified 2026-07-31 that no chat
endpoint names it.

- **O33** — 🔶 **Decoupled from the product 2026-08-03** (notes excluded from RAG,
  above), but F29 remains a valid *Kuroco* finding: RAG applies no per-member
  scoping, so member-owned content in a shared index leaks. If we still report it,
  reproduce on a *throwaway* endpoint (group 23 → chat endpoint, member A saves a
  distinctive note, ask as member B), then delete the endpoint. Not filed on
  source reading alone. No longer blocks any Omnix feature.
- **O34** — Measure what the injected profile does to retrieval. The block is
  embedded along with the question, so it can drag the search off-topic — the
  same hazard that keeps conversation history to questions only. Constants
  (`MAX_PREFERENCES`, `RELEVANT_NOTES`, `MAX_NOTE_CHARS`) are named for tuning.
- **O35** — `chat_contents_search` accepts **only `text`** in the body; `prompt`,
  `max_distance` and the rest are endpoint config, not per-request. So there is
  no way to pass persona or per-member context *out of band* — anything
  personal must go into the same string that gets embedded. Worth raising
  alongside P1's persona item.

### Agent chat — ◐ FRONTEND BUILT 2026-08-03, backend blocked on a safe agent

A **separate** chat surface from the RAG guide (decision reversed 2026-08-03 — the
user wants it despite the F15/F16 danger). It talks to a stateful Kuroco AI Agent
session, so it has real server-side memory — unlike the stateless RAG chat that
needs the 24/25 history bolt-on. The agent session (`ai_session_id`) is NOT the
same as the 24/25 "session"/"message" rows.

Frontend (all built, `yarn generate` passes, inert until the backend exists):
- `composables/useAgent.ts` — async protocol: `create_session` once → `send_message`
  → poll session events until `session_status: idle` → read `agent.message` text.
  Poll uses `send_message` with an **empty message** (the controller skips the
  dispatch but returns fresh events+status) — see F31. Refuses to confirm any
  `requires_action` tool request; surfaces it as blocked instead.
- `pages/assistant.vue` — the separate chat page (`layout: false`, own viewport),
  reuses `ChatWindow`/`ChatBubble`, own minimal composer, prominent "experimental
  agent" warning, per-member `localStorage` session, "New session" reset.
- `pages/index.vue` — "Assistant ⚡" link in the control strip.

Security design (the containment is server-side; client guards are theater — F30):
1. **Pin `ai_agent_id`** in the `create_session` endpoint's fixed params — never
   caller-supplied, or a member could open a session against any agent.
2. **The pinned agent must have zero destructive tools** (ideally zero tools) —
   admin-UI config, the only real answer to "the agent just complies".
3. Session-ownership on `send_message` is unenforced (F15) — accepted only because
   this is a test site.

Status / open:
- **O37** — ☑ **Done 2026-08-03.** Both endpoints created on api 7 via MCP, agent
  pinned: **147** `ai/create_session` (`model_method_params {"ai_agent_id": 3}`,
  GroupAuth [105]) and **148** `ai/send_message` (GroupAuth [105]). Wired end to end.
- **O36** — 🔴 **Still blocked: agent 3's model is invalid.** User gave
  `ai_agent_id: 3`. Reading its sessions (via `ai_session_view-get`) shows every
  turn dies with the Bedrock error `(ValidationException) ConverseStream: The
  provided model identifier is invalid` (O15, reproduced exactly). The chat is now
  fully wired but will only return that error until the model is fixed in the admin
  UI. Also unconfirmed: whether agent 3 has zero tools (the containment). User must
  fix the model AND confirm no tools.
- **O38** — Verify the empty-message poll (F31) returns events+status through the
  live api-7 endpoint (works via `ai_session_view-get`; not yet exercised through
  148). Browser test once the model is valid.

### Chat / retrieval config

- **O25** — 🔴 **A relevance threshold on api 7's `chat_contents_search` now admits
  distance-0.82 matches**, so "quantum chromodynamics" returns ten Dota heroes and
  the model answers from its own knowledge while citing them. The day before, the
  same endpoint refused cleanly at 0.691. Check that endpoint's `max_distance` /
  `cnt` params — a parallel session may have changed them. This is the single
  setting separating refusal from citation-backed fabrication (F21).
- **O22** — 🔶 `chat_contents_search` on api 7 searches **group 17 only** (proven:
  every hit across four queries carried `topics_group_id: 17`; "Black King Bar"
  returned 0). Items and builds live in group 12, reachable only via
  `chat_supplementary_search`. **Add group 12 — and 20 once populated — to the api 7
  endpoint's `topics_group_id`.** Until then Answer mode cannot discuss any item,
  and most of the dictionary's item entries have nothing to match.
- **O23** — Finish the dictionary in three phases. Blast radius is small: F19
  established replacement happens on the **query**, so a bad rule spoils one
  search rather than corrupting stored content — test aggressively.
  1. Add a single risky row (`AM,Anti-Mage,Noun`) to the plain dictionary and ask
     *"what happens in a teamfight?"*. If retrieval visibly changes, Kuroco is
     doing naive substring replacement ("te**Anti-Mage**fight") → finding.
  2. Then load `jargon_dict_kuroco_regex.csv` (67 rows, `\bkey\b`) into a
     **second** dictionary with Regex ON. Regex is a per-dictionary toggle, not
     per-row, so plain and regex rules cannot share one dictionary — which also
     exercises the Priority field. Set the regex dictionary higher priority.
  3. Compare: if `\b` works, the full 111 usable rows are safe. If Kuroco's regex
     does not support `\b`, that is the finding, and the ~30 two-letter hero
     abbreviations stay out.
  Files: `jargon_dict_kuroco_pilot.csv` (44, loaded), `..._deferred.csv` (67,
  plain, held), `..._regex.csv` (67, boundary-guarded, ready).
- **O24** — ☑ Resolved 2026-07-30: `eval/run_eval.py` already scores the returned
  `list` (slug, `topics_group_id`, `vector_distance`), not reply prose, so it is
  immune to the F21 grounding problem. It reads api 6 + `KUROCO_ACCESS_TOKEN` from
  `.env` — which is why `6/rag_main_search` is worth keeping even though the
  browser cannot use it.

### Chat modes

- **O27** — 🔴 `7/chat_contents_search` still answers **anonymously** and spends
  model budget per call. Api 6 was restricted 2026-07-31; api 7 was not.
- **O28** — Bind the AI dictionary: set **`input_dict_sys_nm`** = `dota_jargon` on
  the api 7 chat endpoint. Until then the dictionary is inert (F19). Then A/B it
  properly, and try `output_dict_sys_nm` as a separate lever.
- **O29** — `eval/run_eval.py` now 401s: it sends a static token to api 6, which
  is cookie-mode and restricted. Give it a login step, or its own structure.
  Blocks coverage item #6.
- **O9** — ☑ BUILT 2026-07-31. `7/rag_search` (uri 145, GET, OpenAI::rag_search,
  group 17, `?query=`) and `7/chat` (uri 146, POST, OpenAI::chat, `{text}`) now
  exist, both `GroupAuth [105]` to match the other chat endpoints. The client
  already routed to `7/rag_search` and `7/chat`, so no code change — the mode
  toggle's "Sources only" and "No retrieval" options work as soon as these
  resolve. `model` is a required param on both (rag_search rejects its absence).
  Browser-verify alongside O30. Note `rag_search` fixes O35's persona gap only
  for the sources view, not the answer path.

### Signup / auth

- **O10** — Nothing ties a verified `email_hash` to `auth/register`, so signup
  verification is decorative. Source-verified and written up in
  `../issue_api_registration_no_email_verification.md` (drafted, **not filed**).
  Binding options are in `Plan_Jul30.md` §2.
- **O11** — The live three-step signup has never been run end to end; step 1 mails
  a real code, so it needs a real mailbox.
- **O12** — `ext_info: {name1, name2}` on invite: unverified whether Kuroco carries
  those into the provisional member. Harmless if dropped.
- **O13** — Chat answers without a session, contradicting the "login required for
  everything" decision. Decide: enforce, or amend the decision deliberately.

### Content / data

- **O14** — "BKB" returns **0 hits** — no jargon content indexed. Baseline for §A#1
  (AI dictionary) and for the empty Guides structure (group 20, 0 rows).
- **O15** — AI Agent `send_message` fails: `ValidationException: The provided model
  identifier is invalid` (`us.anthropic.claude-opus-4-8`, Bedrock ap-northeast-1).
  Try another model on `ai_agent_id: 1`, then run the two-message memory test.
- **O16** — Temp structures still live: **api 8** ("TEMP AI Agent memory test",
  `privileged_static_token`) and **api 9** (`checkbox_api_struct`, same). Both are
  privileged and should not outlive their tests.
- **O17** — Group 12 cleanup pilot not run. Include rows 7101 and 8844
  deliberately — both should come back `NO_USABLE_CONTENT`, and if either returns
  invented advice the anti-fabrication prompt needs hardening before spending on
  ~3,900 rows.
- **O18** — `eval/run_eval.py` not re-run since the content merge and the endpoint
  move; no current retrieval baseline.
- **O19** — `ext_4` (Icon) empty on the sampled hero row; unverified across the set.

### Frontend polish

- **O20** — `isChecking` is shared between the session check and every auth call,
  so the sign-in button reads "Signing in…" on first load.
- **O21** — ☑ Resolved 2026-07-31 by the conversation-rail layout change. The
  header and disclaimer moved out of `layouts/default.vue` and into the chat
  column itself, so they centre on the chat column rather than the window — and
  the side rails run the full viewport height instead of being clipped top and
  bottom by a full-width band. `/register` keeps the default layout.

  The workspace uses **`definePageMeta({ layout: false })`** and sets its own
  `height: 100dvh`. A dedicated `layouts/chat.vue` was tried first and removed:
  taking the page's height from a layout's scoped `.shell` meant that when that
  CSS was not live — a stale `nuxt dev` did exactly this, while the production
  build was fine — the grid had nothing to size against, collapsed to content
  height, and left the bottom ~40% of the window black. A page that owns the
  viewport cannot fail that way. Worth remembering before reintroducing a layout
  here.

### Reported / filed already

- adminMCP checkbox read bug (`bug_adminmcp_checkbox_data_loss.txt`) — filed.
- Trailing-whitespace option key bug — filed.
- 18 further findings in `kuroco_feedback_log.md` — **not yet reported**. F2/F3/F4/
  F6/F10 are the highest-value cluster (all diagnosability); F15/F16 are security
  and should not go in a public issue.

---

## §C — Ready to build (needs admin MCP)

Everything below is specified from things verified the hard way this week. The
frontend for it is already committed; none of it works until these exist.

### Structures

**`omnix_sessions`** — one row per conversation. `subject` = title (first
question, 80 chars), `contents` = optional summary. **No extension fields.**

**`omnix_messages`** — one row per turn, append-only:

| ext | Slug | Type | Purpose |
|---|---|---|---|
| ext_1 | `session_id` | text | `topics_id` of the session row; filtered on |
| ext_2 | `role` | text | `user` or `omnix` |
| ext_3 | `seq` | number | ordering — `inst_ymdhi` is too coarse for same-second turns |
| ext_4 | `mode` | text | which AI operation answered |

Both structures: **`writer_groups` = `omnix_user`** and **owned-content edit
restriction = `omnix_user`**. Do **not** enable vectorisation on either — member
notes and conversations in a shared RAG index is the leak described in
`kuroco_frontend_endpoints.md`, and worth testing deliberately later rather than
switching on by accident.

### Endpoints (api 7, request restriction `omnix_user` on all five)

| Path | Operation | Params |
|---|---|---|
| `sessions/list` | `Topics::list` | pinned group, `my_own_list`, order `inst_ymdhi desc`, `cnt: 50` |
| `sessions/create` | `Topics::insert` | pinned group, **`open_flg: 1`** |
| `sessions/delete/{id}` | `Topics::delete` | pinned group |
| `messages/list` | `Topics::list` | pinned group, `my_own_list`, `cnt: 200`, `filter_request_allow_list: ext_col_01` |
| `messages/create` | `Topics::insert` | pinned group, **`open_flg: 1`** |

The id goes in the **path** for delete (`{id}`), not the body — the bare path
404s.

### Why each of those settings is there

- **`open_flg: 1`** — without it the insert returns `"Added."` with an id and the
  row is invisible to list. Cost hours (F22).
- **`my_own_list`** — the only per-member scoping parameter; `has_permissions` is
  something else entirely (F18).
- **owned-content edit restriction** — Kuroco then enforces ownership itself;
  verified by a 403 when deleting another member's row.
- **request restriction `omnix_user`** — not the *structure* security mode, which
  is orthogonal and does not require a login (F23).

### Then verify

Sign in as the test member in a browser (cookie is `HttpOnly` + only issued to
allowed origins, so curl cannot do this — see §13.2 of the findings), ask two
questions, and confirm: a session row appears, two message rows per exchange with
increasing `seq`, the conversation picker lists it, and reloading resumes it.
