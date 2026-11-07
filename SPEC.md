# Spec: Japanese Guidebook MVP

_Labels: `ready-for-agent` · Source: REQUIREMENTS.md (2026-11-08) and the implementation grilling session_

## Problem Statement

English-speaking travellers planning a Japan trip have no trustworthy, single place to decide where to eat, what to see and where to stay. Recommendations are scattered across Google Maps, Tabelog and Reddit. Star ratings are inflated until every place looks like a 4.3, and the data is locked inside companies whose terms forbid reuse. Travellers who have already been to Japan have nowhere to record and rank the places they visited in a way that helps the next traveller. Nobody maintains an open dataset of trusted, comparative rankings.

## Solution

A mobile-first web app (installable PWA) organised by **City → Location → Place**:

- **Cities** are the eight launch cities: Tokyo, Kyoto, Osaka, Nara, Hiroshima, Fukuoka, Sapporo and Kanazawa.
- **Locations** are curated general areas within a city, such as Asakusa, Gion & Higashiyama or Miyajima. Day-trip areas belong to the nearest launch city. Every city also has one catch-all "Elsewhere in <City>".
- **Places** are pins that users drop on a map, each tagged with exactly one location and one of 27 curated subcategories.

Users don't give star ratings. They put each place in a bucket (Liked, Fine or Disliked) and then answer a few "Which was better?" questions that slot it into their personal **List** for that city and subcategory. A place's position in a List sets its personal score, and personal scores combine into a Bayesian public score per place. Those public scores power ranked lists such as "Ramen in Tokyo", which can be narrowed by location, as well as a map and search. Users can bookmark places to visit. They can flag bad data (closed, wrong location, duplicate, spam), and three distinct flaggers trigger an automatic action. Admins handle a moderation queue. Each week the whole dataset is exported as an open CC BY-SA 4.0 dump.

For the MVP the full stack runs locally through Docker Compose. Users sign in with only a username. Real authentication is a stretch item that must be finished before any public deployment.

## User Stories

### Identity

1. As a visitor, I want to sign in by typing just a username, so that I can start ranking without creating credentials.
2. As a visitor typing a new username, I want to be asked "Create account <name>?" before it's created, so that a typo doesn't silently give me a second account.
3. As a returning user, I want typing my existing username to sign me straight in, so that I can pick up my lists on any device.
4. As a user, I want an invalid, reserved or taken username to show an inline error, so that I know why it was rejected and can pick another.
5. As a user, I want my session to last 30 days, so that I don't have to sign in every time I open the app on my phone in Japan.
6. As a user, I want to sign out, so that someone else using my device doesn't act as me.
7. As a visitor, I want to see the CC BY-SA 4.0 notice on the sign-in screen, so that I know my contributions become open data.
8. As a team member, I want to make a user admin with one command, so that we can bootstrap moderators without a UI.
9. As a non-admin user, I want moderation pages to be refused to me, so that only trusted people can moderate.

### Adding places

