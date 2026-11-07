# 09: Want-to-go & profiles

**What to build:** A traveller bookmarks places to visit and switches the map between all places, their rankings and their want-to-go list. Every user has a public profile showing their ranked Lists and can make it private. See REQUIREMENTS R6.3, R7, R8 and SPEC.md "Bookmarks", "Profiles".

**Blocked by:** 06 (Map browsing), 07 (Pairwise ranking)

**Status:** ready-for-agent

- [ ] A want-to-go toggle on search results, the detail page and the map pin summary; bookmarks persist across sessions
- [ ] Ranking a bookmarked place removes the bookmark
- [ ] The map switches between all places, "my rankings" and "want-to-go" without a page reload
- [ ] `/u/<username>` shows the user's ranked Lists grouped by city and category to logged-out visitors
- [ ] A private toggle: a private profile URL returns 404 to others; the private user's notes and created places show "Anonymous"; their rankings still count in public scores
- [ ] Hidden places never appear on public profiles
- [ ] API tests cover bookmark toggling and removal on ranking, profile visibility and anonymisation
