# 05: Submission guards

**What to build:** Adding a place becomes safe and low-friction. The address fills itself in, the user is warned before creating a duplicate, the creator can fix mistakes for 24 hours, and spam floods are rate-limited. See REQUIREMENTS R2.4, R2.6, R2.8, R2.9, N2.2 and SPEC.md "Geocoding", "Places".

**Blocked by:** 04 (Add a place by pin)

**Status:** ready-for-agent

- [ ] Within 2 s of placing the pin, the address field fills in from the backend reverse-geocode endpoint (public Nominatim, URL in config, identifying User-Agent)
- [ ] Geocode results are cached in Postgres by coordinates rounded to 4 decimals; outgoing calls are limited to ≤1/s across all workers (advisory lock + last-called row)
- [ ] If geocoding fails or is throttled, the address stays blank and submit still works
- [ ] On submit, same-subcategory places within 50 m or trigram-similar names (`pg_trgm` GIN on both name columns) within 200 m are shown; the user picks one (opens ranking, or its detail page until ranking exists) or confirms "this is different"
- [ ] The creator can edit name, pin, subcategory and location for 24 h; after that the edit button is hidden and the API returns 403; editing someone else's place returns 403
- [ ] Accounts younger than 7 days can create 5 places per rolling 24 h, older accounts 20; the next one returns 429 with a clear message
- [ ] Tests use the geocoder stub (never the public API) and cover cache hits, failure fallback, both duplicate rules, the 24 h window and both rate-limit tiers
