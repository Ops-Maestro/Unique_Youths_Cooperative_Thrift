import express from "express";
import User from "../models/User.js";
import Circle from "../models/Circle.js";
import Ledger from "../models/Ledger.js";
import LateFee from "../models/LateFee.js";
import Announcement from "../models/Announcement.js";
import { requireMember, requireRegistration } from "../middleware/auth.js";
import { withExpiry } from "../utils/announcements.js";
import {
  MONTHLY_CONTRIBUTION,
  SAVINGS_AMOUNT,
  PARTY_AMOUNT,
  GROSS_PAYOUT,
  SERVICE_FEE,
  NET_PAYOUT,
  LATE_PENALTY
} from "../utils/finance.js";

const router = express.Router();

/* ============================================================
 * Make sure there is always an open (active, not-completed, not-full)
 * circle for an admin to assign new members into. Without this, the
 * Member Slot Grid has nothing to show until an admin remembers to
 * click "Start new cycle" on the Ajo Recipient Draw page first.
 * ============================================================ */
async function ensureOpenCircle() {
  const openCircle = await Circle.findOne({ active: true, completed: false })
    .sort({ cycleNumber: -1 });

  if (openCircle && openCircle.members.length < openCircle.baselineSize) {
    return openCircle;
  }

  const last = await Circle.findOne().sort({ cycleNumber: -1 });
  const baselineSize = Number(process.env.CIRCLE_BASELINE_SIZE) || last?.baselineSize || 20;

  return Circle.create({
    name: "Unique Youth Circle",
    cycleNumber: (last?.cycleNumber || 0) + 1,
    baselineSize
  });
}

/* ============================================================
 * COMPLETE REGISTRATION - step 3
 * Submits guarantor details + rules acceptance.
 * Uses the short-lived "registration" token from verify-otp.
 * Does NOT place the member in a circle - an admin verifies the
 * guarantor first, then assigns a slot via the Member Slot Grid.
 * ============================================================ */
router.post("/complete-registration", requireRegistration, async (req, res) => {
  const { guarantorName, guarantorPhone, rulesAccepted } = req.body;

  if (!guarantorName || !guarantorPhone || rulesAccepted !== true) {
    return res.status(400).json({ message: "Guarantor and rules agreement are required" });
  }

  const user = await User.findById(req.auth.userId);

  if (!user || !user.emailVerifiedAt) {
    return res.status(400).json({ message: "Email verification is required first" });
  }

  if (user.registrationStatus !== "pending_otp" && user.registrationStatus !== "awaiting_guarantor_review") {
    return res.status(409).json({ message: "Registration has already been completed" });
  }

  user.guarantorName = guarantorName;
  user.guarantorPhone = guarantorPhone;
  user.rulesAcceptedAt = new Date();
  user.registrationStatus = "awaiting_guarantor_review";

  await user.save();

  // Guarantee there's an open circle with a free slot waiting, so an admin
  // can immediately place this member once the guarantor is verified.
  await ensureOpenCircle();

  // Two private, member-only welcome notices - only this member sees them,
  // shown in their announcement feed the moment they can first log in.
  // These clear themselves out automatically after 5 minutes, so the ticker
  // always shows what's recent.
  await Announcement.create([
    withExpiry({
      type: "general_update",
      description: `Welcome, ${user.firstName}, to Unique Youth Cooperative Thrift! We're glad to have you.`,
      user: user._id
    }, 5),
    withExpiry({
      type: "general_update",
      description: "Finish setting up your profile: open the Profile tab on your dashboard to upload a photo and add your date of birth.",
      user: user._id
    }, 5)
  ]);

  // Let everyone already on the platform know a new member joined - also
  // clears itself out automatically after 5 minutes.
  await Announcement.create(withExpiry({
    type: "general_update",
    description: `${user.firstName} ${user.lastName} just joined Unique Youth Cooperative Thrift — please welcome them!`
  }, 5));

  return res.json({
    message: "Registration submitted. An administrator will verify your guarantor shortly, after which you can log in.",
    registrationStatus: user.registrationStatus
  });
});

/* ============================================================
 * MEMBER DASHBOARD DATA
 * ============================================================ */
