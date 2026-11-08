# 25: Self-hosted anonymous usage counts and admin Stats

**What to build:** We can see whether the app is easy to use without any third-party analytics. The frontend sends a handful of anonymous events to our own API. Admins see a weekly funnel and the share of first visits that open a place within 2 minutes. See REQUIREMENTS R18.1–R18.5.

**Blocked by:** 24 (event sources exist: near me, directions, top picks)

**Status:** built, awaiting test run

- [x] `events` table: id, browser_id (random UUID from the client), type, source, created_at. No user_id, username, IP or user-agent (Alembic migration)
- [x] `POST /api/events` accepts a small batch (≤ 20) of `{browser_id, type, source?}` with an allow-listed type and source; it's rate-limited per browser_id and returns 204 even when it drops events
- [x] Client `track()` queues events and flushes with `navigator.sendBeacon` or `fetch keepalive`; failures are swallowed; the browser ID lives in localStorage (try/catch → in-memory)
- [x] Tracked: app_open (first/returning), place_open (pin/top_pick/search/near_me/list), save, rank, add, search_no_result, near_me, directions
- [x] Weekly cron: roll raw events into `event_daily` (date, type, source, count, distinct browsers), then delete raw events older than 90 days
- [x] `GET /api/admin/stats` (admin only) + Stats page: weekly funnel first visit → place opened → saved → ranked; % of first visits opening a place within 2 min; top no-result searches count
- [x] API tests: schema has no identity columns, allow-list rejects unknown types, rollup and expiry, 403 for non-admins; Playwright: no requests leave the origin except map tiles