10. As a signed-in user, I want to enter "Add place" mode and drop a draggable pin, so that I can add a place the app doesn't know yet.
11. As a mobile user, I want to long-press the map to start adding a place at that spot, so that adding is quick on a phone.
12. As a desktop user, I want to right-click the map to start adding a place there, so that adding is quick with a mouse.
13. As a user who can't place a pin precisely by touch, I want to set the pin from "use my location" or an address search and then nudge it with the arrow keys, so that I can still place it accurately.
14. As a user adding a place, I want submit disabled until a pin is set, so that I can't create a place without coordinates.
15. As a user adding a place, I want to enter an English name and optionally a Japanese name, so that both foreigners and locals can recognise it.
16. As a user adding a place, I want to pick a subcategory from a curated list grouped under Food, Sights, Stays and Experiences & Nightlife, so that places are categorised consistently.
17. As a user adding a place, I want the location picker to pre-select the nearest location, so that tagging takes no effort in the usual case.
18. As a user adding a place, I want to change the pre-selected location to any location in that city, including "Elsewhere in <City>", so that I can correct a wrong guess.
19. As a user who has already picked a location, I want moving the pin not to change my pick, so that my choice is never overwritten.
20. As a user pinning somewhere far from every launch city, I want to be told "We only cover these cities for now" and see the list, so that I understand why I can't submit.
21. As a user adding a place, I want the address filled in automatically within about two seconds of placing the pin, so that I don't have to type it.
22. As a user adding a place while address lookup is failing, I want to still be able to submit with the address blank, so that one outside service doesn't block me.
23. As a user submitting a place, I want to be warned about nearby places in the same subcategory or with similar names, so that I don't create a duplicate.
24. As a user shown possible duplicates, I want to either pick one (which opens ranking for it) or confirm "this is different", so that I can carry on either way.
25. As a user who just added a place, I want it on the map, in search and in lists immediately, with an "Unverified" badge, so that I can rank it straight away and others know it's new.
26. As a community member, I want the Unverified badge to clear once two users other than the creator have ranked a place, so that the badge means other people have confirmed it.
27. As a place creator, I want to edit the name, pin, subcategory and location for 24 hours, so that I can fix my own mistakes.
28. As a place creator after 24 hours, I want the edit button hidden, so that the community's view of the place stays stable.
29. As a new user, I want a clear message when I hit the daily creation limit, so that I know when I can add more.
30. As a team member, I want new accounts limited to 5 places per 24 hours and older accounts to 20, so that spam floods are slowed down.
31. As a user adding a place, I want to see that my contribution is CC BY-SA 4.0, so that the licence is clear at the moment I contribute.

### Search

32. As a traveller, I want to search places by English name, so that I can find something I've heard of.
33. As a traveller, I want to search places by Japanese name, so that I can find a place from a sign or a Japanese recommendation.
34. As a traveller, I want to filter search by city, location and category, so that results stay relevant to my trip.
35. As a traveller, I want search results within about 300ms, so that the app feels instant on mobile data.
36. As a traveller who searched for something missing, I want "Not found" and an "Add it on the map" link, so that I can contribute it myself.
37. As a traveller, I want Rank and Want-to-go buttons on each search result, so that I can act without opening the detail page.

### Ranking

38. As a returnee, I want to start ranking a place by choosing Liked, Fine or Disliked, so that the first decision is easy.
39. As a returnee, I want to be asked "Which was better?" only against my other places in the same subcategory and city, so that comparisons make sense.
40. As a returnee, I want the fewest possible comparisons (binary search), so that ranking a place takes seconds even with a long list.
41. As a returnee placing the first item in a bucket, I want no comparisons at all, so that early ranking is quick.
42. As a returnee, I want my personal scores worked out from the order of my list, so that I never have to invent a number.
43. As a returnee, I want Liked, Fine and Disliked to map to separate score bands that never overlap or tie, so that a Liked place always outscores a Fine one.
44. As a returnee, I want my other places' scores to adjust when I insert a new one, so that the scores always reflect my current order.
45. As a returnee, I want to add an optional note of up to 1,000 characters and a visit month/year, so that others get context.
46. As a returnee, I want to edit my note and visit date later without re-ranking, so that small fixes are cheap.
47. As a returnee, I want to re-rank a place, so that my list reflects a changed opinion.
48. As a returnee, I want to delete a ranking, so that it drops off my list and stops counting toward the public score.
49. As a returnee, I want to close the comparison flow midway with nothing saved, so that abandoning is safe.
50. As a returnee using two tabs, I want a ranking based on an outdated view of my list to be rejected and restarted, so that my list never ends up inconsistent.
51. As a returnee, I want ranking an already-ranked place to open re-rank, so that I never end up with two entries for one place.
52. As a keyboard-only user, I want to complete the whole ranking flow without a mouse, so that ranking is accessible.
53. As a returnee who bookmarked a place, I want ranking it to remove it from my want-to-go list, so that the list only holds places I haven't been to.
54. As a returnee whose ranked place was merged into another, or moved to a different subcategory or city, I want my ranking moved into the right List at a matching position automatically, so that I don't have to redo it.
55. As a returnee whose ranked place gets hidden, I want it to stay in my own List in the same position, so that unhiding restores everything.
56. As a returnee whose ranked place closes, I want it to stay in my List with a Closed badge, so that my history stays intact.

### Public scores & lists

