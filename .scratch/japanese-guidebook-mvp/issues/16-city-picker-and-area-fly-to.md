# 16: Floating search bar shell: city picker and area fly-to

**What to build:** A search bar floats at the top of the map. Its left side is a city picker that is always set. Under it, an area picker lists that city's areas. Picking a city or an area flies the map there, without filtering any pins. The text input is added here but does nothing until ticket 19. See REQUIREMENTS R11.3, R11.4, R11.7, N3.6, X8.

**Blocked by:** 15 (Map-first home)

**Status:** built, awaiting test run

- [x] The bar is pinned to the top of the map as [City ▾][search input]; the city is never empty
- [x] Changing the city flies to its centroid at zoom 12 and saves it as the last-used city (localStorage, try/catch)
- [x] The area picker lists the selected city's areas (EN + JA names) from `GET /api/cities`; picking one flies to its centroid at zoom 15 in ≤ 1.5s; "Elsewhere in <City>" flies to the city view at zoom 12
- [x] Picking an area does not filter pins: places in neighbouring areas stay visible. The map's old `location` filter param is dropped (`/map?location=` is ignored)
- [x] With `prefers-reduced-motion: reduce`, every fly-to becomes an instant jump
- [x] Panning far into another city doesn't change the picker. Only an explicit pick does
- [x] Playwright: pick Tokyo, then Roppongi & Azabu → the map centre is within 300m of the centroid; a pin outside the area is still rendered
