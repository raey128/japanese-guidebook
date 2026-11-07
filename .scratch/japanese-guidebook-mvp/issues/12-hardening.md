# 12: Hardening: PWA, accessibility, e2e & performance

**What to build:** The MVP meets its non-functional bar. It installs as a PWA, works at phone width, passes accessibility scans, its core flow is covered end to end on all target browsers, and it stays fast with 50,000 places. See REQUIREMENTS N1, N2.4, N3.1, N4, N5.4.

**Blocked by:** 04, 05, 06, 07, 08, 09, 10, 11

**Status:** ready-for-agent

- [ ] Valid manifest and service worker (installable); usable at 360 px width with no horizontal scroll
- [ ] axe shows zero serious or critical issues on list, detail, ranking flow, add-place, profile and search
- [ ] e2e: a place name and a note containing `<script>` render as plain text
- [ ] N5.4 e2e: sign in with a username → add a place by pin → rank 3 places → see them in the personal and public lists
- [ ] Core flows pass on the last 2 versions of iOS Safari (WebKit), Chrome and Firefox in Playwright
- [ ] A synthetic-data generator loads 50,000 places; k6 at 50 concurrent users shows search and map p95 < 300 ms and the duplicate check p95 < 200 ms; any index or query fixes needed are made
- [ ] Lighthouse mobile (simulated 4G) LCP < 2.5 s on list, map and detail pages against the local stack
- [ ] The app footer shows the CC BY-SA 4.0 notice and the OpenStreetMap attribution
