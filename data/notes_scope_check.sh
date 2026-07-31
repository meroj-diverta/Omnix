#!/usr/bin/env bash
# Confirms notes/list is scoped per member. Member 13 owns notes; member 14 owns
# none. If member 14's list is non-empty, notes are still leaking.
set -euo pipefail
BASE=https://meroj.g.kuroco.app
ORIGIN=http://localhost:3000

check() {
  local email=$1 jar; jar=$(mktemp)
  local gt
  gt=$(curl -sS -X POST "$BASE/rcms-api/7/auth/login" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" \
        -d "{\"email\":\"$email\",\"password\":\"password01\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("grant_token",""))')
  curl -sS -X POST "$BASE/rcms-api/7/auth/token" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" \
        -c "$jar" -d "{\"grant_token\":\"$gt\"}" -o /dev/null
  echo "== $email =="
  curl -sS "$BASE/rcms-api/7/notes/list" -H "Origin: $ORIGIN" -b "$jar" \
    | python3 -c 'import sys,json;d=json.load(sys.stdin);r=d.get("list") or d.get("topics_list") or [];print("notes returned:",len(r));[print("  ",n.get("topics_id"),"owner",n.get("member_id"),repr(n.get("subject"))) for n in r]'
  rm -f "$jar"
}

check meromah.it@gmail.com   # member 13 — owns 3
check linebuggy@gmail.com    # member 14 — owns 0