57. As a traveller, I want each place's public score to be a fair average that doesn't overreact to a single ranker, so that one 10/10 can't put an unknown place at the top.
58. As a traveller, I want places with no rankings to show "Not yet ranked" and sort last, so that unranked places aren't mistaken for good or bad ones.
59. As a traveller, I want sensible scores even in a category with very few rankings, so that new cities and categories still give meaningful results.
60. As a traveller, I want a ranked list per city and subcategory, such as "Ramen in Tokyo", so that I can see the best options.
61. As a traveller, I want lists rolled up to the top category, such as "Food in Kyoto", so that I can browse broadly.
62. As a traveller, I want to filter a list by location, such as "Ramen in Tokyo › Shibuya & Harajuku", so that I can plan by neighbourhood.
63. As a traveller, I want each list entry to show the score, number of rankers and any Unverified or Closed badge, so that I can judge how reliable it is.
64. As a traveller, I want an empty list to show "No rankings yet" with a prompt to rank or add a place, so that I know how to help.
65. As a traveller, I want a place detail page with both names, the address, location and city, category, map pin, public score, ranker count, creator and notes, so that I have everything I need to decide.
66. As a traveller, I want notes by private users shown as "Anonymous", so that their privacy is respected.
67. As a traveller, I want place names shown in English and Japanese when both exist, so that I can match them to signs.

### Map

68. As a traveller, I want a map of every live place, so that I can explore by area.
69. As a traveller, I want only the pins in the visible area to load, so that the map stays fast on a phone.
70. As a traveller zoomed out, I want pins grouped into clusters with counts, so that the map is readable at city or country level.
71. As a traveller, I want to filter map pins by category and location, so that I can focus on what I'm looking for.
72. As a traveller, I want tapping a pin to show the name, score, badges, Rank, Want-to-go and Flag buttons, and a link to the detail page, so that I can act from the map.
73. As a user, I want to switch the map between all places, my rankings and my want-to-go pins without a page reload, so that I can plan around my own data.

### Want-to-go

74. As a traveller, I want to bookmark a place as want-to-go from search, the detail page or the map, so that I can build a trip shortlist.
75. As a traveller, I want my want-to-go list kept across sessions, so that my shortlist is still there in Japan.

### Profiles & privacy

76. As a returnee, I want a public profile at /u/<username> showing my ranked lists grouped by city and category, so that I can share my taste.
77. As a logged-out visitor, I want to view public profiles, so that I can follow trusted people's picks without an account.
78. As a returnee, I want to make my profile private, so that my username and notes aren't public.
79. As a private user, I want my rankings still counted in public scores, so that my contributions still help.
80. As a visitor, I want a private profile URL to return "not found", so that private users can't be listed or found.

### Flags & moderation

81. As a signed-in user, I want to flag a place as Closed, Wrong location, Wrong info, Duplicate or Fake/spam, so that bad data gets fixed.
82. As a user flagging Wrong location, I want to drag a suggested pin, so that the admin sees exactly where it should be.
83. As a user flagging Wrong info, I want to suggest a corrected name, subcategory or location tag, so that the admin can apply it in one click.
84. As a user flagging Duplicate, I want to pick the other place, so that the admin knows what to merge.
85. As a signed-in user, I want to flag a note as spam or inappropriate, so that abusive content gets removed.
86. As a user, I want to be limited to one flag per place per type, so that one person can't stack up flags.
87. As a user, I want no Flag button on my own places and notes, so that I can't game the system by flagging myself.
88. As a community member, I want a place hidden automatically once three different users flag it as Fake/spam, so that spam disappears before an admin gets to it.
89. As a community member, I want a "Reported closed" badge, and no new rankings accepted, once three different users flag a place Closed, so that travellers aren't sent somewhere that's shut.
90. As an admin, I want a queue of all flags grouped by place or note, newest first, with suggested fixes visible, so that I can work through them quickly.
91. As an admin, I want to hide/unhide, mark closed/reopen, apply a suggested location or info fix, or dismiss a flag, so that I can resolve every kind of report.
92. As an admin, I want to merge duplicates so that rankings and bookmarks move to the surviving place (one per user, keeping the most recent) and the old URL redirects, so that nobody's data is lost.
93. As an admin, I want a hidden item gone from the map, search, lists and the dump, so that hiding really takes it out of public view.
94. As an admin, I want to edit any place after the creator's 24-hour window, so that long-lived data can still be corrected.

### Seed data & launch prep

