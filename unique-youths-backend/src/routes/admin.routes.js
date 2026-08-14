import express from "express";
import User from "../models/User.js";
import Ledger from "../models/Ledger.js";
import LateFee from "../models/LateFee.js";
import Circle from "../models/Circle.js";
import Announcement from "../models/Announcement.js";
import AdminActivity from "../models/AdminActivity.js";
import MemberActivity from "../models/MemberActivity.js";
import OTP from "../models/OTP.js";
import { requireAdmin } from "../middleware/auth.js";
import {
  MONTHLY_CONTRIBUTION,
  LATE_PENALTY,
  SAVINGS_AMOUNT,
  PARTY_AMOUNT,
  latePenaltyFor
} from "../utils/finance.js";
import { generateOtp, hashOtp } from "../utils/otp.js";
import { sendOtpEmail, sendBackupEmail } from "../config/email.js";
import { runBackup } from "../utils/backup.js";
import { sendOtpSms } from "../config/sms.js";
import { toCsv } from "../utils/csv.js";

const router = express.Router();

// Online status is session-based (see User.isOnline) - true from login
// until explicit logout, not a time-window guess off lastSeenAt.

/* ============================================================
 * MEMBERS ROSTER - full list with live online/offline status, for the
 * admin Members page. Distinct from Circle Overview's "active members"
 * (which specifically means "fully onboarded and drawing a savings
 * mandate" for the financial math) - this is just "everyone who has
 * registered," which stays a meaningful number even right after a circle
 * gets deleted and members fall back to awaiting slot assignment.
 * ============================================================ */
router.get("/members", requireAdmin, async (_req, res) => {
  const users = await User.find({ registrationStatus: { $ne: "rejected" } })
    .select(
      "firstName lastName username email registrationStatus avatarDataUrl lastSeenAt isOnline createdAt"
    )
    .sort({ firstName: 1 });

  const withPresence = users.map(u => ({
    ...u.toObject(),
    online: !!u.isOnline
  }));

  res.json(withPresence);
});

// Lightweight summary for the sidebar - polled frequently on its own,
// separate from the manual "Refresh" button, so the online count is
// genuinely real-time rather than only updating when someone clicks refresh.
router.get("/presence-summary", requireAdmin, async (_req, res) => {
  const [totalMembers, onlineNow] = await Promise.all([
    User.countDocuments({ registrationStatus: { $ne: "rejected" } }),
    User.countDocuments({ isOnline: true })
  ]);

  res.json({ totalMembers, onlineNow });
});

/* ============================================================
 * MEMBER ACTIVITY LOG - who logged in/out, and when. Same idea as the
 * admin activity log, for the member side.
 * ============================================================ */
router.get("/member-activity", requireAdmin, async (_req, res) => {
  const items = await MemberActivity.find()
    .sort({ createdAt: -1 })
    .limit(150);

  res.json(items);
});

/* ============================================================
 * ADMIN ACTIVITY LOG
 * Who logged in/out, and when (down to the second). Visible to any
 * logged-in admin so it's clear who else is currently active.
 * ============================================================ */
router.get("/activity", requireAdmin, async (_req, res) => {
  const items = await AdminActivity.find()
    .sort({ createdAt: -1 })
    .limit(100);

  res.json(items);
});

/* ============================================================
 * ADMIN OTP BACKDOOR
 * If a member says they never received their OTP email, an admin can
 * generate a fresh one here and read it back to them directly (call,
 * WhatsApp, in person) instead of relying on email deliverability.
 * OTPs are normally only ever stored hashed - this is the one place the
 * plaintext code is ever exposed, and only to an authenticated admin.
 * ============================================================ */
