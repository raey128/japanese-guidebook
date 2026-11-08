# 14: Friendly design system and app-wide restyle

**What to build:** The app gets a friendly, approachable look in the spirit of Duolingo, without copying its branding. That means bright colours, a bold rounded font, chunky buttons that press down when tapped, rounded cards and chips, lots of space, and warm, plain copy. Shared components replace the one-off Tailwind classes, and every existing page is moved onto them. Tickets 15–23 build their screens from these components. See REQUIREMENTS R16.1–R16.4, R16.6, N1.5, N3.8, X12.

**Blocked by:** 13 (Lists tab; restyled along with the rest)

**Status:** built, awaiting test run

- [x] Tokens in `src/index.css` (`@theme`): a bright primary (replaces the current dark red `brand`), 4 category colours shared with pins (ticket 17), a success, warning and danger colour, a neutral scale, radii (≥ 12px on buttons and cards) and spacing. No hard-coded hex colours in components
- [x] Rounded, bold font served by the app itself via `@fontsource-variable/nunito` (no Google Fonts CDN), with `font-display: swap`; headings use weight 800
- [x] `Button` component (primary / secondary / danger / ghost): ≥ 48px tall, rounded, with a darker 4px bottom border that collapses on `:active` (the press-down feel); disabled and focus-visible states; works as `<button>` or a router `<Link>`
- [x] `Chip` (selectable, `aria-pressed`, optional emoji and colour), `Card`, `Sheet` (bottom sheet with peek and expanded states, used by ticket 18), `Badge` and `EmptyState` (emoji + friendly headline + one action) components
- [x] Every existing page uses them: sign-in, Lists tab, ranked list, place detail, ranking flow, add/edit place, settings, profile, admin queue, seed review, not found. Check: `grep -rn "rounded border" src/pages` finds no hand-styled buttons left
- [x] Copy pass with a short copy guide in `src/copy.ts`: friendly, second person, no jargon. Required strings include search placeholder "Where to?", empty list "Nothing ranked here yet. Be the first!", empty want-to-go "No saved spots yet. Tap ♡ on any place to save it", and errors like "Hmm, that didn't load. Try again?" with a retry button
- [x] Contrast: text on every coloured button, chip and badge is ≥ 4.5:1 (bright greens and yellows usually need dark text, not white). Checked by an axe run on each restyled page
- [x] Nothing that copies Duolingo's branding: no owl or look-alike character, not their exact green (#58CC02), not their font (Feather / DIN Round)
- [x] Vitest: Button renders as a link and as a button, disabled blocks clicks, Chip toggles `aria-pressed`; Playwright: existing e2e still passes after the restyle (update selectors only where labels deliberately changed); axe has zero serious or critical issues on the restyled pages
