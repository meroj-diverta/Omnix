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
| 9 | **AI Agent tier** | Unblock `send_message` (bad Bedrock model id), zero-tool agent, run the memory test | user | ☐ blocked (O15) | Whether Bedrock-harness sessions carry real memory; also the F15 ownership gap in practice |
| 10 | **Autonomous agent + mailbox** | Daily patch-notes summariser triggered by mail or cron | user | ☐ | The mail-triggers-an-agent path, loop guards, and what an unattended failure looks like |
| 11 | **RAG Quickstart + RAG log** | Use both throughout the above; log UX gaps | user | ☐ | Whether the built-in tooling is enough to debug retrieval without curl — this session needed curl constantly |

Not yet slotted, worth considering later: Slack/LINE inbound → agent; approval
workflow with AI; multi-language auto-translation via post-processing; AI-assisted
content editing in the admin (copilot).

---

## §B — Open issues

### Notes — decided: native `omnix_user` group, proxy abandoned

**Decision 2026-07-30:** notes go through the direct `Topics::*` endpoints with a
new `omnix_user` member group. The custom-function proxy and its hidden api-5
endpoint are being deleted. Frontend needs no change — `useNotes.ts` already
calls `7/notes/*`; only what sits behind those paths changes.

- **O1** — Create the `omnix_user` group: User type = **Editing user**, "disable
  management-screen access" ticked, content permissions only (View/Create/Update/
  Delete), **not** Administrator. Point new registrations at it in two places:
  the site-wide default-group setting, and `default_group_id` on the register
  endpoint.
- **O2** — On the notes structure: **Edit restriction** = `omnix_user`, **Edit
  restriction limited to owned content** = `omnix_user`. Group 23 already carries
  `writer_groups:['User']` + `my_topics_only_limit_groups:['User']` per
  `Plan_Jul30.md`, so this may be a rename/reassign rather than new work.
- **O3** — Confirm `omnix_user` appears in **no other structure's** edit
  restriction — 17 (Hero+Lore), 20 (Guides), 12 (Supplementary). That is the RAG
  corpus; it is the whole product.
- **O4** — Existing test member is in the old group. Changing the default only
  affects new registrations, so it will keep 403ing until moved by hand.
  `7/auth/token` currently answers *"Member is not in any of the allowed groups"*.
- **O5** — ☑ Resolved 2026-07-31. `7/notes/create` now points at `Topics::insert`
  directly and refuses anonymous callers (probed with `validate_only:true` so
  nothing was written: `403 Insufficient permissions`). The proxy and api 5 are
  gone.
- **O6** — Orphaned notes rows. **Test members were deleted 2026-07-31, and
  deleting a member does not delete their content**, so any rows they created —
  plus stray row `topics_id 10809` from a diagnostic — now belong to members that
  no longer exist. Because `my_own_list` scopes to the current member, these are
  invisible to the app but still present. Clear them out so they don't muddy
  future tests.
- **O6b** — `notes/list` returned nothing after a successful create. Two candidates:
  (a) API-created content is **not auto-published**, and `Topics::list` returns
  published rows only — the gotcha already recorded in findings §3.4; fix by
  pinning `open_flg: 1` / `open_type: open` in the create endpoint's params.
  (b) the rows belong to a now-deleted member (see O6). Check the row's publish
  state and owner in the admin.
- **O7** — `7/notes/list` needs the **`my_own_list`** parameter ticked, or members
  see each other's notes.
- **O8** — Notes CRUD has never run end to end. `update`/`delete` take the id in
  the **path** (`useNotes.ts` fixed for this, unverified live); `remove()` also
  sends `topics_id` in the body — harmless, redundant.

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
