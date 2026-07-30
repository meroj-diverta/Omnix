#!/usr/bin/env python3
"""
Retrieval eval for Omnix's Kuroco RAG endpoints.

Scores RETRIEVAL, not answer prose. Verified 2026-07-29: the model answers from
its own training knowledge even when retrieval misses entirely, so answer text
cannot tell you whether a config change helped.

Revised 2026-07-29 for the consolidated schema. hero_abilities (group 18) and
hero_lore (group 19) were folded into the hero_master row (group 17) as one
Markdown document per hero. That broke the old scoring model: when nearly every
case expects group 17, "did the top hit come from the right group?" passes
trivially and measures nothing.

So the primary assertion is now expect_slug — WHICH hero row answered:

  - top_slug_match : the top-ranked result is the expected row
  - any_slug_match : the expected row appears anywhere in list[]
  - top_group_match: falls back to group when a case expects no specific row
                     (aggregates like "name some Universal heroes")
  - distance_ok    : best distance from the expected row <= max_distance

The endpoint response carries slug/subject/topics_group_id/vector_distance but
NOT topics_id, so slug is the row identity available to us. That also means the
eval survives the group being re-imported with fresh topics_ids.

Usage:
    python3 eval/run_eval.py                    # run, print report, save snapshot
    python3 eval/run_eval.py --compare BEFORE   # run and diff against a snapshot
    python3 eval/run_eval.py --tag ability      # only cases with this tag
    python3 eval/run_eval.py --id ability-03    # a single case
    python3 eval/run_eval.py --no-save          # don't write a snapshot

Workflow around a config or data change:
    python3 eval/run_eval.py                    -> eval/results/<timestamp>.json
    ...change something...
    python3 eval/run_eval.py --compare eval/results/<timestamp>.json

Reads KUROCO_ACCESS_TOKEN and NUXT_PUBLIC_KUROCO_API_BASE/_ID from ../.env
(i.e. Omnix/Omnix/.env). Calls the public rcms-api endpoints directly, NOT
adminMCP -- a different credential, so this can fail with 401/403 while admin
tooling still works.
"""
import argparse, json, os, sys, time, urllib.request, urllib.error
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RESULTS_DIR = os.path.join(HERE, "results")


def load_env():
    env = {}
    path = os.path.join(ROOT, ".env")
    if not os.path.exists(path):
        sys.exit(f"missing {path}")
    for line in open(path):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
    if not env.get("KUROCO_ACCESS_TOKEN"):
        sys.exit("KUROCO_ACCESS_TOKEN not set in .env")
    return env


def ask(base, api_id, endpoint, token, text, timeout=120):
    url = f"{base}/rcms-api/{api_id}/{endpoint}"
    body = json.dumps({"text": text}).encode()
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("X-RCMS-API-ACCESS-TOKEN", token)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode()), None
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code}: {e.read().decode()[:200]}"
    except Exception as e:
        return None, f"{type(e).__name__}: {e}"


def expected_slugs(case):
    if case.get("expect_slug"):
        return [case["expect_slug"]]
    return list(case.get("expect_slug_any") or [])


def score(case, resp):
    """Return a per-case result dict. Retrieval-only assertions."""
    lst = resp.get("list") or []
    got = [{"group": x.get("topics_group_id"),
            "slug": x.get("slug") or "",
            "dist": x.get("vector_distance"),
            "subject": (x.get("subject") or "")[:60]} for x in lst]

    want_slugs = expected_slugs(case)
    expect_group = case.get("expect_group")
    maxd = case.get("max_distance", 0.5)
    top = got[0] if got else None

    base = {"id": case["id"], "endpoint": case["endpoint"], "q": case["q"],
            "expect_group": expect_group, "expect_slug": want_slugs or None,
            "top_group": top["group"] if top else None,
            "top_slug": top["slug"] if top else None,
            "max_distance": maxd, "tags": case.get("tags", []), "got": got[:5]}

    # --- negative: nothing specific should answer confidently ---
    if expect_group is None and not want_slugs:
        best_any = min((g["dist"] for g in got if g["dist"] is not None), default=None)
        passed = (not got) or (best_any is not None and best_any > maxd)
        return {**base, "kind": "negative", "best_distance": best_any,
                "top_slug_match": None, "any_slug_match": None,
                "top_group_match": None, "distance_ok": passed, "passed": passed}

    # --- slug-level: which row answered ---
    if want_slugs:
        hits = [g for g in got if g["slug"] in want_slugs]
        best = min((g["dist"] for g in hits if g["dist"] is not None), default=None)
        top_match = bool(top and top["slug"] in want_slugs)
        dist_ok = best is not None and best <= maxd
        return {**base, "kind": "slug", "best_distance": best,
                "top_slug_match": top_match, "any_slug_match": bool(hits),
                "top_group_match": bool(top and top["group"] == expect_group),
                "distance_ok": dist_ok, "passed": top_match and dist_ok}

    # --- group-level fallback: aggregates with no single right row ---
    hits = [g for g in got if g["group"] == expect_group]
    best = min((g["dist"] for g in hits if g["dist"] is not None), default=None)
    top_match = bool(top and top["group"] == expect_group)
    dist_ok = best is not None and best <= maxd
    return {**base, "kind": "group", "best_distance": best,
            "top_slug_match": None, "any_slug_match": None,
            "top_group_match": top_match, "distance_ok": dist_ok,
            "passed": top_match and dist_ok}


