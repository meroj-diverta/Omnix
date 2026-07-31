# Omnix workplan — AI feature coverage + open issues

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
| 9 | **AI Agent tier** | **Not for user-facing chat** — decided 2026-07-31 (F15 + F16). Keep for internal tasks only; the memory test is still worth running to settle whether Bedrock sessions persist | user | ◐ deferred | Already produced F15/F16. Blocked on a valid Bedrock model id; note `ai_agent_id: 1` is stale |
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

### Conversation history — frontend done, Kuroco side missing

- **O26** — 🔶 **Create the two structures and five endpoints in §C.** The client
  (`useConversations.ts`) is built, typechecked and committed; nothing works until
  these exist. This is the first thing to do with admin MCP access.

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
- **O9** — Chat modes "Sources only" and "No retrieval" need `rag_search` and
  `chat` on **api 7**. `6/rag_main_search` was created 2026-07-30 but api 6 is
  static_token, so the browser cannot use it — still useful for `run_eval.py`.
  Code expects `7/rag_search`; adjust the route string if the path differs.

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
- **O21** — After the full-bleed layout change, the header title and footer centre
  on the window, so with the codex pane open they no longer sit above the centre
  of the chat column.

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