95. As a team member, I want one command to load the curated cities and locations, so that a fresh stack has its geography.
96. As a team member, I want one command to load the seed places, owned by a reserved system user and marked Unverified, so that the app isn't empty at launch.
97. As a team member, I want a seed run to fail on an unknown subcategory or location, so that bad seed data never loads silently.
98. As a team member, I want re-running the seeds to create no duplicates, so that seeding is safe to repeat.
99. As an admin, I want an admin view listing seed places with a "reviewed" checkbox and a per-city count of unreviewed places, so that we can see how close we are to launch.
100. As a team member, I want "reviewed" kept separate from the Unverified badge, so that the team's checks and community confirmation don't get mixed up.

### Open data

101. As a data consumer, I want a weekly export of places, rankings, notes and public scores as CSV and Parquet, so that I can reuse the data.
102. As a data consumer, I want each export in its own dated folder with a LICENSE stating CC BY-SA 4.0 and the OpenStreetMap address attribution, so that I know my reuse obligations.
103. As a private user, I want to appear in the dump only as an opaque ID, so that my privacy holds in the open data too.
104. As a team member, I want to run the dump on demand with the same code as the scheduled job, so that manual and scheduled exports never differ.

### Developer experience

105. As a developer, I want `docker compose up` on a clean clone to start the frontend, API, database and cron, so that onboarding takes minutes.
106. As a developer, I want tests that never call the public geocoding API, so that CI is fast, deterministic and well-behaved toward OSM.
107. As a developer, I want CI to run lint, backend tests, frontend tests and browser e2e on every PR, with failures blocking merge, so that main stays green.
108. As a developer, I want JSON logs with request ID, route, status and latency, so that I can debug locally and later in production.

## Implementation Decisions

### Architecture & stack

- **Monorepo.** It holds a Python backend (FastAPI, managed with uv), a TypeScript frontend (React + Vite, managed with pnpm), infrastructure config, and a root Makefile with targets for seeding locations, seeding places, granting admin, dumping, testing and linting.
- **Backend data layer.** SQLAlchemy 2.0 in async mode (asyncpg), GeoAlchemy2 for PostGIS types, Alembic for migrations, and Pydantic v2 request/response schemas kept separate from the ORM models. The hot queries (map bbox and clustering, duplicate check, ranked lists) may be hand-written SQL.
- **Frontend.**
  - Routing: React Router v7 in SPA mode.
  - Server state: TanStack Query.
  - Map: react-map-gl over MapLibre with OpenFreeMap tiles; the tile URL is a config value.
  - Styling: Tailwind.
  - PWA: vite-plugin-pwa for the manifest and service worker.
  - API client: generated from the backend's OpenAPI schema, so the two sides can't drift apart.
- **No Redis.** All shared state lives in Postgres: the geocode cache, the global Nominatim throttle, and the rate-limit counters.
- **Scheduled jobs.** A cron container reuses the backend image and runs the dump with supercronic. The scheduled job and the on-demand Makefile target call the same entrypoint.

### Modules

These are deep modules, each with a small interface.

- **Identity.** Creates or resumes a user by username, validates username rules (3–20 chars of `[a-z0-9_]`, case-insensitively unique, reserved names rejected), creates and deletes sessions, and resolves the current user from the cookie. Sessions are server-side rows referenced by an opaque random token in an HttpOnly, SameSite=Lax cookie with a 30-day expiry. Admin is a boolean on the user. Real auth (OAuth, magic link) will later plug in as another way to create a session.
- **Geography.** Owns Cities and Locations, which are curated data loaded from CSV. A City has slug, name, Japanese name, country code and centroid. A Location has slug, name, Japanese name, city, an optional centroid, and a catch-all flag; catch-alls have no centroid. Its interface:
  - Suggest a location for a point: the nearest non-catch-all centroid, or "outside coverage" when the nearest is more than 30 km away (config value).
  - List the locations of a city.
