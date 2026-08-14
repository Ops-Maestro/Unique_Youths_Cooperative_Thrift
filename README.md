# Unique Youths Cooperative Thrift Club — Version 1.1.0

## 📖 Description

### Ajo Thrift Club
A full-stack web application for running a traditional Nigerian Ajo
(rotating savings) circle online. Members register, get verified by an
admin, and contribute a fixed monthly amount; the admin records monthly contributions confirmed via WhatsApp payment proof, and two members are randomly selected each month to receive a lump-sum payout. The circle runs until the last member has been paid out.

Payments happen off-platform (bank transfer, proof shared in a WhatsApp
community) and are confirmed by an admin — the app's job is to be the
transparent, always-current record of who's paid, who's been paid out,
and how the circle is doing, not to process money itself.

This is built for one community's internal use, not as a public product —
payments happen by bank transfer outside the app; the app's job is to track who
has paid, who's owed a turn, and who's been paid already, transparently.

## 🚀 Tech Stack

### Frontend — Member app (`unique-youths-client`)
- React 18 — UI framework
- Vite — build tool and dev server
- Tailwind CSS — styling, with a class-based light/dark/system theme toggle
- Capacitor — wraps the deployed web app into an installable Android APK
- PWA (manifest + service worker) — installable on both Android and iPhone via "Add to Home Screen"

### Frontend — Admin dashboard (`unique-youths-admin`)
- React 18 — UI framework
- Vite — build tool and dev server
- Tailwind CSS — styling, with the same light/dark/system theme toggle
- lucide-react — icon set

### Backend (`unique-youths-backend`)
- Node.js + Express — REST API
- MongoDB + Mongoose — database and schema modeling
- JSON Web Tokens (jsonwebtoken) — member and admin authentication
- bcryptjs — password hashing
- Resend — transactional email (OTP verification codes)
- MongoDB TTL indexes — automatic cleanup of short-lived system announcements

## 📦 Project Structure

This is a monorepo with three independent apps, each deployed separately:

```
unique-youths-backend/    Express API + MongoDB models
unique-youths-client/     Member-facing registration, login, and dashboard
unique-youths-admin/      Admin dashboard for running the circle
.github/workflows/        CI/CD — keep-alive ping + Android APK build
```

## 🏗️ Architecture

```text
Unique_Youth_Cooperative_Thrift/
├── unique-youths-backend/
│   ├── server.js
│   └── src/
│       ├── config/       (db.js, email.js)
│       ├── middleware/   (auth.js - requireMember/requireAdmin/requireRegistration)
│       ├── models/       (User, Circle, Ledger, Announcement, Admin, AdminActivity, OTP)
│       ├── routes/       (auth.routes.js, member.routes.js, admin.routes.js)
│       └── utils/        (finance.js, otp.js, announcements.js, keepAlive.js)
├── unique-youths-client/
│   └── src/ (App.tsx, components/Logo.tsx, lib/api.ts)
└── unique-youths-admin/
    └── src/ (App.tsx, components/, pages/ - one file per admin section)
```

See `DEPLOYMENT_RUNBOOK.md` for the full step-by-step deployment guide
(MongoDB Atlas, Render, Resend, GitHub Actions), and `QUICK_REFERENCE.md`
for a fast lookup once you've deployed once already.

### 🔐 Authentication flow

**Member registration → login**
1. `POST /api/auth/register` - creates the account, sends an email OTP
2. `POST /api/auth/verify-otp` - confirms the OTP, issues a short-lived
   `registration`-scoped token (cannot access the dashboard, only the next step)
3. `POST /api/member/complete-registration` - submits guarantor + rules
   acceptance using that token; account is now `awaiting_guarantor_review`
4. Admin verifies the guarantor (`awaiting_slot_assignment`), then assigns a
   circle slot (`active`)
5. `POST /api/auth/login` - email or username + password, any time after
   step 1. A member not yet `active` sees a plain status screen instead of
   the full dashboard, not an error.

**Admin login**
- `POST /api/auth/admin/login` - only the two accounts configured via
  environment variables at server boot can ever log in; every login/logout
  is written to the activity log

**Session storage** - both frontends use `sessionStorage`, not
`localStorage`, for the auth token. This is deliberate: it means two browser
tabs can be logged in as two different people at once, instead of one tab's
login silently overwriting the other's.

## 🗄️ Database schema (Mongoose models)

**User**
```js
{
  firstName, lastName, username, email, password (hashed), primaryPhone,
  residentialAddress, bank: { bankName, accountNumber, accountName },
  registrationStatus: "pending_otp" | "awaiting_guarantor_review" |
                       "awaiting_slot_assignment" | "active" | "rejected",
  emailVerifiedAt, rulesAcceptedAt,
  guarantorName, guarantorPhone, guarantorVerifiedAt, guarantorVerifiedBy,
  guarantorRejectionReason
}
```

**Circle**
```js
{
  name, cycleNumber, baselineSize,
  members: [{ user, numericId, drawExcluded, disbursed, disbursedAt }],
  active, completed, completedAt
}
```

**Ledger** (one confirmed payment per member per calendar month)
```js
{ user, circle, monthIndex, savingsAmount, partyAmount, serviceFee,
  latePenalty, isPaid, paymentReference, paidAt }
```

