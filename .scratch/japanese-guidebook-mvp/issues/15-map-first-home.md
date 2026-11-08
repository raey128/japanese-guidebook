# 15: Map-first home screen, menu and + button

**What to build:** Opening the app lands on a full-screen map. The old Home page and site header disappear from this screen. Navigation moves into a menu drawer over the map, and adding a place becomes a floating + button. The map always shows all live places, because the All / My rankings / Want to go toggle now lives in the Lists tab (13). See REQUIREMENTS R11.1, R11.2, R11.7, R11.8, R6.3, R6.4.

**Blocked by:** 13 (Lists tab), 14 (Design system)

**Status:** built, awaiting test run

- [x] `/` renders the map at 100dvw × 100dvh with no site header or footer; `/map` redirects to `/` and keeps its query string (`lat`, `lng`, `z`, `category`, `place`); the OSM attribution stays visible through the map's attribution control
- [x] Other pages keep the normal header; the old Home content (ranked list links, API status line) is removed or moved into the Lists tab or menu
- [x] A menu button in a top corner opens a drawer with: Sign in/out, Lists, My submissions (left out until ticket 21, or shown as disabled), Settings, Admin (admins only), and the CC BY-SA notice. Esc and a tap outside close it, and focus returns to the button
- [x] The map's pin-set toggle is removed; the map shows all live places only (R6.3 retired)
- [x] A round floating + button at the bottom right, above the zoom controls, is at least 48×48px with the accessible name "Add place". It opens the pin-drop add form (R2.1) with the pin at the map centre; logged-out users go to sign in and come back to the form. Long-press and right-click still work
- [x] The map opens on the last city used in this browser (localStorage, wrapped in try/catch), else Tokyo; URL `lat/lng/z` override that. Ticket 16 adds the city picker that sets it, so for now this only reads the stored value
- [x] At 360×640 the menu button and + button don't overlap each other, the zoom controls or the pin summary
- [x] Playwright: `/` shows the map with no header; the menu opens and links to Lists; the + button opens the add form; `/map?lat=…` redirects and keeps the view
