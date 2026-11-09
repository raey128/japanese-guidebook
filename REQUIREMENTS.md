# Japanese Guidebook: Requirements

_Last updated: 2026-11-08_

## Summary

**Problem:** Japan travel recommendations are scattered across Google, Tabelog and Reddit, star ratings are inflated, and nobody owns an open dataset of trusted rankings.
**Users:** English-speaking travellers planning a Japan trip at home and using it on their phone while there, plus returnees logging and ranking where they went.
**Success looks like:** MVP done when the full stack runs locally via Docker Compose with CI green. Product success: 100 users have each ranked at least 10 places within 3 months of public launch (measured after the deployment phase, which requires real auth, see S13).
**Constraints:** Team of 2–4, MVP by 2027-02-08. React + Vite frontend, FastAPI + Postgres/PostGIS backend, everything self-hosted. MVP runs fully via Docker Compose locally; production deployment is a later phase. The MVP has no real authentication: users sign in with a username only (R1). Places are user-created by pinning on a map, tagged with a curated city location, and policed by user flags; no external POI dataset (no Google, no Foursquare) and no administrative boundary data. All content is CC BY-SA 4.0. Japan first, but the data model must support any country.

## Glossary

- **City**: a launch city (Tokyo, Kyoto, Osaka, Nara, Hiroshima, Fukuoka, Sapporo, Kanazawa), curated in `data/cities.csv`. Carries `country_code` and a centroid.
- **Location**: a curated general area inside a city (Asakusa, Gion & Higashiyama, Miyajima…), curated in `data/locations.csv` as a name + centroid point, with no boundary. Day-trip areas belong to the nearest launch city (Miyajima → Hiroshima, Dazaifu → Fukuoka, Ikaruga → Nara, Mitaka → Tokyo, Otaru → Sapporo). Each city also has one catch-all location, "Elsewhere in <City>", which has no centroid. Shown to users as **Area** (e.g. "Roppongi & Azabu").
- **Pending place**: a place added through "Add manually" from search (R13). It is hidden from everyone except its submitter until an admin approves it.
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
| R2.7 | Place added by pin-drop goes live immediately, marked "Unverified" (places added via "Add manually" from search follow R13 instead) | New place appears on the map, in search and in lists at once with an "Unverified" badge; the badge clears once 2 users other than the creator have ranked it (for seed places, any 2 users) |
| R2.8 | Creator can edit name, pin, subcategory and location for 24h; after that, admin only | Edit button is hidden after 24h for the creator; an API edit attempt then returns 403. A subcategory or location change that moves the place to a different city/subcategory re-inserts its rankings (see R4.9) |
| R2.9 | Submission rate limit | Accounts younger than 7 days can create 5 places per rolling 24h, older accounts 20; the next one returns 429 with a clear message |
| R2.10 | Data model carries country and is not Japan-specific | `country_code` on cities; cities and locations are data, not code; no Japan-only columns or hard-coded city logic |
| R2.11 | Seed scripts load cities, locations and places | `make seed-locations` loads `data/cities.csv` and `data/locations.csv`; `make seed-places` loads `data/seed_places.csv` (columns: name, name_ja, lat, lng, subcategory, location) as places owned by the reserved system user `guidebook`, marked Unverified. Rows with an unknown subcategory or location fail the run; reruns are idempotent (no duplicates by name + 50m, locations upserted by slug); admin view lists seed places with a 'reviewed' checkbox and a per-city count of unreviewed places. The 'reviewed' flag is independent of the Unverified badge |

### R3: Search & ranking entry `🟡 changed`

