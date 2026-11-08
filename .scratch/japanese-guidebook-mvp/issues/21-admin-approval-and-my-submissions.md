# 21: Admin approval queue and "My submissions"

**What to build:** Admins get a queue of pending manual adds and can approve them (after fixing anything wrong) or reject them. Approved places go live as normal Unverified places. Admins see a pending count on the menu. Submitters can follow their adds in "My submissions". See REQUIREMENTS R13.4–R13.7, R13.9, R10.4, X11.

**Blocked by:** 20 (Pending places)

**Status:** built, awaiting test run

- [x] `GET /api/admin/pending` (admin only, others 403) lists pending places oldest first with name, coordinates, subcategory, location, submitter, and live places within 200m
- [x] Admin page section "Pending places": each card shows a mini map and nearby places, with Approve / Edit then approve / Reject
- [x] Approve sets `status=live`: the place appears on the map, in suggestions and in lists at once with the Unverified badge, and the submitter's rankings start counting (scores and the prior recomputed)
- [x] Admin can edit name, pin, subcategory and location before approving; a city or subcategory change re-inserts rankings per R4.9
- [x] Reject sets `status=rejected` with an optional reason (≤ 200 chars); the place disappears from the submitter's map too; its rankings and bookmarks are deleted
- [x] "My submissions" (`/me/submissions`, in the menu drawer) lists the user's manual adds with Pending / Approved / Rejected and the reason, newest first
- [x] Admins see a dot on the menu button when anything is pending, and the drawer shows "Admin · N pending". The count refreshes on page load and whenever the drawer opens. No email or push (X11)
- [x] An approved place appears in the next dump; a rejected one never does
- [x] API tests: approve and reject effects, 403 for non-admins, reason length, score recompute on approve. Playwright: a submitter adds manually → a second user can't see it → the admin sees "1 pending", approves → the second user sees it; reject shows the reason in My submissions
