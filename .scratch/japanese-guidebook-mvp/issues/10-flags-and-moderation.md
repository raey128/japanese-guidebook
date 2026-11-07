# 10: Flags & moderation

**What to build:** Users flag bad data and abusive notes. Three distinct flaggers trigger automatic action, and admins work a queue to hide, close, fix, merge or dismiss. Whenever a place moves to a different city or subcategory (a merge, an applied fix, or a creator/admin edit), everyone's rankings of it slide into the right List automatically. Admins also get the seed-review view. See REQUIREMENTS R2.11 (review view), R4.8, R4.9, R9 and SPEC.md "Moderation".

**Blocked by:** 05 (Submission guards), 08 (Public scores, ranked lists & search)

**Status:** ready-for-agent

- [ ] Place flags Closed, Wrong location (with a dragged suggested pin), Wrong info (suggested name, subcategory or location), Duplicate (with the other place picked) and Fake/spam; note flag spam/inappropriate; one per user per target per type; none on your own content (button hidden, API 403)
- [ ] At 3 distinct flaggers, Fake/spam auto-hides the place; Closed adds a "Reported closed" badge and blocks new rankings; both stay in the queue
- [ ] A hidden place disappears from the map, search, lists, profiles, public scores and category priors, but stays in its owner's own List at the same position; a closed place keeps counting toward its public score
- [ ] The admin queue groups flags by place or note, newest first, with suggested fixes visible
- [ ] Admin actions: hide/unhide, close/reopen, apply a suggested location or info fix, dismiss, and edit any place after the creator's 24 h window
- [ ] Merge moves rankings and bookmarks to the surviving place (one per user, keeping the most recent) and redirects the old place URL
- [ ] Re-insertion (R4.9): when a merge, fix or edit moves a place to a different (city, subcategory), each affected ranking keeps its bucket and is inserted at the position with the closest score; both Lists and aggregates are recomputed
- [ ] The admin seed-review view lists seed places with a "reviewed" checkbox and a per-city count of unreviewed places
- [ ] API tests cover flag uniqueness and own-content 403, both thresholds, hide/unhide round trips, merge and re-insertion