router.post("/members/:userId/reveal-otp", requireAdmin, async (req, res) => {
  const user = await User.findById(req.params.userId);

  if (!user) {
    return res.status(404).json({ message: "Member not found" });
  }

  if (user.emailVerifiedAt) {
    return res.status(400).json({
      message: "This member's email is already verified"
    });
  }

  const channel = user.preferredOtpChannel === "sms" ? "sms" : "email";
  const otp = generateOtp();
  const expiresAt = new Date(
    Date.now() +
      Number(process.env.OTP_EXPIRES_MINUTES || 10) * 60 * 1000
  );

  await OTP.create({
    user: user._id,
    email: user.email,
    channel,
    otpHash: hashOtp(otp),
    expiresAt
  });

  // Best-effort - still return the code even if delivery fails, since
  // delivery failing is exactly the scenario this endpoint is for.
  let delivered = true;

  try {
    if (channel === "sms") {
      await sendOtpSms({
        to: user.primaryPhone,
        otp
      });
    } else {
      await sendOtpEmail({
        to: user.email,
        otp
      });
    }
  } catch {
    delivered = false;
  }

  await AdminActivity.create({
    admin: req.auth.adminId,
    action: "otp_resend",
    detail: `Generated a fresh ${channel.toUpperCase()} OTP for ${
      user.firstName
    } ${user.lastName} (${
      channel === "sms" ? user.primaryPhone : user.email
    })`
  });

  res.json({
    message: delivered
      ? `A new OTP was generated and sent by ${
          channel === "sms" ? "SMS" : "email"
        }. You can also read it out below if it doesn't arrive.`
      : `A new OTP was generated, but ${
          channel === "sms" ? "the SMS" : "the email"
        } failed to send - read it out to the member directly.`,
    otp,
    expiresAt,
    channel
  });
});

/* ============================================================
 * PAYMENTS - an admin confirms a contribution once they've checked the
 * proof-of-payment shared in the WhatsApp community. Members never create
 * their own ledger entries (see member.routes.js for why).
 * ============================================================ */
router.post("/payments", requireAdmin, async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({
      message: "userId is required"
    });
  }

  const user = await User.findById(userId);

  if (!user) {
    return res.status(404).json({
      message: "Member not found"
    });
  }

  const circle = await Circle.findOne({
    "members.user": userId
  });

  if (!circle) {
    return res.status(400).json({
      message:
        "This member has not been assigned a circle slot yet"
    });
  }

  const paidAt = new Date();

  const monthIndex =
    (await Ledger.countDocuments({
      user: userId,
      circle: circle._id
    })) + 1;

  // A late fee is now a completely separate transaction (see the
  // /late-fees routes below) - imposed by the admin on their own schedule,
  // paid on its own schedule, never auto-attached to the monthly
  // contribution record itself.
  const ledger = await Ledger.create({
    user: userId,
    circle: circle._id,
    monthIndex,
    savingsAmount: SAVINGS_AMOUNT,
    partyAmount: PARTY_AMOUNT,
    latePenalty: 0,
    isPaid: true,
    confirmedBy: req.auth.adminId,
    paymentReference:
      req.body.paymentReference || `PAY-${Date.now()}`,
    paidAt
  });

  await Announcement.create({
    type: "payment_received",
    description: `${user.firstName}'s monthly contribution was confirmed.`,
    circle: circle._id
  });

  res.status(201).json({
    message: "Payment recorded",
    ledger
  });
});

/* ============================================================
 * UNDO / REVERSE MONTHLY PAYMENT
 *
 * The financial Ledger record is deleted so contribution totals,
 * circle totals, member payment status, and member progress all
 * recalculate from the remaining records.
 *
 * The original payment_received announcement is intentionally kept.
 * A new reversal announcement is created so the history tells the
 * complete story instead of silently erasing the original action.
 * ============================================================ */
router.delete("/payments/:id", requireAdmin, async (req, res) => {
  const item = await Ledger.findById(req.params.id);

  if (!item) {
    return res.status(404).json({
      message: "Payment record not found"
    });
  }

  const user = await User.findById(item.user);

  const paymentAmount =
    Number(item.savingsAmount || 0) +
    Number(item.partyAmount || 0);

  const memberName = user
    ? `${user.firstName} ${user.lastName}`.trim()
    : "A member";

  // Remove the financial record.
  await Ledger.findByIdAndDelete(item._id);

  // Preserve the original confirmation announcement and add a separate
  // reversal event so the audit/history remains understandable.
  await Announcement.create({
    type: "general_update",
    description:
      `${memberName}'s ₦${paymentAmount.toLocaleString()} monthly contribution ` +
      `confirmation was reversed by an administrator.`,
    circle: item.circle
  });

  // Record the administrative action separately.
  await AdminActivity.create({
    admin: req.auth.adminId,
    action: "payment_reversed",
    detail:
      `${memberName}'s ₦${paymentAmount.toLocaleString()} monthly contribution ` +
      `payment was reversed and its ledger record deleted.`
  });

  res.json({
    message:
      "Payment reversed. The original payment notice has been preserved in the audit history."
  });
});

