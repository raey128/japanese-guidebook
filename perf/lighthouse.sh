#!/usr/bin/env bash
# Lighthouse (mobile, simulated 4G = default throttling) on the list, map and detail pages of
# the local stack. Fails if any page's LCP >= 2500 ms.
#   perf/lighthouse.sh                      # BASE_URL=http://localhost:5173
#   BASE_URL=http://localhost:8000 PLACE_ID=12 CITY=tokyo CATEGORY=ramen perf/lighthouse.sh
# Needs Node (npx), Chrome and a stack with data (make up migrate seed-locations seed-places).
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5173}"
CITY="${CITY:-tokyo}"
CATEGORY="${CATEGORY:-food}"
LCP_LIMIT_MS="${LCP_LIMIT_MS:-2500}"
OUT="${OUT_DIR:-$(mktemp -d)}"

# A real place id for the detail page, unless given.
if [ -z "${PLACE_ID:-}" ]; then
  PLACE_ID="$(curl -fsS "${API_URL:-$BASE_URL}/api/search?q=a" | node -e \
    'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const i=JSON.parse(s).items;console.log(i.length?i[0].id:"")})')"
fi
[ -n "$PLACE_ID" ] || { echo "No place found for the detail page; set PLACE_ID." >&2; exit 2; }

declare -a PAGES=(
  "list|/lists/${CITY}/${CATEGORY}"
  "map|/map"
  "detail|/places/${PLACE_ID}"
)

status=0
for entry in "${PAGES[@]}"; do
  name="${entry%%|*}"; path="${entry#*|}"
  json="$OUT/$name.json"
  npx --yes lighthouse "${BASE_URL}${path}" --form-factor=mobile --only-categories=performance \
    --output=json --output-path="$json" --chrome-flags="--headless=new --no-sandbox" --quiet
  lcp="$(node -e 'const r=require(process.argv[1]);console.log(Math.round(r.audits["largest-contentful-paint"].numericValue))' "$json")"
  if [ "$lcp" -ge "$LCP_LIMIT_MS" ]; then
    echo "FAIL $name ($path): LCP ${lcp} ms >= ${LCP_LIMIT_MS} ms"; status=1
  else
    echo "ok   $name ($path): LCP ${lcp} ms"
  fi
done
echo "Reports in $OUT"
exit $status
