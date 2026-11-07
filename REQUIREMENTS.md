# Japanese Guidebook: Requirements

_Last updated: 2026-11-08_

## Summary

**Problem:** Japan travel recommendations are scattered across Google, Tabelog and Reddit, star ratings are inflated, and nobody owns an open dataset of trusted rankings.
**Users:** English-speaking travellers planning a Japan trip at home and using it on their phone while there, plus returnees logging and ranking where they went.
**Success looks like:** MVP done when the full stack runs locally via Docker Compose with CI green. Product success: 100 users have each ranked at least 10 places within 3 months of public launch (measured after the deployment phase, which requires real auth, see S13).
**Constraints:** Team of 2–4, MVP by 2027-02-08. React + Vite frontend, FastAPI + Postgres/PostGIS backend, everything self-hosted. MVP runs fully via Docker Compose locally; production deployment is a later phase. The MVP has no real authentication: users sign in with a username only (R1). Places are user-created by pinning on a map, tagged with a curated city location, and policed by user flags; no external POI dataset (no Google, no Foursquare) and no administrative boundary data. All content is CC BY-SA 4.0. Japan first, but the data model must support any country.

## Glossary

- **City**: a launch city (Tokyo, Kyoto, Osaka, Nara, Hiroshima, Fukuoka, Sapporo, Kanazawa), curated in `data/cities.csv`. Carries `country_code` and a centroid.
- **Location**: a curated general area inside a city (Asakusa, Gion & Higashiyama, Miyajima…), curated in `data/locations.csv` as a name + centroid point, with no boundary. Day-trip areas belong to the nearest launch city (Miyajima → Hiroshima, Dazaifu → Fukuoka, Ikaruga → Nara, Mitaka → Tokyo, Otaru → Sapporo). Each city also has one catch-all location, "Elsewhere in <City>", which has no centroid.
- **Place**: a user-created pin, tagged with exactly one location (and therefore one city) and one subcategory.
- **List**: one user's ranked places for a (city, subcategory, bucket). Personal scores are derived from position in the list.

## In-Scope

### R1: Identity (username-only, no auth)

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R1.1 | Sign in by entering a username | A new username asks "Create account <name>?" and creates the user on confirm; an existing username signs straight in. There is no password or verification (local MVP only, see S13) |
| R1.2 | Username rules | 3–20 chars of `[a-z0-9_]`, unique case-insensitively; invalid or reserved names (`guidebook`, `admin`, …) show an inline error; username shows on profile and notes |
| R1.3 | Sessions | Signing in creates a server-side session row referenced by an opaque random cookie; sign-out deletes the row |
| R1.4 | Admin role | Only users flagged admin in the DB (set with `make make-admin USERNAME=…`) can open moderation pages; others get 403 |

### R2: Place submission (manual pinning)

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R2.1 | Signed-in user adds a place by dropping a pin on the map | "Add place" mode places a draggable pin; submit is disabled until a pin is set |
| R2.2 | Required fields: pin, English name, subcategory, location; optional Japanese name | Submit without a required field shows an inline error; Japanese name is saved when given |
| R2.3 | Subcategory picked from the curated list in `data/subcategories.csv` (27 subcategories under 4 top categories: Food, Sights, Stays, Experiences & Nightlife) | Picker shows only curated subcategories; every place has exactly one |
| R2.4 | Address auto-filled by reverse geocoding through the backend, which calls the public OSM Nominatim API for the MVP | Within 2s of placing the pin, the address field fills in; the backend throttles to ≤1 req/s globally, caches by coordinates rounded to 4 decimals, and sends an identifying User-Agent; if geocoding fails or is throttled, submit still works with the address blank. The geocoder URL is a config value so the API can be swapped for a self-hosted instance |
| R2.5 | Place tagged with a curated location | When the pin is set, the location picker pre-selects the non-catch-all location with the nearest centroid; the user can change it to any location of that city, including "Elsewhere in <City>". If the nearest location centroid is more than 30 km away (config value), submit is blocked with "We only cover these cities for now" and the list of cities. Moving the pin does not change the tag once the user has picked one |
| R2.6 | Duplicate warning on submit | If a same-subcategory place lies within 50m, or a fuzzy-similar name within 200m, the user sees those matches and must pick one (which opens ranking) or confirm "this is different" |
| R2.7 | Place goes live immediately, marked "Unverified" | New place appears on the map, in search and in lists at once with an "Unverified" badge; the badge clears once 2 users other than the creator have ranked it (for seed places, any 2 users) |
| R2.8 | Creator can edit name, pin, subcategory and location for 24h; after that, admin only | Edit button is hidden after 24h for the creator; an API edit attempt then returns 403. A subcategory or location change that moves the place to a different city/subcategory re-inserts its rankings (see R4.9) |
| R2.9 | Submission rate limit | Accounts younger than 7 days can create 5 places per rolling 24h, older accounts 20; the next one returns 429 with a clear message |
| R2.10 | Data model carries country and is not Japan-specific | `country_code` on cities; cities and locations are data, not code; no Japan-only columns or hard-coded city logic |
| R2.11 | Seed scripts load cities, locations and places | `make seed-locations` loads `data/cities.csv` and `data/locations.csv`; `make seed-places` loads `data/seed_places.csv` (columns: name, name_ja, lat, lng, subcategory, location) as places owned by the reserved system user `guidebook`, marked Unverified. Rows with an unknown subcategory or location fail the run; reruns are idempotent (no duplicates by name + 50m, locations upserted by slug); admin view lists seed places with a 'reviewed' checkbox and a per-city count of unreviewed places. The 'reviewed' flag is independent of the Unverified badge |