/* ============================================================
 * LATE FEES - completely separate from the monthly contribution above.
 * The admin decides when to impose one (not an automatic date check) and
 * a member pays it as its own transaction, whenever that happens.
 * ============================================================ */
router.post("/late-fees", requireAdmin, async (req, res) => {
  const { userId, amount, reason } = req.body;

  if (!userId) {
    return res.status(400).json({
      message: "userId is required"
    });
  }

  const user = await User.findById(userId);

  if (!user) {
    return res.status(404).json({
      message: "Member not found"
    });
  }

  const circle = await Circle.findOne({
    "members.user": userId
  });

  if (!circle) {
    return res.status(400).json({
      message:
        "This member has not been assigned a circle slot yet"
    });
  }

  const monthIndex =
    (await Ledger.countDocuments({
      user: userId,
      circle: circle._id
    })) + 1;

  const existing = await LateFee.findOne({
    user: userId,
    circle: circle._id,
    monthIndex,
    status: "owed"
  });

  if (existing) {
    return res.status(409).json({
      message:
        "This member already has an outstanding late fee for this month"
    });
  }

  const fee = await LateFee.create({
    user: userId,
    circle: circle._id,
    monthIndex,
    amount: amount || LATE_PENALTY,
    reason,
    imposedBy: req.auth.adminId
  });

  await Announcement.create({
    type: "payment_missed",
    description:
      `${user.firstName} was issued a ₦${fee.amount.toLocaleString()} late fee.`,
    circle: circle._id
  });

  res.status(201).json({
    message: "Late fee imposed",
    lateFee: fee
  });
});

/* ============================================================
 * MARK LATE FEE PAID
 * ============================================================ */
router.post("/late-fees/:id/mark-paid", requireAdmin, async (req, res) => {
  const fee = await LateFee.findById(req.params.id);

  if (!fee) {
    return res.status(404).json({
      message: "Late fee not found"
    });
  }

  if (fee.status === "paid") {
    return res.status(409).json({
      message:
        "This late fee is already marked paid"
    });
  }

  fee.status = "paid";
  fee.paidAt = new Date();
  fee.confirmedBy = req.auth.adminId;

  await fee.save();

  const user = await User.findById(fee.user);

  await Announcement.create({
    type: "payment_received",
    description:
      `${user?.firstName || "A member"}'s ₦${fee.amount.toLocaleString()} late fee was paid.`,
    circle: fee.circle
  });

  res.json({
    message: "Late fee marked as paid",
    lateFee: fee
  });
});

/* ============================================================
 * UNDO / REMOVE LATE FEE
 *
 * If the fee is still owed:
 *   → it is treated as removed/waived.
 *
 * If the fee was already paid:
 *   → it is treated as a payment reversal.
 *
 * In both cases the original announcement remains untouched.
 * A new announcement and AdminActivity record explain what happened.
 * ============================================================ */
router.delete("/late-fees/:id", requireAdmin, async (req, res) => {
  const fee = await LateFee.findById(req.params.id);

  if (!fee) {
    return res.status(404).json({
      message: "Late fee not found"
    });
  }

  const user = await User.findById(fee.user);

  const memberName = user
    ? `${user.firstName} ${user.lastName}`.trim()
    : "A member";

  const amount = Number(fee.amount || 0);
  const wasPaid = fee.status === "paid";

  // Remove the financial LateFee record.
  await LateFee.findByIdAndDelete(fee._id);

  if (wasPaid) {
    await Announcement.create({
      type: "general_update",
      description:
        `${memberName}'s ₦${amount.toLocaleString()} late-fee payment ` +
        `was reversed by an administrator.`,
      circle: fee.circle
    });

    await AdminActivity.create({
      admin: req.auth.adminId,
      action: "late_fee_payment_reversed",
      detail:
        `${memberName}'s ₦${amount.toLocaleString()} late-fee payment ` +
        `was reversed and the fee record was deleted.`
    });

    return res.json({
      message:
        "Late-fee payment reversed. The original payment notice has been preserved in the audit history."
    });
  }

  await Announcement.create({
    type: "general_update",
    description:
      `${memberName}'s ₦${amount.toLocaleString()} late fee ` +
      `was removed/waived by an administrator.`,
    circle: fee.circle
  });

  await AdminActivity.create({
    admin: req.auth.adminId,
    action: "late_fee_removed",
    detail:
      `${memberName}'s ₦${amount.toLocaleString()} outstanding late fee ` +
      `was removed/waived.`
  });

  return res.json({
    message:
      "Late fee removed. The original fee notice has been preserved in the audit history."
  });
});

