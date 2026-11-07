# 06: Map browsing

**What to build:** A traveller opens the map and explores every live place. Pins load for the visible area only, cluster into count bubbles when zoomed out, can be filtered by category and location, and tapping one shows a summary. See REQUIREMENTS R6.1, R6.2 and SPEC.md "Lists & search queries".

**Blocked by:** 03 (Geography & seed places)

**Status:** ready-for-agent

- [ ] The map endpoint takes bbox, zoom and filters; below zoom 11 (config value) it returns `ST_SnapToGrid` clusters with counts, and at zoom ≥ 11 raw points capped at 2,000
- [ ] Panning or zooming reloads only the visible bbox; clusters show counts and zoom in on tap
- [ ] Category and location filters narrow the pins
- [ ] Tapping a pin shows name, badges and a link to the detail page (score, Rank, Want-to-go and Flag buttons are added by later tickets)
- [ ] Hidden places never appear
- [ ] API tests cover the cluster vs points switch, the cap, filters and hidden exclusion; a Playwright test pans and opens a pin
