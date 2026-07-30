# Kuroco Setup for Omnix Stage 1 (Omnix chatbot)

> **Stale notice (updated 2026-07-27):** this file is the original ask/spec. `CLAUDE_SESSION_FINDINGS.md` is the current source of truth — it has the live-site audit (none of the structures below exist yet; the endpoint currently RAGs over a generic raw-crawl group instead) and supersedes the claim below that nothing here is automated by Claude. Read both, but trust `CLAUDE_SESSION_FINDINGS.md` where they disagree.

Checklist for the Kuroco management site (`https://meroj.g.kuroco.app`, api id `6`). The frontend code assumes these steps are done. **Schema/config work (Content Structures, endpoint config) is authorized for Claude to execute directly via the admin MCP/CLI tools** — only data population (§3) remains manual/on the user.

## 1. Content Structures to create

Create four separate Content Structures (コンテンツ定義), keeping hero facts, hero abilities, lore, and guides in separate structures rather than one blob.

**Important — Spider (the crawler) can only fill `subject`/`contents` on whatever single Content Structure it's wired to.** It's a raw page-scrape → `Topics::insert()` passthrough (confirmed in `nfs/lib/modules/topics/direct/spider_upsert.php`): no entity extraction, so it can never populate a `select`, `checkbox`, `number`, or `relation` field, and one Spider config targets exactly one Content Structure (`t_topics_group.spider_settings_id` is a 1:1 link). That splits the four structures into two groups:

- **Manual/structured only — never a Spider target:** `hero_master`, `hero_abilities`. Their required `select`/`checkbox`/`number`/`relation` fields would just sit empty on crawler-authored rows, so populate these by hand (or via CSV bulk upload if you have structured hero data from elsewhere) — not the crawler.
- **Spider-crawlable prose:** `hero_lore`, `guides`. These can each optionally have their own Spider config (one Spider → `hero_lore`, a separate Spider → `guides`, if you want both crawled). Their "Related Hero" relation field must stay **optional** — crawled rows won't set it, only manually-entered ones will.

### `hero_master` — one row per hero (manual/structured, no Spider)
| Field | Type | Notes |
|---|---|---|
| `subject` (built-in) | text | Hero name |
| `contents` (built-in) | wysiwyg/text | Short summary / basic attributes, searchable |
| Primary Attribute | select | Options: STR, AGI, INT, Universal |
| Roles | checkbox (multi-select) | e.g. Carry, Support, Nuker, Disabler, Jungler, Durable, Escape, Pusher, Initiator |
| Attack Type | select | Options: Melee, Ranged |
| Icon | image | Hero icon |
| External ID | text (optional) | For future stat-refresh mapping (e.g. OpenDota hero id) |

### `hero_abilities` — many rows per hero (manual/structured, no Spider)
| Field | Type | Notes |
|---|---|---|
| `subject` (built-in) | text | Ability name |
| Related Hero | relation → `hero_master` | Links each ability to its hero |
| Ability Type | select | Options: Active, Passive, Toggle |
| Cooldown | text | e.g. "16/14/12/10" |
| Mana Cost | number | |
| Description | wysiwyg | |

### `hero_lore` — backstory prose (RAG-searchable, optionally Spider-fed)
| Field | Type | Notes |
|---|---|---|
| Related Hero | relation → `hero_master`, **not required** | Crawled rows won't set this — only backfill it by hand if you want the link |
| Lore Text | wysiwyg | The actual backstory content |
| Source URL | link | Where it was sourced from |

### `guides` — jargon dictionary + beginner how-tos (RAG-searchable, optionally Spider-fed)
| Field | Type | Notes |
|---|---|---|
| Guide Type | select | Options: Beginner, Jargon, Matchup, Meta |
| Guide Text | wysiwyg | e.g. jargon dictionary entries: BKB, CC, Stacking, Buyback |
| Source URL | link | |
| Related Hero | relation → `hero_master` (optional, same caveat as above) | |

