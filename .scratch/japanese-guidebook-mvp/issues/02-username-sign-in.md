# 02: Username sign-in & sessions

**What to build:** A visitor types a username to sign in (no password, no email). A new username asks "Create account <name>?" before creating it; an existing one signs straight in. The user stays signed in for 30 days and can sign out. A team member can make someone an admin with one command, and only admins can open the (placeholder) admin area. See REQUIREMENTS R1, N2.1–N2.3, N6.1 and SPEC.md "Identity".

**Blocked by:** 01 (Walking skeleton)

**Status:** ready-for-agent

- [ ] Usernames are 3–20 chars of `[a-z0-9_]`, unique case-insensitively; reserved names (`guidebook`, `admin`, …) and invalid or taken names show an inline error
- [ ] A new username shows the "Create account <name>?" confirm; confirming creates the user and signs in; an existing username signs in directly
- [ ] Signing in creates a server-side session row; the cookie is an opaque random token, HttpOnly, SameSite=Lax, 30-day expiry; sign-out deletes the row
- [ ] The API can resolve the current user from the cookie; endpoints can require a signed-in user (401) or an admin (403)
- [ ] `make make-admin USERNAME=…` sets the admin flag; a placeholder admin page returns 403 for non-admins and loads for admins
- [ ] The users table has no email or password columns
- [ ] The sign-in screen shows the CC BY-SA 4.0 contribution notice
- [ ] API tests cover the username rules, sign-in/create, sign-out, expiry, 401/403; one Playwright test signs in and out
