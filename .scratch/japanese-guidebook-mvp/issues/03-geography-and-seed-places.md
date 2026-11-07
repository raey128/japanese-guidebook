# 03: Geography & seed places

**What to build:** A fresh stack can be filled with the curated geography and the 225 seed places, so the app has real content before anyone adds anything. A user can open any seeded place's detail page and see its names, location, city and subcategory. The backend can suggest a Location for any point. See REQUIREMENTS glossary, R2.3, R2.5, R2.10, R2.11 and SPEC.md "Geography", "Seeding".

**Blocked by:** 01 (Walking skeleton)

**Status:** ready-for-agent

- [ ] Schema for subcategories, cities (with `country_code` and centroid), locations (optional centroid, catch-all flag) and places (pin, English and Japanese names, subcategory, location, creator, created_at, unverified/hidden/closed state, seed "reviewed" flag); nothing is Japan-specific
- [ ] `make seed-locations` loads subcategories, cities and locations from the `data/` CSVs; reruns upsert by slug; any bad row fails the run
- [ ] A reserved system user `guidebook` exists and nobody can sign in as it
- [ ] `make seed-places` loads `data/seed_places.csv` as Unverified places owned by `guidebook`; an unknown subcategory or location fails the whole run; reruns create no duplicates (name + 50 m)
- [ ] Location suggestion: for a point, returns the nearest non-catch-all location centroid and its city, or `outside_coverage` when the nearest is over 30 km away (config value)
- [ ] The place detail page shows both names, location + city, subcategory, a map pin and the Unverified badge
- [ ] Tests (CLI seam + API) cover idempotent reruns, failure on an unknown subcategory or location, suggestion inside and outside coverage, and the catch-all never being suggested
