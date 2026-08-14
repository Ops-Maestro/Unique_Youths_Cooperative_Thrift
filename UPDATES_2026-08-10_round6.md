# Updates — round 6

## SMS OTP (Option 2: alternative alongside email, not a replacement)
- User model: `preferredOtpChannel` ("email" default | "sms", chosen once at registration).
- OTP model: `channel` field per code.
- New `src/config/sms.js` — Termii client (POST /api/sms/send, "dnd" channel for transactional OTP), built against Termii's real current API docs.
- New `src/utils/phone.js` — normalizes any local/international Nigerian phone format to what Termii needs. Tested against 5 common input formats, all correct.
- `register` accepts `otpChannel`; `sendOtp`/`resend-otp` dispatch to email or SMS automatically based on the member's saved choice - never asked twice.
- Env: `TERMII_API_KEY` / `TERMII_SENDER_ID` added to `.env.example`.
- Client: registration step 1 now has an Email/SMS toggle ("Email (free)" vs "SMS to my phone"), OTP step title/copy adapts to the chosen channel.
- Real cost note (already discussed): email stays free via Resend; SMS costs money per message via Termii - this is why it's opt-in, not default.

## Bug found and fixed while in this code
- Admin's "reveal OTP" button (Guarantor Portal) was calling a route that only existed as a comment - never actually implemented, so it 404'd. Implemented it properly, now channel-aware (SMS or email) too.

## Mobile app install card
- Removed the "×" dismiss button entirely, per request - it's now permanently visible until the app is actually installed (that detection is legitimate and stays), not just closed once.

## Verified
- Backend: `node --check` on every changed file + a live module-import smoke test (no circular imports/wiring errors).
- Client: `npm install && vite build` passes clean.
- Phone normalizer tested directly against 5 real input formats.

## Not touched / flagged, not fixed
- ~~This zip (built outside this conversation) re-added the Profile page (avatar/DOB) that was explicitly removed in round 4's traditional-ajo simplification.~~ **RESOLVED: David confirmed both the Profile page and the Android APK should stay in the app going forward. No code change needed — already present, now intentional rather than flagged.**
- A pre-existing (unrelated to this round's changes) TS strict-mode nit in the reintroduced Profile page code (`React.ChangeEvent` namespace) - doesn't block the actual Vite build, only shows under a stricter standalone tsc check.
