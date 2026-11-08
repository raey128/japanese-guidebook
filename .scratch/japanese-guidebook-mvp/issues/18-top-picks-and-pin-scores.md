# 18: Top picks sheet and scores on pins

**What to build:** The map answers "what's good around here?" without any searching. Zoomed in, pins show their score, so the best places stand out. A bottom sheet, "Top picks here", lists the best-ranked places in the current view for the selected category, and it refreshes as you pan. Tapping a pick flies the map to it. See REQUIREMENTS R15.1–R15.4.

**Blocked by:** 17 (Category chips and pin colours)

**Status:** built, awaiting test run

- [x] At zoom ≥ 14 (config value), each ranked pin shows its public score (one decimal, e.g. "8.7") on the pin. Unranked pins show only the emoji. Below zoom 14, plain pins as before
- [x] New `GET /api/top-picks?bbox=&category=&limit=10` returns up to 10 live places inside the bbox with ≥ 1 ranker, sorted by public score (ties: more rankers first), as `PlaceSummary`. Hidden and pending places are excluded (pending: everyone but their submitter, once ticket 20 lands)
- [x] The sheet uses the ticket 14 `Sheet`. Peek state: "⭐ Top picks here", the count, and the top 3 as a horizontal row. Dragging up or tapping expands it to the full list (rank, name, score, category emoji, area). It refreshes on `moveend` and when the category chip changes
- [x] Empty view: "Nothing ranked here yet. Be the first!" with a button that starts the pin-drop add
- [x] Tapping a pick flies to it (zoom ≥ 16, reduced motion → jump), highlights its pin, opens the pin summary and collapses the sheet to peek
- [x] The peek sheet leaves ≥ 50% of the map visible at 360×640 and sits above the attribution; the + button floats above the sheet, never on top of it
- [x] API tests: bbox and category filtering, the order, unranked places left out, hidden places left out, limit. Playwright: rank two places in view → the higher one is #1 in the sheet → tap it → its pin summary opens; pan to an empty area → the empty state shows