**Announcement**
```js
{ type, description, circle, user, createdBy, expiresAt }
// expiresAt is a MongoDB TTL index - system notices clear themselves out
// automatically; admin broadcasts (no expiresAt) stay until deleted
```

**Admin** — `{ username, email, password (hashed), role, isActive }`
**AdminActivity** — `{ admin, action: "login"|"logout", at }`
**OTP** — `{ user, email, otpHash, expiresAt, verified, attempts }`
(the plaintext code is never stored, only a one-way hash)

## 💰 The money rules (`src/utils/finance.js`)

- Monthly contribution: **₦11,000** = ₦10,000 savings + ₦1,000 Owambe/party fund
- Deadline: the 5th of each month. Late = flat **₦4,000** fine, computed from
  the payment date automatically, never entered manually
- Payout: **₦100,000 gross − ₦5,000 service fee = ₦95,000 net** to the member,
  taken only at the moment of disbursal, not monthly

## 🌐 API endpoints

**Public**
- `GET /health`
- `POST /api/auth/register`, `/verify-otp`, `/resend-otp`, `/login`
- `POST /api/auth/admin/login`

**Member (requires member JWT)**
- `GET /api/member/me` - dashboard data (own circle slot, ledger, live
  contribution progress)
- `GET /api/member/announcements`
- `GET /api/member/constants`
- `POST /api/member/complete-registration` (requires the `registration` token
  instead, not a full member session)

**Admin (requires admin JWT)**
- `GET /api/admin/metrics`, `/contributions`, `/circles`, `/activity`
- `GET /api/admin/unlocked-members`, `/guarantors/pending`, `/members/pending-otp`
- `POST /api/admin/circles/start-new-cycle`
- `POST /api/admin/circles/:circleId/assign-slot`
- `POST /api/admin/circles/:circleId/random-disbursal`
- `POST /api/admin/circles/:circleId/members/:numericId/mark-paid`
- `DELETE /api/admin/circles/:circleId/members/:numericId/disbursement` (undo)
- `DELETE /api/admin/circles/:circleId` (deletes the circle + its ledger entries)
- `DELETE /api/admin/ledger/:id` (undo a payment record)
- `POST /api/admin/guarantors/:userId/verify`, `/reject`
- `POST /api/admin/members/:userId/issue-otp`
- `POST /api/auth/admin/logout`
- `GET /api/admin/announcements`, `POST /api/admin/announcements`,
  `DELETE /api/admin/announcements/:id`

## ✨ Core features

- **Guided registration**: personal details → bank details → email OTP
  verification → digital guarantor nomination → rules acceptance, with
  back/forward navigation at every step.
- **Admin-verified onboarding**: an admin manually verifies each member's
  guarantor before they're placed into a circle slot.
- **Traditional Ajo math**: 20 members per circle, 2 recipients drawn at
  random each month, ₦11,000 monthly contribution (₦10,000 into the pot +
  ₦1,000 into a party/Owambe fund), a flat late-payment fine, and a
  disclosed service fee on payout — all spelled out in the Rules step
  members explicitly accept.
- **Admin-confirmed payments**: since money moves off-platform, only an
  admin can mark a contribution as received — never self-reported by a
  member — keeping one single source of truth.
- **Live transparency**: every member sees the circle's real-time monthly
  contribution progress (collected vs. target, how many have paid) without
  seeing other members' individual identities or payment status.
- **Member profile**: photo upload, date of birth, and read-only details
  synced from registration.
- **Broadcast Engine**: admin-authored announcements to all members, plus
  automatic system messages (welcome, "member just joined," profile
  reminders) that clear themselves out after a few minutes.
- **Contributions Tracker**: color-coded per-member payment status (on
  time, late, unpaid) with live progress bars per circle.
- **Real-time presence**: admin can see which members are online right
  now, plus a full login/logout activity log for both members and admins.
- **Light / dark / system theme**, installable as a mobile app on both
  Android (APK, built via GitHub Actions) and iPhone (PWA install).

## 🔒 Security notes

- Passwords are hashed with bcrypt; OTPs are stored hashed, never in
  plaintext (an admin can generate and read out a fresh one if a member
  never receives the email, but the original code is never recoverable).
- Session tokens are stored per-browser-tab (`sessionStorage`), so two
  members — or two admins — can stay logged in separately in different
  tabs of the same browser.
- No payment processing happens in this app. It never stores card or bank
  transfer credentials — only confirms, on an admin's word, that a
  contribution arrived.

## 🛠 Getting started (local development)

Each app has its own `.env.example` — copy it to `.env` and fill in real
values (MongoDB connection string, JWT secret, Resend API key, etc.).

```bash
# Backend
cd unique-youths-backend
npm install
npm run dev

# Member app
cd unique-youths-client
npm install
npm run dev

# Admin app
cd unique-youths-admin
npm install
npm run dev
```

For a full production deployment (Render + MongoDB Atlas + Resend + GitHub
Actions for the Android build), follow `DEPLOYMENT_RUNBOOK.md` from the
top — it's written to be followed in order from a completely blank slate.

## 📄 License

Private - for Unique Youths Cooperative Thrift Club's internal community use
only. Not licensed for public redistribution.
