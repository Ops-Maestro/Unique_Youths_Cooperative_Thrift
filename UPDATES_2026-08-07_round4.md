# Updates — 7 Aug 2026 (round 4) — traditional-Ajo simplification + 12 fixes

This round did two things: trimmed the money model back down to match a
straightforward Ajo/thrift circle (per your steer), and worked through the
12 items from last time. Everything here builds on rounds 1-3 — nothing
earlier was undone.

## Money model simplified

**Removed:** the ₦5,000 "service fee" and the "Net Personal Revenue"
concept entirely — no cut is taken by the organizer/admin anymore.
**Kept exactly as you specified:** 20 members per circle, 2 recipients paid
out per month, ₦1,000 party/Owambe fund, ₦4,000 late fee.

A recipient now takes home the **full ₦100,000** lump sum. The admin
"Profit Matrix" page is now **Circle Overview** — it shows the Global
Savings Pool, the Owambe Fund, and Late Penalties Collected, with no
profit-framed line, because the organizer isn't earning anything here.

This also fixed the root cause of the "₦4,000 in the payment box went to
the wrong place" bug (item #12) — see below.

## Payments are now admin-confirmed only (items #5 and #12)

Members could previously type anything into a "Month" field and create a
ledger entry themselves — that's how a stray "4000" turned into a bogus
extra ₦11,000 counted toward the month's target. **Members no longer
record their own payments at all.** The dashboard now just tells them
where to send money and that an admin will confirm it. On the admin side,
**Contributions Tracker** now has "Mark paid" / "Mark paid (late)" buttons
per member, plus an "Undo" on any payment record in case of a mistake.
This matches how the money actually moves: bank transfer to the admin,
proof shared in the WhatsApp community, admin confirms.

## The 12 items

1. **Two tabs, one session** — fixed. Both apps now store the session
   token in `sessionStorage` (unique per browser tab) instead of
   `localStorage` (shared across every tab). Two members — or two admins —
   can each stay logged in in separate tabs of the same browser now.
2. **Circle number privacy** — fixed. `/api/member/me` no longer sends the
   full roster; a member only ever sees their own number plus "14 of 20
   slots filled, 6 remaining." The old 20-box grid (which technically
   didn't show names, but still exposed the whole circle's shape) is
   replaced with a simple "Your circle" card showing just your own number.
3. **Responsiveness** — the admin sidebar is now a proper mobile nav: a
   hamburger-triggered slide-in panel below the `md` breakpoint instead of
   a fixed 256px column eating the whole screen. Tables that don't fit
   narrow screens (Monthly Disbursals) now scroll horizontally instead of
   squashing. The client app's layouts were already fairly responsive and
   got a pass too. This wasn't an exhaustive device-by-device QA pass —
   flag anything that still looks wrong on a specific screen size and I'll
   fix it directly.
4. **Render free-tier downtime** — added `.github/workflows/keep-alive.yml`,
   a free GitHub Actions job that pings your backend's `/health` endpoint
   every 10 minutes. Needs a one-time setup: add a `BACKEND_HEALTH_URL`
   repo secret (instructions are in the workflow file's comments). Worth
   knowing this reduces cold starts but Render can still restart the
   service for deploys/maintenance regardless.
5. **Payment confirmation ownership** — resolved above: admin-confirmed,
   off-platform payment model.
6. **Deleting circles/disbursals** — Member Slot Grid now has a "Delete
   this circle" button (works on any circle, including a just-finished
   one so you can start fresh), plus a small "×" on every filled slot to
   clear just that one member. Monthly Disbursals has a per-row delete and
   a "this circle is complete, delete it" shortcut when every slot has
   been disbursed.
7. **Admin activity log + admin session isolation** — new **Activity Log**
   tab shows every login/logout with a real timestamp (down to the
   second) and who did it, visible to any logged-in admin. Session
   isolation is the same `sessionStorage` fix as item #1.
8. **OTP admin backdoor** — Guarantor Portal now has a "Stuck at email
   verification" section listing anyone who registered but never
   confirmed their OTP. An admin can generate a fresh code there and it's
   shown directly on screen to read out to the member (call/WhatsApp),
   since the stored OTP is otherwise only ever kept hashed. The client's
   OTP screen also now says "Didn't get your OTP? Contact an admin
   directly."
9. **Ticker speed + staleness** — TTL dropped from 1 hour to **5 minutes**
   on all system messages (welcome, join announcements, profile
   reminders). The scroll speed is no longer a fixed duration — it now
   scales with how much text is actually in the ticker, so it reads at a
   consistent pace regardless of how many messages are queued.
10. **Dark mode text contrast** — found the actual bug: the dashboard's
    root container wasn't setting a text color at all, so headings
    (including "Welcome, ...") fell back to default black text on a
    near-black background. Fixed at the source, plus a pass over other
    text elements that were missing explicit `dark:` colors.
11. **Stale "Almost there" banner + font** — once `profileCompletedAt` is
    set, the banner drops the "you can set up your profile" line entirely
    instead of nagging about something already done. That specific status
    banner now uses a bold monospace font stack (`FreeMono` first, with
    sane fallbacks since FreeMono isn't guaranteed to be installed on
    every device).
12. **Late payment miscategorization + registration caching** — the
    miscategorization is fixed as a side effect of removing member
    self-reported payments entirely (see above) — there's no longer a
    field for someone to type a stray number into. Separately, logging
    out now fully resets the registration wizard (step, form fields,
    OTP/guarantor state) before showing Register again, so clicking
    Register after logout always starts from a clean blank form — no
    refresh needed.

## Files touched (high-level)

Backend: `finance.js`, `Ledger.js`, `Announcement.js` (new `AdminActivity`
model), `member.routes.js`, `admin.routes.js`, `auth.routes.js`, plus the
new `announcements.js` helper and `.github/workflows/keep-alive.yml`.

Admin: `App.tsx` (session storage, mobile nav, Activity Log tab),
`ContributionsTracker.tsx` (mark paid/undo), `MemberSlotGrid.tsx` /
`MonthlyDisbursals.tsx` (delete circle/slot/record), `GuarantorPortal.tsx`
(OTP reveal section), `ProfitMatrix.tsx` → Circle Overview, new
`ActivityLog.tsx`.

Client: `App.tsx` — full pass covering session storage, removed
self-report payment UI, circle privacy, wizard reset, ticker speed/TTL,
dark-mode contrast, stale banner, FreeMono status font.

Both frontend apps build clean (`npm run build`); every backend file
passes a syntax check.

## What to re-test

1. Open two tabs, log in as two different members (or two different
   admins) — confirm each tab keeps its own session now.
2. As a member, check your dashboard only shows your own circle number,
   not a roster.
3. On mobile width (or a narrow browser window), open the admin app and
   confirm the hamburger menu works and Monthly Disbursals scrolls
   instead of breaking.
4. Record a payment from Contributions Tracker ("Mark paid" and "Mark
   paid (late)") and confirm it shows correctly and no longer inflates
   the monthly target incorrectly.
5. Delete a circle, a single slot, and a disbursal record — confirm each
   behaves as described and the member's status resets sensibly.
6. Check the Activity Log after logging in/out a couple of times.
7. Try the OTP reveal flow from Guarantor Portal for a test member stuck
   at email verification.
8. Watch the ticker for a bit — confirm messages clear after ~5 minutes
   and the scroll speed feels steady regardless of message count.
9. Toggle dark mode and check the "Welcome, ..." heading and the "Almost
   there" banner are both clearly readable.
10. Log out, click Register — confirm it's a blank form immediately, no
    refresh needed.