def run(cases, env, delay):
    base = env.get("NUXT_PUBLIC_KUROCO_API_BASE", "https://meroj.g.kuroco.app")
    api_id = env.get("NUXT_PUBLIC_KUROCO_API_ID", "6")
    token = env["KUROCO_ACCESS_TOKEN"]
    out = []
    for i, c in enumerate(cases, 1):
        print(f"  [{i}/{len(cases)}] {c['id']:16} {c['q'][:58]}", flush=True)
        resp, err = ask(base, api_id, c["endpoint"], token, c["q"])
        if err:
            out.append({"id": c["id"], "endpoint": c["endpoint"], "q": c["q"],
                        "error": err, "passed": False, "tags": c.get("tags", []),
                        "got": [], "kind": "error"})
        else:
            out.append(score(c, resp))
        if delay:
            time.sleep(delay)
    return out


def report(results):
    total = len(results)
    passed = sum(1 for r in results if r.get("passed"))
    errs = [r for r in results if r.get("kind") == "error"]

    print("\n" + "=" * 88)
    print(f"RETRIEVAL EVAL   {passed}/{total} passed"
          + (f"   ({len(errs)} errors)" if errs else ""))
    print("=" * 88)

    for r in results:
        if r.get("kind") == "error":
            print(f"  ERR  {r['id']:16} {r['error'][:64]}")
            continue
        mark = "PASS" if r["passed"] else "FAIL"
        d = r["best_distance"]
        ds = f"{d:.3f}" if isinstance(d, (int, float)) else "  -  "
        if r["expect_slug"]:
            want = ",".join(r["expect_slug"])
            # slug can be long (crawled rows especially) -- truncate, don't wrap
            got = (r["top_slug"] or "-")[:22]
        else:
            want = f"grp {r['expect_group']}"
            got = f"grp {r['top_group']}"
        print(f"  {mark} {r['id']:16} want={want:24} got={got:24} "
              f"d={ds} max={r['max_distance']}")
        if not r["passed"]:
            # any_slug_match distinguishes "wrong row won" from "row absent entirely"
            if r.get("any_slug_match") is True and not r.get("top_slug_match"):
                print(f"         (expected row WAS retrieved, just not ranked first)")
            for g in r["got"][:3]:
                gd = g["dist"]
                gds = f"{gd:.3f}" if isinstance(gd, (int, float)) else "  -  "
                print(f"         got: grp {str(g['group']):4} {g['slug'][:22]:24} d={gds}  {g['subject']}")

    tags = {}
    for r in results:
        for t in r.get("tags", []):
            tags.setdefault(t, [0, 0])
            tags[t][1] += 1
            if r.get("passed"):
                tags[t][0] += 1
    print("\n  by tag:")
    for t in sorted(tags):
        p, n = tags[t]
        flag = "" if p == n else "   <-- "
        print(f"    {t:22} {p}/{n}{flag}")

    # ranked-but-not-first is the actionable middle ground: the data is indexed,
    # the ordering is the problem (cnt, max_distance, competing rows).
    near = [r["id"] for r in results if r.get("any_slug_match") and not r.get("top_slug_match")]
    if near:
        print(f"\n  retrieved but not ranked first ({len(near)}): {', '.join(near)}")
    print()
    return passed, total


def compare(prev_path, results):
    prev = {r["id"]: r for r in json.load(open(prev_path))["results"]}
    print("=" * 88)
    print(f"COMPARISON vs {os.path.basename(prev_path)}")
    print("=" * 88)
    gained, lost, dmoved, new = [], [], [], []
    for r in results:
        p = prev.get(r["id"])
        if not p:
            new.append(r["id"])
            continue
        if r.get("passed") and not p.get("passed"):
            gained.append(r["id"])
        elif p.get("passed") and not r.get("passed"):
            lost.append(r["id"])
        a, b = p.get("best_distance"), r.get("best_distance")
        if isinstance(a, (int, float)) and isinstance(b, (int, float)) and abs(a - b) >= 0.02:
            dmoved.append((r["id"], a, b))
    dropped = [i for i in prev if i not in {r["id"] for r in results}]
    print(f"  fixed      ({len(gained)}): {', '.join(gained) or '-'}")
    print(f"  REGRESSED  ({len(lost)}): {', '.join(lost) or '-'}")
    if new:
        print(f"  new cases  ({len(new)}): {', '.join(new)}")
    if dropped:
        print(f"  not in this run ({len(dropped)}): {', '.join(dropped)}")
    if dmoved:
        print("  distance shifts >=0.02:")
        for i, a, b in dmoved:
            print(f"    {i:16} {a:.3f} -> {b:.3f}  ({'better' if b < a else 'worse'})")
    print()
    return lost


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--compare", metavar="SNAPSHOT")
    ap.add_argument("--tag")
    ap.add_argument("--id")
    ap.add_argument("--delay", type=float, default=1.0, help="seconds between calls")
    ap.add_argument("--no-save", action="store_true")
    a = ap.parse_args()

    spec = json.load(open(os.path.join(HERE, "golden_questions.json")))
    cases = spec["cases"]
    if a.tag:
        cases = [c for c in cases if a.tag in c.get("tags", [])]
    if a.id:
        cases = [c for c in cases if c["id"] == a.id]
    if not cases:
        sys.exit("no cases matched")

    env = load_env()
    print(f"running {len(cases)} case(s)...")
    results = run(cases, env, a.delay)
    passed, total = report(results)

    regressed = compare(a.compare, results) if a.compare else []

    if not a.no_save:
        os.makedirs(RESULTS_DIR, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        path = os.path.join(RESULTS_DIR, f"{stamp}.json")
        json.dump({"timestamp": stamp, "passed": passed, "total": total,
                   "results": results}, open(path, "w"), indent=1)
        print(f"snapshot: {os.path.relpath(path, ROOT)}")
        print(f"compare later with: python3 eval/run_eval.py --compare {os.path.relpath(path, ROOT)}")

    sys.exit(1 if regressed else 0)


if __name__ == "__main__":
    main()
