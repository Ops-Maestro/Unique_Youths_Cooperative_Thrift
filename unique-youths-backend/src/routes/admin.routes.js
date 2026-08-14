import express from "express";
import User from "../models/User.js";
import Ledger from "../models/Ledger.js";
import LateFee from "../models/LateFee.js";
import Circle from "../models/Circle.js";
import { randomInt } from "node:crypto";
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

/*
 * The dice animation runs for this many milliseconds.
 *
 * The backend remains authoritative. The random recipients are selected
 * when the draw begins, but they are not revealed to the dashboards until
 * the rolling period has completed.
 */
const DRAW_ROLL_DURATION_MS = 5000;

// Online status is session-based (see User.isOnline) - true from login
// until explicit logout, not a time-window guess off lastSeenAt.

/* ============================================================
 * MEMBERS ROSTER
 * ============================================================ */
router.get("/members", requireAdmin, async (_req, res) => {
  const users = await User.find({
    registrationStatus: { $ne: "rejected" }
  })
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

/* ============================================================
 * PRESENCE SUMMARY
 * ============================================================ */
router.get("/presence-summary", requireAdmin, async (_req, res) => {
  const [totalMembers, onlineNow] = await Promise.all([
    User.countDocuments({
      registrationStatus: { $ne: "rejected" }
    }),
    User.countDocuments({
      isOnline: true
    })
  ]);

  res.json({
    totalMembers,
    onlineNow
  });
});

/* ============================================================
 * MEMBER ACTIVITY LOG
 * ============================================================ */
router.get("/member-activity", requireAdmin, async (_req, res) => {
  const items = await MemberActivity.find()
    .sort({ createdAt: -1 })
    .limit(150);

  res.json(items);
});

/* ============================================================
 * ADMIN ACTIVITY LOG
 * ============================================================ */
router.get("/activity", requireAdmin, async (_req, res) => {
  const items = await AdminActivity.find()
    .sort({ createdAt: -1 })
    .limit(100);

  res.json(items);
});

/* ============================================================
 * ADMIN OTP BACKDOOR
 * ============================================================ */
router.post(
  "/members/:userId/reveal-otp",
  requireAdmin,
  async (req, res) => {
    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(404).json({
        message: "Member not found"
      });
    }

    if (user.emailVerifiedAt) {
      return res.status(400).json({
        message: "This member's email is already verified"
      });
    }

    const channel =
      user.preferredOtpChannel === "sms"
        ? "sms"
        : "email";

    const otp = generateOtp();

    const expiresAt = new Date(
      Date.now() +
        Number(process.env.OTP_EXPIRES_MINUTES || 10) *
          60 *
          1000
    );

    await OTP.create({
      user: user._id,
      email: user.email,
      channel,
      otpHash: hashOtp(otp),
      expiresAt
    });

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
        channel === "sms"
          ? user.primaryPhone
          : user.email
      })`
    });

    res.json({
      message: delivered
        ? `A new OTP was generated and sent by ${
            channel === "sms"
              ? "SMS"
              : "email"
          }. You can also read it out below if it doesn't arrive.`
        : `A new OTP was generated, but ${
            channel === "sms"
              ? "the SMS"
              : "the email"
          } failed to send - read it out to the member directly.`,
      otp,
      expiresAt,
      channel
    });
  }
);

/* ============================================================
 * PAYMENTS
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
      req.body.paymentReference ||
      `PAY-${Date.now()}`,
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
 * ============================================================ */
router.delete(
  "/payments/:id",
  requireAdmin,
  async (req, res) => {
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

    await Ledger.findByIdAndDelete(item._id);

    await Announcement.create({
      type: "general_update",
      description:
        `${memberName}'s ₦${paymentAmount.toLocaleString()} monthly contribution ` +
        `confirmation was reversed by an administrator.`,
      circle: item.circle
    });

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
  }
);

/* ============================================================
 * LATE FEES
 * ============================================================ */
