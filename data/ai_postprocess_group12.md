# AI post-processing for topics_group 12 (crawled Dota 2 guides)

Cleans the crawler's raw Markdown into usable prose for the RAG index.

Derived from real rows, not guesswork — samples inspected: **7101** (Razor guide:
100% comment thread, zero guide content), **8844** (Templar Assassin: comment
thread with heavy verbatim quoting), **3990** (Broodmother: item list only,
duplicated entries).

---

## 1. Prerequisites — the prompt alone will not run

### a. The crawler suppresses post-processing

**The short version:** enabling the rule is not enough. The crawler saves rows in
a mode that deliberately skips every post-save hook, so nothing will happen to
the 3,900 rows already sitting in group 12, and nothing will happen to rows a
future crawl adds either. You have to re-save the rows yourself, and the CSV
upload screen has a dropdown that does exactly that.

#### Why the crawl skips it

`Topics::insert()` takes a `lightweight_mode` flag whose documented purpose is
*"skips the execution of post-processing batches, but improves performance
instead"* (`/modules/topics/msg/parameter_explain_lightweight_mode`). It defaults
to `false`.

The crawler passes it as `true`, hardcoded — third positional argument, with the
reason in the comment right above it (`spider_upsert.php:87-96`):

```php
// 5. Forward to Topics::insert.
//    - lightweight_mode=true: skip heavy hooks for crawler throughput.
//    - upsert_by_columns=['slug']: idempotent re-crawls keyed on slug.
$response = $topics_v1->insert(
    $topics_group_id,
    false,         // validate_only
    true,          // lightweight_mode   <-- always true, not configurable
    [],            // use_columns
    ['slug']       // upsert_by_columns
);
```

That is a defensible choice on its own terms — a crawl writing thousands of pages
does not want to fire triggers, external-service sync and AI jobs per row. But it
means the AI dispatch is unreachable from a crawl, because all three dispatch
sites live inside `lightweight_mode` guards in `topics_edit.php`:

| Line | Save path | Guard |
|---|---|---|
| `:3489` | insert | inside `if (!$this->getParam('lightweight_mode'))` at `:3473` |
| `:3587` | update | inside the same guard at `:3572` |
| `:3718` | approval accept | inside the same guard at `:3701` |

Each is the same call:

```php
$aiPostProcess = new TopicsAIPostProcess();
$aiPostProcess->startBatch($this->cn, $this->id, "update", $this->getDocumentLanguage());
```

`startBatch()` (`AIPostProcessBase.php:139`) is what reads the group's
`ai_postprocess_settings`, filters rules by timing, computes the input hash and
queues a per-row batch entry. With `lightweight_mode = true` it is never called
at all — so the rule config is read zero times and the logs stay silent. Nothing
errors; nothing happens.

#### Why there is no fallback sweep

`topics_ai_postprocess.php` is a **queue consumer**, not a scanner. Its header
states the contract: it expects `ext_data` carrying `topics_id`, `trigger_timing`
and `rules`. It processes the row it is handed and has no ability to go looking
for rows that need work. `topics_bulk_postprocess.php` sounds like it would help
but only recalculates tag counts. So if `startBatch()` never queued a row, no
later batch will pick it up.

#### How to actually run it

`startBatch()` opens with a per-save override (`AIPostProcessBase.php:143-150`):

```php
// Per-save dispatch override from the topics_edit/topics_upload "後処理" section.
// '' (default) = follow group trigger settings; 'on' = force run; 'off' = force skip.
$dispatchOverride = $_REQUEST['dispatch_ai_postprocess'] ?? '';
```

This is a real control in the admin UI, present on both the content edit screen
and the CSV upload screen, labelled **"AI post-processing"** with three options:

| Option | Value | Meaning |
|---|---|---|
| Follow trigger settings | `''` | obey the group's rule timings (default) |
| **Force run** | `'on'` | run even if the group's rules are disabled |
| Force skip | `'off'` | never run |

So the sweep is an ordinary CSV upload, not custom code:

1. Export group 12, or build a minimal CSV of just `Topic ID` + `Slug` for the
   rows you want processed.
2. Upload it with **Lightweight mode OFF** — this is the part that matters, and
   it is the opposite of what the crawler does.
3. Set **AI post-processing → Force run**.

Each row saved that way reaches `:3587`, calls `startBatch()`, and gets queued.

Two things to get right:

- **Rule `timing` must include updates.** `resolveActionTiming()`
  (`AIPostProcessBase.php`) returns `"new"` only for genuinely new records; a
  re-save of an existing row in the primary language resolves to `"update"`. A
  rule set to `timing: "new"` will be filtered out and silently skipped. Use
  `new_and_update`.