/* ============================================================
 * CONTRIBUTIONS TRACKER
 * Per-member, per-current-calendar-month payment status, so an admin can
 * see at a glance who paid on time, who paid late (with the fine), and
 * who hasn't paid yet this month - plus each circle's live collection
 * total against its ₦11,000-per-member target.
 * ============================================================ */
router.get("/contributions", requireAdmin, async (_req, res) => {
  const circles = await Circle.find()
    .populate(
      "members.user",
      "firstName lastName username avatarDataUrl"
    )
    .sort({ cycleNumber: -1 });

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const ledgers = await Ledger.find({
    paidAt: { $gte: startOfMonth }
  });

  const lateFees = await LateFee.find({
    status: { $ne: "waived" }
  }).sort({ createdAt: -1 });

  const latestFeeByUser = {};

  for (const f of lateFees) {
    const key = String(f.user);

    if (!latestFeeByUser[key]) {
      latestFeeByUser[key] = f;
    }
  }

  // If a member has more than one payment recorded this month, use their
  // most recent one for "this month's" status.
  const latestByUser = {};

  for (const l of ledgers) {
    const key = String(l.user);

    if (
      !latestByUser[key] ||
      l.paidAt > latestByUser[key].paidAt
    ) {
      latestByUser[key] = l;
    }
  }

  const data = circles.map(c => {
    const members = c.members.map(m => {
      const uid = String(m.user?._id || m.user);
      const l = latestByUser[uid];
      const fee = latestFeeByUser[uid];
      const status = !l ? "unpaid" : "onTime";

      return {
        numericId: m.numericId,
        user: m.user,
        status,
        savingsAmount: l?.savingsAmount || 0,
        partyAmount: l?.partyAmount || 0,
        paidAt: l?.paidAt || null,
        ledgerId: l?._id || null,
        lateFee: fee
          ? {
              id: fee._id,
              amount: fee.amount,
              status: fee.status
            }
          : null
      };
    });

    const target =
      c.members.length * MONTHLY_CONTRIBUTION;

    const collected = members.reduce(
      (sum, m) =>
        sum + m.savingsAmount + m.partyAmount,
      0
    );

    const paidCount = members.filter(
      m => m.status !== "unpaid"
    ).length;

    return {
      _id: c._id,
      name: c.name,
      cycleNumber: c.cycleNumber,
      target,
      collected,
      paidCount,
      memberCount: c.members.length,
      percentage: target
        ? Math.min(100, Math.round((collected / target) * 100))
        : 0,
      met:
        paidCount >= c.members.length &&
        c.members.length > 0,
      members
    };
  });

  res.json(data);
});

