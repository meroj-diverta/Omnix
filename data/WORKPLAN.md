# Omnix workplan — AI feature coverage + open issues

Working scratchpad, kept deliberately terse. Two parts:

- **§A** — the Kuroco AI feature coverage plan (agreed 2026-07-30). This is the
  actual project goal: exercise as many Kuroco AI features as possible and record
  where Kuroco can improve. Product fit is secondary.
- **§B** — every known open issue, so nothing is lost while we work on something
  else.

Companion docs: `KurocoAI_features.md` (what exists), `kuroco_feedback_log.md`
(findings to report — the deliverable), `endpoint_status.md` (live endpoint
state), `../CLAUDE_SESSION_FINDINGS.md` (long-form history).

---

## §A — AI feature coverage plan

Ordered by friction-yield per unit of effort. "Who" = admin clicks (user) vs code
(Claude). Status: ☐ not started · ◐ in progress · ☑ done.

| # | Feature | Concrete build in Omnix | Who | Status |
|---|---|---|---|---|
| 1 | **AI dictionary** | Dota jargon dictionary (BKB, CC, stacking, buyback) applied to chat. Baseline measured: "BKB" currently returns **0 hits** | user (admin) | ☐ |
| 2 | **AI post-processing** | On note save: auto-summarise + auto-tag rows in `my_notes` | user | ☐ |
| 3 | **AI validation rules** | Reject empty/garbage notes *before* save (the pre-save counterpart of #2) | user | ☐ |
| 4 | **`ai_completion` in Smarty** | "Explain this term" custom-function endpoint | Claude writes, user pastes | ☐ |
| 5 | **`rag_search` + `chat`** | Chat mode toggle: Answer / Supplementary / Sources-only / No-retrieval | Claude | ◐ UI done; modes 3+4 need endpoints (see O7) |
| 6 | **Embedding template + eval** | Change `search_template_vector`, re-run `eval/run_eval.py`, measure the delta | shared | ☐ |
| 7 | **Post-processing pilot on group 12** | 10-row `clean_guide` pilot via CSV upload with lightweight mode OFF + Force run. Spec: `ai_postprocess_group12.md` | user | ☐ |
| 8 | **Spider** | Crawl patch notes into a new structure, then fill custom fields via post-processing — the documented workaround for Spider's limitation | user | ☐ |
| 9 | **AI Agent tier** | Unblock `send_message` (bad Bedrock model id), zero-tool user-facing agent, run the memory test | user | ☐ blocked (O14) |
| 10 | **Autonomous agent + mailbox** | Daily patch-notes summariser, triggered by mail or cron | user | ☐ |
| 11 | **RAG Quickstart + RAG log** | Use both while doing the above; record UX gaps in the feedback log | user | ☐ |

Not yet slotted, worth considering later: Slack/LINE inbound → agent; approval
workflow with AI; multi-language auto-translation via post-processing.

---

## §B — Open issues

### Blocking the notes feature

- **O1** — Notes writes 403 for members. Decided fix not yet applied: create an
  `omnix_user` group (User type = Editing user, "disable management-screen
  access" ticked, content permissions only), then on `my_notes` set **Edit
  restriction** = `omnix_user` and **Edit restriction limited to owned content** =
  `omnix_user`. Verify the group appears in **no other structure's** edit
  restriction — especially `hero_master`, `hero_abilities`, `hero_lore`,
  `guides`, 12, 13.
- **O2** — Existing test member is still in the old group; changing the default
  only affects new registrations, so it will keep 403ing until moved by hand.
- **O3** — `7/notes/list` needs the **`my_own_list`** parameter ticked, or members
  see each other's notes.
- **O4** — `7/notes/create` answers **unauthenticated** (verified by curl, no
  cookie). Needs API request restriction → GroupAuth. Urgent once writes work.
- **O5** — `notes/update/{id}` and `notes/delete/{id}` take the id in the **path**;
  `useNotes.ts` was fixed for this but the flow has never been run end to end.
  `remove()` still also sends `topics_id` in the body — harmless, redundant.
- **O6** — Half-built custom-function proxy: api 5 `notes/create` + a custom
  function pointing at a nonexistent `/rcms_api/11/notes_insert`. Decide whether
  to finish it as a feature-coverage exercise (it exercises `api_internal` and
  `request_api_post`) or delete it now that the group approach makes it
  unnecessary. Do not leave it half-wired.

### Signup / auth

- **O7** — `rag_search` and `chat` don't exist on api 7 (only on api 6, which is
  static_token and browser-unusable). Chat modes 3 and 4 stay dark until created.
- **O8** — Nothing ties a verified `email_hash` to `10/auth/register`: it requires
  only `login_pwd`/`name1`/`email` and ignores unknown properties, so signup
  verification looks bypassable. Check the parameter list at
  `api_info/?api_id=10`.
- **O9** — The live three-step signup has never been run end to end; step 1 mails
  a real code, so it needs a real mailbox.
- **O10** — `ext_info: {name1, name2}` on invite: unverified whether Kuroco carries
  those into the provisional member. Harmless if dropped.
- **O11** — Chat still answers without a session, which contradicts the
  "login required for everything" decision. Decide: enforce, or amend the
  decision on purpose.

### Content / data

- **O12** — "BKB" returns **0 hits** — no jargon content indexed. Baseline for #1
  and for the `guides` structure.
- **O13** — 62 of 127 heroes still not loaded into `hero_master` (17).
- **O14** — AI Agent `send_message` fails: `ValidationException: The provided model
  identifier is invalid` (`us.anthropic.claude-opus-4-8`, Bedrock ap-northeast-1).
  Try another model on `ai_agent_id: 1`. Then run the two-message memory test, and
  clean up temp **api 8** (2 URIs + the API).
- **O15** — Group 12 cleanup pilot not run; blocked on nothing but time. Include
  rows 7101 and 8844 deliberately — both should come back
  `NO_USABLE_CONTENT`, and if either returns invented advice the anti-fabrication
  prompt needs hardening before spending on ~3,900 rows.
- **O16** — `eval/run_eval.py` has not been re-run since the endpoint moved to
  api 7; no current retrieval baseline.

### Frontend polish

- **O17** — `isChecking` is shared between the session check and every auth call,
  so the sign-in button reads "Signing in…" on first load.
- **O18** — After the full-bleed layout change, the header title and footer centre
  on the window, so with the codex pane open they no longer sit above the centre
  of the chat column.
- **O19** — Stray file literally named `'` in the repo root (~5.7KB, an old copy of
  `useAuth.ts`) from a shell mishap. Untracked; delete once confirmed junk.

### Reported / filed already

- adminMCP checkbox read bug (`bug_adminmcp_checkbox_data_loss.txt`) — filed.
- Trailing-whitespace option key bug — filed.
- 18 further findings in `kuroco_feedback_log.md` — **not yet reported**. F2/F3/F4/
  F6/F10 are the highest-value cluster (all diagnosability); F15/F16 are security
  and should not go in a public issue.