router.post(
  "/late-fees",
  requireAdmin,
  async (req, res) => {
    const {
      userId,
      amount,
      reason
    } = req.body;

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

    const existing =
      await LateFee.findOne({
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
      amount:
        amount || LATE_PENALTY,
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
  }
);

/* ============================================================
 * MARK LATE FEE PAID
 * ============================================================ */
router.post(
  "/late-fees/:id/mark-paid",
  requireAdmin,
  async (req, res) => {
    const fee = await LateFee.findById(
      req.params.id
    );

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

    const user = await User.findById(
      fee.user
    );

    await Announcement.create({
      type: "payment_received",
      description:
        `${user?.firstName || "A member"}'s ₦${fee.amount.toLocaleString()} late fee was paid.`,
      circle: fee.circle
    });

    res.json({
      message:
        "Late fee marked as paid",
      lateFee: fee
    });
  }
);

/* ============================================================
 * UNDO / REMOVE LATE FEE
 * ============================================================ */
router.delete(
  "/late-fees/:id",
  requireAdmin,
  async (req, res) => {
    const fee = await LateFee.findById(
      req.params.id
    );

    if (!fee) {
      return res.status(404).json({
        message: "Late fee not found"
      });
    }

    const user = await User.findById(
      fee.user
    );

    const memberName = user
      ? `${user.firstName} ${user.lastName}`.trim()
      : "A member";

    const amount = Number(
      fee.amount || 0
    );

    const wasPaid =
      fee.status === "paid";

    await LateFee.findByIdAndDelete(
      fee._id
    );

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
        action:
          "late_fee_payment_reversed",
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
      action:
        "late_fee_removed",
      detail:
        `${memberName}'s ₦${amount.toLocaleString()} outstanding late fee ` +
        `was removed/waived.`
    });

    return res.json({
      message:
        "Late fee removed. The original fee notice has been preserved in the audit history."
    });
  }
);

/* ============================================================
 * CONTRIBUTIONS TRACKER
 * ============================================================ */
router.get(
  "/contributions",
  requireAdmin,
  async (_req, res) => {
    const circles = await Circle.find()
      .populate(
        "members.user",
        "firstName lastName username avatarDataUrl"
      )
      .sort({
        cycleNumber: -1
      });

    const startOfMonth =
      new Date();

    startOfMonth.setDate(1);
    startOfMonth.setHours(
      0,
      0,
      0,
      0
    );

    const ledgers =
      await Ledger.find({
        paidAt: {
          $gte: startOfMonth
        }
      });

    const lateFees =
      await LateFee.find({
        status: {
          $ne: "waived"
        }
      }).sort({
        createdAt: -1
      });

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
        l.paidAt >
          latestByUser[key].paidAt
      ) {
        latestByUser[key] = l;
      }
    }

    const data = circles.map(c => {
      const members =
        c.members.map(m => {
          const uid = String(
            m.user?._id || m.user
          );

          const l =
            latestByUser[uid];

          const fee =
            latestFeeByUser[uid];

          const status =
            !l
              ? "unpaid"
              : "onTime";

          return {
            numericId:
              m.numericId,
            user: m.user,
            status,
            savingsAmount:
              l?.savingsAmount || 0,
            partyAmount:
              l?.partyAmount || 0,
            paidAt:
              l?.paidAt || null,
            ledgerId:
              l?._id || null,
            lateFee: fee
              ? {
                  id: fee._id,
                  amount: fee.amount,
                  status:
                    fee.status
                }
              : null
          };
        });

      const target =
        c.members.length *
        MONTHLY_CONTRIBUTION;

      const collected =
        members.reduce(
          (sum, m) =>
            sum +
            m.savingsAmount +
            m.partyAmount,
          0
        );

      const paidCount =
        members.filter(
          m =>
            m.status !==
            "unpaid"
        ).length;

      return {
        _id: c._id,
        name: c.name,
        cycleNumber:
          c.cycleNumber,
        target,
        collected,
        paidCount,
        memberCount:
          c.members.length,
        percentage: target
          ? Math.min(
              100,
              Math.round(
                (collected /
                  target) *
                  100
              )
            )
          : 0,
        met:
          paidCount >=
            c.members.length &&
          c.members.length >
            0,
        members
      };
    });

    res.json(data);
  }
);

/* ============================================================
 * CONTRIBUTIONS CSV EXPORT
 * ============================================================ */