// Same underlying data as /contributions, flattened one row per
// member per circle, downloadable as a spreadsheet-ready CSV.
router.get("/contributions/export.csv", requireAdmin, async (_req, res) => {
  const circles = await Circle.find()
    .populate(
      "members.user",
      "firstName lastName username email primaryPhone bank"
    )
    .sort({ cycleNumber: -1 });

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const ledgers = await Ledger.find({
    paidAt: { $gte: startOfMonth }
  });

  const lateFees = await LateFee.find({
    status: { $ne: "waived" }
  }).sort({ createdAt: -1 });

  const latestFeeByUser = {};

  for (const f of lateFees) {
    const key = String(f.user);

    if (!latestFeeByUser[key]) {
      latestFeeByUser[key] = f;
    }
  }

  const latestByUser = {};

  for (const l of ledgers) {
    const key = String(l.user);

    if (
      !latestByUser[key] ||
      l.paidAt > latestByUser[key].paidAt
    ) {
      latestByUser[key] = l;
    }
  }

  const rows = [];

  for (const c of circles) {
    for (const m of c.members) {
      const u = m.user;
      const uid = String(u?._id || u);
      const l = latestByUser[uid];
      const fee = latestFeeByUser[uid];

      rows.push({
        Circle: c.name,
        Cycle: c.cycleNumber,
        Slot: m.numericId,
        Name: u
          ? `${u.firstName} ${u.lastName}`
          : "",
        Username: u?.username || "",
        Email: u?.email || "",
        Phone: u?.primaryPhone || "",
        BankName: u?.bank?.bankName || "",
        AccountNumber: u?.bank?.accountNumber || "",
        AccountHolder: u?.bank?.accountName || "",
        ThisMonthStatus: l
          ? "Paid"
          : "Unpaid",
        ThisMonthPaidAt: l?.paidAt
          ? new Date(l.paidAt).toISOString()
          : "",
        LateFeeStatus: fee
          ? fee.status
          : "none",
        LateFeeAmount: fee
          ? fee.amount
          : "",
        Disbursed: m.disbursed
          ? "Yes"
          : "No",
        DisbursedAt: m.disbursedAt
          ? new Date(m.disbursedAt).toISOString()
          : ""
      });
    }
  }

  const csv = toCsv(rows);
  const filename =
    `contributions-${new Date().toISOString().slice(0, 10)}.csv`;

  res.setHeader(
    "Content-Type",
    "text/csv"
  );

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`
  );

  res.send(csv);
});

/* ============================================================
 * PROFIT MATRIX
 * ============================================================ */
router.get("/metrics", requireAdmin, async (_req, res) => {
  const activeUsers = await User.countDocuments({
    registrationStatus: "active"
  });

  const [
    totals,
    circles,
    circle,
    lateFeeTotals
  ] = await Promise.all([
    Ledger.aggregate([
      { $match: { isPaid: true } },
      {
        $group: {
          _id: null,
          savingsTotal: {
            $sum: "$savingsAmount"
          },
          partyTotal: {
            $sum: "$partyAmount"
          },
          penaltyTotal: {
            $sum: "$latePenalty"
          }
        }
      }
    ]),

    Circle.find(),

    Circle.findOne({ active: true })
      .sort({ cycleNumber: -1 }),

    LateFee.aggregate([
      { $match: { status: "paid" } },
      {
        $group: {
          _id: null,
          total: {
            $sum: "$amount"
          }
        }
      }
    ])
  ]);

  const disbursedCount = circles.reduce(
    (sum, c) =>
      sum + c.members.filter(m => m.disbursed).length,
    0
  );

  res.json({
    activeUsers,
    disbursedCount,

    // Quarterly Get-Together / Owambe fund - the ₦1,000 portion of
    // the monthly contribution.
    owambeFund:
      totals[0]?.partyTotal || 0,

    // Rotating savings pool - the ₦10,000 portion of the monthly
    // contribution.
    globalSavingsPool:
      totals[0]?.savingsTotal || 0,

    totalPenalties:
      (totals[0]?.penaltyTotal || 0) +
      (lateFeeTotals[0]?.total || 0),

    circle: circle
      ? {
          id: circle._id,
          name: circle.name,
          cycleNumber: circle.cycleNumber,
          members: circle.members
        }
      : null
  });
});

/* ============================================================
 * CIRCLES / AJO RECIPIENT DRAW / MEMBER SLOT GRID
 * ============================================================ */
router.get("/circles", requireAdmin, async (_req, res) =>
  res.json(
    await Circle.find()
      .populate(
        "members.user",
        "firstName lastName username email bank"
      )
      .sort({ cycleNumber: -1 })
  )
);

// Delete an entire circle - for a mistakenly-started cycle, or to clear out
// a fully-completed one (everyone disbursed) once you're done with it and
// ready to start fresh. Existing Ledger/payment history is left alone
// (kept for record), only the circle/roster itself is removed.
router.delete("/circles/:circleId", requireAdmin, async (req, res) => {
  const circle = await Circle.findByIdAndDelete(
    req.params.circleId
  );

  if (!circle) {
    return res.status(404).json({
      message: "Circle not found"
    });
  }

  // Anyone still active in this circle goes back to "awaiting slot
  // assignment" rather than being left in limbo pointing at a dead circle.
  const memberIds = circle.members.map(m => m.user);

  if (memberIds.length) {
    await User.updateMany(
      {
        _id: { $in: memberIds },
        registrationStatus: "active"
      },
      {
        $set: {
          registrationStatus: "awaiting_slot_assignment"
        }
      }
    );
  }

  res.json({
    message: "Circle deleted"
  });
});

// Remove a single member's slot from a circle (e.g. undo one disbursal
// record, or free up a slot assigned by mistake) without deleting the
// whole circle.
router.delete(
  "/circles/:circleId/members/:numericId",
  requireAdmin,
  async (req, res) => {
    const circle = await Circle.findById(
      req.params.circleId
    );

    if (!circle) {
      return res.status(404).json({
        message: "Circle not found"
      });
    }

    const numericId = Number(req.params.numericId);
    const before = circle.members.length;

    circle.members = circle.members.filter(
      m => m.numericId !== numericId
    );

    if (circle.members.length === before) {
      return res.status(404).json({
        message: "That slot was already empty"
      });
    }

    // Circle can no longer be "completed" if we just pulled a member out of it.
    if (circle.completed) {
      circle.completed = false;
      circle.completedAt = undefined;
      circle.active = true;
    }

    await circle.save();

    res.json({
      message: `Slot ${numericId} cleared`,
      circle
    });
  }
);

// Manually open a new cycle. Idempotent - returns the existing open
// circle if one is already accepting registrations.
router.post(
  "/circles/start-new-cycle",
  requireAdmin,
  async (req, res) => {
    const openCircle = await Circle.findOne({
      active: true,
      completed: false
    }).sort({ cycleNumber: -1 });

    if (
      openCircle &&
      openCircle.members.length <
        openCircle.baselineSize
    ) {
      return res.json({
        message:
          "A circle is already open for registration.",
        circle: openCircle
      });
    }

    const last = await Circle.findOne()
      .sort({ cycleNumber: -1 });

    // Admin can set the size for this specific cycle (e.g. start with
    // 5-10 real members instead of always assuming 20). Falls back to
    // the env default, then to whatever the previous cycle used,
    // then to 20.
    const requestedSize = Number(
      req.body?.baselineSize
    );

    const baselineSize =
      Number.isInteger(requestedSize) &&
      requestedSize >= 2
        ? requestedSize
        : Number(process.env.CIRCLE_BASELINE_SIZE) ||
          last?.baselineSize ||
          20;

    const circle = await Circle.create({
      name: "Unique Youth Circle",
      cycleNumber: (last?.cycleNumber || 0) + 1,
      baselineSize
    });

    res.status(201).json({
      message:
        `New cycle started with ${baselineSize} slots.`,
      circle
    });
  }
);

router.post(
  "/circles/:circleId/random-disbursal",
  requireAdmin,
  async (req, res) => {
    const circle = await Circle.findById(
      req.params.circleId
    );

    if (!circle) {
      return res.status(404).json({
        message: "Circle not found"
      });
    }

    const pool = circle.members.filter(
      m => !m.drawExcluded && !m.disbursed
    );

    if (pool.length < 2) {
      return res.status(400).json({
        message:
          "Fewer than two eligible numeric positions remain"
      });
    }

    for (let i = pool.length - 1; i > 0; i--) {
      const j =
        Math.floor(Math.random() * (i + 1));

      [pool[i], pool[j]] =
        [pool[j], pool[i]];
    }

    const selectedIds =
      pool.slice(0, 2).map(
        m => m.numericId
      );

    circle.members.forEach(m => {
      if (selectedIds.includes(m.numericId)) {
        m.disbursed = true;
        m.drawExcluded = true;
        m.disbursedAt = new Date();
      }
    });

    // If every slot is filled AND every filled slot has now been disbursed,
    // this cycle is fully wrapped up - all 20 members received their payout
    // when it was their turn. Close it out.
    const circleIsFull =
      circle.members.length >=
      circle.baselineSize;

    const allDisbursed =
      circle.members.every(
        m => m.disbursed
      );

    let cycleCompleted = false;

    if (circleIsFull && allDisbursed) {
      circle.completed = true;
      circle.completedAt = new Date();
      circle.active = false;
      cycleCompleted = true;
    }

    await circle.save();

    await Announcement.create({
      type: "general_update",
      description:
        `Two monthly lump-sum recipients were selected for cycle ${circle.cycleNumber}.`,
      circle: circle._id
    });

    if (cycleCompleted) {
      await Announcement.create({
        type: "general_update",
        description:
          `Cycle ${circle.cycleNumber} is complete - all ${circle.baselineSize} members have now received their payout.`,
        circle: circle._id
      });
    }

    res.json({
      message:
        "Monthly disbursal selection completed",
      recipients: selectedIds.map(
        numericId => ({
          numericId,
          status: "Disbursed/Collected"
        })
      ),
      cycleCompleted
    });
  }
);

// Members who are ready for a slot (guarantor verified, not yet placed)
router.get(
  "/unlocked-members",
  requireAdmin,
  async (_req, res) => {
    const users = await User.find({
      registrationStatus:
        "awaiting_slot_assignment"
    })
      .select(
        "firstName lastName username email guarantorName guarantorVerifiedAt"
      )
      .sort({
        guarantorVerifiedAt: 1
      });

    res.json(users);
  }
);

router.post(
  "/circles/:circleId/assign-slot",
  requireAdmin,
  async (req, res) => {
    const { userId, numericId } = req.body;

    const circle = await Circle.findById(
      req.params.circleId
    );

    if (!circle) {
      return res.status(404).json({
        message: "Circle not found"
      });
    }

    if (circle.completed) {
      return res.status(409).json({
        message:
          "This cycle is already complete"
      });
    }

    const slot = Number(numericId);

    if (
      !Number.isInteger(slot) ||
      slot < 1 ||
      slot > circle.baselineSize
    ) {
      return res.status(400).json({
        message:
          `Slot must be between 1 and ${circle.baselineSize}`
      });
    }

    if (
      circle.members.some(
        m => m.numericId === slot
      )
    ) {
      return res.status(409).json({
        message:
          "That slot is already taken"
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message:
          "Member not found"
      });
    }

    if (
      user.registrationStatus !==
      "awaiting_slot_assignment"
    ) {
      return res.status(409).json({
        message:
          "Member is not ready for slot assignment"
      });
    }

    if (
      circle.members.some(
        m => String(m.user) ===
          String(user._id)
      )
    ) {
      return res.status(409).json({
        message:
          "Member already has a slot in this circle"
      });
    }

    circle.members.push({
      user: user._id,
      numericId: slot
    });

    await circle.save();

    user.registrationStatus = "active";

    await user.save();

    await Announcement.create({
      type: "general_update",
      description:
        `${user.firstName} was assigned to slot ${slot} in ${circle.name} (cycle ${circle.cycleNumber}).`,
      circle: circle._id
    });

    res.json({
      message: "Slot assigned",
      circle
    });
  }
);

/* ============================================================
 * MEMBERS STUCK AT EMAIL VERIFICATION
 * Registered (step 1) but never confirmed their OTP - either they never
 * got the email, or gave up. Surfaced here so an admin can generate and
 * read out a fresh code (see POST /members/:userId/reveal-otp above).
 * ============================================================ */
router.get(
  "/members/pending-otp",
  requireAdmin,
  async (_req, res) => {
    const users = await User.find({
      emailVerifiedAt: null
    })
      .select(
        "firstName lastName username email primaryPhone preferredOtpChannel createdAt"
      )
      .sort({
        createdAt: 1
      });

    res.json(users);
  }
);

/* ============================================================
 * GUARANTOR PORTAL
 * (manual review only - no automated SMS, keeps this free-tier friendly)
 * ============================================================ */
router.get(
  "/guarantors/pending",
  requireAdmin,
  async (_req, res) => {
    const users = await User.find({
      registrationStatus:
        "awaiting_guarantor_review"
    })
      .select(
        "firstName lastName username email primaryPhone guarantorName guarantorPhone rulesAcceptedAt"
      )
      .sort({
        rulesAcceptedAt: 1
      });

    res.json(users);
  }
);

router.post(
  "/guarantors/:userId/verify",
  requireAdmin,
  async (req, res) => {
    const user = await User.findById(
      req.params.userId
    );

    if (!user) {
      return res.status(404).json({
        message: "Member not found"
      });
    }

    if (
      user.registrationStatus !==
      "awaiting_guarantor_review"
    ) {
      return res.status(409).json({
        message:
          "Member is not awaiting guarantor review"
      });
    }

    user.registrationStatus =
      "awaiting_slot_assignment";

    user.guarantorVerifiedAt =
      new Date();

    user.guarantorVerifiedBy =
      req.auth.adminId;

    await user.save();

    res.json({
      message:
        "Guarantor verified. Member is ready for slot assignment.",
      user
    });
  }
);

router.post(
  "/guarantors/:userId/reject",
  requireAdmin,
  async (req, res) => {
    const user = await User.findById(
      req.params.userId
    );

    if (!user) {
      return res.status(404).json({
        message: "Member not found"
      });
    }

    if (
      user.registrationStatus !==
      "awaiting_guarantor_review"
    ) {
      return res.status(409).json({
        message:
          "Member is not awaiting guarantor review"
      });
    }

    user.registrationStatus =
      "rejected";

    user.guarantorRejectionReason =
      req.body.reason ||
      "Guarantor could not be verified";

    await user.save();

    res.json({
      message:
        "Guarantor rejected.",
      user
    });
  }
);

/* ============================================================
 * BROADCAST ENGINE
 * ============================================================ */
router.get(
  "/announcements",
  requireAdmin,
  async (_req, res) => {
    const items = await Announcement.find()
      .populate(
        "circle",
        "name cycleNumber"
      )
      .populate(
        "user",
        "firstName lastName username"
      )
      .sort({
        createdAt: -1
      })
      .limit(100);

    res.json(items);
  }
);

router.post(
  "/announcements",
  requireAdmin,
  async (req, res) => {
    const {
      type,
      description,
      circle,
      venue,
      eventDate
    } = req.body;

    if (!type || !description) {
      return res.status(400).json({
        message:
          "Type and description are required"
      });
    }

    const item = await Announcement.create({
      type,
      description,
      createdBy: req.auth.adminId,
      circle: circle || null,
      venue: venue || null,
      eventDate: eventDate
        ? new Date(eventDate)
        : null,
      isBroadcast:
        type !== "party_banner"
    });

    res.status(201).json(item);
  }
);

// Delete a stale/incorrect announcement. Available to any admin, matching
// the rest of the Broadcast Engine's permissions.
router.delete(
  "/announcements/:id",
  requireAdmin,
  async (req, res) => {
    const item =
      await Announcement.findByIdAndDelete(
        req.params.id
      );

    if (!item) {
      return res.status(404).json({
        message:
          "Announcement not found"
      });
    }

    res.json({
      message:
        "Announcement deleted"
    });
  }
);

/* ============================================================
 * BACKUP - free alternative to Atlas's paid Cloud Backup. Dumps the core
 * collections to JSON and emails them as attachments via Resend.
 * Reachable two ways: a logged-in admin clicking "Back up now", or a
 * scheduled GitHub Action hitting it with a shared secret header (since a
 * cron job can't hold an admin login session).
 * ============================================================ */
router.post("/backup/run", async (req, res) => {
  const hasValidSecret =
    process.env.BACKUP_SECRET &&
    req.headers["x-backup-secret"] ===
      process.env.BACKUP_SECRET;

  if (hasValidSecret) {
    return performBackup(res);
  }

  // No valid secret - fall back to normal admin-login auth instead.
  requireAdmin(
    req,
    res,
    () => performBackup(res)
  );
});

async function performBackup(res) {
  try {
    const to =
      process.env.BACKUP_EMAIL_TO ||
      process.env.SUPER_ADMIN_EMAIL;

    if (!to) {
      return res.status(500).json({
        message:
          "No backup recipient configured (BACKUP_EMAIL_TO or SUPER_ADMIN_EMAIL)"
      });
    }

    const { attachments, summary } =
      await runBackup();

    await sendBackupEmail({
      to,
      attachments,
      summary
    });

    res.json({
      message:
        `Backup emailed to ${to}`,
      summary
    });
  } catch (error) {
    console.error(
      "Backup failed:",
      error
    );

    res.status(500).json({
      message:
        error.message ||
        "Backup failed"
    });
  }
}

export default router;