### R3: Search & ranking entry

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R3.1 | Search places by English or Japanese name, optionally filtered by city, location and category | Searching a seeded name returns it within 300ms; filters narrow results. Matching is trigram-based; kana/romaji variants of a kanji name are not matched (see S15) |
| R3.2 | Signed-in user can rank any live place | The Rank button on detail page, search result and map pin starts the R4 flow |
| R3.3 | One ranking per user per place | Ranking an already-ranked place opens re-rank instead of creating a second entry |
| R3.4 | Empty search result state | No-match search shows "Not found" with an "Add it on the map" link that opens R2.1 |

### R4: Pairwise ranking

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R4.1 | Ranking starts with a Liked / Fine / Disliked choice | Choosing a bucket moves on to comparisons within that bucket only |
| R4.2 | Binary-search insertion via "Which was better?" comparisons against the user's places in the same subcategory + city | Inserting into a bucket of n places takes ≤ ⌈log2(n+1)⌉ comparisons; the resulting order is consistent with every answer given. The search runs in the browser against a snapshot of the list; the client submits only the final bucket + position with the list version, and the server rejects a stale version with 409 |
| R4.3 | Personal score derived from position | Bands: Liked 6.7–10, Fine 3.4–6.7, Disliked 0–3.4. Place i (1 = best) of n in a band [lo, hi] scores `lo + (hi − lo) · (n − i + 0.5) / n`. A single place gets the band midpoint; scores approach but never reach the band edges, so bands never tie; all scores in the list update on each insert |
| R4.4 | Attach an optional text note and visit date (month/year) | Note ≤ 1,000 chars; both are saved and editable afterwards without re-ranking |
| R4.5 | Re-rank a place | Re-rank re-runs R4.1–R4.2 for that place; other places' scores update; the public score updates |
| R4.6 | Delete a ranking | Ranking disappears from the personal list and stops counting in the public score |
| R4.7 | Comparison flow can be abandoned | Closing mid-flow saves nothing; the list is unchanged |
| R4.8 | Closed and hidden places in personal lists | A closed place stays in the user's list with its badge and keeps counting in its public score. A hidden place stays in its owner's own list (keeping its position, so unhide restores it) but is excluded from public profiles, public scores, the category prior and the dump |
| R4.9 | Re-insertion when a place changes list | When a merge, subcategory change or location change moves a place to a different (city, subcategory), each affected ranking keeps its bucket and is inserted into the user's new list at the position whose score is closest to its old personal score; both lists are recomputed; the user is not prompted |

### R5: Public scores & ranked lists

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R5.1 | Public score per place = Bayesian average of users' personal scores, with the prior = mean of all rankings in that subcategory + city, weighted as 5 virtual rankers (config value) | Unit test: 1 ranker at 10.0 in a category averaging 6.0 yields a score well below 10, and the score approaches the raw mean as rankers grow. If the subcategory + city has no rankings, the prior falls back to the subcategory nationwide, then all rankings, then 5.0. A place with 0 rankers shows "Not yet ranked" and sorts last |
| R5.2 | Ranked list per city + subcategory (also rolled up to top category), filterable by location | "Ramen in Tokyo" (and "Ramen in Tokyo › Shibuya & Harajuku") lists places sorted by public score, showing score, ranker count and any Unverified/Closed badge |
| R5.3 | Place detail page | Shows name (EN + JA), address, location + city, category, map pin, public score, ranker count, creator username, and notes with author username (or "Anonymous" for private users) |
| R5.4 | Empty list state | A city+category with no rankings shows "No rankings yet" plus a prompt to rank or add a place |

