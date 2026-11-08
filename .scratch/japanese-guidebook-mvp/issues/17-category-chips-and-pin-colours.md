# 17: Category chips and pin colours

**What to build:** A row of chips under the search bar filters the map by category: 4 top categories first, then that category's subcategories. Pins are coloured by top category to match the chips, with a legend, so a glance at the map shows food vs sights vs stays vs nightlife. See REQUIREMENTS R11.5, R11.6, R6.1, N3.5.

**Blocked by:** 16 (Search bar shell), 14 (Design system)

**Status:** built, awaiting test run

- [x] Four single-select chips: 🍜 Food, ⛩️ Sights, 🏨 Stays, 🏮 Experiences & Nightlife, each in its pin colour with a text label (emoji `aria-hidden`), built from the ticket 14 Chip component
- [x] Tapping a top chip filters pins (and clusters) to that category and shows its subcategory chips; tapping a subcategory narrows further; tapping the active chip clears it; the filter is in the URL as `category=`
- [x] The chip row scrolls sideways inside itself at 360px; the page never scrolls sideways
- [x] The map endpoint returns each point's top category (or subcategory slug) so the client can colour the pin
- [x] Pins are round badges in the category colour with the category emoji inside (emoji `aria-hidden`); each top category has one pin colour; all 4 have ≥ 3:1 contrast against the OpenFreeMap base style; colours live in one config/token file shared by pins, chips and legend
- [x] The selected pin keeps a distinct ring; clusters stay brand-coloured
- [x] A legend ("Key" button, or the chip row if it reads clearly as one) maps colour → category
- [x] Each pin's accessible name includes its category, e.g. "Ichiran Roppongi, Ramen"
- [x] API test: the map payload includes the category per point; Playwright: tapping Food hides a seeded temple pin and shows a ramen pin; axe passes with the chips visible
