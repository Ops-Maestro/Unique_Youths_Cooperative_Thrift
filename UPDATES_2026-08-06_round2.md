# Updates — 6 Aug 2026 (round 2)

Built on top of the previous fixes — nothing from that round was touched or
undone. Both `unique-youths-client` and `unique-youths-admin` rebuild clean
(`npm run build`) after these changes.

## 1. Member Profile page

- A **Profile** button now appears in the client dashboard header (shown as
  a small circular avatar/initial next to "Profile"/"Dashboard") — but only
  once a member's guarantor has actually been verified by an admin
  (`awaiting_slot_assignment` or `active` status). Members still waiting on
  guarantor review don't see it yet, since there's nothing to place a photo
  against until an admin has looked at them.
- On the Profile page:
  - **Photo upload** — "Choose photo" opens the file picker, the image is
    automatically resized/compressed in the browser (max 320px, JPEG) before
    it's saved, so it stays small even on a free-tier database.
  - A **table of read-only rows** showing: Full name, Residential address,
    Phone number, Circle number (their actual assigned slot + circle name/
    cycle, or "Not yet assigned"), and Date of birth (day + month only — no
    year, as requested).
  - A small form below to **set day/month of birth** (day as a number 1–31,
    month as a dropdown) with a Save button.
- Backend: `PUT /api/member/profile` validates and stores the avatar
  (rejects anything that isn't image data or is too large — a friendly
  error, not a silent failure) and the day/month of birth.

## 2. Automatic welcome + "finish your profile" messages

The moment a member finishes the registration wizard (guarantor + rules
step), two **private** announcements are created for that member only —
nobody else sees them:
1. `Welcome, {FirstName}, to Unique Youths Cooperative Thrift Club! We're
   glad to have you.`
2. `Finish setting up your profile: open the Profile tab on your dashboard
   to upload a photo and add your date of birth.`

Then, the first time they actually finish their profile (photo + day +
month all saved), a third private message fires automatically:
`{FirstName}, your profile is now fully set up. Thanks for keeping your
details current!`

These show up in the same scrolling ticker/announcement feed members already
had — no new UI needed there, just new message content targeted at the
right person.

## 3. Broadcast Engine: delete + confirmed all-member visibility

- Every announcement card in the admin Broadcast Engine now has a **delete
  (trash) button**. Deleting removes it from the database entirely, so it
  also disappears from members' feeds/tickers.
- Investigated your "not everyone sees broadcasts" concern: broadcasts sent
  from the Broadcast Engine were already being stored with no circle
  attached, and the member-side query already treated "no circle" as
  visible to everyone — that part was already working correctly. What
  wasn't working was that a private, single-member announcement (like the
  new welcome message) would previously have leaked to *every* member,
  because both cases were stored the same way. I separated the two: private
  (`user` set) vs broadcast (`user` empty, optionally `circle`-scoped), and
  fixed the member-side query to only match the right one. So now:
  - **General update / Payment received / Payment missed sent from the
    Broadcast Engine** → still visible to all members, confirmed.
  - **Welcome / profile-completion messages** → private to that one member,
    and don't leak into everyone else's feed.
  - The admin list itself now also labels each card so you can tell at a
    glance: "Private to {name}", "{Circle name} · Cycle N", or "All
    members".

## Files touched

- `unique-youths-backend/src/models/User.js` — avatar, DOB day/month,
  profile-completed timestamp.
- `unique-youths-backend/src/models/Announcement.js` — new optional `user`
  field for private, single-member notices.
- `unique-youths-backend/src/routes/member.routes.js` — welcome/profile
  announcements on registration completion, `PUT /api/member/profile`,
  corrected announcement visibility query.
- `unique-youths-backend/src/routes/admin.routes.js` — `DELETE
  /api/admin/announcements/:id`, populate the new `user` field for display.
- `unique-youths-admin/src/pages/BroadcastEngine.tsx` — delete button,
  recipient labels.
- `unique-youths-client/src/App.tsx` — Profile tab/page, avatar upload +
  resize, DOB form, profile table.

## What to re-test

1. Register a fresh test member all the way through → check their feed
   shows the two welcome/profile messages once they can log in
   (`awaiting_guarantor_review` state — they should already be there).
2. Verify their guarantor in the Guarantor Portal → log them back in →
   the Profile button should now appear in the header.
3. Open Profile, upload a photo, set day/month, Save → confirm the table
   updates and a "profile is now fully set up" message appears in their
   feed.
4. Assign them a slot in Member Slot Grid → back on Profile, "Circle
   number" should now show their real slot instead of "Not yet assigned".
5. Send a broadcast from the admin Broadcast Engine → confirm it shows up
   for this member (and any other member) within ~8 seconds, then delete it
   from the admin side and confirm it disappears from the member's feed on
   the next refresh.
