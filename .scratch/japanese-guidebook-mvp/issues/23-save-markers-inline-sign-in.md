# 23: Save ♡, personal markers and inline sign-in

**What to build:** The map becomes *your* map. Want-to-go is renamed **Save ♡**. Saved places show a ♡ marker and places you've ranked show a ✓ marker, and a ♡ Saved chip filters to just your saved places. Saving, ranking or adding while signed out opens a one-field username panel over the map, so nobody gets bounced to another page. See REQUIREMENTS R17.1–R17.3.

**Blocked by:** 17 (Chips and pins), 15 (+ button)

**Status:** built, awaiting test run

- [x] All UI labels say Save / Saved (♡) instead of Want to go; Lists segment "Saved" (`?tab=want_to_go` kept for URL stability); no user-facing "pin"
- [x] The map endpoint marks each point with `saved` and `ranked` for the signed-in viewer; pins show ♡ / ✓ marks; accessible names include "saved" / "ranked by you"
- [x] A "♡ Saved" chip (signed in only) at the start of the chip row filters the map to saved places (`mode=want_to_go` on the existing endpoint)
- [x] `InlineSignIn` panel: one username field with R1.2 validation, create-or-sign-in in one step, then it resumes the pending action (save / rank / add)
- [x] Used by ♡ (pin summary, list rows), Rank and the + button; the map view and selected place are unchanged afterwards
- [x] API test: map points carry saved/ranked flags only for the viewer; Playwright: signed out → tap ♡ on a pin → enter username → the place is saved, the map still shows the same view, the ♡ marker shows
