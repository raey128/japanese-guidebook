# 19: Type-ahead suggestions in the map search bar

**What to build:** Typing in the map's search bar shows grouped suggestions right away: matching areas, matching categories, then places. Places inside the current map view come first, then the rest of the selected city. Picking a suggestion moves the map or sets the filter. This replaces the standalone search page. See REQUIREMENTS R12.1–R12.4, R3.1, R3.5, X9, X10, N1.4, N3.4.

**Blocked by:** 17 (Category chips; suggestions honour the chip filter), 18 (Top picks sheet; the open dropdown collapses it)

**Status:** built, awaiting test run

- [x] New `GET /api/suggest?q=&city=&bbox=&category=` returns `{areas[≤3], subcategories[≤3], on_map[≤5], elsewhere[≤5]}`. Areas and subcategories match their EN/JA names; places use the existing trigram search scoped to the city; `on_map` holds places inside `bbox`, `elsewhere` holds the rest of the city; hidden places excluded
- [x] The dropdown opens after the first character, with a 150ms debounce; out-of-order responses are discarded; clearing the input closes it
- [x] Groups are rendered in order: Areas, Categories, "On the map", "Elsewhere in <City>". Place rows show name, area and a category colour dot
- [x] Picking an area runs the ticket 16 fly-to; picking a subcategory sets the ticket 17 chip; picking a place flies to it (zoom ≥ 16), highlights its pin and opens the pin summary
- [x] Works logged out
- [x] The search bar follows the ARIA combobox pattern: ↑/↓ move, Enter picks, Esc closes, and the result count is announced
- [x] `/search?q=&city=&category=` redirects to `/` with the bar pre-filled; the `Search.tsx` page and its route are removed
- [x] At 360×640 the open dropdown covers ≤ 60% of the viewport height and never makes the page scroll
- [x] API tests: grouping, limits, bbox split, category filter, hidden exclusion. k6: suggest p95 < 150ms at 50 concurrent users with 50,000 places. Playwright: type "Roppo" and pick the area by keyboard only; type a seeded place name and pick it from "Elsewhere in Tokyo"
