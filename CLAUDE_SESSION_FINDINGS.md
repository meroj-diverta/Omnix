# Omnix / Kuroco Session Findings & Resume Point (as of 2026-07-27, ~21:45 JST)

**One-sentence summary of this session's work**: Built and wired up the full
Stage 1 structured content model for Omnix's Q&A chatbot on Kuroco (4 new
content structures, corrected endpoint config, fixed a missing-embedding
bug), corrected two wrong assumptions about how Kuroco's AI tiers work
(no built-in persona/system-prompt anywhere, and AI Agent sessions need a
specific non-obvious setup chain), and got partway through an empirical
test of whether AI Agent sessions carry real conversation memory — currently
blocked on a Bedrock model-id error, not on anything conceptual.

This file is a full session snapshot so a new Claude session (or a human)
can pick up exactly where this one left off, even if the original chat
history is gone. Supersedes all prior versions of this file and the
assumptions in `KUROCO_SETUP.md`. Read this file's §6 first — it's the
literal "what to do next" — then the rest for context as needed.

## 1. Project overview

**Omnix** = a Dota 2 AI game guide/chatbot, built on Kuroco as its mandatory
backend (explicit user requirement).

- **Frontend**: `~/Omnix/Omnix` — Nuxt 4 app. Chat UI
  (`app/components/ChatWindow.vue`, `ChatBubble.vue`, `ChatInput.vue`),
  composable `app/composables/useOmnix.ts`, server proxy
  `server/api/omnix.post.ts`. Fully wired already, confirmed working
  end-to-end against the live backend this session. No frontend code
  changes needed for Stage 1.
- **Backend**: live Kuroco cloud site `https://meroj.g.kuroco.app`, api id
  `6` ("DOTA 2 endpoints"), using `chat_contents_search` (uri id 109) as
  Omnix's answer engine.
- Original phased proposal: Stage 1 = text Q&A (this file's main focus,
  **now functionally complete**, see §3), Stage 2 = Strategy Planner pivot
  (pregame intake → goal clarification → RAG fetch → tailored plan →
  **recurring mid-game check-in loop**, explicitly the core focus of that
  phase, not a stretch goal — see §5), Stage 3 (voice/OCR) not started and
  not currently planned.

## 2. Permission/authorization state

