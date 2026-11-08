# 24: Near me, walking time, directions and the decision popup

**What to build:** A traveller standing in Tokyo taps 📍 Near me and sees what's best around them, with walking times. The place popup answers "should I go?" in seconds, and "Get directions" hands off to their phone's maps app. Top picks falls back to Team picks so it's never empty in a covered city. See REQUIREMENTS R17.4–R17.8, R6.2.

**Blocked by:** 18 (Top picks), 23 (Save ♡)

**Status:** built, awaiting test run

- [x] 📍 Near me button: geolocation only on tap; centres at zoom 15 with a "you are here" dot; denied → friendly toast, map unchanged
- [x] `walkLabel(from, to)`: straight line × 1.3 ÷ 80 m/min, rounded up → "~N min walk"; over 30 min → "2.4 km". Shown on picks and in the popup when located
- [x] `directionsUrl(place, platform)`: iOS → Apple Maps `daddr`; Android → `geo:`; desktop → OpenStreetMap directions (new tab). Never Google
- [x] Popup order: name → score & rankers → emoji · area · walk → top Liked note quote (one line, ellipsised) → Save ♡ · Directions · Rank → View details; Flag in a "…" menu
- [x] Place detail API includes `top_note` (most recent note from a Liked ranking, respecting private-user anonymity and hidden notes)
- [x] Top picks: when no ranked place is in view, the response is `{kind: "team", items}` with reviewed seed places nearest the centre, shown as "Team picks"
- [x] Vitest: walkLabel and directionsUrl tables; API tests: top_note rules, Team picks fallback; Playwright: mocked geolocation → Near me → picks show walk times; popup shows Directions with the right link
