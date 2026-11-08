# Performance tooling (ticket 12)

Not part of the per-PR suite. Budgets: search and map p95 < 300 ms, duplicate check p95 < 200 ms
(50 concurrent users, 50k places); LCP < 2.5 s on mobile / simulated 4G.

## 1. Synthetic data

    make up migrate seed-locations
    make synthetic            # python -m app.cli synthetic --count 50000 [--seed 42]

Inserts places around every location centroid (gaussian, about 1.5 km), plus about 2,000 synthetic
users (`synth_NNNNN`) ranking random places in a few Lists, owned by the ordinary user
`synthetic_data`. It is deterministic per seed and refreshes all aggregates. Re-running adds another
batch. To clean up, recreate the dev database (`make down`, remove the volume).

## 2. k6

Install [k6](https://k6.io/docs/get-started/installation/), then:

    make perf                                     # k6 run perf/k6.js
    BASE_URL=http://localhost:8000 k6 run perf/k6.js

50 VUs for 1 minute: search (40%), map at zooms 8-15 (40%), duplicate check (20%, signed in as
`k6_user`, created in `setup()`). Thresholds on `http_req_duration{name:search|map|duplicates}`
fail the run (non-zero exit) when exceeded.

## 3. Lighthouse

Needs Node, Chrome and a running stack with data (frontend on :5173 by default):

    perf/lighthouse.sh
    BASE_URL=http://localhost:8000 PLACE_ID=12 CITY=tokyo CATEGORY=food perf/lighthouse.sh

Audits the list (`/lists/<city>/<category>`), `/map` and a place detail page with Lighthouse's
default mobile profile (simulated 4G, 4x CPU slowdown) and exits non-zero if LCP >= 2500 ms
(`LCP_LIMIT_MS` to override). JSON reports are kept in a temp dir (`OUT_DIR` to choose).
