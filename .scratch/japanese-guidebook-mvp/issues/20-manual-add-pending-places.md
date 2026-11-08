# 20: "Add manually" from search creates pending places

**What to build:** When search can't find a business, the user picks "Add manually" at the bottom of the suggestions. The existing add form opens pre-filled with their text. The place is saved as **pending**: only the submitter can see it until an admin approves it (ticket 21). The submitter can rank and bookmark it right away, but it doesn't count publicly yet. Pin-drop adds still go live immediately. See REQUIREMENTS R13.1–R13.3, R13.8, R13.10, R12.5, R12.6, R3.4, R2.7, R10.4.

**Blocked by:** 19 (Suggestions)

**Status:** built, awaiting test run

- [x] Schema: places get `status` (`live` | `pending` | `rejected`, default `live`) via an Alembic migration; existing rows are `live`
- [x] "Can't find it? Add '<text>' manually" is always the last suggestion row once ≥ 1 character is typed, including when nothing matches (R3.4)
- [x] It opens the add-place form with the English name pre-filled from the text and the pin at the map centre, and the request marks it as a manual add (e.g. `source=manual`). Logged out → sign in → back to the form with the name kept
- [x] A manual add is stored `pending`; R2.6 duplicate warnings and the R2.9 rate limit apply, and manual and pin-drop adds share the same quota (R13.10)
- [x] Pending places are excluded for everyone but the submitter from: map, suggest/search, ranked lists, other users' profiles and lists, public scores, the category prior and the dump
- [x] The submitter sees their pending place on the map and in suggestions with a "Pending review" badge, and can rank, note and bookmark it. Those rankings stay in their personal list but don't feed public scores or the prior
- [x] Pin-drop adds (+ button, long-press, right-click) are unchanged: live at once with the Unverified badge
- [x] API tests: a pending place is invisible to a second user across map, suggest, lists, profile and scores; the submitter can rank it without moving the public score; quota is shared; dump excludes it. Playwright: type an unknown name → Add manually → submit → see the "Pending review" pin
