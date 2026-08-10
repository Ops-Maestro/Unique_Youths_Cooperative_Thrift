# Rebuild Progress — Unique Youths Cooperative Thrift

Target spec = the screenshots David provided. Working inside the original
3-folder structure (unique-youths-backend / unique-youths-client / unique-youths-admin).

## ✅ DONE — Chunk 1: Backend

- **Registration → Login flow fixed**
  - `verify-otp` no longer auto-issues a full member session token. It now issues
    a short-lived `registration`-scoped token (new `requireRegistration` middleware)
    that can ONLY be used to call `complete-registration`.
  - `complete-registration` no longer auto-places the member in a circle. It just
    records guarantor info + rules acceptance and sets status to
    `awaiting_guarantor_review`.
  - New `POST /api/auth/login` — member logs in with email OR username + password.
    No OTP required at login (OTP stays only at signup, per David's request — no SMS,
    email OTP only, Render free-tier friendly).

- **Guarantor Portal (backend)** — manual admin review, no SMS/automated signing:
  - `GET /api/admin/guarantors/pending`
  - `POST /api/admin/guarantors/:userId/verify`
  - `POST /api/admin/guarantors/:userId/reject`

- **Member Slot Grid (backend)** — admin manually assigns a verified member to a
  specific numbered slot (matches the "ASSIGN SLOT TO" dropdown in the screenshot):
  - `GET /api/admin/unlocked-members` (guarantor-verified, awaiting a slot)
  - `POST /api/admin/circles/:circleId/assign-slot` `{ userId, numericId }`

- **Cycle lifecycle**
  - `POST /api/admin/circles/start-new-cycle` — manual "Start new cycle" button support.
  - `random-disbursal` now detects when a circle is full (20/20) AND every slot has
    been disbursed → marks it `completed`, stops draws on it, and posts an
    announcement. A brand-new registration will auto-open the next cycle.

- **User model** — new registration status machine:
  `pending_otp → awaiting_guarantor_review → awaiting_slot_assignment → active`
  (or `rejected`), plus `guarantorVerifiedAt/By` and `guarantorRejectionReason`.

- **Circle model** — added `completed` / `completedAt`.

- All backend files pass `node --check` (syntax-verified). Could not run a live
  integration test in this sandbox because outbound network here is locked to
  package registries only — `*.mongodb.net` is not reachable from here. Full
  end-to-end testing needs to happen on your machine (steps included in the final
  delivery message).

## ✅ DONE — Chunk 2: Admin frontend

- **Bug fix (backend, found while wiring this up):** `/api/admin/metrics` was
  mislabeling the ₦1,000 party contribution as "Emergency Insurance Vault" (there is
  no emergency levy anywhere in the real finance rules) and was calculating
  "Net Personal Revenue" as ₦5,000 × every active member every month, when the
  ₦5,000 service fee is only actually deducted from a payout at disbursal time.
  Fixed to: `netPersonalRevenue = disbursedCount × SERVICE_FEE`, plus separate,
  correctly-labeled `owambeFund` (₦1,000 pool) and `globalSavingsPool` (₦10,000 pool)
  totals. Also added `bank` to the `/api/admin/circles` populate so Monthly
  Disbursals can show payout bank details.
- Added `lucide-react` for icons (matches your screenshots).
- Rebuilt `unique-youths-admin/src/App.tsx` as a real shell: royal blue
  (`#173ea5`) sidebar, "Unique Youths / COOPERATIVE THRIFT CLUB" stacked brand
  lockup, footer with live active-member count + "View member dashboard feed" link,
  logout.
- Real tab-based navigation (previously the 3 nav items were static, did nothing
  when clicked) across 6 working pages in `unique-youths-admin/src/pages/`:
  - `ProfitMatrix.tsx` — the corrected metrics above, ₦95,000 payout badge
  - `AjoRecipientDraw.tsx` — per-circle tabs, eligible-pool count, red "Trigger
    Random Selection Roll" button, "Start new cycle" button, recipient cards with
    disbursed status
  - `MemberSlotGrid.tsx` — "Assign slot to" dropdown of guarantor-verified members,
    click an open numbered slot to assign them, locked/disbursed/open legend
  - `MonthlyDisbursals.tsx` — table of every disbursed member across circles with
    bank details
  - `GuarantorPortal.tsx` — pending guarantor queue with Verify / Reject buttons
  - `BroadcastEngine.tsx` — compose + send an announcement, plus history feed
- `npm install` + `npx vite build` both succeed with no errors (verified in this
  sandbox). node_modules/dist removed again before packaging.

## ⏳ NEXT — Chunk 3: Client frontend rebuild

## ✅ DONE — Chunk 3: Client frontend

- **Login flow fixed** (the original ask): after the rules-acceptance step, the
  member now lands on a real "5. Login" step instead of being silently logged in.
  `verify-otp`'s registration-scoped token is used only to submit guarantor info;
  a separate `/api/auth/login` call (email/username + password) is what actually
  starts a session.
- **Fixed the unstyled-button bug**: `.btn` was used everywhere but never defined.
  Added it to `index.css` via `@layer components` — verified in the compiled CSS
  output that it now renders as the intended red/white/rounded button.
- Added holding screens for members who are `awaiting_guarantor_review` or
  `awaiting_slot_assignment` instead of assuming everyone is `active`. A `rejected`
  member sees why, instead of a broken/blank dashboard.
- Full dashboard (contribution cards, Owambe fund progress, ledger, circle
  positions grid) now only renders once a member is actually `active`.
- `npm install` + `npx vite build` succeed with no errors.

## ✅ DONE — Chunk 4: Packaging, docs, security cleanup

- Rewrote the root `README.md` — removed a stale, inaccurate claim about an
  `ADMIN_SIGNUP_KEY` that doesn't exist in this codebase (admin accounts are
  actually auto-created from env vars on server boot). Added:
  - An accurate plain-English description of the real membership flow
    (register → guarantor review → slot assignment → active).
  - A full local POC testing walkthrough (14 concrete steps, end to end,
    covering both apps + backend).
  - Render free-tier deployment steps for all 3 services + MongoDB Atlas +
    Resend + the CORS env-var loop between them.
- Filled in the missing admin-bootstrap keys in
  `unique-youths-backend/.env.example` (they existed in `.env` but not the
  example file).
- **Removed `unique-youths-backend/.env`** (the one with your real, already
  -exposed-in-this-chat MongoDB/JWT/Resend/admin-password secrets) from the final
  package. Recreate it locally from `.env.example` with rotated credentials —
  see the README's "Security notes" section.

## Status: COMPLETE
All requested items from this conversation are addressed. See README.md for
testing + deployment instructions.

## ✅ DONE — Chunk 5: Configurable circle size

- The "Start new cycle" action in Ajo Recipient Draw now takes the slot count as
  an admin-entered number (defaults to whatever the most recent circle used, or
  20 if there's no history yet) instead of always reading a fixed
  `CIRCLE_BASELINE_SIZE` env var.
- Backend `POST /api/admin/circles/start-new-cycle` accepts `{ baselineSize }` in
  the body; falls back to the env var, then the previous cycle's size, then 20,
  if not supplied. Minimum enforced size: 2.
- This means launching with 5–10 real members works correctly out of the box —
  the random-draw button only ever required 2 eligible slots to run, it never
  required the circle to be full. The thing that previously wouldn't have worked
  right was cycle *completion*, which now correctly triggers once every slot in
  whatever size you chose has been disbursed.
- Verified: backend `node --check` passes, admin `npm install` + `vite build`
  both pass with no errors.
