# 22: Celebration moments

**What to build:** Contributing feels rewarding. Saving a ranking or adding a place triggers a short, cheerful celebration and a progress line like "That's your 7th place in Tokyo!". Users who prefer reduced motion get the message without the animation. See REQUIREMENTS R16.5, N3.6.

**Blocked by:** 14 (Design system)

**Status:** built, awaiting test run

- [x] After a ranking is saved (new or re-rank), a celebration shows for ~1.5s: a confetti burst (small client-side canvas, no new heavy dependency; ≤ 5 KB gzipped if a library is used) and a bouncy card: "Nice! That's your <n><ordinal> place in <City>!", where n is the user's ranking count in that city after the save
- [x] Milestones at 1, 5, 10, 25 and 50 rankings in a city get a bigger message (e.g. "🎉 10 places in Tokyo, you're a local now!")
- [x] After a pin-drop place is added: "Added! Thanks for helping fellow travellers 🙌". After a manual add (ticket 20): "Sent for review! We'll add it soon 🙌"
- [x] The rank API response (or a light follow-up query) provides the count for that city, so nothing is computed client-side from stale data
- [x] `prefers-reduced-motion: reduce` → no confetti or bounce, just the message card, which is announced through a polite live region
- [x] The celebration never blocks: it closes on tap, Esc, or after its timer, and the user can keep using the page underneath
- [x] Vitest: the ordinal and milestone message builder (1st, 2nd, 3rd, 11th, 21st…); Playwright: rank a place → see "That's your 1st place in Tokyo!"; with reduced motion, no canvas is rendered