_The search UI moves onto the map (R12). R3.1 is now the backend that powers the suggestions._

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R3.1 | Search places by English or Japanese name, optionally filtered by city, location and category | Searching a seeded name returns it within 300ms; filters narrow results. Matching is trigram-based; kana/romaji variants of a kanji name are not matched (see S15) |
| R3.2 | Signed-in user can rank any live place | The Rank button on detail page, search result and map pin starts the R4 flow |
| R3.3 | One ranking per user per place | Ranking an already-ranked place opens re-rank instead of creating a second entry |
| R3.4 | Empty search result state | A search with no match shows "Not found" plus an "Add manually" option that starts R13 (pending approval). _Changed: it used to link to the live pin-drop flow_ |
| R3.5 | The standalone search page is retired | `/search` (with any query string) redirects to `/` and keeps `q`, `city` and `category`, so the map's search bar opens with them filled in |
| R3.6 | Every ranking has a 1–5 star rating; a comment is required below 3 stars | Ranking without a rating is refused (422). 4–5 ★ go in Liked, 3 ★ in Fine, 1–2 ★ in Disliked, then the usual comparisons. A 1–2 ★ rating without a comment is refused in the app and by the API, and its comment can't later be cleared. Comments are optional at 3 ★ and up. Adding a place asks "Have you been here?" (required); "Yes" requires a star rating and ranks the place for the adder as it's created, then offers comparisons if the list has other places (the "Have you been here?" step on Add a place is switched off for now; the API still accepts a review with a new place) |

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

### R6: Map view `🟡 changed`

_The map is now the home screen (R11). Picking an area moves the map there and no longer filters pins by location tag._

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R6.1 | Map of all live places (MapLibre with OpenFreeMap vector tiles for the MVP; tile URL is a config value), filterable by category (R11.5) | Panning loads pins for the visible bbox only; p95 bbox query < 300ms. Below zoom 11 (config) the server returns grid clusters with counts; at zoom ≥ 11 it returns raw points, capped at 2,000 |
| R6.2 | Pin tap opens place summary | Shows name, public score, badges, and buttons for Rank, Want-to-go and Flag, plus a link to the detail page |
| R6.3 | ~~Toggle between all places, "my rankings" and "want-to-go" pins~~ _Replaced by the Lists tab (R14): the map always shows all live places plus the user's own pending places_ | Map has no pin-set toggle |
| R6.4 | "Add place here" from the map | The floating + button (R11.8) starts R2.1 with the pin at the map centre; long-press (mobile) or right-click (desktop) on the map starts R2.1 with the pin at that spot |

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
| R10.4 | Pending and rejected places are never dumped | Test: a pending place and its rankings are absent from the dump; after approval they appear in the next dump |