**Out of scope for Stage 1** (now fully speced as the Stage 2 "Strategy Planner" pivot — see `CLAUDE_SESSION_FINDINGS.md` §6 for the detailed field lists and open questions): `hero_matchups`, `items_master`, `patch_notes`, `game_plans`, `game_checkins`. Don't build these yet.

**None of the four structures above exist on the live site yet** (confirmed 2026-07-24). What currently exists instead: Content Structure #12 "Dota 2 Guides" and #13 "test spider" — generic raw Spider-crawl schemas (URL, hash, response status, etc., no hero-specific fields) that `chat_contents_search` currently RAGs over. Default plan is to keep #12/#13 as an extra RAG source alongside the new structures rather than deleting them (open decision, not finalized).

## 1b. If you use Spider for `hero_lore` / `guides`

- Set up a separate Spider config (AI → Spider) per Content Structure you want crawled — link it via that Content Structure's `spider_settings_id`, not the other way around.
- Crawled pages become raw Topics rows: title + main-content text extracted via a CSS-selector list (defaults cover common patterns like `article`, `.content`, `#main`, etc. — override with your own selector if a source site needs it).
- Enable "collect images" on the Spider config if you want page images pulled in, but note this is just whatever images are on the page — it won't specifically grab a hero's icon in a structured way. The `hero_master` Icon field still needs to be set manually.
- After a crawl, review the resulting rows — the CSS-selector extraction is generic and can pull in noise (nav/boilerplate) depending on the source site.

## 2. Configure the `chat_contents_search` endpoint (api id 6, uri id 109)

- Point its content search source at `hero_master` + `hero_lore` + `guides` (add `hero_abilities` too if useful) — i.e. update the `topics_group_id` param from its current live value `[12]` to the new structure IDs. Full method param list (cnt, prompt, max_distance, ext_info, filter, model, etc.) is in `CLAUDE_SESSION_FINDINGS.md` §3.3.
- Find the system prompt / instructions field for this endpoint's AI configuration — check both the endpoint's own AI settings and any linked AI Router entry, since it's not obvious from the outside which one api id 6 currently uses. **As of 2026-07-24 this was not found via any available MCP tool** — the endpoint's `model` param is currently the string `"gpt-5.6"` (likely an AI Router/Agent alias) and there is no system-prompt param on the method itself; needs checking in the Kuroco admin UI or via `kuroco-admin` CLI. Set it to:

  > You are Omnix, a friendly Dota 2 coach for brand-new players. Never use jargon or community slang without immediately explaining it in plain English the first time you use it in an answer (e.g. "BKB (Black King Bar) — an item that makes you immune to most magic for a few seconds"). Keep answers short and encouraging. Base answers only on the provided context; if you don't know, say so rather than guessing.

- **Response contract the frontend expects** — for each matched item in the response's `list[]`, make sure it includes:
  - `subject` (already expected)
  - `slug` (already expected)
  - `image` (new — the hero's icon URL, pulled from `hero_master`'s Icon field via this endpoint's post-processing/output config)

  If there's no way in the Kuroco UI to inject a related hero's icon into `list[]` this way, don't force it — just note that back so the frontend mapping can be adjusted instead of silently expecting an image that never arrives. **Not yet tested live** — the `ext_info` param is the best lead (untested) per `CLAUDE_SESSION_FINDINGS.md` §3.3.

## 3. Data population

Entirely on you — Claude does not do this step. Per the split above: `hero_master`/`hero_abilities` need manual (or CSV bulk-import) entry since Spider can't fill their structured fields; `hero_lore`/`guides` can be manually entered, Spider-crawled, or a mix of both.

## 4. When done

Claude builds the Content Structures + endpoint config directly (steps 1-2 above, per the authorization in `CLAUDE_SESSION_FINDINGS.md` §2) — confirm that authorization is still current before large/destructive admin actions. Once data population (§3, still manual) is far enough along, Claude tests the live endpoint end-to-end from the Nuxt app.
