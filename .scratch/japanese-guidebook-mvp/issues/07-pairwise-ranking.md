# 07: Pairwise ranking

**What to build:** A signed-in user ranks a place by choosing Liked / Fine / Disliked and answering a few "Which was better?" comparisons against their other places in the same city and subcategory. The place slots into their personal List and every score in that List updates. They can add a note and visit date, re-rank, delete a ranking, abandon midway safely, and do it all by keyboard. See REQUIREMENTS R3.2, R3.3, R4.1–R4.7 and SPEC.md "Ranking (Lists)".

**Blocked by:** 02 (Username sign-in & sessions), 03 (Geography & seed places)

**Status:** ready-for-agent

- [ ] Rankings store bucket, integer position and personal score; a List is (user, city, subcategory, bucket) and has a version; one ranking per user per place
- [ ] The client fetches the List snapshot and runs the binary search in the browser: the first item in a bucket needs no comparison, and n items need ≤ ⌈log2(n+1)⌉ comparisons; the final order matches every answer
- [ ] The client submits `{place_id, bucket, position, list_version}`; a stale version returns 409 and the UI restarts the comparisons on the fresh List
- [ ] Each write shifts positions and recomputes every score in the List in one transaction, using: in band [lo, hi] (Liked 6.7–10, Fine 3.4–6.7, Disliked 0–3.4), place i of n (1 = best) scores `lo + (hi − lo) · (n − i + 0.5) / n`
- [ ] Closing the flow midway saves nothing
- [ ] Ranking an already-ranked place opens re-rank, which re-runs the flow and updates the other scores
- [ ] An optional note (≤ 1,000 chars) and visit month/year are saved and editable without re-ranking
- [ ] Deleting a ranking removes it from the List and recomputes the other scores
- [ ] A Rank button on the place detail page and the map pin summary starts the flow; a personal "my rankings" page shows each List with scores
- [ ] Users can only change their own rankings (403 otherwise)
- [ ] API tests cover the score formula, positions, 409, re-rank, delete and the note limit; Playwright covers ranking 3 places, and a keyboard-only ranking (N3.2)