### R11: Map-first home screen `⬜ new`

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R11.1 | The first screen is a full-screen map | `/` renders the map edge to edge (100dvw × 100dvh) with no site header or footer; `/map` redirects to `/` and keeps its query string. The OSM attribution stays visible as the map's attribution control |
| R11.2 | Navigation sits behind a menu button over the map | A menu button in a top corner opens a drawer with: Sign in/out, Lists (R14), My submissions (R13.7), Settings, Admin (admins only, with the pending count from R13.9), and the CC BY-SA notice. Other pages keep the normal header |
| R11.3 | A floating search bar on the map holds the city picker | The bar is pinned to the top of the map: [City ▾][search input]. The city is always set. Changing the city flies the map to that city's centroid at zoom 12 |
| R11.4 | Picking an area flies the map there | An area picker (in the bar under the city, listing that city's areas) and area suggestions (R12.2) fly the map to the area centroid at zoom 15 in ≤ 1.5s. Pins outside the area stay visible. "Elsewhere in <City>" has no centroid, so it flies to the city view (zoom 12) |
| R11.5 | Category chips under the search bar filter pins | A row of 4 single-select top-category chips (Food, Sights, Stays, Experiences & Nightlife), each in its pin colour. Tapping one filters pins and suggestions to it and shows its subcategory chips. Tapping a subcategory narrows further. Tapping the active chip again clears it. The filter is kept in the URL (`category=`) |
| R11.6 | Pins are coloured by top category | Each of the 4 top categories has its own pin colour. A legend is reachable from the map (a "Key" button or the chip row itself). Selected pins keep a distinct ring. Clusters stay neutral (brand colour) |
| R11.7 | The map opens on the last-used city | On first visit the map opens on Tokyo. Afterwards it opens on the last city picked in that browser (localStorage, wrapped in try/catch, falling back to Tokyo). URL `lat/lng/z` params, when present, win |
| R11.8 | "Add place" is a floating + button on the map | A round + button floats at the bottom right, above the zoom controls, and is always visible. Tapping it starts the pin-drop add (R2.1, goes live). Logged-out users go to sign in first and come back to the form |

### R12: Type-ahead search suggestions `⬜ new`

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R12.1 | Suggestions appear as soon as the user types | After the first character, a dropdown shows suggestions within 300ms of the last keystroke (150ms debounce + API). Clearing the input closes it |
| R12.2 | Suggestions are grouped: areas, categories, places | Up to 3 matching areas of the selected city ("Roppo" → Roppongi & Azabu; picking one runs R11.4), up to 3 matching subcategories ("ram" → Ramen; picking one sets the R11.5 chip), then places. Areas and subcategories match their EN and JA names |
| R12.3 | Place suggestions favour the area currently on screen | Places come in two groups: "On the map" (inside the current viewport, up to 5) and "Elsewhere in <City>" (rest of the selected city, up to 5). The category chip filter applies to both. Each row shows the name, area and a category colour dot |
| R12.4 | Picking a place suggestion shows it on the map | If needed the map flies to the place (zoom ≥ 16), then highlights its pin and opens its summary (R6.2) |
| R12.5 | "Add manually" is always the last row | The row is there once at least 1 character is typed, even when other suggestions show, and reads "Can't find it? Add '<typed text>' manually". It starts R13 |
| R12.6 | Searching is open to everyone; adding is not | Logged-out users get suggestions. Picking "Add manually" while logged out sends them to sign in, then back into R13 with the name kept |

### R13: Manual add with admin approval `⬜ new`

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R13.1 | "Add manually" opens the existing add-place form, pre-filled | Same form as R2.1–R2.5 (pin, EN/JA name, subcategory, location) with the English name pre-filled from the search text and the pin started at the map centre. R2.6 duplicate warning and R2.9 rate limit apply as normal |
| R13.2 | A manually added place is created as pending | It is saved with status `pending` and is absent for everyone else: map, search, suggestions, lists, other profiles and public scores. API test: another user's map/search query does not return it |
| R13.3 | The submitter sees and can use their pending place | The submitter sees it on their map and in their suggestions with a "Pending review" badge, and can rank, note and bookmark it. Their ranking stays in their personal list but does not count toward public scores or the category prior until approval |
| R13.4 | Admins review pending places in a queue | The admin page lists pending places oldest first with name, pin on a mini map, subcategory, location, submitter, and nearby places within 200m. Non-admins get 403 |
| R13.5 | Approve makes the place live | Approval puts it on the map, in search and in lists immediately, with the normal "Unverified" badge (R2.7). The submitter's ranking starts counting in public scores. Admin can fix name, pin, subcategory or location before approving |
| R13.6 | Reject removes the place | A rejected place disappears from the submitter's map too, and its rankings and bookmarks are deleted. Admin can add an optional reason (≤ 200 chars). The status is kept for the submitter (R13.7) |
| R13.7 | Adding a place happens on the main map, search first | Tapping + opens an Add panel over the same full-screen map with the name field focused. The map doesn't move and there's no pin yet. Picking a suggestion zooms the map to that place and pins it. The pin is fixed until "Edit pin" (or "Place pin myself" / "Can't find it? Place the pin yourself"); then dragging it or tapping the map moves it, until Done. Long-press on the map starts with a pin there. Picking a place already in the app closes the panel and opens it. After adding, the new place's summary opens. Old `/places/new` links open the panel |
| R13.8 | Pin-drop adds are unaffected | Places added with the + button, long-press or right-click (R2, R6.4) still go live immediately. Test: a pin-drop place appears to other users at once and a manual add does not |
| R13.9 | Admins can see when places are waiting | When there are pending places, the menu button shows a dot for admins and the drawer's Admin entry shows the count ("Admin · 3 pending"). The count updates on page load and whenever the drawer opens. No email or push |
| R13.10 | Manual adds count toward the daily submission limit | A manual add uses up the same R2.9 quota as a pin-drop add. Test: a new account that has made 5 places in 24h (any mix) gets 429 on the 6th |
| R13.11 | Typing a name on Add a place suggests businesses | From 2 letters, a dropdown shows places already in the app ("Already on the map", opening them instead of adding a duplicate) and businesses from OpenStreetMap, nearest first. Picking one fills in the name and address, drops the pin and guesses the subcategory where it can. If the lookup service is down, the form still works by hand |
| R13.12 | Adding a place happens on the main map, search first | Tapping + opens an Add panel over the same map with the name field focused; the map doesn't move or zoom. Typing shows suggestions (places already in the app, then OpenStreetMap). Picking one moves the map there and pins it. The form is just Name and Category: no Japanese name, address or "Where is it?" fields (the address and area come from the pin). The pin is fixed unless the user taps "Edit pin" (or "Place the pin yourself" when it isn't listed); then dragging it or tapping the map moves it, until Done. After adding, the panel closes, "📍 Pin added!" shows, and the new place's summary opens |
| R13.13 | Category is chosen with chips, and users can add one | The group (Food / Sights / Stays / Experiences) and its kinds are chips styled like the rest of the app, not a dropdown. "+ New" adds a kind under the chosen group (2–40 characters, signed-in users); a name that already exists (any case) selects the existing one |
| R13.14 | Zoom controls are always on the map | A zoom group (+, −, 🗾 whole city) sits on the right of the map at all times, including while adding a place; 🗾 flies back to the default view of the current city |