router.get("/me", requireMember, async (req, res) => {
  const user = await User.findById(req.auth.userId).select("-password");

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const circle = await Circle.findOne({ "members.user": user._id });

  const ledgers = await Ledger.find({ user: user._id }).sort({ monthIndex: -1 }).limit(12);
  // "Live feed" progress for the current calendar month: how much of the
  // whole circle's ₦11,000-per-member target has actually come in so far,
  // so members can see the target rise in real time as people pay.
  let monthProgress = null;
  if (circle) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const paidThisMonth = await Ledger.find({
      circle: circle._id,
      isPaid: true,
      paidAt: { $gte: startOfMonth }
    });

    const memberCount = circle.members.length;
    const target = memberCount * MONTHLY_CONTRIBUTION;
    const collected = paidThisMonth.reduce((sum, l) => sum + l.savingsAmount + l.partyAmount, 0);
    const paidCount = new Set(paidThisMonth.map(l => String(l.user))).size;

    monthProgress = {
      memberCount,
      paidCount,
      target,
      collected,
      percentage: target ? Math.min(100, Math.round((collected / target) * 100)) : 0,
      met: paidCount >= memberCount && memberCount > 0
    };
  }

  // Their own most recent late fee, if any - a separate transaction from
  // the monthly contribution above, shown as its own card on the dashboard.
  const lateFeeDoc = await LateFee.findOne({ user: user._id, status: { $ne: "waived" } }).sort({ createdAt: -1 });
  const lateFee = lateFeeDoc ? { amount: lateFeeDoc.amount, status: lateFeeDoc.status, imposedAt: lateFeeDoc.createdAt, paidAt: lateFeeDoc.paidAt } : null;

  res.json({
    user,
    // Never expose the roster: a member only ever sees their own slot
    // number plus how full the circle is overall, not who else is in it
    // or which numbers they hold.
    circle: circle ? {
      _id: circle._id,
      name: circle.name,
      cycleNumber: circle.cycleNumber,
      baselineSize: circle.baselineSize,
      size: circle.members.length,
      slotsRemaining: Math.max(0, circle.baselineSize - circle.members.length),
      active: circle.active,
      completed: circle.completed,
      myNumber: circle.members.find(m => String(m.user) === String(user._id))?.numericId || null,
      myDisbursed: circle.members.find(m => String(m.user) === String(user._id))?.disbursed || false
    } : null,
    ledgers,
    monthProgress,
    lateFee,
    finance: {
      monthlyContribution: MONTHLY_CONTRIBUTION,
      savings: SAVINGS_AMOUNT,
      party: PARTY_AMOUNT,
      grossPayout: GROSS_PAYOUT,
      serviceFee: SERVICE_FEE,
      netPayout: NET_PAYOUT,
      latePenalty: LATE_PENALTY
    }
  });
});

router.get("/announcements", requireMember, async (req, res) => {
  const circle = await Circle.findOne({ "members.user": req.auth.userId });

  const items = await Announcement.find({
    $or: [
      // Private notices meant only for this member (e.g. their welcome message).
      { user: req.auth.userId },
      // Broadcasts sent to every member.
      { user: null, circle: null },
      // Broadcasts scoped to this member's own circle.
      { user: null, circle: circle?._id }
    ]
  }).sort({ createdAt: -1 }).limit(40);

  res.json(items);
});

/* ============================================================
 * PROFILE - avatar + date of birth (day/month only).
 * Everything else on the profile (name, phone, address, circle slot)
 * already exists on the user/circle from registration and is read-only
 * here; this endpoint only updates the extras the member fills in later.
 * ============================================================ */
router.put("/profile", requireMember, async (req, res) => {
  const user = await User.findById(req.auth.userId);
  if (!user) return res.status(404).json({ message: "User not found" });

  const { avatarDataUrl, dateOfBirthDay, dateOfBirthMonth } = req.body;

  if (avatarDataUrl !== undefined) {
    if (avatarDataUrl === null || avatarDataUrl === "") {
      user.avatarDataUrl = undefined;
    } else {
      if (typeof avatarDataUrl !== "string" || !avatarDataUrl.startsWith("data:image/")) {
        return res.status(400).json({ message: "Invalid image data." });
      }
      // Roughly 400KB of base64 text - plenty for a small resized avatar,
      // small enough to keep the user document lightweight on the free tier.
      if (avatarDataUrl.length > 400000) {
        return res.status(400).json({ message: "That photo is too large. Please choose a smaller image." });
      }
      user.avatarDataUrl = avatarDataUrl;
    }
  }

  if (dateOfBirthDay !== undefined || dateOfBirthMonth !== undefined) {
    const day = Number(dateOfBirthDay);
    const month = Number(dateOfBirthMonth);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      return res.status(400).json({ message: "Day of birth must be between 1 and 31." });
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ message: "Month of birth must be between 1 and 12." });
    }
    user.dateOfBirthDay = day;
    user.dateOfBirthMonth = month;
  }

  const wasComplete = !!user.profileCompletedAt;
  const isNowComplete = !!user.avatarDataUrl && !!user.dateOfBirthDay && !!user.dateOfBirthMonth;
  if (!wasComplete && isNowComplete) {
    user.profileCompletedAt = new Date();
  }

  await user.save();

  if (!wasComplete && isNowComplete) {
    await Announcement.create(withExpiry({
      type: "general_update",
      description: `${user.firstName}, your profile is now fully set up. Thanks for keeping your details current!`,
      user: user._id
    }, 5));
  }

  const clean = await User.findById(user._id).select("-password");
  res.json({ message: "Profile updated", user: clean, justCompleted: !wasComplete && isNowComplete });
});

// Payments are never recorded by the member themselves - money moves off
// -platform (bank transfer to the admin, proof shared in the WhatsApp
// community), so only an admin can mark a contribution as received. See
// POST /api/admin/payments. This avoids members creating confusing/
// incorrect ledger entries (e.g. typing an amount into a month field).

router.get("/constants", requireMember, (_req, res) => {
  res.json({
    MONTHLY_CONTRIBUTION,
    SAVINGS_AMOUNT,
    PARTY_AMOUNT,
    GROSS_PAYOUT,
    SERVICE_FEE,
    NET_PAYOUT,
    LATE_PENALTY,
    DEADLINE_DAY: 5
  });
});

export default router;
