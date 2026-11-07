# 08: Public scores, ranked lists & search

**What to build:** A traveller browses "Ramen in Tokyo" (or "Food in Kyoto", optionally narrowed to a location) and sees places ordered by a fair public score that doesn't overreact to one ranker. They can search by English or Japanese name, and the detail page shows the public score and everyone's notes. See REQUIREMENTS R2.7, R3.1, R3.4, R5.1–R5.4 and SPEC.md "Public scores", "Lists & search queries".

**Blocked by:** 07 (Pairwise ranking)

**Status:** ready-for-agent

- [ ] Per-place (sum, count) and per-(city, subcategory) aggregates are updated in the same transaction as each ranking write
- [ ] The public score is a Bayesian average with 5 virtual rankers (config value) at the prior. The prior falls back from the (city, subcategory) mean of all rankings, to the subcategory nationwide, to all rankings, to 5.0. It's computed in SQL when read
- [ ] A place with 0 rankers shows "Not yet ranked" and sorts last
- [ ] Unit/API test: 1 ranker at 10.0 in a category averaging 6.0 scores well below 10, and the score approaches the raw mean as rankers grow
- [ ] Ranked list per city + subcategory and rolled up to top category, with an optional location filter; rows show score, ranker count and Unverified/Closed badges; an empty list shows "No rankings yet" with prompts to rank or add a place
- [ ] The Unverified badge clears once 2 distinct users other than the creator have ranked the place (for seed places, any 2 users)
- [ ] The detail page and map pin summary show the public score and ranker count; the detail page lists notes with author username
- [ ] Search by English or Japanese name (`pg_trgm`), filterable by city, location and category; results show the Rank button; no match shows "Not found" with an "Add it on the map" link to add-place
- [ ] API tests cover the prior fallbacks, zero rankers, sorting, filters and the Unverified rule; a Playwright test searches a seeded place and opens its list
