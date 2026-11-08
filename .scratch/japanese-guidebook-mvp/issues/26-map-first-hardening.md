# 26: Map-first hardening: accessibility, small screens and e2e

**What to build:** The new map-first experience meets the same quality bar as the rest of the MVP. Accessibility scans cover the new screens, the overlay works on small phones, and one end-to-end test walks the full map → search → manual add → approval flow. See REQUIREMENTS N3.1, N3.4–N3.7, N4.4, N5.6.

**Blocked by:** 13–25

**Status:** built, awaiting test run

- [x] axe shows zero serious or critical issues on: the map home with the search dropdown open, the menu drawer, the Lists tab (all 3 segments), My submissions and the admin pending queue
- [x] At 360×640: the search bar, chip row, menu button and + button leave ≥ 50% of the map visible; the + button never covers the dropdown or the pin summary; no page scroll in any direction
- [x] Reduced motion: Playwright with `reducedMotion: 'reduce'` confirms fly-tos jump (no animation frames between start and end)
- [x] N5.6 e2e: open `/` → pick Tokyo → type "Roppo" → pick the area (centre within 300m of the Roppongi & Azabu centroid) → tap Food → type an unknown name → Add manually → submit → pending for the submitter, invisible to a second user → admin sees "1 pending" → approves → the second user sees it
- [x] The e2e passes on WebKit, Chromium and Firefox in CI
- [x] Ticket 12's old checks that mention `/search` or the Home page are updated to the new screens
