# Kuroco AI features

Inventory of what Kuroco offers on the AI side, compiled 2026-07-30 from the
bundled Kuroco documentation (`kuroco-skills:kuroco-docs`) plus this project's
own source-verified findings in `CLAUDE_SESSION_FINDINGS.md`.

Legend: ✅ = already in use by Omnix. Items without a mark are available but
untouched.

---

## 1. RAG / vector search — the core tier

Admin location: **AI/RAG** menu.

| Feature | What it does | Notes for Omnix |
|---|---|---|
| **Content vectorisation** ✅ | Enable "convert to vector data" on a content structure and choose an embedding model | Internally `use_openai: 1` + `embedding_model`. Forget either and search silently returns nothing — no error. Set on groups 17–20. |
| **`OpenAI::chat_contents_search`** ✅ | Retrieval **+** generated answer | Omnix's entire chat feature (api 7, formerly api 6 uri 109) |
| **`OpenAI::rag_search`** | Retrieval only — returns matched `contents` text, no synthesis | Public calls need `GET ?query=...`, not a POST body |
| **`OpenAI::chat`** | Plain LLM completion, zero retrieval | Verified to have no knowledge of site content |
| **`OpenAI::chat_supplementary_search`** ✅ | Supplementary retrieval pass | Exists on api 6 uri 122, pinned to group 12 |
| **Embedding template** (`search_template_vector`) ✅ | Smarty template deciding what text of each row gets embedded | The lever in the group-12 cleanup plan: point it at `clean_guide` instead of raw `data` |
| **RAG Quickstart** | Admin screen: pick a vectorised structure + a `chat_contents_search`/`rag_search` endpoint and ask a question | Only lists endpoints on APIs with **static access token** security. Fast way to test retrieval changes without the frontend |
| **KurocoRAG log** | Log of every RAG API request, filterable by keyword and date | Operations → Log management → KurocoRAG log. Useful for retrieval-quality debugging |
| **AI model list** | Available embedding + completion models with **reference price per 1,000 characters** and max input tokens | Check before bulk operations — the group-12 sweep is ~3,900 rows |

## 2. Content automation

| Feature | What it does | Notes for Omnix |
|---|---|---|
| **AI post-processing** (`ai_postprocess_settings`) | Per content structure: on save, send chosen fields to a model and write the result into other fields. Configurable timing (new / update / both), save disposition, model, or a specific agent | Fully speced for group 12 in `data/ai_postprocess_group12.md`. **Blocked by design**: the crawler saves with `lightweight_mode: true`, which skips every post-save hook — the workaround is a CSV re-upload with lightweight mode OFF and "AI post-processing → Force run" |
| **AI validation rules** | Same config block, but runs **before** save and can reject the content | Post-processing runs after; validation can block |
| **AI dictionary** | Registered dictionaries with slug, type and priority, applied to AI processing | **Not yet explored, and the best native fit for the product's jargon-neutralisation goal** — more appropriate than stuffing term definitions into a prompt |
| **Spider (crawler)** ✅ | Crawls URLs into a content structure | Only ever fills the fixed 18-field "webpage" preset. It can **never** populate a custom select/checkbox/relation/number field — confirmed in source. This is why groups 17–20 are manual/CSV |

## 3. AI Agents — a separate tier from everything above

Different `model_classpath` (`AiAgent`, not `OpenAI`) and different operations.
Setup chain: **AI Environment → AI Agent → endpoint**, in that order.

| Feature | What it does | Notes for Omnix |
|---|---|---|
| **AI Environment** | The harness: *Anthropic Managed Agents* (needs your own API key) or *AWS Bedrock AgentCore*. Includes sandbox controls — network type, allowed hosts, package-manager restrictions | Bedrock path works with **no AWS credentials of your own**: leave the Execution Role ARN blank to fall back to the platform role |
| **AI Agent** | A named agent: system prompt, model, and tool grants | Grantable tools include `bash`, `read`, `write`, `edit`, `glob`, `grep`, `web_fetch`, `web_search`, GitHub Copilot MCP (via a stored PAT), document skills, and Admin MCP modules |
| **`AiAgent::create_session` / `send_message`** | Conversational sessions with an agent | `create_session` verified working (`ai_session_id: 1`). `send_message` still blocked on an invalid Bedrock model id — see findings §5.4 |
| **Autonomous / headless runs** | `autonomous_enabled` plus a batch runner; **every agent also has a mailbox** (`{id\|slug}@agent.r-cms.jp`) | Consequence: anything in Kuroco that can send mail can trigger an agent — cron, approval workflows, inquiry forms, Smarty `sendmail` |
| **In-admin copilot** | Assists inside admin screens, with current-page context and screenshots | |
| **Admin MCP** ✅ | Exposes admin operations over MCP | How the content structures and endpoint config were built in earlier sessions |

## 4. Smarty / custom-function level

| Feature | What it does |
|---|---|
| **`ai_completion`** | Call a model directly from a custom function or template — relevant now that the notes work involves custom functions |

---

## Two cautions carried over from source review

**Tool grants are the security boundary.** They live on the agent
(`t_ai_agent`), not per-session or per-caller, so every user of an exposed
endpoint inherits that agent's full permissions — up to shell access. Prompt
injection therefore equals privilege escalation. Keep any user-facing agent at
**zero tool grants**, and never co-locate it with an automation agent that holds
`bash`/write/Admin-MCP. A system prompt is not a security control.

**`ai_session_id` ownership is not enforced.** Verified against source: the
`send_message` REST path performs no authorization on a caller-supplied session
id, ids are sequential integers, and the response includes the full transcript —
so one call both injects and exfiltrates. This is why the Stage 2 recommendation
is to keep conversation history in Omnix's own content structures rather than in
Kuroco AI sessions. See findings §7.5 and §7.7.

## Not evaluated yet

- **AI dictionary** for jargon neutralisation (see §2) — the clearest unclaimed
  win against a stated product goal.
- Whether Bedrock-harness sessions carry real conversation memory (findings
  §5.5 — the test exists, it has never been run).
- `ext_info` on `chat_contents_search` as a way to return hero images in
  `list[]` (findings §3.5).