- **Places.** Creates places from pin, names, subcategory and location, and applies the rate limits and the creator's 24-hour edit window. It also runs the duplicate check: same subcategory within 50 m, or a trigram-similar name within 200 m. It computes the Unverified status (fewer than 2 distinct rankers other than the creator) and the hidden/closed state. Each place stores its location and therefore its city. The tag is set explicitly, never derived from the pin when reading.
- **Geocoding.** Reverse geocoding behind a configurable URL. Results are cached by coordinates rounded to 4 decimals. A global limit of ≤1 request per second is enforced with a Postgres advisory lock plus a last-called timestamp. Requests carry an identifying User-Agent. Any failure returns "no address" and never raises into the submit flow.
- **Ranking (Lists).** The core module.
  - **Storage.** A List is keyed by (user, city, subcategory, bucket) and has a version. Each ranking stores bucket, integer position and personal score.
  - **Interface:** get a List snapshot with its version; insert or move a ranking to a (bucket, position) given an expected version, getting a conflict back if the version is stale; delete a ranking; update the note and visit date; re-insert a ranking by nearest score (used by merges and tag or subcategory changes).
  - **Writes.** Every write shifts positions, recomputes all personal scores in the affected List(s), bumps the version and updates the public-score aggregates, all in one transaction.
  - **Score formula.** In band [lo, hi] (Liked 6.7–10, Fine 3.4–6.7, Disliked 0–3.4), place i of n (1 = best) scores `lo + (hi − lo) · (n − i + 0.5) / n`.
  - **Who runs the search.** The binary-search comparison flow runs in the browser against the snapshot. The server checks only the version and does not re-check the user's answers.
- **Public scores.** Kept up to date in the same transaction as ranking writes. It maintains per-place (sum, count) and per-(city, subcategory) aggregates. The public score is computed in SQL when read: a Bayesian average with 5 virtual rankers (config value) at the prior. The prior falls back from the (city, subcategory) mean, to the subcategory mean nationwide, to the mean of all rankings, to 5.0. A place with zero rankers has no public score and sorts last. Hidden places are left out of the aggregates; closed places stay in.
- **Lists & search queries.**
  - Ranked lists by city + subcategory or top category, with an optional location filter.
  - Search by English or Japanese name using `pg_trgm` GIN indexes, on a database created with a UTF-8 non-C locale so CJK trigrams work, filterable by city, location and category.
  - Map query by bbox and zoom: grid clusters with counts (`ST_SnapToGrid`) below zoom 11 and raw points capped at 2,000 at zoom ≥ 11, filterable by category, location and the all / my rankings / want-to-go modes.
- **Bookmarks.** Toggle want-to-go on a place. Ranking a place removes its bookmark.
- **Profiles.** Public profile by username with Lists grouped by city and category, and a private toggle. A private profile returns not-found to others, and private users are shown as "Anonymous" on notes and created places.
- **Moderation.**
  - **Flags.** Flag types for places and notes, unique per (user, target, type), never allowed on your own content. Payloads carry the suggested pin, the suggested name/subcategory/location, or the duplicate's target.
  - **Auto-actions.** At 3 distinct flaggers: Fake/spam hides the place; Closed sets "Reported closed" and blocks new rankings.
  - **Admin queue and actions.** Hide/unhide, close/reopen, apply a suggested fix, merge, dismiss. A merge moves rankings and bookmarks to the surviving place (one per user, keeping the most recent, re-inserted by nearest score) and records a redirect from the old place.
- **Seeding.** Loads cities and locations (upsert by slug) and seed places. Seed places are owned by a reserved system user nobody can sign in as, and are idempotent by name + 50 m. Any unknown subcategory or location fails the whole run. Each seed place has a "reviewed" flag that is separate from Unverified.
- **Dump.** Exports places (name, coordinates, address, subcategory, location, city), rankings, notes and public scores to CSV and Parquet (pyarrow) in a dated folder, with a LICENSE file. Private users become opaque IDs. Hidden items are excluded.

### API contracts

These are the key shapes; field names are illustrative.

- The ranking write takes `{place_id, bucket, position, list_version}`. It returns the updated List, or 409 with the current version when stale.
- Place create returns either the created place or a duplicate-candidates response. Submitting with "this is different" confirmed skips that response.
- Location suggestion takes a point and returns `{location | null, city, outside_coverage: bool}`.
- The map endpoint takes bbox, zoom, filters and mode. It returns either clusters `{lat, lng, count}` or points `{id, lat, lng, name, score, badges}`.
- Error statuses: 403 for ownership, admin and own-content flag violations; 429 for rate limits with a human-readable message; 404 for private profiles and hidden places to non-admins.

