# Updates — 6 Aug 2026 (round 3)

Built on top of rounds 1 and 2 — nothing from either was touched or undone.
Both frontend apps rebuild clean (`npm run build`), and every backend file
passes a syntax check.

## 1. Contribution visibility — admin + live member feed

**New admin page: Contributions Tracker.** For each circle, this shows the
live total collected this calendar month against the ₦11,000-per-member
target, with a progress bar, plus a color-coded card per member:
- 🟢 **Green** — "Paid ₦11,000" broken down as ₦10,000 savings + ₦1,000
  Owambe, shown as the actual amount posted.
- 🟠 **Amber** — "Paid late (+₦4,000 fine)".
- ⚪ **Grey** — "Not paid yet this month".

**Member dashboard: live target card.** Every active member now sees a
"This month's contribution target" card with the same live numbers —
₦X of ₦Y collected, N of M members paid, a progress bar that fills in
real time as the dashboard polls (every 8s), and "Target met! 🎉" once
everyone in the circle has paid. This is the transparency piece: every
member can see the whole circle's status, not just their own.

Backend: `GET /api/admin/contributions` (new) and `monthProgress` added to
`GET /api/member/me`, both computed from real `Ledger` records for the
current calendar month — not a stand-in number.

## 2. Registration wizard: Back / Forward navigation

Every step past the first now has a **Back** button alongside its forward
action, so a misclick doesn't cost you the form. Going back is always safe
(pure navigation, no resubmission). Going forward again after going back is
guarded so you don't accidentally double-register or re-submit a used OTP:
if you'd already registered/verified in this session, clicking forward just
takes you to the next screen instead of hitting the API again.

## 3. Refresh buttons

- **Client dashboard:** a "Refresh" button now sits next to Logout (and
  the Profile toggle), reloading your dashboard and announcements on
  demand instead of waiting for the 8-second auto-poll.
- **Admin sidebar:** a "Refresh" button now sits next to Logout. It
  reloads whichever page you're currently on with fresh data from the
  server.

## 4. Announcements: auto-clear, welcome-back, and profile-page auto-return

- **Auto-clearing system messages.** Welcome messages, "finish your
  profile" reminders, profile-completed confirmations, "so-and-so just
  joined" broadcasts, and welcome-back greetings now delete themselves
  automatically — an hour later for most of them, 15 minutes for the
  welcome-back greeting — via MongoDB's built-in TTL expiry (no manual
  cleanup job needed). Broadcasts you send from the admin Broadcast
  Engine are unaffected and still stay until you delete them.
- **Welcome back.** Every time a member logs in (not just their first
  time), a private "Welcome back, {name}!" notice now appears in their
  feed.
- **Profile page auto-returns to the dashboard.** The moment a member's
  profile actually becomes complete (photo + day + month of birth all
  saved together for the first time), saving takes them straight back to
  the dashboard instead of leaving them on the Profile page. Saving a
  partial update (e.g. just the photo, before DOB is set) still shows an
  inline "Profile saved" message and keeps them on the page, since they're
  not done yet.

## 5. New-member broadcast + real scrolling ticker banner

- The moment someone finishes registering, every other member gets a
  broadcast: **"{Name} just joined Unique Youths Cooperative Thrift
  Club — please welcome them!"** — visible to everyone, auto-clears after
  an hour like the other system notices.
- The ticker itself was previously just a pulsing/fading list, not an
  actual moving banner. It's now a real horizontally auto-scrolling
  marquee (continuous CSS animation, no extra dependency), so announcements
  visibly slide across the screen.

## 6. Light / Dark / Auto theme

Both apps now have a three-way **Light / Auto / Dark** toggle (Auto follows
the device's OS setting and updates live if that changes). It's in the
header of the client app (both the registration screens and the dashboard)
and in the sidebar of the admin app. The choice is remembered per device via
`localStorage` and applied via Tailwind's class-based dark mode — every
major surface (backgrounds, cards, tables, inputs, panels, ticker, wizard)
has matching dark-mode styling, not just a global filter.

## Files touched

Backend:
- `src/models/Announcement.js` — TTL `expiresAt` field + index.
- `src/utils/announcements.js` — new, `withExpiry()` helper.
- `src/routes/member.routes.js` — new-member broadcast, `monthProgress` in
  `/me`, `justCompleted` flag on `/profile`, TTL on system announcements.
- `src/routes/auth.routes.js` — welcome-back notice on every member login.
- `src/routes/admin.routes.js` — new `/contributions` endpoint.

Admin:
- `src/App.tsx` — refresh button, theme toggle, new Contributions tab.
- `src/components/ui.tsx` — `ThemeToggle`/`applyTheme`, dark-mode classes.
- `src/pages/ContributionsTracker.tsx` — new.
- `src/pages/*.tsx` (all six existing pages) — `refreshKey` prop, dark mode.
- `tailwind.config.js` — `darkMode: "class"`, marquee keyframes.

Client:
- `src/App.tsx` — full rewrite: theme toggle, wizard Back/Forward + submit
  guards, refresh button, live `monthProgress` card, real marquee ticker,
  Profile auto-return, dark mode throughout.
- `tailwind.config.js` — `darkMode: "class"`, marquee keyframes.

## What to re-test

1. Register a fresh member, use Back/Forward through the wizard (including
   going back after the OTP step and forward again) to confirm nothing
   double-submits or breaks.
2. On finishing registration, check every other logged-in member's ticker
   for the "just joined" banner, scrolling horizontally.
3. Log a member out and back in — confirm a private "Welcome back" message
   appears, and confirm the earlier welcome/reminder messages from ~an
   hour ago are gone from their feed.
4. As that member, go to Profile, set only the photo and save (should stay
   on Profile with "Profile saved"), then set day+month and save again
   (should auto-return to the dashboard, with a "profile fully set up"
   message in the ticker).
5. Record a couple of payments (one edited to look "late" is hard to fake,
   but paying today should show green/on-time) and check both the client's
   "This month's contribution target" card and the admin Contributions
   Tracker page reflect it, color-coded correctly.
6. Toggle Light/Auto/Dark in both apps' headers and confirm it persists on
   reload.
7. Click Refresh in both the client dashboard and the admin sidebar and
   confirm data reloads without a full page refresh.