router.get(
  "/contributions/export.csv",
  requireAdmin,
  async (_req, res) => {
    const circles = await Circle.find()
      .populate(
        "members.user",
        "firstName lastName username email primaryPhone bank"
      )
      .sort({
        cycleNumber: -1
      });

    const startOfMonth =
      new Date();

    startOfMonth.setDate(1);
    startOfMonth.setHours(
      0,
      0,
      0,
      0
    );

    const ledgers =
      await Ledger.find({
        paidAt: {
          $gte: startOfMonth
        }
      });

    const lateFees =
      await LateFee.find({
        status: {
          $ne: "waived"
        }
      }).sort({
        createdAt: -1
      });

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
        l.paidAt >
          latestByUser[key].paidAt
      ) {
        latestByUser[key] = l;
      }
    }

    const rows = [];

    for (const c of circles) {
      for (const m of c.members) {
        const u = m.user;
        const uid = String(
          u?._id || u
        );

        const l =
          latestByUser[uid];

        const fee =
          latestFeeByUser[uid];

        rows.push({
          Circle: c.name,
          Cycle:
            c.cycleNumber,
          Slot:
            m.numericId,
          Name: u
            ? `${u.firstName} ${u.lastName}`
            : "",
          Username:
            u?.username || "",
          Email:
            u?.email || "",
          Phone:
            u?.primaryPhone || "",
          BankName:
            u?.bank?.bankName ||
            "",
          AccountNumber:
            u?.bank?.accountNumber ||
            "",
          AccountHolder:
            u?.bank?.accountName ||
            "",
          ThisMonthStatus:
            l
              ? "Paid"
              : "Unpaid",
          ThisMonthPaidAt:
            l?.paidAt
              ? new Date(
                  l.paidAt
                ).toISOString()
              : "",
          LateFeeStatus:
            fee
              ? fee.status
              : "none",
          LateFeeAmount:
            fee
              ? fee.amount
              : "",
          Disbursed:
            m.disbursed
              ? "Yes"
              : "No",
          DisbursedAt:
            m.disbursedAt
              ? new Date(
                  m.disbursedAt
                ).toISOString()
              : ""
        });
      }
    }

    const csv = toCsv(
      rows
    );

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
  }
);

/* ============================================================
 * PROFIT MATRIX
 * ============================================================ */