### Schema notes

- There are no email, password or other PII columns in the MVP.
- `country_code` lives on cities. Nothing in the schema is Japan-specific.
- Rankings are unique per (user, place). Positions are unique per List.
- Merged places keep a redirect pointer to the surviving place.

## Testing Decisions

- **What makes a good test here:** it exercises behaviour through a public seam and asserts on what a user or API client can observe, such as responses, list order, scores, badges and dump contents. It must not assert on internal function calls, ORM details or query shapes. Tests use a real PostGIS database because the important rules (distance radii, trigram similarity, bbox, aggregates) are database behaviour. Each test runs in a transaction that is rolled back afterwards. The only fake is the geocoder: a stub HTTP server reached through the configurable geocoder URL. The public Nominatim API is never called from tests.
- **Seam 1: backend HTTP API (primary).** pytest drives the FastAPI app with an in-process HTTP client. It covers:
  - identity and sessions
  - place submission, location suggestion and the 30 km block
  - duplicate warnings
  - rate limits (429)
  - the 24-hour edit window and ownership checks (403)
  - ranking insert, move and delete, including the 409 on a stale version
  - the personal-score band formula
  - public Bayesian scores, including cold-start fallbacks and zero-ranker places
  - the Unverified badge
  - hide and close effects on Lists and scores
  - re-insertion on merge and on tag or subcategory changes
  - flag uniqueness and the 3-flagger auto-actions
  - the admin actions
  - bbox clustering versus raw points
  - search filters
  - profile privacy
  - an assertion that no PII appears in responses or logs

  The ranking, scoring, duplicate-detection and flag-threshold modules need ≥ 80% coverage through this seam.
- **Seam 2: CLI entrypoints.** The seed and dump commands are called in-process against the test DB. They're checked for idempotent reruns, failure on an unknown subcategory or location, dump files and LICENSE contents, private users becoming opaque IDs, and hidden items being absent.
- **Seam 3: browser (Playwright).** The core flow: sign in with a username, add a place by pin, rank 3 places, and see them in the personal and public lists. Also a ranking completed by keyboard only, axe scans with zero serious or critical issues on list, detail, ranking, add-place, profile and search, and a check that `<script>` in names and notes renders as text. Core flows run on current Safari, Chrome and Firefox. This is the only seam that tests the client-side binary-search insertion; there is deliberately no separate unit seam for it.
- **Performance checks (not part of the per-PR suite).** k6 at 50 concurrent users with 50,000 synthetic places: search and map p95 < 300ms, and duplicate check p95 < 200ms. Lighthouse mobile LCP < 2.5s against the local stack.
- **Prior art:** none yet. The repository has no code. These seams set the pattern that later features follow.

## Out of Scope

- **Real authentication**, deferred as a stretch item: Google OAuth, magic links, account deletion and anonymization. It blocks any public deployment.
- Production deployment and hosting, along with the self-hosted Nominatim and PMTiles move that comes with it.
- Administrative boundary data (polygons). Cities and locations are a curated tagging system.
- User-proposed locations. Locations are team-curated via CSV for the MVP.
- Kana/romaji search normalization.
- External POI datasets (Google, Foursquare, Overture, OSM POIs) and any Google Maps data or verification.
- Photos, tags such as "cash only", social features, itinerary planning, offline mode, a Japanese UI, imports from Google Maps or Beli, email notifications, countries beyond Japan, wiki-style edit history, and notifying flaggers of outcomes.
- Native mobile apps, booking, payments, and a public read API (the dump is the open-data channel).

## Further Notes

- Usernames can be claimed by anyone in the MVP, so the rate limits and the 3-flagger threshold are easy to get around. They are still built and tested so they're ready once real auth lands.
- The seed data (225 places, 8 cities, 62 named locations plus 8 catch-alls) was drafted from general knowledge. Coordinates are approximate to about 100 m and location centroids are rough area centres. Launch is blocked until every seed place has been reviewed in-app by a team member.
- The MVP deadline is 2027-02-08 with a team of 2–4. "Done" means the full stack runs via Docker Compose with CI green.
- Attribution: map tiles and addresses © OpenStreetMap contributors (ODbL). It appears in the app footer and the dump LICENSE.
