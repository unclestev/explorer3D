#!/usr/bin/env bash
# Pre-commit / pre-push checks for Yorkville Driver.
#   bash tools/check.sh            compare against origin/main
#   bash tools/check.sh <ref>      compare against another ref
# 1. node --check on every JS file
# 2. every JS/CSS file changed since <ref> (committed or not) has a new ?v= in index.html
# 3. warns about "//" comments followed by more code on the same line (the one-liner pitfall)
set -u
cd "$(dirname "$0")/.." || exit 1
BASE="${1:-origin/main}"
fail=0

echo "== node --check"
for f in js/*.js js/enh/*.js js/lib/*.js; do
  [ -f "$f" ] || continue
  node --check "$f" 2>&1 || { echo "  FAIL $f"; fail=1; }
done

echo "== ?v= bumps vs $BASE"
if ! git rev-parse -q --verify "$BASE" >/dev/null; then
  echo "  (no $BASE here; run: git fetch origin main)"
else
  changed=$( { git diff --name-only "$BASE" -- js css; git ls-files --others --exclude-standard js css; } | sort -u)
  oldidx=$(git show "$BASE:index.html" 2>/dev/null)
  for f in $changed; do
    [ -f "$f" ] || continue
    case "$f" in js/lib/*) continue;; esac
    if [ "$f" = "js/enh/engine-worklet.js" ]; then
      old=$(git show "$BASE:js/enh/sound.js" 2>/dev/null | grep -o 'engine-worklet.js?v=[0-9]*' | head -1)
      new=$(grep -o 'engine-worklet.js?v=[0-9]*' js/enh/sound.js | head -1)
    else
      old=$(printf '%s' "$oldidx" | grep -o "$f?v=[0-9]*" | head -1)
      new=$(grep -o "$f?v=[0-9]*" index.html | head -1)
    fi
    if [ -z "$new" ]; then echo "  WARN $f has no ?v= tag in index.html (new file not loaded?)"; fail=1
    elif [ -n "$old" ] && [ "$old" = "$new" ]; then echo "  FAIL $f changed but still ${new#*\?}"; fail=1
    else echo "  ok   $f  ${old#*\?} -> ${new#*\?}"; fi
  done
  [ -z "$changed" ] && echo "  (no JS/CSS changes)"
fi

echo "== '//' comment followed by code on the same line (changed lines only)"
if git rev-parse -q --verify "$BASE" >/dev/null; then
  hits=$(git diff -U0 "$BASE" -- '*.js' | grep '^+[^+]' | grep -E '[;{}]\s*//[^/].*;\s*\S' | grep -vE "https?://" | head -20)
  if [ -n "$hits" ]; then printf '%s\n' "$hits"; echo "  ^ check these: a // comment swallows everything after it on the line"; else echo "  none"; fi
fi

[ $fail = 0 ] && echo "ALL OK" || { echo "PROBLEMS FOUND"; exit 1; }
