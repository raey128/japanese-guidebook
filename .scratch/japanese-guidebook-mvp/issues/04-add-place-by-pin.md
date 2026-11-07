# 04: Add a place by pin

**What to build:** A signed-in user adds a missing place by dropping a pin on a map, entering its names, picking a subcategory and confirming the pre-selected location. The place shows up immediately with an Unverified badge. See REQUIREMENTS R2.1–R2.3, R2.5, R2.7, R6.4, N3.3.

**Blocked by:** 02 (Username sign-in & sessions), 03 (Geography & seed places)

**Status:** ready-for-agent

- [ ] Add-place mode places a draggable pin on a MapLibre map (OpenFreeMap tiles, tile URL in config); submit is disabled until the pin is set
- [ ] Long-press (mobile) or right-click (desktop) on the map starts add-place with the pin at that spot
- [ ] Without precise touch: "use my location" or an address search sets the pin, and the arrow keys nudge it
- [ ] The form requires English name, subcategory and location; Japanese name is optional; missing fields show inline errors
- [ ] The subcategory picker shows the 27 curated subcategories grouped by top category
- [ ] The location picker pre-selects the suggested location and lists every location of that city, including "Elsewhere in <City>"; once the user picks a location, moving the pin doesn't change it
- [ ] A pin outside coverage blocks submit with "We only cover these cities for now" and the list of cities
- [ ] The created place appears on its detail page with the Unverified badge; the form shows the CC BY-SA 4.0 notice
- [ ] Signed-out users can't open add-place (prompted to sign in); the API returns 401
- [ ] API tests cover validation and the coverage block; a Playwright test adds a place end to end
