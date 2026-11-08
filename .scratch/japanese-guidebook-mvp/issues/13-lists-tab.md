# 13: Lists tab (Beli-style)

**What to build:** One Lists page holds everything list-shaped. Segments at the top switch between the public ranked lists (All), the user's own rankings and their want-to-go bookmarks, replacing the separate My rankings and Want to go pages. This lands before the map loses its pin-set toggle (ticket 15), so users never lose access to their lists. See REQUIREMENTS R14.1–R14.6.

**Blocked by:** None (builds on the existing lists, rankings and bookmarks endpoints)

**Status:** built, awaiting test run (Vitest + Playwright not run locally)

- [x] `/lists` renders segments **All**, **My rankings**, **Want to go**; switching doesn't reload the page and the segment is kept in `?tab=`
- [x] `/me/rankings` → `/lists?tab=mine` and `/me/want-to-go` → `/lists?tab=want_to_go` (redirects); `/lists/:city/:category` keeps working
- [x] All: city picker (defaults to the last-used city, else Tokyo) × top category → subcategory, reusing the R5.2 ranked lists
- [x] My rankings: grouped by city then subcategory, in rank order with personal score
- [x] Want to go: grouped by city; ranking a place removes it (R7.2 still holds)
- [x] Every place row has "Show on map" linking to `/map?place=<id>`, which flies to the place and opens its pin summary. Ticket 15 moves the map to `/` and keeps the `place` param working
- [x] Logged out: All works; the other two segments show "Sign in to see your lists" with a sign-in link that returns to the same segment
- [x] Vitest covers segment switching and the logged-out prompts; a Playwright test ranks a place, finds it under My rankings, and uses "Show on map"