- **Batch in chunks.** Every row queues an AI call. Uploading all 3,907 at once
  queues 3,907 jobs, which is both the cost and the blast radius. Do the pilot
  rows first.

#### Consequence for future crawls

This is not a one-off migration — the gap is structural. Any recurring crawl
(the `ai/kick_spider` batch) will keep inserting rows with `lightweight_mode =
true`, so newly discovered guides will arrive unprocessed. Cleaning has to be a
scheduled second pass that re-saves recent rows with **Force run**, filtered on
something like `inst_ymdhi >=:relatively \`today\`` so you are not reprocessing
the whole corpus every night.

### b. Cleaning is invisible to search unless the template changes

Group 12's `search_template_vector` currently embeds the **raw** field:

```smarty
# {$details.subject}
{$details.description}

{$details.data|replace_md_alt:$details.image_url:$details.alt|replace:"*":""}
```

Writing clean text to a new field changes nothing until this template reads that
field instead of `data`. Change the last line to `{$details.clean_guide}`.

Note `{$details.description}` is the **OGP** description — on dotafire it is the
same boilerplate on every page ("Find top Razor build guides by DotA 2
players…"), repeated across thousands of rows. Drop it from the template too.

### c. Output needs a new field; `contents` is not available

Group 12 sets `content_input_type: 2` and every crawled row has `contents: ""` —
the body lives in the `data` ext field. So add two fields in the admin UI:

| ext_slug | Title | Type | Purpose |
|---|---|---|---|
| `clean_guide` | Cleaned guide | textarea or wysiwyg | the cleaned prose |
| `content_status` | Extraction status | text | `USEFUL` / `NO_USABLE_CONTENT` |

`content_status` must be **text**, not a select — `collectPassthroughFields()`
(`TopicsAIPostProcess.php:988-991`) excludes SELECT/CHECKBOX/NUMBER/RELATION as
non-text types the AI cannot write.

**`input_fields` and `output_fields` must stay disjoint.** The loop guard hashes
only `input_fields`; if an output field is also an input, the hash changes every
pass and the job never converges (`AIPostProcessBase.php:218-240`).

---

## 2. The prompt

```
You clean crawled Dota 2 web pages for a search index. You are given a page
title and a raw Markdown body scraped from a fan site. Rewrite the body into
clean, self-contained English prose that a Dota 2 player could actually learn
from.

REMOVE COMPLETELY

- Markdown image embeds and the link wrappers around them. Keep only the plain
  name. For example
  "[ ![](https://www.dotafire.com/images/item/desolator.png) Desolator ](/dota-2/item/desolator-67)"
  becomes "Desolator", and
  "[ ![](https://www.dotafire.com/images/skill/razor-eye-of-the-storm.png) Eye of the Storm ](/dota-2/skill/eye-of-the-storm-184)"
  becomes "Eye of the Storm".
- Every URL, absolute or relative: https://www.dotafire.com/..., /dota-2/hero/...,
  /dota-2/item/..., /dota-2/skill/..., favicon and social image links.
- Author attribution and profile boilerplate, e.g.
  "[ Sp3ctr3 ](https://www.dotafire.com/profile/sp3ctr3-53986) wrote:".
- Repeated blocks. These pages are forum threads where each reply quotes the
  previous comment verbatim before answering it, so whole paragraphs appear two
  or three times. Keep the first occurrence and delete the rest. Also collapse
  repeated list entries that are plainly a scraping artifact, such as the same
  starting item listed twice in a row.
- Content-free chatter and voting noise: "Great job", "+1 for the guide",
  "Insta+1", "what a amazing player omfg", "Thanks", "np", apologies about the
  writer's English, and greetings.
- Discussion about the website itself rather than the game: how to insert item
  icons, which brackets to type, forum formatting, profile questions.
- Site navigation, headers, footers, cookie or login prompts, advertisement
  text, and "related guides" lists.

FIX IN PLACE

- HTML entities that were left encoded: &#x27; and &apos; become an apostrophe,
  &amp; becomes &, &quot; becomes a double quote, &lt; and &gt; become < and >,
  &nbsp; becomes a space.
- Wrong characters standing in for punctuation. An acute accent is frequently
  used where an apostrophe belongs: "I´ll" becomes "I'll", "don´t" becomes
  "don't", "I´m" becomes "I'm". Fix any similar mojibake you find.
- Hard line wrapping. The crawler wraps at roughly 76 columns and breaks
  sentences, and sometimes single words, across lines: "Huskar lvl\n1 burning
  spear", "lane\ndominance", "icon-\nsm/pudge.png". Rejoin these into continuous
  paragraphs. Do not preserve the original line breaks.
- Escaped Markdown left over from conversion: "\-" becomes "-", "\+" becomes
  "+", "\*" becomes "*".
- Keep hero, item and ability names as ordinary text with normal capitalisation.

KEEP

Only substantive, actionable content about playing the game:
- item builds, and the reasoning or trade-offs given for them
- skill build and levelling order
- lane matchups, specific counters, and how to play against named heroes
- timings, positioning, and objective play
- concrete numbers: costs, cooldowns, armour values, damage, percentages
- explicit warnings about what does not work and why

OUTPUT

Return clean Markdown. Use a short "## " heading per topic when the content
naturally divides (for example "## Item build", "## Skill order",
"## Matchups"). Plain paragraphs and "- " bullets only. No images, no links, no
tables, no HTML.

Set content_status to USEFUL when you produced real guide content, or to
NO_USABLE_CONTENT when you did not.

DO NOT INVENT ANYTHING — THIS IS THE MOST IMPORTANT RULE

Use only what is present in the input. Do not add advice from your own knowledge
of Dota 2, do not fill gaps, do not generalise, and do not "improve" thin
content by elaborating.

Many of these pages contain no guide at all — the scraper often captured only
the comment thread. If, after removing the noise above, there is no substantive
strategy content left, set clean_guide to an empty string and content_status to
NO_USABLE_CONTENT. Return nothing else.

An empty result is a correct and useful answer. A plausible-sounding guide that
you composed yourself is the worst possible outcome, because it enters a search
index where it will be presented to players as fact.

Do not comment on the state of the input or explain what you removed. Return
only the cleaned content.
```

---

## 3. Rule configuration

Exact keys per `parseAIPostProcessRulesFromRequest()`
(`topics_group_edit.php`). `ai_postprocess_settings` is a composite JSON column:

```json
{
  "enabled": true,
  "rules": [
    {
      "input_fields": ["subject", "data"],
      "output_fields": ["clean_guide", "content_status"],
      "prompt": "<the prompt above>",
      "timing": "new_and_update",
      "create_as": "published",
      "approvalflow_id": "",
      "source_lang": "",
      "dest_lang": [],
      "model": "auto",
      "ai_agent_id": 0
    }
  ],
  "validation_enabled": false,
  "validation_rules": []
}
```

- `create_as` is the **save disposition**, not "make a new record".
  `saveTransformedContent()` (`TopicsAIPostProcess.php:1359-1381`) hardcodes
  `MODE=UPDATE` on the same `topics_id`, so this writes back to the same row.
  Use `unpublished` instead of `published` if you would rather review before the
  cleaned text becomes searchable.
- `model: "auto"` resolves to `gpt-5-mini`. Worth pinning something cheap
  deliberately: this is ~3,900 rows of 5–10k characters each, so it is the most
  expensive operation in the project so far.

---

## 4. Suggested order

1. Add `clean_guide` and `content_status` to group 12 (admin UI).
2. Configure the rule with the prompt, `enabled: true`.
3. **Pilot on a handful first** — re-save 5–10 rows and read the output. Include
   7101 and 8844 deliberately: both *should* come back `NO_USABLE_CONTENT`, and
   if either returns invented Razor or Templar Assassin advice, the anti-
   fabrication instruction is not holding and the prompt needs hardening before
   you spend money on 3,900 rows.
4. Only then sweep the rest.
5. Update `search_template_vector` to embed `clean_guide` and drop the
   boilerplate OGP `description`.
6. Consider unpublishing rows where `content_status = NO_USABLE_CONTENT` —
   `open_flg = 0` removes them from the index entirely
   (`ai_embeddings.php:41`), which is cheaper and cleaner than leaving empty
   rows to compete for matches.
7. Re-run `eval/run_eval.py --compare` and watch the `supp-*` cases.

---

## 5. Expectation worth setting

A large share of this corpus may come back `NO_USABLE_CONTENT`. All three rows
sampled were comment threads; two had no guide content whatsoever. The root
cause is the CSS selector the crawl used — `.content` on 7101 and `.main` on
3990, neither of which captured the actual guide body on dotafire.

If the `NO_USABLE_CONTENT` rate is high, the cheaper fix is upstream: correct the
selector and re-crawl, rather than paying an LLM to discover that thousands of
pages are comment sections. Worth checking the rate on the pilot before
committing to the full sweep.