router.get(
  "/metrics",
  requireAdmin,
  async (_req, res) => {
    const activeUsers =
      await User.countDocuments({
        registrationStatus:
          "active"
      });

    const [
      totals,
      circles,
      circle,
      lateFeeTotals
    ] = await Promise.all([
      Ledger.aggregate([
        {
          $match: {
            isPaid: true
          }
        },
        {
          $group: {
            _id: null,
            savingsTotal: {
              $sum:
                "$savingsAmount"
            },
            partyTotal: {
              $sum:
                "$partyAmount"
            },
            penaltyTotal: {
              $sum:
                "$latePenalty"
            }
          }
        }
      ]),

      Circle.find(),

      Circle.findOne({
        active: true
      }).sort({
        cycleNumber: -1
      }),

      LateFee.aggregate([
        {
          $match: {
            status: "paid"
          }
        },
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

    const disbursedCount =
      circles.reduce(
        (sum, c) =>
          sum +
          c.members.filter(
            m => m.disbursed
          ).length,
        0
      );

    res.json({
      activeUsers,
      disbursedCount,

      owambeFund:
        totals[0]
          ?.partyTotal || 0,

      globalSavingsPool:
        totals[0]
          ?.savingsTotal || 0,

      totalPenalties:
        (totals[0]
          ?.penaltyTotal ||
          0) +
        (lateFeeTotals[0]
          ?.total || 0),

      circle: circle
        ? {
            id:
              circle._id,
            name:
              circle.name,
            cycleNumber:
              circle.cycleNumber,
            members:
              circle.members
          }
        : null
    });
  }
);

/* ============================================================
 * CIRCLES / AJO RECIPIENT DRAW / MEMBER SLOT GRID
 * ============================================================ */
router.get(
  "/circles",
  requireAdmin,
  async (_req, res) =>
    res.json(
      await Circle.find()
        .populate(
          "members.user",
          "firstName lastName username email bank"
        )
        .sort({
          cycleNumber: -1
        })
    )
);

/* ============================================================
 * DELETE CIRCLE
 * ============================================================ */
router.delete(
  "/circles/:circleId",
  requireAdmin,
  async (req, res) => {
    const circle =
      await Circle.findByIdAndDelete(
        req.params.circleId
      );

    if (!circle) {
      return res.status(404).json({
        message: "Circle not found"
      });
    }

    const memberIds =
      circle.members.map(
        m => m.user
      );

    if (memberIds.length) {
      await User.updateMany(
        {
          _id: {
            $in: memberIds
          },
          registrationStatus:
            "active"
        },
        {
          $set: {
            registrationStatus:
              "awaiting_slot_assignment"
          }
        }
      );
    }

    res.json({
      message:
        "Circle deleted"
    });
  }
);

/* ============================================================
 * REMOVE SINGLE SLOT
 * ============================================================ */
router.delete(
  "/circles/:circleId/members/:numericId",
  requireAdmin,
  async (req, res) => {
    const circle =
      await Circle.findById(
        req.params.circleId
      );

    if (!circle) {
      return res.status(404).json({
        message:
          "Circle not found"
      });
    }

    const numericId =
      Number(
        req.params.numericId
      );

    const before =
      circle.members.length;

    circle.members =
      circle.members.filter(
        m =>
          m.numericId !==
          numericId
      );

    if (
      circle.members.length ===
      before
    ) {
      return res.status(404).json({
        message:
          "That slot was already empty"
      });
    }

    if (circle.completed) {
      circle.completed = false;
      circle.completedAt =
        undefined;
      circle.active = true;
    }

    await circle.save();

    res.json({
      message:
        `Slot ${numericId} cleared`,
      circle
    });
  }
);

/* ============================================================
 * START NEW CYCLE
 * ============================================================ */
router.post(
  "/circles/start-new-cycle",
  requireAdmin,
  async (req, res) => {
    const openCircle =
      await Circle.findOne({
        active: true,
        completed: false
      }).sort({
        cycleNumber: -1
      });

    if (
      openCircle &&
      openCircle.members.length <
        openCircle.baselineSize
    ) {
      return res.json({
        message:
          "A circle is already open for registration.",
        circle:
          openCircle
      });
    }

    const last =
      await Circle.findOne()
        .sort({
          cycleNumber: -1
        });

    const requestedSize =
      Number(
        req.body?.baselineSize
      );

    const baselineSize =
      Number.isInteger(
        requestedSize
      ) &&
      requestedSize >= 2
        ? requestedSize
        : Number(
            process.env
              .CIRCLE_BASELINE_SIZE
          ) ||
          last?.baselineSize ||
          20;

    const circle =
      await Circle.create({
        name:
          "Unique Youth Circle",
        cycleNumber:
          (last?.cycleNumber ||
            0) + 1,
        baselineSize
      });

    res.status(201).json({
      message:
        `New cycle started with ${baselineSize} slots.`,
      circle
    });
  }
);

/* ============================================================
 * COMPLETE A DRAW AFTER THE ROLLING PERIOD
 *
 * This endpoint is called by the dashboards while they poll for
 * draw status.
 *
 * The first request that reaches the end of the rolling period
 * atomically changes the draw to "completed" and creates the
 * announcements. Other simultaneous requests simply receive the
 * completed state.
 * ============================================================ */
async function finalizeDrawIfReady(circle) {
  if (
    !circle.draw ||
    circle.draw.status !==
      "rolling"
  ) {
    return circle;
  }

  const startedAt =
    circle.draw.startedAt
      ? new Date(
          circle.draw.startedAt
        ).getTime()
      : 0;

  const elapsed =
    Date.now() - startedAt;

  if (
    elapsed <
    DRAW_ROLL_DURATION_MS
  ) {
    return circle;
  }

  /*
   * Atomically claim completion.
   *
   * This prevents both the admin dashboard and member dashboards
   * from creating duplicate completion announcements.
   */
  const claimed =
    await Circle.updateOne(
      {
        _id: circle._id,
        "draw.status":
          "rolling",
        "draw.startedAt":
          circle.draw.startedAt
      },
      {
        $set: {
          "draw.status":
            "completed",
          "draw.completedAt":
            new Date()
        }
      }
    );

  if (
    claimed.modifiedCount === 0
  ) {
    return Circle.findById(
      circle._id
    );
  }

  const selectedCount =
    circle.draw.selectedMembers
      ?.length || 0;

  await Announcement.create({
    type:
      "general_update",
    description:
      `Two monthly lump-sum recipients were selected for cycle ${circle.cycleNumber}.`,
    circle:
      circle._id
  });

  if (circle.completed) {
    await Announcement.create({
      type:
        "general_update",
      description:
        `Cycle ${circle.cycleNumber} is complete - all ${circle.baselineSize} members have now received their payout.`,
      circle:
        circle._id
    });
  }

  return Circle.findById(
    circle._id
  );
}

/* ============================================================
 * START RANDOM MONTHLY DISBURSAL
 *
 * IMPORTANT:
 *
 * The member's numericId is NEVER used as the random input.
 *
 * The system:
 *
 *   1. Builds a pool of eligible member records.
 *   2. Cryptographically selects two distinct members.
 *   3. Locks those members out immediately.
 *   4. Stores their user IDs under circle.draw.selectedMembers.
 *   5. Sets draw.status = "rolling".
 *   6. Dashboards display the dice for 5 seconds.
 *   7. draw-status polling changes the state to "completed".
 * ============================================================ */
router.post(
  "/circles/:circleId/random-disbursal",
  requireAdmin,
  async (req, res) => {
    const circle =
      await Circle.findById(
        req.params.circleId
      );

    if (!circle) {
      return res.status(404).json({
        message:
          "Circle not found"
      });
    }

    if (
      circle.completed ||
      !circle.active
    ) {
      return res.status(400).json({
        message:
          "This circle is no longer active."
      });
    }

    if (
      circle.draw.status ===
      "rolling"
    ) {
      return res.status(409).json({
        message:
          "A random draw is already in progress."
      });
    }

    const pool =
      circle.members.filter(
        member =>
          !member.drawExcluded &&
          !member.disbursed
      );

    if (pool.length < 2) {
      return res.status(400).json({
        message:
          "Fewer than two eligible members remain for this cycle."
      });
    }

    /*
     * Select actual member records using cryptographically secure
     * randomness.
     */
    const workingPool =
      [...pool];

    const selectedMembers =
      [];

    for (
      let i = 0;
      i < 2;
      i++
    ) {
      const randomIndex =
        randomInt(
          workingPool.length
        );

      const [
        selected
      ] =
        workingPool.splice(
          randomIndex,
          1
        );

      selectedMembers.push(
        selected
      );
    }

    const selectedUserIds =
      selectedMembers.map(
        member =>
          member.user
      );

    /*
     * Lock the selected members immediately.
     *
     * This guarantees that another draw cannot select them again
     * while the dice animation is still running.
     */
    circle.members.forEach(
      member => {
        const selected =
          selectedUserIds.some(
            userId =>
              String(
                userId
              ) ===
              String(
                member.user
              )
          );

        if (selected) {
          member.disbursed =
            true;
          member.drawExcluded =
            true;
          member.disbursedAt =
            new Date();
        }
      }
    );

    const circleIsFull =
      circle.members.length >=
      circle.baselineSize;

    const allDisbursed =
      circle.members.length >
        0 &&
      circle.members.every(
        member =>
          member.disbursed
      );

    const cycleCompleted =
      circleIsFull &&
      allDisbursed;

    if (
      cycleCompleted
    ) {
      circle.completed =
        true;

      circle.completedAt =
        new Date();

      circle.active =
        false;
    }

    /*
     * Store the result, but keep it hidden behind draw.status =
     * "rolling" until the rolling duration has elapsed.
     */
    circle.draw.status =
      "rolling";

    circle.draw.startedAt =
      new Date();

    circle.draw.completedAt =
      null;

    circle.draw.selectedMembers =
      selectedUserIds;

    await circle.save();

    /*
     * Return only the draw state and timing.
     *
     * Recipients are deliberately NOT returned during the rolling
     * state because the dashboard should reveal them after the dice
     * animation finishes.
     */
    res.json({
      message:
        "Random selection roll started",

      draw: {
        status:
          circle.draw.status,
        startedAt:
          circle.draw.startedAt,
        durationMs:
          DRAW_ROLL_DURATION_MS
      },

      eligibleCount:
        pool.length,

      cycleCompleted
    });
  }
);

/* ============================================================
 * ADMIN DRAW STATUS
 *
 * The admin dashboard polls this while the dice is rolling.
 * Once the 5-second rolling period has elapsed, this endpoint
 * finalizes the draw and returns the actual selected members.
 * ============================================================ */
router.get(
  "/circles/:circleId/draw-status",
  requireAdmin,
  async (req, res) => {
    let circle =
      await Circle.findById(
        req.params.circleId
      ).populate(
        "draw.selectedMembers",
        "firstName lastName username"
      );

    if (!circle) {
      return res.status(404).json({
        message:
          "Circle not found"
      });
    }

    circle =
      await finalizeDrawIfReady(
        circle
      );

    await circle.populate(
      "draw.selectedMembers",
      "firstName lastName username"
    );

    const recipients =
      circle.draw.status ===
      "completed"
        ? circle.draw.selectedMembers.map(
            user => {
              const member =
                circle.members.find(
                  m =>
                    String(
                      m.user
                    ) ===
                    String(
                      user._id
                    )
                );

              return {
                userId:
                  user._id,
                firstName:
                  user.firstName,
                lastName:
                  user.lastName,
                username:
                  user.username,
                numericId:
                  member?.numericId ??
                  null,
                status:
                  "Disbursed/Collected"
              };
            }
          )
        : [];

    res.json({
      draw: {
        status:
          circle.draw.status,
        startedAt:
          circle.draw.startedAt,
        completedAt:
          circle.draw.completedAt,
        durationMs:
          DRAW_ROLL_DURATION_MS
      },

      recipients,

      cycleCompleted:
        circle.completed,

      eligibleCount:
        circle.members.filter(
          member =>
            !member.drawExcluded &&
            !member.disbursed
        ).length
    });
  }
);

/* ============================================================
 * MEMBERS WHO ARE READY FOR A SLOT
 * ============================================================ */
router.get(
  "/unlocked-members",
  requireAdmin,
  async (_req, res) => {
    const users =
      await User.find({
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

/* ============================================================
 * ASSIGN SLOT
 * ============================================================ */
router.post(
  "/circles/:circleId/assign-slot",
  requireAdmin,
  async (req, res) => {
    const {
      userId,
      numericId
    } = req.body;

    const circle =
      await Circle.findById(
        req.params.circleId
      );

    if (!circle) {
      return res.status(404).json({
        message:
          "Circle not found"
      });
    }

    if (circle.completed) {
      return res.status(409).json({
        message:
          "This cycle is already complete"
      });
    }

    const slot =
      Number(numericId);

    if (
      !Number.isInteger(
        slot
      ) ||
      slot < 1 ||
      slot >
        circle.baselineSize
    ) {
      return res.status(400).json({
        message:
          `Slot must be between 1 and ${circle.baselineSize}`
      });
    }

    if (
      circle.members.some(
        m =>
          m.numericId ===
          slot
      )
    ) {
      return res.status(409).json({
        message:
          "That slot is already taken"
      });
    }

    const user =
      await User.findById(
        userId
      );

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
        m =>
          String(
            m.user
          ) ===
          String(
            user._id
          )
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

    user.registrationStatus =
      "active";

    await user.save();

    await Announcement.create({
      type:
        "general_update",
      description:
        `${user.firstName} was assigned to slot ${slot} in ${circle.name} (cycle ${circle.cycleNumber}).`,
      circle:
        circle._id
    });

    res.json({
      message:
        "Slot assigned",
      circle
    });
  }
);

/* ============================================================
 * MEMBERS STUCK AT EMAIL VERIFICATION
 * ============================================================ */
router.get(
  "/members/pending-otp",
  requireAdmin,
  async (_req, res) => {
    const users =
      await User.find({
        emailVerifiedAt:
          null
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
 * ============================================================ */
router.get(
  "/guarantors/pending",
  requireAdmin,
  async (_req, res) => {
    const users =
      await User.find({
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
    const user =
      await User.findById(
        req.params.userId
      );

    if (!user) {
      return res.status(404).json({
        message:
          "Member not found"
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
    const user =
      await User.findById(
        req.params.userId
      );

    if (!user) {
      return res.status(404).json({
        message:
          "Member not found"
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
    const items =
      await Announcement.find()
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

    if (
      !type ||
      !description
    ) {
      return res.status(400).json({
        message:
          "Type and description are required"
      });
    }

    const item =
      await Announcement.create({
        type,
        description,
        createdBy:
          req.auth.adminId,
        circle:
          circle || null,
        venue:
          venue || null,
        eventDate:
          eventDate
            ? new Date(
                eventDate
              )
            : null,
        isBroadcast:
          type !==
          "party_banner"
      });

    res.status(201).json(
      item
    );
  }
);

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
 * BACKUP
 * ============================================================ */
router.post(
  "/backup/run",
  async (req, res) => {
    const hasValidSecret =
      process.env.BACKUP_SECRET &&
      req.headers[
        "x-backup-secret"
      ] ===
        process.env.BACKUP_SECRET;

    if (hasValidSecret) {
      return performBackup(
        res
      );
    }

    requireAdmin(
      req,
      res,
      () =>
        performBackup(
          res
        )
    );
  }
);

async function performBackup(
  res
) {
  try {
    const to =
      process.env
        .BACKUP_EMAIL_TO ||
      process.env
        .SUPER_ADMIN_EMAIL;

    if (!to) {
      return res.status(500).json({
        message:
          "No backup recipient configured (BACKUP_EMAIL_TO or SUPER_ADMIN_EMAIL)"
      });
    }

    const {
      attachments,
      summary
    } =
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
