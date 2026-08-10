# Updates — 9 Aug 2026 (round 5) — presence, activity logs, logo, contrast

## 1. Real-time online/offline presence + member activity logs

**The bug:** the admin sidebar's "active members" count pulled from
`registrationStatus === "active"` — which is correct for Circle Overview's
savings-pool math, but wrong as a general "how many people are enrolled"
number. Deleting a circle resets members to `awaiting_slot_assignment`,
which dropped them out of that count entirely, even though they're still
real registered members. That's why the number kept "disappearing."

**The fix — two separate, correct things now:**

- **New `Members` admin page.** Every registered member, each with a live
  presence dot: pulsing green (with a soft ping animation) when online,
  solid red when offline. This page re-polls itself every 5 seconds on its
  own — independent of the shared manual "Refresh" button — because
  presence is the one thing here that's actually supposed to be real-time.
- **Sidebar fixed.** Now shows two honest numbers: **"X members"** (total
  registered, survives circle deletions/reassignments) and **"Y online
  now"** with the same live pulsing dot, refreshed every 5 seconds.
- **How "online" is determined:** every authenticated request from a
  member's dashboard (including their normal 8-second polling) touches a
  `lastSeenAt` timestamp on their account, fire-and-forget so it never
  slows down their actual request. "Online" = seen within the last 45
  seconds — comfortably covers a missed poll or a brief network blip
  without flickering. Logging out zeroes it immediately rather than
  waiting for the window to lapse.
- **Member activity logging**, mirroring the admin activity log built
  earlier: every member login/logout is now recorded with a real
  timestamp. The **Activity Log** page now has an Admins/Members tab
  switcher instead of only showing admin activity.
- Circle Overview's own "active members" number is untouched — that
  specific meaning (fully onboarded, contributing to savings) is still
  correct for the financial math there. Only the sidebar's *display* was
  fixed, not that underlying calculation.

## 2. Copyright text visibility

Was too dim to read comfortably, especially in dark mode:
- Client footer: `text-slate-400 dark:text-slate-500` → bold and dark-mode-safe: `text-sm font-semibold text-slate-600 dark:text-slate-200`.
- Admin sidebar footer and login-screen footer: were translucent (`/70`
  opacity) blue-on-blue, genuinely hard to read → solid `text-blue-50
  font-semibold` in both spots.

## 3. New logo

Replaced throughout: the badge (handshake + interlocking rings + "UY"),
cropped and regenerated as the full icon set (favicon, 192/512/maskable
PWA icons, apple-touch-icon) for both apps, plus the Android project's
launcher icons (all five density buckets) and splash screens. Old logo
fully retired — nothing references it anymore.

## Files touched

Backend: `models/User.js` (`lastSeenAt`), `models/MemberActivity.js` (new),
`middleware/auth.js` (presence tracking on every member request),
`routes/auth.routes.js` (member login logs activity + sets `lastSeenAt`,
new `POST /api/auth/member/logout`), `routes/admin.routes.js` (new
`GET /members`, `GET /presence-summary`, `GET /member-activity`).

Admin: `App.tsx` (Members tab, real-time sidebar presence, own 5s poll
interval, brighter footer text), new `pages/Members.tsx`,
`pages/ActivityLog.tsx` (admin/member tabs).

Client: `App.tsx` (logout now calls the new member-logout endpoint,
brighter footer text), new logo assets throughout `public/`.

Both frontend apps rebuild clean; all backend files pass a syntax check;
the Android project was re-synced with the new logo and latest build.

## What to re-test

1. Log in as a member on the client, leave the tab open — in the admin
   Members page, their dot should go green within a few seconds and stay
   green as long as the tab's open (their dashboard keeps polling).
2. Close that tab (or log out) — the dot should go red within a few
   seconds, faster if they used Logout specifically.
3. Delete a circle (Member Slot Grid) and confirm the sidebar's "X members"
   number does **not** drop — only "online now" and individual statuses
   should be affected, not the total headcount.
4. Check Activity Log's new Members tab shows login/logout entries with
   real timestamps.
5. Look at the copyright line in both apps, light and dark mode — should
   be clearly readable now, not faint.
6. Confirm the new logo shows correctly: both app headers, both favicons/
   browser tabs, and (if you rebuild the Android APK) the app icon and
   splash screen on a phone.