### R6: Map view

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R6.1 | Map of all live places (MapLibre with OpenFreeMap vector tiles for the MVP; tile URL is a config value) filterable by category and location | Panning loads pins for the visible bbox only; p95 bbox query < 300ms. Below zoom 11 (config) the server returns grid clusters with counts; at zoom ≥ 11 it returns raw points, capped at 2,000 |
| R6.2 | Pin tap opens place summary | Shows name, public score, badges, and buttons for Rank, Want-to-go and Flag, plus a link to the detail page |
| R6.3 | Toggle between all places, "my rankings" and "want-to-go" pins | Toggle switches pin sets without a page reload |
| R6.4 | "Add place here" from the map | Long-press (mobile) or right-click (desktop) on the map starts R2.1 with the pin at that spot |

### R7: Want-to-go list

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R7.1 | Bookmark a place as want-to-go | Bookmark toggles from search, the detail page and the map; the list persists across sessions |
| R7.2 | Ranking a bookmarked place removes it from want-to-go | After ranking, the place no longer appears in want-to-go |

### R8: Minimal profile & privacy

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R8.1 | Public profile page: username + ranked lists grouped by city/category | `/u/<username>` shows lists to logged-out visitors |
| R8.2 | Profiles are public by default with a private opt-out | Private profile URL returns 404 to others; private user's notes and created places show as "Anonymous"; their rankings still count in public scores |

### R9: User flags & moderation

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R9.1 | Signed-in user can flag a place from its map pin or detail page as: Closed, Wrong location, Wrong info, Duplicate, Fake/spam | One flag per user per place per type; "Wrong location" lets the user drag a suggested pin; "Wrong info" takes a suggested correction to name, subcategory or location tag; "Duplicate" requires picking the other place |
| R9.2 | Signed-in user can flag a note as spam/inappropriate | One flag per user per note |
| R9.3 | All flags go to an admin queue | Queue lists flags grouped by place/note, newest first, with the suggested fixes visible |
| R9.4 | Auto-action at 3 distinct flaggers | 3 users flagging Fake/spam auto-hides the place; 3 flagging Closed shows a "Reported closed" badge and stops new rankings. Both stay in the queue for admin review |
| R9.5 | Admin actions: hide/unhide, mark closed/reopen, apply suggested location or info fix, merge duplicates, dismiss | Merging moves rankings and bookmarks to the surviving place (one per user, keeping the most recent, re-inserted per R4.9) and redirects the old URL; a hidden item disappears from map, search, lists and the dump; unhide restores it |
| R9.6 | Users can't flag their own places or notes | Flag button is hidden on own content; the API returns 403 |

### R10: Open data dump

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R10.1 | CLI job exports places (name, coordinates, address, subcategory, location, city), rankings, notes and public scores as CSV + Parquet | `make dump` writes the files plus a LICENSE (CC BY-SA 4.0, with "Address data © OpenStreetMap contributors, ODbL" attribution for the address column) |
| R10.2 | Dump respects privacy and moderation | Private users appear as an opaque ID with no username; hidden items are absent (verified by test) |
| R10.3 | Dump runs on a schedule | Weekly via a cron container in Docker Compose; writes `dumps/YYYY-MM-DD/`; the scheduled and manual runs share one entrypoint |

## Stretch