Claude is authorized to run mutating `kuroco-admin` CLI / admin_api / admin
MCP calls directly for schema/config work on the live site (confirmed and
exercised extensively this session — dozens of live mutations made:
content structures created, endpoint configs changed, a stray topics_group
deleted, a temporary test API created). No new restriction has been placed
on this. `kuroco-admin` CLI itself remains logged out (needs
browser-interactive login the AI can't do) — everything this session was
done via the `meroj-adminMCP` MCP tools instead, which remained
authenticated throughout.

## 3. Stage 1 — status: BACKEND done, FRONTEND deployment broken

> ⚠️ **Amended 2026-07-28.** The Kuroco *backend* work in this section is
> complete and verified. But the deployed *frontend* cannot reach it at all
> — the app is deployed as a static site with no server, so its server-proxy
> architecture doesn't exist at runtime. **See §7.6.** Stage 1 is not
> user-facing-complete until that is fixed.

### 3.1 Content structures created (live, confirmed working)

| topics_group_id | name | fields (ext_N → title, type, notes) |
|---|---|---|
| **17** | `hero_master` | ext_1 Primary Attribute (select, required), ext_2 Roles (checkbox multi — **see §3.6: writable via `::` string, but unreadable via adminMCP**), ext_3 Attack Type (select, required), ext_4 Icon (image, required), ext_5 External ID (text) |
| **18** | `hero_abilities` | ext_1 Related Hero (relation → 17, required), ext_2 Ability Type (select, required), ext_3 Cooldown (text), ext_4 Mana Cost (number), ext_5 Description (wysiwyg) |
| **19** | `hero_lore` | ext_1 Related Hero (relation → 17, required), ext_2 Lore Text (wysiwyg, required), ext_3 Source URL (link) |
| **20** | `guides` | ext_1 Guide Type (select, required), ext_2 Guide Text (wysiwyg, required), ext_3 Source URL (link), ext_4 Related Hero (relation → 17, required) |

All 4 are **manual/CSV-curated by design** — no Spider/`webpage_flg`
involved (see §4.1 for why). `Related Hero` is required on all three
dependent structures (no crawl-caveat needed, since nothing crawls into
them).

**Critical, easy-to-miss config that's NOT part of `topics-group-create`'s
defaults** — all 4 groups needed this set explicitly afterward via
`topics-group-update`, or `chat_contents_search` silently returns nothing:
- `use_openai: 1`
- `embedding_model: "text-embedding-3-small"` (matching existing groups;
  without this, the endpoint errors `"Embedding model is not set."`)

Both are now set on groups 17–20. **If you ever create a 5th structure
(`hero_matchups` etc. for Stage 2), do not forget this step** — it cost
significant debugging time this session because it fails silently
(no error, just empty search results) unless you hit the
`embedding_model`-missing case specifically.

### 3.2 A stray topics_group was found and deleted

Group 14, "Omnix: heroes" (a raw Spider-dump duplicate, `spider_settings_id: 4`,
0 content rows) was found unexpectedly at the start of this session's
execution phase. User confirmed it was their own abandoned experiment,
no longer needed → deleted via `topics-group-bulk_delete`. Not part of the
current design; don't recreate it.

### 3.3 Endpoint 109 (`chat_contents_search`) — current live production config

```json
{"cnt": 3, "model": "gpt-5.6", "topics_group_id": [17, 18, 19, 20, 12, 13]}
```

This is the **correct, final state** — groups 12/13 (raw Spider crawl
dumps, ~3907 rows in group 12) are intentionally kept as supplementary RAG
sources alongside the 4 new structured ones. Confirmed working end-to-end
live (see §3.4). **Do not leave any diagnostic overrides on this URI** —
during testing this session `max_distance`/`skip_proper_noun_detection`/
`ext_info`/a narrowed `topics_group_id` were temporarily added for
debugging and were reverted; always double check this config is back to
the block above before ending a session that touched it.

### 3.4 End-to-end verification — done, root cause of earlier confusion found

A placeholder test hero (topics_id **3926**, in group 17, subject
`"Test Hero (placeholder — safe to delete)"`) was created to test the
pipeline. It initially appeared completely invisible to
`chat_contents_search` ("I could not find any relevant content") even after
fixing `use_openai`/`embedding_model` and relaxing every search parameter —
this looked like it might be an embedding-generation delay specific to
API-driven saves.

**The real root cause, found by the user directly in the admin UI: the
record was never published** (`open_flg`/`open_type` not "open"). Content
created via the `topics-create` MCP tool does not auto-publish. Once the
user published it manually, `chat_contents_search` worked immediately and
correctly:

```
query: "Tell me about the placeholder test hero"
vector_distance: 0.323
reply: "The placeholder test hero is a temporary entry categorized as
hero_master, with the external ID TEST-PLACEHOLDER. No other details are
provided."
```

**Lesson for real data population**: whatever inserts real hero rows (CSV
import or manual entry) must ensure `open_type: "open"` /
publish, or those rows will be silently invisible to search with no error
— this is the most likely real-world gotcha to hit again.

**Side-by-side demo of the three single-shot AI operations**, run live this
session, confirmed the conceptual differences cleanly:
| Endpoint | Behavior observed |
|---|---|
| `chat` (110) | Pure LLM completion, zero retrieval — asked about "the test hero," got a generic clarifying question. No knowledge of any Omnix content. |
| `rag_search` (108) | Pure retrieval — returns raw matched `contents` text, no synthesized answer. (Note: public call needs `GET` with `?query=...`, not POST with `{"text":...}` — different from `chat_contents_search`.) |
| `chat_contents_search` (109) | Retrieval + generation — this is the one Omnix uses. Confirmed working per above. |

### 3.5 Two loose ends — not blocking, not yet resolved

1. **`Roles` checkbox — RESOLVED 2026-07-29. Writes work; the READ is
   broken.** See §3.6 for the full verified account. Short version: use a
   **`::`-delimited string** (`"Carry::Support::Durable"`) via adminMCP —
   the value is stored correctly and is keyword-searchable. Do **not** try
   to verify it by reading back via `topics-fetch`, which returns `[[""]]`
   for adminMCP-written checkbox values; spot-check in the admin UI
   instead. Earlier entries in this file claiming checkbox writes were
   impossible, or that `::` destroyed data, were **wrong** — both were
   artifacts of trusting that broken read.
2. **`ext_info` param (hypothesized mechanism for injecting `image` into
   `chat_contents_search`'s `list[]` response) was never cleanly tested** —
   the diagnostic attempts got tangled up with the publish-status bug
   (§3.4) and were abandoned once that bigger issue was found. Now that
   publish-status and embedding config are understood, this should be a
   quick clean retest: set `ext_info` in the URI's `model_method_params`
   (not per-request — public calls only accept `{"text": "..."}`, extra
   body properties get rejected with `"Additional properties not allowed"`),
   call the endpoint with a query matching the test hero, inspect the
   `list[]` item for an `image`/similar field. Revert the URI config
   immediately after testing, same caution as §3.3.

### 3.6 Multiple choice (checkbox) fields via adminMCP — VERIFIED 2026-07-29

**Conclusion: adminMCP writes checkbox values correctly. adminMCP cannot
read back what it wrote.** This was established by a controlled two-round
test that the user and Claude cross-checked independently (Claude via
adminMCP, user via the admin UI). It **corrects three earlier wrong claims**
in this file and in a filed GitHub issue.

**Test setup** — content structure `mcp_readwrite_test` (`topics_group_id
22`), created by the user in the admin UI, deliberately minimal:
- `cb_field` (`ext_1`) — Multiple choice (checkbox), options `alpha`,
  `beta`, `gamma`, `delta`. No trailing whitespace (that would trigger the
  separate, already-filed whitespace bug).
- `text_control` (`ext_2`) — plain Text. **Control field**, to isolate
  whether the fault is checkbox-specific or general to adminMCP writes.
- Record `rw-test-1` (`topics_id 10618`), published.

Option values were chosen **disjoint** between rounds so the origin of any
observed value is unambiguous.

**Round 1 — baseline, written via admin UI** (alpha + beta, `baseline`):
adminMCP `topics-fetch` returned `[["alpha","beta"]]` and `["baseline"]`.
✅ UI and adminMCP agree. So the adminMCP read is **not** broken in general.

**Round 2 — written via adminMCP.** One request, both fields:
```
topics-update {"topics_id":10618,"topics_group_id":22,
               "ext_1":"gamma::delta","ext_2":"written-by-mcp"}
→ {"errors":[],"messages":["Updated"],"status":"1"}
```
Results:
| Check | Result |
|---|---|
| adminMCP `topics-fetch` → `ext_col_01` | `[[""]]` ❌ |
| adminMCP `topics-fetch` → `ext_col_02` | `["written-by-mcp"]` ✅ |
| Admin UI (hard-refreshed) → `cb_field` | **gamma, delta** ✅ |
| Admin UI → `text_control` | `written-by-mcp` ✅ |
| adminMCP `topics-list` `topics_keyword=gamma` | **matches the record** ✅ |

**What this proves:**
- The write **succeeded** — the UI shows exactly the submitted values, and
  keyword search finds them, so the data is stored and indexed.
- The **read** misreports it as `[[""]]`.
- It is **checkbox-specific** — the text field in the *same request*
  round-tripped perfectly.
- **No data loss.** The update replaced alpha/beta with gamma/delta, which
  is correct update behaviour.
- `[[""]]` (array containing an empty string) is distinguishable from a
  genuinely unset field, which reads `[[]]`.

**Three earlier claims this corrects — do not regress to them:**
1. ❌ *"`::` writes silently destroy data"* — false. The write is correct;
   the read misreports.
2. ❌ *"Checkbox fields cannot be written via API in any format"* — false
   for the **public rcms_api** (the user verified a plain JSON array
   `["one","three"]` works there, and that a `::` string is correctly
   rejected with `"Array expected, ... received"`), and false for adminMCP
   with a `::` string.
3. ❌ *"A valid array is rejected by adminMCP"* — **unverifiable**, and
   removed from the issue. Claude cannot observe how the MCP client
   serialises array-valued tool arguments, so an array may never actually
   have reached the server as an array. Only unambiguous string payloads
   should be cited as evidence from the adminMCP path.

**Root cause — plausible, NOT confirmed:** UI-written values read back
correctly while adminMCP-written values do not, so the two paths likely
leave the field in different stored representations. Kuroco has a JSONB
storage mode for extension values (`USE_TOPICS_EXT_JSONB`,
`nfs/lib/modules/topics/config.php:90`), and the checkbox extension class
defines both a JSONB column accessor (`subLangColumnSingle()` → `value_json`)
and a JSONB escaping helper (`jsonbEscapeValueSingle()`) in
`nfs/lib/modules/topics/class/extensions/05_5_multiple_choice_checkbox.php`.
A mismatch between which representation the adminMCP write populates and
which its read consults fits the evidence. **Not verified — offered only as
a lead.** An earlier "grep-confirmed" `ApiModelValues\MultiSelect::parseRequest`
explanation was abandoned because it explained claim 3, which itself did not
survive.

**Practical consequences for this project:**
- **Roles is populatable.** Write `"Carry::Support::Durable"` via adminMCP.
  Verify by spot-checking in the admin UI or via keyword search — never by
  reading back through `topics-fetch`.
- Any read-after-write verification loop against a checkbox field via
  adminMCP will produce a false negative.
- **Still untested:** Master (checkbox) `ext_type 37`; repeatable fields
  (`ext_group_loop > 1`); whether re-saving from the admin UI normalises the
  stored representation so the adminMCP read starts working; and whether the
  bug reproduces on a *different* Kuroco site (which would point at a
  per-site config difference such as `USE_TOPICS_EXT_JSONB` and would confirm
  the lead above — this test was attempted but the second MCP server never
  registered).

**Filed issue**: text lives in `~/Omnix/Omnix/bug_adminmcp_checkbox_data_loss.txt`
(filename now a misnomer — it is not data loss). The user filed it and has
edited it once; it has been rewritten to match the conclusions above.
Separate already-filed issue: trailing whitespace in an option key makes the
option unselectable (asymmetric `trim()` at
`nfs/lib/modules/topics/class/extension.php:2075` — label trimmed, key not).

### 3.7 Content-structure creation mechanics — confirmed live tool quirks

The `topics-group-create` MCP tool's own declared JSON schema is
**incomplete/misleading** — trust what actually works, confirmed by
successful live calls this session, over the schema or any generic skill
doc:
- Select/checkbox options: use **`options: [{"key":"...","val":"..."}]`**
  (an array of objects) as a top-level field property — **not** the
  declared `ext_option` string param, which is silently accepted but
  never actually applied (confirmed: sending it produces an empty
  `ext_option_N` in the underlying form data every time, with no error).
- Relation fields: use top-level **`module: "topics"`** and
  **`group_id: "<target topics_group_id as a string>"`** — this works
  despite not being in the tool's declared schema either.
- `required: true` on a field correctly maps to `ext_limit_item: "required=1"`
  internally — this one part of the declared schema works as documented.
- The live Zod-schema-pull endpoint mentioned in earlier planning
  (`GET /direct/rcms_api/admin_api/?MODE=zod_schema&schema=TopicsGroupSchema`)
  was never actually used this session — empirical trial-and-error against
  the real tool (create on a throwaway test group → inspect the echoed
  `formData` in the response → delete the test group) was faster and more
  reliable. Prefer that approach over trying to fetch the schema via
  `kuroco-admin` CLI (which needs a login the AI can't do).

## 4. Corrected misconceptions from earlier sessions (important — don't regress)

### 4.1 Spider/crawling cannot fill custom fields — confirmed via source, acted on

Flagging a TopicsGroup with `webpage_flg=1` auto-materializes a **fixed**
18-field "webpage" preset (this is exactly what groups 12/13 are). Spider's
crawl payload only ever writes into that fixed field set by slug — it can
**never** populate a custom `relation`/`select`/`wysiwyg` field you add
yourself, regardless of whether the group is also crawler-flagged. This is
why all 4 Stage 1 structures ended up fully manual/CSV-curated with zero
Spider involvement — there was no way to have Spider partially fill them.

### 4.2 There is no persona/system-prompt config anywhere in Kuroco's single-shot AI tier — corrected by the user directly, this was wrong

An earlier hypothesis (from source-code reading) guessed that
`chat_contents_search`'s `"model": "gpt-5.6"` value resolved through a
`t_ai_router` config entry carrying a system prompt/persona. **The user
corrected this directly and unambiguously: no such thing exists.**
`"gpt-5.6"` is simply a model name picked from a dropdown at
endpoint-creation time (Category: AI, Model: **AI** — see §5.1 for the
distinction from Model: AIAgent). No config file, markdown, or global
context is attached to any model choice on this tier. Confirmed further by
live testing: `chat` (which uses the same tier) had zero awareness of
anything Omnix/Dota2-related and asked a generic clarifying question.

**Concrete implication for Omnix, not yet built**: if/when Omnix wants the
"friendly Dota 2 coach" persona from `KUROCO_SETUP.md` §2, it must be
composed into the `text` sent from Omnix's own server
(`server/api/omnix.post.ts`) on every call — e.g. prepend the persona
instructions to the user's question before sending. There is nothing to
configure on the Kuroco side for this on the single-shot tier. This is an
actual code change, not an admin task — **not yet done**.

### 4.3 AI Agent + Session memory — verified via source, empirical test in progress (see §5)

Re-verified (not re-guessed, this time) via careful source reading that
Kuroco's own code, for the **Anthropic** harness specifically
(`AiAgentApi.php`), sends only the new message per call, keyed by a remote
`harness_session_id`, and never stores/resends prior turns itself. Whether
that means real memory exists depends on whether Anthropic's Managed
Agents API actually persists context server-side — unconfirmable from
Kuroco's code alone. **This project is actually using the Bedrock harness**
(no Anthropic API key available), which uses a different class
(`BedrockManagedHarness.php`) that explicitly mirrors events into a local
`t_ai_session_event` table — a meaningfully different mechanism not yet
re-verified with the same rigor. The empirical live test (§5) exists
specifically to settle this without relying on source-reading assumptions
that have already been wrong twice this session.

## 5. AI Agent + Session tier — setup chain (discovered live, non-obvious)

This is a completely separate tier from everything in §3 — different
`model_classpath` (`AiAgent`, not `OpenAI`), different operations
(`create_session`/`send_message`, not `chat`/`chat_contents_search`).

### 5.1 The endpoint-creation UI distinction

When creating an rcms_api URI with Category: **AI**, the "Model" dropdown
has exactly 2 options:
- **AI** → `model_classpath: "OpenAI"` → operations `chat`/`rag_search`/
  `chat_contents_search`/`simplify_schema`. Everything in §3/§4.2.
- **AIAgent** → `model_classpath: "AiAgent"` → operations
  `create_session`/`send_message`. This section.

### 5.2 The full chain required before an AIAgent-mode URI's Operation field even becomes selectable

Discovered by working through it live, not documented anywhere obvious:

1. **AI Environment** must exist first — admin screen
   `/management/ai/ai_env_edit/`. Choose a **Harness**:
   - "Anthropic Managed Agents" — requires your own Anthropic API key.
   - "AWS Bedrock AgentCore Managed Harness" — Execution Role ARN field can
     be **left blank** to fall back to `oem_bedrock_harness_role_arn` from
     platform/OEM settings, meaning **no AWS credentials of your own are
     needed**. This is the path used this session (no Anthropic key
     available).
2. **AI Agent** must exist next — admin screen
   `/management/ai/ai_agent_edit/`, referencing the environment from step 1,
   with a name, a model choice, and a system prompt. Its numeric
   `ai_agent_id` is visible in that screen's URL. Created this session as
   **`ai_agent_id: 1`**.
3. **The rcms_api API's own security mode must support AiAgent operations**
   — confirmed live: `static_token` does **not** work
   (`"The method ai/v1/AiAgent::create_session cannot be used with static
   token security mode"`). This is why a separate temporary API was created
   rather than adding these operations to api id 6 (which uses
   `static_token` for the live Omnix frontend — changing that would have
   broken production). Used **`privileged_static_token`** instead, which
   worked.
4. **`ai_agent_id` for `create_session` must be set in the URI's own
   admin-side `model_method_params`** (e.g. `{"ai_agent_id": 1}`), **not**
   sent per-request by the caller. Sending it in the request body or as a
   query string both fail with `"ApiMethodParam ai_agent_id is required but
   not set"` even though the live method schema lists it as a per-call
   parameter with `required_as_arg: true`. Same lesson as
   `chat_contents_search`'s `topics_group_id`/`model`/`cnt` — some
   documented "call params" are actually admin-config-only in practice.
5. **New URIs default to `open_flg: 0`** (unpublished) when created via
   `rcms_api-api_upsert_uri` — must explicitly pass `open_flg: 1` or the
   public URL 404s with `"Current URL could not be mapped"`.

### 5.3 Current live test infrastructure (temporary — clean up once the memory test concludes)

- **api id 8**, title "TEMP AI Agent memory test", `security: privileged_static_token`.
  - uri 117: `create_session`, `model_method_params: {"ai_agent_id": 1}`, `open_flg: 1`.
  - uri 118: `send_message`, `open_flg: 1`.
- A privileged_static token was generated for api id 8, **expires
  ~2026-07-27 23:24 JST** — regenerate via `rcms_api-generate_token` if
  resuming after that time. (Token value was saved to a local `.env`-style
  MCP resource blob, not copied into this file — regenerate rather than
  hunt for it.)
- `ai_agent_id: 1` — created via the Bedrock harness path (no Anthropic
  key). Its exact model choice is whatever was last selected in
  `ai_agent_edit/?ai_agent_id=1` — **currently misconfigured, see §5.4**.
- `create_session` **works** — tested live, returned
  `{"ai_session_id": 1, "ai_agent_id": 1, "status": "active"}`.

### 5.4 Current blocker — NOT conceptual, just a config value

`send_message` against `ai_session_id: 1` fails:
```
HTTP 500 - ValidationException: The provided model identifier is invalid.
Bedrock region: ap-northeast-1
Model id: us.anthropic.claude-opus-4-8
```
The agent's configured model id isn't valid/enabled for Bedrock in that
region — likely missing a version suffix Bedrock expects (e.g. `-v1:0`),
or that specific model isn't enabled there. **Next step, not yet done**:
go to `ai_agent_edit/?ai_agent_id=1`, try a different model from the
dropdown (e.g. a Sonnet variant instead of Opus), save, retry
`send_message`. This was left mid-troubleshooting when the session ended —
the user was about to check what other models are listed.

### 5.5 The actual memory test — once unblocked, not yet run

1. `send_message` with `{"ai_session_id": 1, "message": "Remember this
   fact: my secret codeword is XYLOPHONE-7. Just acknowledge you noted it,
   do not repeat it back yet."}`
2. `send_message` again, same `ai_session_id: 1`, asking "What was the
   secret codeword I told you?"
3. If step 2's reply correctly recalls "XYLOPHONE-7" → genuine session
   memory confirmed for the Bedrock harness. If not → no memory, and
   Stage 2's Strategy Planner must store/resend full conversation history
   itself from Omnix's own server, full stop.

## 6. Immediate next steps (in priority order)

0. **[HIGHEST — added 2026-07-28] Make the deployed frontend actually work.**
   It currently reaches Kuroco not at all (static deploy, no server → the
   proxy route doesn't exist). Decided fix: Kuroco member auth with
   browser→Kuroco direct calls, login required for everything. Four pieces
   of work, all still to do — see **§7.6** for the full detail: create the
   missing login/logout/profile endpoints (api id 7 has only signup email
   verification today), flip api id 6 to `cookie` security, rework
   `useOmnix.ts` to call Kuroco directly with `credentials: 'include'`,
   delete the dead `server/api/omnix.post.ts` and the build-time-baked
   `omnixConfigured` flag, and add login UI + an auth guard.
1. **Unblock and finish the AI Agent memory test** (§5.4/§5.5) — try a
   different model on `ai_agent_id: 1`, run the two-message test, record
   the verdict here.
2. **Clean up temporary test artifacts** once the memory test concludes:
   delete api id 8's 2 URIs and the API itself
   (`rcms_api-api_delete_uri`/`rcms_api-api_delete_api`), let the temp
   token expire naturally or note it's already gone.
2b. **Finish the hero load** — 65 of 127 heroes are in `hero_master` (17).
    Remaining 62 are generated and batched. Roles can now also be populated
    via `::` strings (§3.6), which was previously believed impossible.
3. **Resolve the two Stage 1 loose ends** (§3.5): `Roles` checkbox
   write path, and the `ext_info`/image clean retest.
4. **Real data population** for `hero_master`/`hero_abilities`/`hero_lore`/
   `guides` — remember the publish-status gotcha (§3.4) and the
   `use_openai`/`embedding_model` gotcha (§3.1) apply to every row/group.
   Decide manual vs. CSV bulk-import (`topics-upload`) — CSV path untested
   this session, might sidestep the checkbox bug.
5. **Decide the test hero's (topics_id 3926) fate** — delete it, or keep
   it as a real (if silly) example row. Currently published and correctly
   findable, doesn't need urgent action either way.
6. Only after 1–5: revisit Stage 2 (§9). **Read §7 (security constraints)
   first — it is a hard gate on the Stage 2 design, not optional reading.**
   Also worth reading §8 (what agents can do beyond chat) before committing
   to any manual-data-entry plan.

## 7. SECURITY CONSTRAINTS for exposing an AI Agent to end users — READ BEFORE BUILDING STAGE 2

Raised by the user 2026-07-27 while reviewing the Stage 2 design, which
assumes exposing an AI Agent `send_message` endpoint to Omnix's end users.
The concern was correct and, after source research, understated. **These are
hard constraints, not suggestions.**

### 7.1 The risk model

- **Tool grants live on the agent (`t_ai_agent`), not per-session or
  per-caller.** Every user of an exposed endpoint inherits that agent's
  full permissions. There is no per-request scoping.
- **The grantable tool set includes code execution and filesystem access**,
  not just content CRUD. Confirmed built-in tools
  (`nfs/lib/modules/ai/admin/ai_agent_edit.php:38`): `bash`, `read`,
  `write`, `edit`, `glob`, `grep`, `web_fetch`, `web_search`. Plus optional
  GitHub Copilot MCP backed by a stored PAT (`:62-63`, `:661-667`),
  document-generation skills, and the whole Admin MCP controller surface
  via `admin_mcp_modules`.
- **Therefore prompt injection = privilege escalation**, up to shell access
  depending on grants. A system prompt is *not* a security control — do not
  treat "we told it not to" as mitigation.

### 7.2 Live hazard created during this session — must never become the production pattern

Temp **api id 8** uses `privileged_static_token`, which per its own tool
documentation "authenticates the current admin member on every API call" —
i.e. every caller would act as the admin. This was acceptable only because
it is a throwaway diagnostic reachable only by us, with a ~2h token. It is
already on the cleanup list (§6 item 2). **Never use
`privileged_static_token` for anything user-facing.**

### 7.3 Required architecture for any user-facing agent endpoint

1. **Dedicated user-facing agent with zero tool grants — retrieval only.**
   Kept strictly separate from any internal/automation agent that holds
   `bash`/write/Admin-MCP. Treat "agent with tools" and "agent users can
   talk to" as mutually exclusive by default. **Tool grants are the
   security boundary.**
2. **Never expose Kuroco's agent endpoint to the browser.** Proxy through
   the Nuxt server — the existing `server/api/omnix.post.ts` pattern
   already does this correctly for the current chat endpoint (token stays
   server-side, never shipped to the client). Enforce message shape and
   rate limits there.
3. **Authenticate users via the existing member auth (api id 7)**, not a
   privileged/static token. Sessions tied to authenticated members, with
   ownership enforced server-side (see §7.5 — this may be mandatory rather
   than merely advisable).
4. **All persistence done by Omnix's own server** from the agent's
   structured output. Do not hand the agent write tools so it can save its
   own `game_plans`/`game_checkins` rows.

### 7.4 Native mitigations, if a tool-holding agent is ever genuinely needed

- Per-tool `permission_policy`: `always_allow` vs `always_ask`
  (`ai_agent_edit.php:676-698`) — tools can require confirmation instead of
  firing autonomously.
- AI Environment sandbox (`ai_env_edit.php:256-303`): `networking_type`
  (unrestricted/limited), `allowed_hosts` allowlist, package-manager
  restrictions.
- `admin_mcp_readonly` is a distinct flag from `admin_mcp_modules` — read
  access can be granted without write.
- Agents bind to an `mcp_member_id`, so actions carry an identity rather
  than being ambient-admin.

### 7.5 `ai_session_id` ownership — VERIFIED: **NOT ENFORCED** (confirmed IDOR)

Verified against source 2026-07-27. **Kuroco performs zero authorization on
a caller-supplied `ai_session_id` in the `send_message` REST path.**

Evidence:
- `nfs/lib/modules/ai/api/v1/AiAgent.php:108-125` — `send_message` casts
  `$_REQUEST['ai_session_id']`, rejects only `0`, and proxies onward. No
  member id, no group check, no `hasAuth`. `create_session` (`:41-59`)
  likewise proxies straight through.
- `nfs/lib/modules/ai/admin/ai_session_view.php:29-30` — the session lookup
  is `WHERE dflg = 0 AND ai_session_id = <id>`. Id only. No member, agent,
  or site scoping. Same query repeated at `:65-66`, `:94-95`, `:123-124`
  (tool-confirmation / custom-tool-result / interrupt MODEs — equally
  exposed if ever wired up) and `:166-167`.
- **The owner column exists but is never read on this path.**
  `t_ai_session.member_id` is written (`class/AiSession.php:55`, `:209`)
  but grepping the whole `ai` module finds it read only in
  `direct/ai_agent_assist.php` — never in `ai_session_view.php` or
  `api/v1/AiAgent.php`.
- **The check exists deliberately elsewhere**, which makes this look like an
  omission rather than an intentional design: `ai_agent_assist.php:124-131`
  defines `verifySessionOwnership()`, throwing `RCMSForbiddenException` on
  `session.member_id !== $_SESSION['member_id']`. The REST path has no
  equivalent.
- **One call both injects and exfiltrates.**
  `Admin_ai_session_view_api::run()` (`ai_session_view_api.php:22-28`)
  unconditionally calls `doAssign()`, which loads the full harness
  transcript into `events` (`ai_session_view.php:174-181`), and `events` is
  in `JSONParamsList` (`:429`). So a single `send_message` returns the
  victim's entire conversation history alongside `session_status` and
  `token_display`. No separate read endpoint is needed to exfiltrate.
- Session ids are **sequential integers** → trivial enumeration.
  `ai_session_id` is effectively a bearer capability with no secret.

**One honest caveat**: whether `RCMSAdminAction::execute()` imposes an
admin-privilege gate further up the stack **cannot be confirmed** —
`nfs/lib/extends/RCMSAdminAction.php` is ionCube-encrypted. The AI module's
code assumes `$_SESSION['member_id']` is an *admin* member, so it is
possible that an admin session is required in practice, which would narrow
real-world exposure. **Do not rely on this.** It is unverified, it is not a
documented guarantee, and an endpoint with `auth: {"class": null, "value":
null}` applies no per-endpoint gate of its own.

**Hard requirement for Omnix**: the Nuxt proxy maps its own authenticated
member → session id **server-side** and never accepts a client-supplied
`ai_session_id`. Given the above this is not defence-in-depth — it is the
only thing preventing cross-user conversation injection and transcript
theft. Do not expose `AiAgent::send_message` to clients directly under any
circumstances.

### 7.6 AMENDS §7.3 — the Nuxt-proxy approach is not deployable (verified 2026-07-28)

**Symptom that started this**: no requests visible in browser dev tools, and
nothing arriving at Kuroco. Confirmed via Kuroco's own inbound access log —
over a 3h window the only inbound requests were `claude-code (cli)` (admin
MCP); zero hits on `/rcms-api/6/chat_contents_search`.

**Root cause — there is no server in production.** The deploy workflow
(`.github/workflows/build.yaml`) runs `npm run generate` (SSG) and zips
**only `.output/public`**. Verified by running that exact build locally:
`.output/` contains only `nitro.json` + `public/`, there is **no
`.output/server`**, and `find .output/public -path "*api*"` returns nothing.
So `server/api/omnix.post.ts` **does not exist at runtime** on KurocoFront.
A Nitro server route cannot run on static hosting.

Two compounding failure modes depending on where it's built:
| Build env | `omnixConfigured` (baked at **build** time) | Behavior |
|---|---|---|
| GitHub Actions (workflow never sets `KUROCO_ACCESS_TOKEN`) | `false` | Silent mock branch → canned `MOCK_ANSWERS` → **zero network requests**. This is the live symptom. |
| Local build with `.env` token present | `true` | Calls `/api/omnix` → 404 → caught → *"The Ancients are silent…"* |

One thing that is correct: the token does **not** leak into the static
bundle (verified by grepping the built output) — Nuxt keeps private
`runtimeConfig` server-only.

**Consequence for §7.3 item 2**: "proxy through the Nuxt server so the token
stays server-side" is **currently unimplementable** — there is no server to
hold a secret or to enforce session ownership. That item stands as the
correct pattern *if* SSR is ever adopted, but it does not describe reality
today.

**DECISION (user, 2026-07-28): go with Kuroco member auth, browser → Kuroco
directly.** Rationale: each user authenticates as themselves, so no shared
secret ships to the client. Rejected alternatives: embedding a static token
in client JS (token becomes public to anyone opening dev tools), and
switching to SSR (KurocoFront is confirmed **static-only** — no Node/SSR/
serverless runtime anywhere, and no redirect/rewrite/proxy/basic-auth
features of its own; `KurocoFrontDeploy::deploy()` just pushes an artifact
zip to hosted infra. Note `kuroco_front.json` is **not parsed anywhere in
the open-source repo** — it's consumed by the hosted deploy worker, so its
supported keys could not be determined from source).

**KurocoEdge — a real server-side interception point, evaluated and not
needed (2026-07-28).** `nfs/lib/modules/edge/` is a **declarative CDN rules
engine** (Fastly Compute / Cloudflare Workers / Deno) that sits *in front
of* KurocoFront — the static site is itself just an Edge backend
(`Edge_Backend.php:358-359` labels it `kuroco_front`). Customers don't
upload code; they configure conditions + actions stored in `t_edge_rules`.
Available actions (`Edge_Rules.php:718-860`) include `Header` (request-phase
upsert), `BackendUrl` (+ Host override), `SetPath`, `QueryString`,
`Cookie`/`SetCookie`, `SynthResp`, `BodyReplace`, `Jwt`, `Mcp`; conditions
include path/header/cookie/method/IP/geo/query/body and `VarsApi` (edge-side
subrequest).

So a token-injecting proxy **is** achievable: match `/api/*` → `BackendUrl`
to the api backend + `SetPath` rewrite + request-header upsert of
`X-RCMS-API-ACCESS-TOKEN`, with the token in rule config, never shipped to
the browser. **We are deliberately not using this**, because:
- Cookie member auth is strictly better for our case — per-user identity
  instead of a shared secret, and no dependency on Edge availability.
- **Unconfirmed** whether Edge is on this site's plan (`DEFAULT_EDGE_PLAN`
  is `EDGE_PLAN_FREE`, `config.php:18-20`; some actions are gated above
  Free, `Edge_Rules.php:751`) or whether Edge is provisioned at all for a
  KurocoFront-only site.
- No dedicated secret store — header values are plaintext rule config
  visible to admin users.
- **Critically, it does not solve the §7.5 IDOR.** Edge can inject a
  *static* value; it cannot do "look up which session belongs to this
  authenticated member and substitute it into the request body." That needs
  real logic, not declarative rules. So Edge is not an escape hatch for
  Stage 2 — see §7.7.

**DECISION (user, 2026-07-28): login is required for everything**, including
the basic Q&A chat. Anonymous visitors cannot use Omnix. Accepted cost: a
visitor must sign up before asking even a simple question. Benefits: one
auth model, no unauthenticated AI endpoint to abuse/cost-burn, and Stage 2's
per-member `game_plans` needs identity regardless.

**Note — `api_id` is a security/CORS boundary.** `security` (none /
static_token / cookie / …) and the CORS allowlist are configured **per API
structure, not per URI**. Flipping api 6 to `cookie` makes *every* route
under it login-required together. That's fine given the decision above, but
any future public route must live in a different `api_id`.

**DECISION (user, 2026-07-28): login is required for everything**, including
the basic Q&A chat. Anonymous visitors cannot use Omnix. Accepted cost: a
visitor must sign up before asking even a simple question. Benefits: one
auth model, no unauthenticated AI endpoint to abuse/cost-burn, and Stage 2's
per-member `game_plans` needs identity regardless.

**Work required to implement (none of this is done yet):**
1. **Auth endpoints are missing.** api id 7 ("Omnix User Authentication
   Endpoints") contains exactly ONE URI — `auth/email-verification`
   (`Member::invite`, uri 114), the signup email-verification step. There is
   **no login, no logout, no profile/`me`** endpoint. These must be created,
   plus the rest of the signup flow past email verification.
2. **Change api id 6 security `static_token` → `cookie`** so it accepts the
   member session. Note this invalidates existing static tokens for api 6 —
   acceptable, since the current path is already non-functional.
3. **CORS is already correct** — api 6 allowlists
   `https://meroj.g.kuroco-front.app` and `http://localhost:3000` with
   `allowCredentials: true`, which strongly suggests browser-direct calls
   were the *original* intent and the server proxy was a later wrong turn.
4. **Frontend rework**: `app/composables/useOmnix.ts` calls Kuroco directly
   with `credentials: 'include'` instead of `$fetch('/api/omnix')`; delete
   the dead `server/api/omnix.post.ts`; drop `kurocoAccessToken` /
   `omnixConfigured` from `nuxt.config.ts` (the build-time-baked
   `omnixConfigured` flag is itself a footgun and should go); add login UI
   and an auth-state guard around the chat.

### 7.7 Stage 2 design implication — AMENDED 2026-07-28

Original conclusion: the Planner agent should be a **reasoning/synthesis
component with retrieval only**; every write goes through Omnix's own
server. Still correct in spirit — but §7.6 removes the server, so it needs
restating.

**The tension**: §7.5 requires that something server-side maps
authenticated member → `ai_session_id` and never accepts a client-supplied
one. With a static deploy and browser-direct calls, **there is no server
anywhere**, so the client necessarily supplies `ai_session_id` — which is
exactly the IDOR. KurocoEdge does not rescue this (§7.6): it can inject a
static value, not perform a per-user lookup.

| | Stage 1 Q&A | Stage 2 agent sessions |
|---|---|---|
| Browser-direct + cookie auth (**chosen**) | Clean — cookie is the whole credential, no session id involved | **IDOR unmitigated** — any logged-in user could pass another member's `ai_session_id` and read/inject their conversation |

**Recommended resolution (not yet ratified by the user): don't use Kuroco
AI Sessions for the Planner at all.** Instead make stateless agent/LLM calls
and keep conversation history in Omnix's own content structures — which is
what `game_plans` / `game_checkins` were *already* designed to hold (§9).
This:
- removes the client-supplied-session-id attack surface entirely,
- sidesteps the still-unresolved question of whether Bedrock-harness
  sessions carry memory at all (§5.4/§5.5),
- and matches the check-in loop's actual requirement, which is durable
  per-match history the user can revisit — not ephemeral chat state.

Alternative if server-side session state is genuinely wanted later: stand up
a small real backend just for agent calls (abandoning static-only hosting),
or wait for Kuroco to enforce session ownership upstream. Neither is
recommended now.

## 8. What AI Agents can do beyond chat (researched 2026-07-27, directly relevant to Stage 2)

Source-confirmed capability envelope. Useful for Stage 2 planning, but read
§7 first — most of these are *internal automation* capabilities that must
not be co-located with a user-facing agent.

- **Content automation on save — `ai_postprocess_settings`.** Per-content-
  structure rules, fired from generic `Admin_topics_edit` hooks, so *any*
  create/update path triggers them (admin UI, CSV import via
  `topics_upload.php:1622`, REST API, inbound email/messaging). Real
  configurable options (`topics_group_edit.php:2274-2317`): `input_fields[]`,
  `output_fields[]`, `prompt` (Smarty-rendered), `timing`
  (`new`/`update`/`new_and_update`), `create_as`
  (`published`|`unpublished`|`draft`|`workflow`), `approvalflow_id`,
  `source_lang`, `dest_lang[]`, `model`, `ai_agent_id`. Confirmed in-repo
  uses: multi-language auto-translation with duplicate-guard, field-filling
  via an auto-generated JSON response schema derived from the ext_col
  config, draft/workflow creation, idempotency via input hashing.
- **Synchronous validation gate — `validation_rules`** (same config block,
  `topics_group_edit.php:2241-2272`, blocking at `topics_edit.php:4247`).
  Runs *before* save and can reject content, unlike postprocess which runs
  after.
- **Slack / LINE / Teams inbound → Topic → agent**, the same dispatch path
  as email (`SlackPersist.php:186`, `LinePersist.php:249`,
  `TeamsPersist.php:122`). Channel/conversation binding per platform;
  LINE has a `line_conversation_timeout` that threads consecutive messages.
  Note: the `*_auto_reply_flg` settings send a **static acknowledgement**
  message, not the agent's answer — the agent replies by writing an
  outbound record.
- **Autonomous / headless runs.** `t_ai_agent.autonomous_enabled`
  (`ai_agent_edit.php:873`) plus `nfs/lib/modules/ai/bat/agent_run.php`,
  which runs the agent with an explicit "there is no human in the loop"
  instruction. Critically, **every agent has a mailbox**
  (`{ai_agent_id|slug}@agent.r-cms.jp`, `AiAgent::dispatchMail()`,
  `class/AiAgent.php:181`) — mail sent there is intercepted and enqueued as
  an agent run, which means **anything in Kuroco that can send mail can
  trigger an agent**: cron batches, approval-workflow notifications,
  inquiry forms, Smarty `sendmail`. Loop-guarded via `_ai_agent_origin`.
- **In-admin copilot** (`ai_agent_assist.php`) — injects current admin
  screen context, page URL, and screenshots.

**Omnix-relevant angle**: `ai_postprocess_settings` is the most immediately
useful piece — it could auto-enrich or auto-tag crawled guide content into
structured fields on save. That **partly works around the confirmed
"Spider can't fill custom fields" limitation (§4.1)**, because an agent
*can* write fields where Spider cannot. Worth evaluating before doing large
amounts of manual data entry.

## 9. Stage 2 — Strategy Planner pivot (unchanged from prior sessions, not touched this session)

Evolve from "just answer questions" into **pregame intake → goal
clarification → RAG fetch → tailored plan → recurring mid-game check-in
loop.** The check-in step is confirmed core, not optional — a loop, not a
one-shot follow-up. Architecture direction locked in previously: the Q&A
chatbot stays on the single-shot tier (§3); the Planner's goal-clarification
+ check-in loop will use the AI Agent + Session tier (§5) once that phase
starts — which is exactly what this session's memory test (§5.5) is meant
to de-risk before committing to that design.

New Content Structures needed for this phase (not created yet):
`hero_matchups`, `items_master`, `patch_notes`, `game_plans` (per-Member —
api id 7 "Omnix User Authentication Endpoints" already provides the auth
foundation), `game_checkins` (relation → `game_plans`, many rows per plan).
Open design questions from prior sessions, still unresolved: directional
vs. descriptive `hero_matchups`; free-text vs. preset `game_plans` goals;
Planner as a separate page vs. a mode-toggle in the existing chat UI;
check-in trigger mechanism (timer vs. player-initiated vs. game-time
milestones — leaning player-initiated/milestone-based, not decided).

## 10. Appendix: email → AI-Agent reply capability (still just researched, not scoped — unchanged from prior session)

Kuroco has a general-purpose email↔Topics↔AI-Agent pipeline (inbound email
→ fixed `EmailReceiveSchema` field preset → generic `ai_postprocess_settings`
hook, not email-specific → optional outbound reply via a published
`direction=outbound` Topic, sent by a generic save-hook). Not tied to any
decided Omnix use case. Do not build anything from this until a concrete
purpose is chosen. Full mechanics from the prior session are unchanged;
not re-explored this session.

## 11. How to resume from this file alone

1. Read §6 — it's the ordered next-steps list.
2. Re-check §5.4's blocker is still the current state (config could have
   changed if you left the browser open) before assuming where to resume.
3. If the temp token (§5.3) has expired, regenerate it — same api id (8),
   same URIs (117/118), just need a fresh
   `rcms_api-generate_token(api_id=8, token_type="privileged_static")` call.
4. Related persistent memory (survives across Claude sessions, separate
   from this file): memory entries `omnix-project-overview` and
   `feedback-omnix-kuroco-admin-manual` — kept in sync with this file's
   headline facts, but this file is the detailed source of truth.