### R14: Lists tab (Beli-style) `🟡 changed`

_Replaces the separate My rankings and Want to go pages and the map toggle. The pages exist today as `MyRankings.tsx` and `WantToGo.tsx`._

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R14.1 | One Lists tab holds all lists | `/lists` is a single page with three segments at the top: **All** (public ranked lists), **My rankings**, **Want to go**. Switching segments doesn't reload the page and the chosen segment is in the URL (`?tab=`). `/me/rankings` and `/me/want-to-go` redirect to the matching segment |
| R14.2 | All shows the public ranked lists | City (defaults to the map's current city) × top category, then subcategory, using the R5.2 lists |
| R14.3 | My rankings shows the user's ranked places | Grouped by city, then subcategory, in rank order with the personal score (R4.3). Pending places show their "Pending review" badge |
| R14.4 | Want to go shows bookmarks | Grouped by city. Ranking a place removes it from here (R7.2) |
| R14.5 | Every row links back to the map | Each place row has "Show on map", which opens `/` with the map flown to that place and its pin summary open (same as R12.4) |
| R14.6 | Lists is the second main tab | A tab bar at the bottom of the map and the Lists page shows Map (1st) and Lists (2nd); one tap switches. The active tab is marked (`aria-current`) and the map ends above the bar |
| R14.7 | The Lists tab shows ready-made rankings | For the chosen city (chips): "Top rated in <city>", then "Top <category> in <city>" for each category with places, then the busiest kinds (e.g. "Top Ramen in Tokyo"), each with its top 5 and "See all N". Empty lists are left out. Tapping a place opens its card on the map |

### R15: Recommendations on the map `⬜ new`

_Goal: a first-time visitor finds a good recommendation from the map by instinct, without searching._

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R15.1 | Zoomed-in pins show their score | At zoom ≥ 14 (config value) each ranked pin shows its public score with one decimal ("8.7") next to the category emoji. Unranked pins show only the emoji. Below 14, plain pins |
| R15.2 | A "Top picks here" bottom sheet lists the best places in view | Up to 10 live places inside the viewport with ≥ 1 ranker, sorted by public score (ties: more rankers first), filtered by the active category chip. It refreshes on pan/zoom end and on chip change. Peek state shows the title, the count and the top 3; expanded shows the full list with rank, name, score, emoji and area |
| R15.3 | Tapping a pick shows it on the map | The map flies to the place (zoom ≥ 16), highlights its pin, opens the pin summary (R6.2) and collapses the sheet to peek |
| R15.4 | Friendly empty state | With no ranked places in view, the sheet says "Nothing ranked here yet. Be the first!" with a button that starts the pin-drop add |
| R15.5 | Sheet, search and buttons don't fight | Opening the search dropdown collapses the sheet. The + button floats above the sheet. At 360×640 the peek sheet leaves ≥ 50% of the map visible |
| R15.6 | Top picks is a side panel you can hide | Top picks sits on the left edge of the map, hidden by default as a small tab ("⭐ Top picks here ›"); one tap opens it, ‹ hides it, and the choice is remembered per browser. Hidden while adding a place |

### R16: Friendly, playful look and feel (Duolingo-inspired) `⬜ new`

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R16.1 | One design system for the whole app | Colour, radius and spacing tokens live in `src/index.css` with no hard-coded hex colours in components: a bright primary, 4 category colours (shared by pins, chips and legend), success, warning and danger, and a neutral scale. The font is rounded and bold (Nunito, served by the app itself) |
| R16.2 | Chunky, tappable controls | Shared `Button` (≥ 48px tall, radius ≥ 12px, darker bottom border that compresses on press), `Chip`, `Card`, `Sheet`, `Badge` and `EmptyState` components. Every page uses them; no hand-styled buttons remain |
| R16.3 | Emoji category icons | 🍜 Food, ⛩️ Sights, 🏨 Stays, 🏮 Experiences & Nightlife on chips, pins, the legend and list rows. The emoji is `aria-hidden`; text labels carry the meaning |
| R16.4 | Friendly copy | Second person, plain, warm. The search placeholder is "Where to?". Every empty state names what's missing and offers one action (e.g. "Nothing ranked here yet. Be the first!"). Errors say what happened in plain words and offer a retry. Strings live in `src/copy.ts` |
| R16.5 | Celebrations when users contribute | Saving a ranking shows a ~1.5s confetti burst and "Nice! That's your <n><ordinal> place in <City>!", with bigger messages at 1, 5, 10, 25 and 50. Adding a place: "Added! Thanks for helping fellow travellers 🙌"; a manual add: "Sent for review! We'll add it soon 🙌". The celebration closes on tap, Esc or its timer and never blocks the page |
| R16.6 | The whole app is restyled, not just new screens | Sign-in, Lists, ranked list, place detail, ranking flow, add/edit place, settings, profile, admin and not-found all use the R16.2 components (checked in review and by the axe run in N3.1) |

### R17: Discover and save here instead of Google Maps `⬜ new`

_Own discovery, saving and ranking; hand off only turn-by-turn directions._

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R17.1 | "Save ♡" and "Add a place +" are distinct, and "pin" never appears in the UI | Want-to-go is labelled **Save** (♡) everywhere, including the Lists segment "Saved". Creating a place is **Add a place** (+). `grep -rni "\bpin\b" src/copy.ts` finds nothing user-facing |
| R17.2 | My places stand out on the map | Saved places show a ♡ marker and places I've ranked a ✓ marker, always, alongside all places. A **♡ Saved** chip at the start of the chip row shows only my saved places (signed in only) |
| R17.3 | Saving, ranking and adding work from a signed-out start without leaving the map | Tapping ♡, Rank or + while signed out opens an inline panel, "Pick a username to save places" (one field, R1.2 rules). On submit the account is created or signed in, the action completes, and the user stays on the same map view |
| R17.4 | Near me | A **📍 Near me** button asks for location only when tapped, centres the map on the user at zoom 15 and shows a "you are here" dot. Top picks then reflect that area. If permission is denied or unavailable, a friendly message shows and the map doesn't move |
| R17.5 | Walking time | Once the user's location is known, picks and the place popup show "~N min walk" = straight-line distance × 1.3 ÷ 80 m/min, rounded up. Over 30 min, show the distance instead ("2.4 km") |
| R17.6 | Get directions hands off to a maps app | iPhone/iPad → `https://maps.apple.com/?daddr=<lat>,<lng>`; Android → `geo:<lat>,<lng>?q=<lat>,<lng>(<name>)`; desktop → OpenStreetMap directions to the place in a new tab. Never a Google link |
| R17.7 | The place popup gives a decision in seconds | Order: name → score & ranker count → category emoji · area · walk time (if located) → one-line quote of the most recent note from a "Liked" ranking (if any) → buttons **Save ♡ · Directions · Rank** → "View details". Flag sits under a "…" menu |
| R17.8 | Top picks never empty in a covered city | If nothing in view is ranked, the sheet shows **Team picks**: reviewed seed places in view, nearest to the map centre first, marked "Team pick". "Nothing here yet" only shows when there are no places in view at all |
| R17.9 | Everything about a place is in its card | Tapping a pin opens one scrollable card: Rate (the main button, first), a bookmark icon to save, a flag icon to report, and edit for the creator. Then score, category, area, address, your rating, and reviews, which can be sorted Newest / Top rated / Lowest. There's no Directions or "View details" button; the card is where details live |

### R18: Usage counts (self-hosted, anonymous) `⬜ new`

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| R18.1 | The app records key events | Events: `app_open` (first or returning), `place_open` (source: pin, top_pick, search, near_me, list), `save`, `rank`, `add`, `search_no_result`, `near_me`, `directions`. Sent fire-and-forget to `POST /api/events`; a failure never affects the UI |
| R18.2 | Events are anonymous | Each event carries a random per-browser ID (localStorage, regenerated if storage is blocked) and is **never** linked to a user or session row. Test: the events table has no user_id, username, IP or user-agent column |
| R18.3 | Raw events expire | Raw events older than 90 days are deleted by the weekly cron. Daily totals per event type are kept |
| R18.4 | Admins see the funnel | Admin-only **Stats** page: weekly first-visit → place opened → saved → ranked funnel, the share of first visits that open a place within 2 minutes, and searches with no result. Non-admins get 403 |
| R18.5 | Events never leave the stack | No third-party analytics scripts or requests (checked in the e2e network log) |

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
- **S16: Subcategory icons inside pins** (ramen bowl, torii…) on top of the category colour. _Why stretch:_ 4 colours cover the MVP; icon set is design work.
- **S17: Open on the nearest city via geolocation**. _Why stretch:_ last-used city + Tokyo default is enough; avoids a permission prompt on first load.
- **S18: Notify the submitter when a manual add is approved or rejected**. _Why stretch:_ needs a notification surface (like S12); "My submissions" covers it for now.
- **S19: Multi-select category chips** (e.g. Food + Sights). _Why stretch:_ single-select keeps the UI states simple.
- **S20: First-visit tour**: a 3-step, skippable tooltip tour on the map ("Pick a city" → "Tap a category" → "Top picks are here"), shown once per browser. _Why stretch:_ the user wants it after the MVP.
- **S21: Original mascot** for empty states and onboarding. _Why stretch:_ needs illustration work; emoji cover the playful tone for now.
- **S22: Daily streaks / ranking goals**. _Why stretch:_ celebrations with per-city counts (R16.5) give the reward loop for the MVP.
- **S23: Real walking routes** (self-hosted OSRM with Japan data) instead of the straight-line estimate. _Why stretch:_ several GB of data and another service to run.
- **S15: Kana/romaji search normalization** (e.g. a stored `name_romaji` via pykakasi) so "Sensoji" and "せんそうじ" find 浅草寺. _Why stretch:_ trigram search covers exact-script matches for the MVP.

## Out-of-Scope

- **X1: Google Maps verification or data**: its terms block an open dataset; user flags handle legitimacy.
- **X2: Production deployment/hosting**: next phase, after the MVP runs locally with tests green, and **not before S13 (real auth) ships**. That phase includes moving geocoding to a self-hosted Nominatim in the backend and map tiles to a self-hosted Protomaps PMTiles file.
- **X3: Native iOS/Android apps**: the mobile-first PWA covers phones.
- **X4: Booking/reservations**: not a guidebook concern.
- **X5: Payments/monetization**: open community project; no revenue model for the MVP.
- **X6: Public read API**: the periodic dump is the open-data channel.
- **X7: External POI datasets (Foursquare, Overture, OSM POIs)**: places come only from user pins and the team's seed CSV. OSM is used for base map tiles and reverse geocoding only.
- **X8: Administrative boundary data (e.g. MLIT N03)**: cities and locations are a curated tagging system, not polygons. So the map never draws area outlines, and picking an area moves the map without filtering pins (R11.4).
- **X9: A separate full search-results page**: the map's suggestions dropdown is the only search UI; `/search` redirects (R3.5).
- **X10: Nationwide (cross-city) search**: search is always scoped to the selected city (R11.3); change city to search elsewhere.
- **X11: Email/push alerts to admins about pending places**: the in-app count (R13.9) is enough for now.
- **X12: Copying Duolingo's branding**: the style is inspired by Duolingo, not a copy. No owl or look-alike character, not their exact green (#58CC02), not their Feather / DIN Round font.
- **X13: A landing or welcome page before the map**: the first screen is always the map (R11.1).

## Non-functional

### N1: Performance

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| N1.1 | List, map and detail pages load fast on phones | LCP < 2.5s in Lighthouse mobile (simulated 4G) against the local Docker stack |
| N1.2 | Search and map queries stay fast at scale | API p95 < 300ms at 50 concurrent users (k6) with 50,000 synthetic places loaded |
| N1.3 | Duplicate check is fast enough for the submit flow | Nearby-match query (R2.6) p95 < 200ms at 50,000 places |
| N1.4 | Suggestions keep up with typing | Suggest endpoint (R12) p95 < 150ms at 50 concurrent users with 50,000 places (k6); out-of-order responses are discarded so a stale result never replaces a newer one |
| N1.5 | The font doesn't slow the first paint | Nunito is self-hosted (no Google Fonts CDN), uses `font-display: swap`, and only the weights in use are shipped; map home LCP stays < 2.5s (N1.1) |

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
| N3.1 | WCAG 2.1 AA on core pages | axe scan shows zero serious/critical issues on the map home (search bar open), Lists tab, list, detail, ranking flow, add-place, profile and the admin pending queue |
| N3.2 | Ranking flow works by keyboard | Playwright test completes a ranking using only the keyboard |
| N3.3 | Adding a place works without precise touch | Add-place also accepts "use my location" or searching an address to set the pin, then nudging with arrow keys |
| N3.4 | Search bar is an accessible combobox | It follows the ARIA combobox pattern: arrow keys move through suggestions, Enter picks, Esc closes, and the result count is announced. Playwright test picks an area and a place by keyboard only |
| N3.5 | Colour is never the only category cue | Pin colours have ≥ 3:1 contrast against the base map (WCAG 1.4.11); chips and the legend carry text labels; each pin's accessible name includes its category |
| N3.6 | Motion respects reduced motion | With `prefers-reduced-motion: reduce`, R11.3/R11.4/R12.4/R15.3 jump to the view instead of animating, button presses don't bounce, and R16.5 celebrations show the message without confetti |
| N3.7 | The + button is usable | It has the accessible name "Add place", is at least 48×48px, and is reachable by keyboard |
| N3.8 | Bright colours stay readable | Text on every coloured button, chip, badge and pin score is ≥ 4.5:1 (dark text on bright greens and yellows where needed); axe finds no colour-contrast issues |

### N4: Compatibility & platforms

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| N4.1 | Mobile-first responsive PWA | Usable at 360px width with no horizontal scroll; installable (valid manifest + service worker) |
| N4.2 | Browser support | Core flows pass e2e on the last 2 versions of iOS Safari, Chrome (Android/desktop) and Firefox |
| N4.3 | English UI; place names shown in English with Japanese where provided | Detail page shows both names when both exist |
| N4.4 | Map overlay fits small phones | At 360×640 the search bar, chip row (scrolls sideways inside itself), menu button and + button leave ≥ 50% of the map visible; the + button never covers the suggestions dropdown or the pin summary; the open dropdown covers ≤ 60% of the viewport height and never causes page scroll |

### N5: Maintainability & operability

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| N5.1 | One-command local stack | `docker compose up` from a clean clone starts frontend, API, Postgres/PostGIS and cron; `make seed-locations` and `make seed-places` load the seed CSVs; tests use a geocoder stub and never call the public API |
| N5.2 | CI on every PR | GitHub Actions runs lint, pytest, Vitest and Playwright; a failing check blocks merge |
| N5.3 | Ranking, scoring, duplicate-detection and flag-threshold logic is well tested | pytest coverage ≥ 80% on those modules |
| N5.4 | Core flow e2e | Playwright: sign in with a username → add a place by pin → rank 3 places → see them in the personal and public lists |
| N5.6 | Map-first flow e2e | Playwright: open `/` → pick Tokyo → type "Roppo" → pick the area (map centre within 300m of the Roppongi & Azabu centroid) → tap Food → type an unknown name → "Add manually" → submit → place is pending for the submitter and invisible to a second user → admin sees "1 pending" → approves → second user sees it |
| N5.5 | Structured logs | API logs JSON with request ID, route, status and latency; errors include stack traces |

### N6: Data

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| N6.1 | All user content licensed CC BY-SA 4.0 | Shown on the sign-in screen, on the add-place form and in the footer; included in the dump LICENSE |

_Attribution:_ map tiles and addresses © OpenStreetMap contributors (ODbL) (shown in the app footer and the dump LICENSE).

_Skipped areas:_ Reliability & availability: local-only MVP, revisit with deployment; Scalability: local MVP, covered by the N1 load bars; Cost: self-hosted locally with no paid services; Usability: covered by R2/R4 flow criteria and N3.

### N7: Usability

| ID | Requirement | Acceptance criterion |
|----|-------------|----------------------|
| N7.1 | Recommendations are findable by instinct | Hallway test with 5 people who have never seen the app: given "Find a well-rated ramen place near Roppongi" and no instructions, at least 4 of 5 open a top pick's summary within 60 seconds |
| N7.2 | Approachable feel | The same 5 testers rate "this feels friendly and easy" ≥ 4/5 on average |

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

- **Launch content:** before launch, the team ranks at least 10 places per launch city in-app, so Top picks has real scores on day one (R17.8 covers the gaps). Launch is blocked until this is done. Owner: team.

- **Seed data accuracy:** `data/seed_places.csv` (225 places; every launch city has ≥25 places with at least one in each top category), `data/cities.csv` and `data/locations.csv` (62 named locations + 8 catch-alls) were drafted from general knowledge, not from a dataset. Place coordinates are approximate (to ~100m) and some places may have moved or closed; location centroids are rough area centres. Process: seed as Unverified, then team members review each city in-app and fix pins and tags with admin edits. Launch is blocked until every seed place has been reviewed once.