- **S1: Photos on rankings**: _Why stretch:_ storage and moderation cost; notes cover the MVP.
- **S2: Tags** (cash only, solo-friendly, reservation needed): _Why stretch:_ polish; requested for later.
- **S3: Social profiles** (follows, friends' scores, activity feed): _Why stretch:_ MVP is public-only with no social graph.
- ~~S4: Manual add of places~~: moved into In-Scope as R2.
- **S5: Trip itinerary planner**: _Why stretch:_ separate product surface; revisit after launch.
- **S6: Offline mode** (cached lists/map in the PWA): _Why stretch:_ not needed for the success metric; revisit after launch.
- **S7: Japanese-language UI**: _Why stretch:_ English-only launch.
- **S8: Import from Google Maps saved lists / Beli**: _Why stretch:_ export formats are brittle; revisit after launch.
- **S9: Email notifications/digests**: _Why stretch:_ needs production email infra.
- **S10: Countries beyond Japan**: _Why stretch:_ R2.10 keeps the model ready; cities, locations and seeds for other countries come after.
- **S11: Wiki-style place editing with history**: _Why stretch:_ MVP uses creator-24h + admin edits with flags carrying fixes.
- **S12: Notify flaggers of the outcome**: _Why stretch:_ needs a notification surface.
- **S13: Real authentication**: Google OAuth (Authlib), emailed magic links (single-use, 15 min expiry, Mailpit locally, 6th request per email per hour → 429), and account deletion with a "delete everything" / "anonymize" choice that leaves no PII behind. No password column ever. Plugs into the existing sessions table. _Why stretch:_ the MVP runs locally only; **this blocks any public deployment** (X2).
- **S14: User-proposed locations**: users suggest a new location, admins approve. _Why stretch:_ the MVP keeps the location list team-curated via CSV.
- **S15: Kana/romaji search normalization** (e.g. a stored `name_romaji` via pykakasi) so "Sensoji" and "せんそうじ" find 浅草寺. _Why stretch:_ trigram search covers exact-script matches for the MVP.

## Out-of-Scope

- **X1: Google Maps verification or data**: its terms block an open dataset; user flags handle legitimacy.
- **X2: Production deployment/hosting**: next phase, after the MVP runs locally with tests green, and **not before S13 (real auth) ships**. That phase includes moving geocoding to a self-hosted Nominatim in the backend and map tiles to a self-hosted Protomaps PMTiles file.
- **X3: Native iOS/Android apps**: the mobile-first PWA covers phones.
- **X4: Booking/reservations**: not a guidebook concern.
- **X5: Payments/monetization**: open community project; no revenue model for the MVP.
- **X6: Public read API**: the periodic dump is the open-data channel.
- **X7: External POI datasets (Foursquare, Overture, OSM POIs)**: places come only from user pins and the team's seed CSV. OSM is used for base map tiles and reverse geocoding only.
- **X8: Administrative boundary data (e.g. MLIT N03)**: cities and locations are a curated tagging system, not polygons.

## Non-functional

### N1: Performance

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| N1.1 | List, map and detail pages load fast on phones | LCP < 2.5s in Lighthouse mobile (simulated 4G) against the local Docker stack |
| N1.2 | Search and map queries stay fast at scale | API p95 < 300ms at 50 concurrent users (k6) with 50,000 synthetic places loaded |
| N1.3 | Duplicate check is fast enough for the submit flow | Nearby-match query (R2.6) p95 < 200ms at 50,000 places |

### N2: Security & privacy

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| N2.1 | No PII stored in the MVP | Users have only a username; there is no email or password column |
| N2.2 | Users can only change their own rankings, notes, bookmarks and (within 24h) places | API test: modifying another user's ranking or place returns 403 |
| N2.3 | Sessions expire | Session cookie is an opaque token, HttpOnly + SameSite=Lax, and expires after 30 days; the session row is deleted on sign-out |
| N2.4 | User text is escaped | Place names and notes containing `<script>` render as plain text (e2e test) |

### N3: Accessibility

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| N3.1 | WCAG 2.1 AA on core pages | axe scan shows zero serious/critical issues on list, detail, ranking flow, add-place, profile and search |
| N3.2 | Ranking flow works by keyboard | Playwright test completes a ranking using only the keyboard |
| N3.3 | Adding a place works without precise touch | Add-place also accepts "use my location" or searching an address to set the pin, then nudging with arrow keys |

### N4: Compatibility & platforms

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| N4.1 | Mobile-first responsive PWA | Usable at 360px width with no horizontal scroll; installable (valid manifest + service worker) |
| N4.2 | Browser support | Core flows pass e2e on the last 2 versions of iOS Safari, Chrome (Android/desktop) and Firefox |
| N4.3 | English UI; place names shown in English with Japanese where provided | Detail page shows both names when both exist |

### N5: Maintainability & operability

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| N5.1 | One-command local stack | `docker compose up` from a clean clone starts frontend, API, Postgres/PostGIS and cron; `make seed-locations` and `make seed-places` load the seed CSVs; tests use a geocoder stub and never call the public API |
| N5.2 | CI on every PR | GitHub Actions runs lint, pytest, Vitest and Playwright; a failing check blocks merge |
| N5.3 | Ranking, scoring, duplicate-detection and flag-threshold logic is well tested | pytest coverage ≥ 80% on those modules |
| N5.4 | Core flow e2e | Playwright: sign in with a username → add a place by pin → rank 3 places → see them in the personal and public lists |
| N5.5 | Structured logs | API logs JSON with request ID, route, status and latency; errors include stack traces |

### N6: Data

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| N6.1 | All user content licensed CC BY-SA 4.0 | Shown on the sign-in screen, on the add-place form and in the footer; included in the dump LICENSE |

_Attribution:_ map tiles and addresses © OpenStreetMap contributors (ODbL) (shown in the app footer and the dump LICENSE).

_Skipped areas:_ Reliability & availability: local-only MVP, revisit with deployment; Scalability: local MVP, covered by the N1 load bars; Cost: self-hosted locally with no paid services; Usability: covered by R2/R4 flow criteria and N3.

## Implementation decisions

| ID | Decision |
|----|----------|
| D1 | Monorepo: `backend/` (FastAPI, uv), `frontend/` (React + Vite, pnpm), `infra/` (compose, cron), root `Makefile` wrapping `seed-locations`, `seed-places`, `make-admin`, `dump`, `test`, `lint` |
| D2 | Backend data layer: SQLAlchemy 2.0 async (asyncpg) + GeoAlchemy2 + Alembic; Pydantic v2 schemas separate from ORM models; raw SQL allowed for hot queries (bbox, duplicate check, ranked lists) |
| D3 | Identity: username-only sign-in (R1), server-side `sessions` table with an opaque cookie token, so S13 only adds new ways to create a session |
| D4 | Rankings store `bucket` + integer `position` + `personal_score`; an insert, move or delete shifts positions and recomputes every score in that list in one transaction. Each list has a version used for the R4.2 409 check |
| D5 | Binary-search comparison flow runs client-side on a list snapshot; the server does not verify answers, only the version |
| D6 | Public score computed at read time: `place_stats(sum, count)` and a per-(city, subcategory) aggregate are updated in the same transaction as ranking changes; the Bayesian expression is evaluated in the list/map SQL |
| D7 | Map: server-side `ST_SnapToGrid` clustering below zoom 11, raw points (cap 2,000) at zoom ≥ 11; vector tiles (`ST_AsMVT`) are the escape hatch if this stops scaling |
| D8 | Search and fuzzy duplicate names: `pg_trgm` GIN indexes on `name` and `name_ja`, database created with a UTF-8 non-C locale |
| D9 | Each place stores `location_id` (and hence city); the tag is chosen at submit, never derived from the pin at read time. Location suggestion = nearest non-catch-all centroid |
| D10 | No Redis: geocode cache, global Nominatim throttle (advisory lock + `last_called_at` row) and rate limits (rolling-window `COUNT(*)`) all live in Postgres |
| D11 | Frontend: React Router v7 (SPA mode), TanStack Query, react-map-gl/maplibre, Tailwind, vite-plugin-pwa, and a TS client generated from FastAPI's OpenAPI schema |
| D12 | Tests run against a real PostGIS (compose service locally, service container in CI), each test rolled back; Nominatim is replaced by a stub HTTP server via the geocoder URL config |
| D13 | Cron container reuses the backend image with supercronic running the dump entrypoint weekly; output to a bind-mounted `dumps/` dir; Parquet via pyarrow |
| D14 | Test seams: (1) backend HTTP API, the primary seam; (2) CLI entrypoints (seed, dump) run in-process against the test DB; (3) Playwright in the browser for core flows, keyboard ranking, axe and escaping. No separate unit seam for the client-side insertion search |

## Open Questions

- **Seed data accuracy:** `data/seed_places.csv` (225 places; every launch city has ≥25 places with at least one in each top category), `data/cities.csv` and `data/locations.csv` (62 named locations + 8 catch-alls) were drafted from general knowledge, not from a dataset. Place coordinates are approximate (to ~100m) and some places may have moved or closed; location centroids are rough area centres. Process: seed as Unverified, then team members review each city in-app and fix pins and tags with admin edits. Launch is blocked until every seed place has been reviewed once.
