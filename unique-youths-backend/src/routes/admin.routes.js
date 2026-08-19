import express from "express";
import User from "../models/User.js";
import Ledger from "../models/Ledger.js";
import PaymentClaim from "../models/PaymentClaim.js";
import LateFee from "../models/LateFee.js";
import Circle from "../models/Circle.js";
import Payout from "../models/Payout.js";
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
  latePenaltyFor,
  calculatePayoutSummary,
  validateRecipientCount,
  DEFAULT_RECIPIENTS_PER_MONTH,
  DEFAULT_CIRCLE_BASELINE_SIZE
} from "../utils/finance.js";
import {
  generateOtp,
  hashOtp
} from "../utils/otp.js";
import {
  sendOtpEmail,
  sendBackupEmail
} from "../config/email.js";
import {
  runBackup
} from "../utils/backup.js";
import {
  sendOtpSms
} from "../config/sms.js";
import {
  toCsv
} from "../utils/csv.js";

// ============================================================
// IMPORT SETTINGS MODEL (shared)
// ============================================================
import { Settings } from "../models/Settings.js";

const router = express.Router();

/*
 * The dice animation runs for this many milliseconds.
 *
 * The backend remains authoritative. The random recipients are selected
 * when the draw begins, but they are not revealed to dashboards until
 * this rolling period has completed.
 */
const DRAW_ROLL_DURATION_MS = 5000;

/*
 * Broadcast Engine messages using:
 *
 * - general_update
 * - payment_received
 * - payment_missed
 *
 * automatically expire after one minute.
 *
 * Party banners and app updates are intentionally NOT included here.
 */
const BROADCAST_AUTO_EXPIRY_MS =
  60 * 1000;

/*
 * Return the beginning of the current calendar month.
 */
function currentMonthKey() {
  const start =
    startOfCurrentMonth();

  return `${start.getFullYear()}-${String(
    start.getMonth() + 1
  ).padStart(
    2,
    "0"
  )}`;
}

async function nextLedgerMonthIndexFor(
  userId,
  circleId
) {
  const rows =
    await Ledger.find({
      user:
        userId,

      circle:
        circleId
    }).select(
      "monthIndex"
    );

  return rows.reduce(
    (
      highest,
      row
    ) =>
      Math.max(
        highest,
        Number(
          row.monthIndex ||
            0
        )
      ),
    0
  ) + 1;
}

function startOfCurrentMonth() {
  const start = new Date();

  start.setDate(1);

  start.setHours(
    0,
    0,
    0,
    0
  );

  return start;
}

function currentMonthLabel() {
  return new Intl.DateTimeFormat(
    "en-NG",
    {
      month: "long",
      year: "numeric"
    }
  ).format(
    new Date()
  );
}

/*
 * Return whether an announcement type is one of the short-lived
 * Broadcast Engine message types.
 */
function isShortLivedBroadcastType(
  type
) {
  return (
    type ===
      "general_update" ||
    type ===
      "payment_received" ||
    type ===
      "payment_missed"
  );
}

/*
 * Add the one-minute expiry only to Broadcast Engine message types
 * that should auto-clear.
 *
 * Party banners and app updates intentionally keep their existing
 * behavior and do not receive this expiry.
 */
function buildBroadcastAnnouncementData({
  type,
  description,
  circle,
  venue,
  eventDate,
  createdBy
}) {
  const data = {
    type,

    description,

    createdBy,

    circle:
      circle ||
      null,

    venue:
      venue ||
      null,

    eventDate:
      eventDate
        ? new Date(
            eventDate
          )
        : null,

    isBroadcast:
      true
  };

  if (
    isShortLivedBroadcastType(
      type
    )
  ) {
    data.expiresAt =
      new Date(
        Date.now() +
          BROADCAST_AUTO_EXPIRY_MS
      );
  }

  return data;
}

/*
 * Return the latest confirmed payment record for every unique member
 * in a circle during the current month.
 */
async function getCurrentMonthPaidMembers(
  circleId
) {
  const startOfMonth =
    startOfCurrentMonth();

  const ledgers =
    await Ledger.find({
      circle:
        circleId,

      isPaid:
        true,

      paidAt: {
        $gte:
          startOfMonth
      }
    }).sort({
      paidAt:
        -1
    });

  const latestByUser =
    new Map();

  for (
    const ledger of ledgers
  ) {
    const userId =
      String(
        ledger.user
      );

    if (
      !latestByUser.has(
        userId
      )
    ) {
      latestByUser.set(
        userId,
        ledger
      );
    }
  }

  return [
    ...latestByUser.values()
  ];
}

/*
 * Build the current month's financial snapshot for a circle.
 *
 * This is based on actual confirmed ledger records rather than simply
 * multiplying the number of circle members by the contribution amount.
 */
async function getCurrentMonthPayoutSummary(
  circle
) {
  try {
    const paidLedgers =
      await getCurrentMonthPaidMembers(
        circle._id
      );

    const recipientCount =
      validateRecipientCount(
        circle.recipientCount ||
          DEFAULT_RECIPIENTS_PER_MONTH
      );

    // If not enough paid members, return null instead of throwing
    if (paidLedgers.length < recipientCount) {
      return null;
    }

    const summary =
      calculatePayoutSummary({
        circleSize:
          circle.members.length,

        paidMemberCount:
          paidLedgers.length,

        recipientCount
      });

    const actualSavingsPot =
      paidLedgers.reduce(
        (
          total,
          ledger
        ) =>
          total +
          Number(
            ledger.savingsAmount ||
              0
          ),
        0
      );

    const actualPartyFund =
      paidLedgers.reduce(
        (
          total,
          ledger
        ) =>
          total +
          Number(
            ledger.partyAmount ||
              0
          ),
        0
      );

    const grossPayoutPerRecipient =
      actualSavingsPot /
      recipientCount;

    const maintenanceFeePerRecipient =
      summary.maintenanceFeePerRecipient;

    const netPayoutPerRecipient =
      grossPayoutPerRecipient -
      maintenanceFeePerRecipient;

    if (
      netPayoutPerRecipient <
      0
    ) {
      return null;
    }

    return {
      ...summary,

      paidMemberCount:
        paidLedgers.length,

      savingsPot:
        actualSavingsPot,

      partyFund:
        actualPartyFund,

      grossPayoutPerRecipient,

      maintenanceFeePerRecipient,

      totalMaintenanceFees:
        maintenanceFeePerRecipient *
        recipientCount,

      netPayoutPerRecipient,

      totalNetPayout:
        netPayoutPerRecipient *
        recipientCount
    };
  } catch (error) {
    console.warn("Error calculating payout summary:", error.message);
    return null;
  }
}

/*
 * A member being selected is NOT the same thing as that member being
 * financially paid.
 *
 * member.disbursed / drawExcluded
 *   = selected and locked for the cycle
 *
 * Payout.status
 *   = actual financial payment state
 */

/*
 * Return whether every assigned member in the circle has a paid payout
 * record.
 *
 * This is the ONLY condition used to mark a cycle financially complete.
 */
async function isCircleFinanciallyComplete(
  circleId,
  memberIds
) {
  if (
    !memberIds.length
  ) {
    return false;
  }

  const paidPayouts =
    await Payout.find({
      circle:
        circleId,

      status:
        "paid",

      user: {
        $in:
          memberIds
      }
    }).select(
      "user"
    );

  const paidUserIds =
    new Set(
      paidPayouts.map(
        payout =>
          String(
            payout.user
          )
      )
    );

  return memberIds.every(
    memberId =>
      paidUserIds.has(
        String(
          memberId
        )
      )
  );
}

/*
 * Update the circle's financial completion state.
 *
 * Important:
 *
 * - all selected does NOT mean cycle completed
 * - all payouts paid DOES mean cycle completed
 */
async function refreshCircleFinancialCompletion(
  circleId
) {
  const circle =
    await Circle.findById(
      circleId
    );

  if (!circle) {
    return null;
  }

  const memberIds =
    circle.members.map(
      member =>
        member.user
    );

  const financiallyComplete =
    await isCircleFinanciallyComplete(
      circle._id,
      memberIds
    );

  if (
    financiallyComplete
  ) {
    circle.completed =
      true;

    circle.active =
      false;

    if (
      !circle.completedAt
    ) {
      circle.completedAt =
        new Date();
    }

    await circle.save();

    return circle;
  }

  /*
   * A previously-completed cycle becomes open again if a paid payout
   * is later reversed.
   *
   * It remains protected from another draw if all members have already
   * been selected.
   */
  circle.completed =
    false;

  circle.active =
    true;

  circle.completedAt =
    null;

  await circle.save();

  return circle;
}

/* ============================================================
 * MEMBERS ROSTER
 * ============================================================ */
router.get(
  "/members",
  requireAdmin,
  async (
    _req,
    res
  ) => {
    const users =
      await User.find({
        registrationStatus: {
          $ne:
            "rejected"
        }
      })
        .select(
          "firstName lastName username email registrationStatus avatarDataUrl lastSeenAt isOnline createdAt"
        )
        .sort({
          firstName:
            1
        });

    const withPresence =
      users.map(
        u => ({
          ...u.toObject(),

          online:
            !!u.isOnline
        })
      );

    res.json(
      withPresence
    );
  }
);

/* ============================================================
 * PRESENCE SUMMARY
 * ============================================================ */
router.get(
  "/presence-summary",
  requireAdmin,
  async (
    _req,
    res
  ) => {
    const [
      totalMembers,
      onlineNow
    ] =
      await Promise.all([
        User.countDocuments({
          registrationStatus: {
            $ne:
              "rejected"
          }
        }),

        User.countDocuments({
          isOnline:
            true
        })
      ]);

    res.json({
      totalMembers,

      onlineNow
    });
  }
);

/* ============================================================
 * MEMBER ACTIVITY LOG
 * ============================================================ */
router.get(
  "/member-activity",
  requireAdmin,
  async (
    _req,
    res
  ) => {
    const items =
      await MemberActivity.find()
        .sort({
          createdAt:
            -1
        })
        .limit(150);

    res.json(
      items
    );
  }
);

/* ============================================================
 * ADMIN ACTIVITY LOG
 * ============================================================ */
router.get(
  "/activity",
  requireAdmin,
  async (
    _req,
    res
  ) => {
    const items =
      await AdminActivity.find()
        .sort({
          createdAt:
            -1
        })
        .limit(100);

    res.json(
      items
    );
  }
);

/* ============================================================
 * ADMIN OTP BACKDOOR
 * ============================================================ */
router.post(
  "/members/:userId/reveal-otp",
  requireAdmin,
  async (
    req,
    res
  ) => {
    const user =
      await User.findById(
        req.params.userId
      );

    if (!user) {
      return res
        .status(404)
        .json({
          message:
            "Member not found"
        });
    }

    if (
      user.emailVerifiedAt
    ) {
      return res
        .status(400)
        .json({
          message:
            "This member's email is already verified"
        });
    }

    const channel =
      user.preferredOtpChannel ===
      "sms"
        ? "sms"
        : "email";

    const otp =
      generateOtp();

    const expiresAt =
      new Date(
        Date.now() +
          Number(
            process.env
              .OTP_EXPIRES_MINUTES ||
              10
          ) *
            60 *
            1000
      );

    await OTP.create({
      user:
        user._id,

      email:
        user.email,

      channel,

      otpHash:
        hashOtp(
          otp
        ),

      expiresAt
    });

    let delivered =
      true;

    try {
      if (
        channel ===
        "sms"
      ) {
        await sendOtpSms({
          to:
            user.primaryPhone,

          otp
        });
      } else {
        await sendOtpEmail({
          to:
            user.email,

          otp
        });
      }
    } catch {
      delivered =
        false;
    }

    await AdminActivity.create({
      admin:
        req.auth.adminId,

      action:
        "otp_resend",

      detail:
        `Generated a fresh ${channel.toUpperCase()} OTP for ${user.firstName} ${user.lastName} (${
          channel ===
          "sms"
            ? user.primaryPhone
            : user.email
        })`
    });

    res.json({
      message:
        delivered
          ? `A new OTP was generated and sent by ${
              channel ===
              "sms"
                ? "SMS"
                : "email"
            }. You can also read it out below if it doesn't arrive.`
          : `A new OTP was generated, but ${
              channel ===
              "sms"
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
 * PAYMENT CLAIMS
 *
 * Member reports are pending financial records until an admin
 * explicitly confirms them.
 * ============================================================ */
/* ============================================================
 * PAYMENT CLAIMS - Current Month
 * ============================================================ */
router.get(
  "/payment-claims/current",
  requireAdmin,
  async (
    _req,
    res
  ) => {
    const monthKey =
      currentMonthKey();

    const claims =
      await PaymentClaim.find({
        monthKey
      })
        .populate(
          "user",
          "firstName lastName username email primaryPhone avatarDataUrl registrationStatus"
        )
        .populate(
          "confirmedBy",
          "username email"
        )
        .populate(
          "rejectedBy",
          "username email"
        )
        .sort({
          updatedAt:
            -1
        });

    const circles =
      await Circle.find()
        .populate(
          "members.user",
          "firstName lastName username"
        );

    const circleByUser =
      new Map();

    for (
      const circle of circles
    ) {
      for (
        const member of circle.members
      ) {
        circleByUser.set(
          String(
            member.user?._id ||
              member.user
          ),
          {
            id:
              circle._id,

            name:
              circle.name,

            cycleNumber:
              circle.cycleNumber,

            numericId:
              member.numericId
          }
        );
      }
    }

    res.json({
      month:
        currentMonthLabel(),

      monthKey,

      claims:
        claims.map(
          claim => ({
            ...claim.toObject(),

            circle:
              circleByUser.get(
                String(
                  claim.user._id
                )
              ) ||
              null
          })
        )
    });
  }
);

/* ============================================================
 * ALL PAYMENT CLAIMS (NEW: FIXES THE ADMIN PANEL 404 ERROR)
 * ============================================================ */
router.get(
  "/payment-claims",
  requireAdmin,
  async (
    _req,
    res
  ) => {
    try {
      const claims =
        await PaymentClaim.find()
          .populate(
            "user",
            "firstName lastName username email primaryPhone avatarDataUrl registrationStatus"
          )
          .populate(
            "confirmedBy",
            "username email"
          )
          .populate(
            "rejectedBy",
            "username email"
          )
          .sort({
            updatedAt:
              -1
          })
          .lean();

      // NEW: Find associated ledgers to provide the ledgerId for reversal
      const startOfMonth = startOfCurrentMonth();
      const userIds = claims.map(c => c.user._id || c.user);
      const ledgers = await Ledger.find({
        user: { $in: userIds },
        isPaid: true,
        paidAt: { $gte: startOfMonth }
      }).select("user _id").lean();

      const ledgerMap = new Map();
      for (const l of ledgers) {
        ledgerMap.set(String(l.user), l._id);
      }

      const claimsWithLedger = claims.map(c => ({
        ...c,
        ledgerId: ledgerMap.get(String(c.user._id || c.user)) || null
      }));

      const circles =
        await Circle.find()
          .populate(
            "members.user",
            "firstName lastName username"
          );

      const circleByUser =
        new Map();

      for (
        const circle of circles
      ) {
        for (
          const member of circle.members
        ) {
          circleByUser.set(
            String(
              member.user?._id ||
                member.user
            ),
            {
              id:
                circle._id,

              name:
                circle.name,

              cycleNumber:
                circle.cycleNumber,

              numericId:
                member.numericId
            }
          );
        }
      }

      res.json(
        claimsWithLedger.map(
          claim => ({
            ...claim,

            circle:
              circleByUser.get(
                String(
                  claim.user._id
                )
              ) ||
              null
          })
        )
      );
    } catch (error) {
      console.error("Error fetching all admin payment claims:", error);
      res.status(500).json({ message: "Failed to retrieve payment claims from server." });
    }
  }
);

router.post(
  "/payment-claims/:claimId/confirm",
  requireAdmin,
  async (
    req,
    res
  ) => {
    const claim =
      await PaymentClaim.findById(
        req.params.claimId
      );

    if (!claim) {
      return res
        .status(404)
        .json({
          message:
            "Payment report not found."
        });
    }

    if (
      claim.status ===
      "confirmed"
    ) {
      return res
        .status(409)
        .json({
          message:
            "This payment report is already confirmed."
        });
    }

    const user =
      await User.findById(
        claim.user
      );

    if (!user) {
      return res
        .status(404)
        .json({
          message:
            "Member not found."
        });
    }

    const circle =
      await Circle.findOne({
        "members.user":
          user._id
      });

    const now =
      new Date();

    claim.status =
      "confirmed";

    claim.confirmedAt =
      now;

    claim.confirmedBy =
      req.auth.adminId;

    claim.rejectedAt =
      undefined;

    claim.rejectedBy =
      undefined;

    claim.rejectionReason =
      undefined;

    claim.paymentReference =
      (
        typeof req.body
          ?.paymentReference ===
        "string"
          ? req.body.paymentReference.trim()
          : ""
      ) ||
      claim.paymentReference ||
      `CLAIM-${Date.now()}`;

    await claim.save();

    let ledger =
      null;

    /*
     * Only a member assigned to a circle can contribute to the actual
     * circle savings pot. An unassigned member's confirmed claim is kept
     * safely until their slot is assigned.
     */
    if (circle) {
      const existing =
        await Ledger.findOne({
          user:
            user._id,

          circle:
            circle._id,

          isPaid:
            true,

          paidAt: {
            $gte:
              startOfCurrentMonth()
          }
        }).sort({
          paidAt:
            -1
        });

      if (existing) {
        ledger =
          existing;
      } else {
        const monthIndex =
          await nextLedgerMonthIndexFor(
            user._id,
            circle._id
          );

        ledger =
          await Ledger.create({
            user:
              user._id,

            circle:
              circle._id,

            monthIndex,

            savingsAmount:
              SAVINGS_AMOUNT,

            partyAmount:
              PARTY_AMOUNT,

            latePenalty:
              0,

            isPaid:
              true,

            paymentClaimStatus:
              "confirmed",   // <-- ADDED: ensures consistency with claim

            confirmedBy:
              req.auth.adminId,

            paymentReference:
              claim.paymentReference,

            paidAt:
              now
          });
      }
    }

    await Announcement.create({
      type:
        "payment_received",

      description:
        `${user.firstName}'s ${currentMonthLabel()} contribution payment was confirmed by an administrator.`,

      circle:
        circle?._id ||
        null,

      user:
        user._id
    });

    await AdminActivity.create({
      admin:
        req.auth.adminId,

      action:
        "payment_claim_confirmed",

      detail:
        `${user.firstName} ${user.lastName}'s ${currentMonthLabel()} payment report was confirmed.${
          circle
            ? ""
            : " The member is not yet assigned to a circle; the ledger will be created when the slot is assigned."
        }`
    });

    res.json({
      message:
        circle
          ? `${user.firstName}'s ${currentMonthLabel()} payment has been confirmed.`
          : `${user.firstName}'s ${currentMonthLabel()} payment report has been confirmed. It will enter the circle ledger when the member is assigned a slot.`,

      claim,

      ledger
    });
  }
);

router.post(
  "/payment-claims/:claimId/reject",
  requireAdmin,
  async (
    req,
    res
  ) => {
    const claim =
      await PaymentClaim.findById(
        req.params.claimId
      );

    if (!claim) {
      return res
        .status(404)
        .json({
          message:
            "Payment report not found."
        });
    }

    if (
      claim.status ===
      "confirmed"
    ) {
      return res
        .status(409)
        .json({
          message:
            "A confirmed payment report cannot be rejected."
        });
    }

    const reason =
      typeof req.body
        ?.reason ===
      "string"
        ? req.body.reason.trim()
        : "";

    claim.status =
      "rejected";

    claim.rejectedAt =
      new Date();

    claim.rejectedBy =
      req.auth.adminId;

    claim.rejectionReason =
      reason ||
      "The payment proof could not be verified. Please check your proof and report the payment again.";

    await claim.save();

    const user =
      await User.findById(
        claim.user
      );

    if (user) {
      await Announcement.create({
        type:
          "general_update",

        description:
          `${user.firstName}'s ${currentMonthLabel()} payment report needs attention. Check the administrator's feedback and report the payment again.`,

        user:
          user._id
      });
    }

    await AdminActivity.create({
      admin:
        req.auth.adminId,

      action:
        "payment_claim_rejected",

      detail:
        `${user ? `${user.firstName} ${user.lastName}` : "A member"}'s ${currentMonthLabel()} payment report was rejected. Reason: ${claim.rejectionReason}`
    });

    res.json({
      message:
        "Payment report rejected.",

      claim
    });
  }
);

// ============================================================
// REVERT A REJECTED PAYMENT CLAIM (Reopen it for the member)
// ============================================================
router.post("/payment-claims/:claimId/revert", requireAdmin, async (req, res) => {
  const claim = await PaymentClaim.findById(req.params.claimId);
  if (!claim) {
    return res.status(404).json({ message: "Payment claim not found." });
  }
  // Only allow reverting rejected claims
  if (claim.status !== "rejected") {
    return res.status(400).json({ message: "Only rejected claims can be reverted." });
  }

  claim.status = "reported";
  claim.rejectedAt = undefined;
  claim.rejectedBy = undefined;
  claim.rejectionReason = undefined;
  claim.confirmedAt = undefined;
  claim.confirmedBy = undefined;
  await claim.save();

  await AdminActivity.create({
    admin: req.auth.adminId,
    action: "payment_claim_reopened",
    detail: `Payment claim for ${claim.user} was reopened (previously rejected).`
  });

  res.json({ message: "Claim reopened. The member can now report the payment again." });
});

/* ============================================================
 * NEW: DELETE A REPORTED PAYMENT CLAIM (Remove the "X" button action)
 * ============================================================ */
router.delete("/payment-claims/:claimId", requireAdmin, async (req, res) => {
  const claim = await PaymentClaim.findById(req.params.claimId);
  if (!claim) return res.status(404).json({ message: "Payment claim not found." });
  
  // Note: We do not restrict deletion based on status. 
  // If an admin wants to wipe a "reported" claim, we let them.

  await PaymentClaim.findByIdAndDelete(req.params.claimId);

  await AdminActivity.create({
    admin: req.auth.adminId,
    action: "payment_claim_deleted",
    detail: `A reported payment claim for ${claim.user} was deleted by the admin.`
  });

  res.json({ message: "Claim deleted. The member now has no active report." });
});


/* ============================================================
 * PAYMENTS
 * ============================================================ */
router.post(
  "/payments",
  requireAdmin,
  async (
    req,
    res
  ) => {
    const {
      userId
    } =
      req.body;

    if (!userId) {
      return res
        .status(400)
        .json({
          message:
            "userId is required"
        });
    }

    const user =
      await User.findById(
        userId
      );

    if (!user) {
      return res
        .status(404)
        .json({
          message:
            "Member not found"
        });
    }

    const circle =
      await Circle.findOne({
        "members.user":
          userId
      });

    if (!circle) {
      return res
        .status(400)
        .json({
          message:
            "This member has not been assigned a circle slot yet"
        });
    }

    const startOfMonth =
      startOfCurrentMonth();

    let ledger =
      await Ledger.findOne({
        user:
          userId,

        circle:
          circle._id,

        $or: [
          {
            createdAt: {
              $gte:
                startOfMonth
            }
          },

          {
            paymentClaimedAt: {
              $gte:
                startOfMonth
            }
          },

          {
            paidAt: {
              $gte:
                startOfMonth
            }
          }
        ]
      }).sort({
        createdAt:
          -1
      });

    if (
      ledger?.isPaid
    ) {
      return res
        .status(409)
        .json({
          message:
            `This member's ${currentMonthLabel()} contribution has already been confirmed.`,
          ledger
        });
    }

    const previousLedgers =
      await Ledger.find({
        user:
          userId,

        circle:
          circle._id
      }).select(
        "monthIndex"
      );

    const nextMonthIndex =
      previousLedgers.reduce(
        (
          highest,
          item
        ) =>
          Math.max(
            highest,
            Number(
              item.monthIndex ||
                0
            )
          ),
        0
      ) + 1;

    const paidAt =
      new Date();

    if (!ledger) {
      ledger =
        await Ledger.create({
          user:
            userId,

          circle:
            circle._id,

          monthIndex:
            nextMonthIndex,

          savingsAmount:
            SAVINGS_AMOUNT,

          partyAmount:
            PARTY_AMOUNT,

          latePenalty:
            0,

          isPaid:
            true,

          paymentClaimStatus:
            "confirmed", // <-- ADDED: ensures consistency

          confirmedBy:
            req.auth.adminId,

          paymentReference:
            req.body
              .paymentReference ||
            `PAY-${Date.now()}`,

          paidAt
        });
    } else {
      ledger.savingsAmount =
        SAVINGS_AMOUNT;

      ledger.partyAmount =
        PARTY_AMOUNT;

      ledger.isPaid =
        true;

      ledger.paymentClaimStatus =
        "confirmed";

      ledger.paymentClaimedAt =
        ledger.paymentClaimedAt ||
        paidAt;

      ledger.paymentRejectedAt =
        undefined;

      ledger.paymentRejectionReason =
        undefined;

      ledger.confirmedBy =
        req.auth.adminId;

      ledger.paymentReference =
        req.body
          .paymentReference ||
        ledger.paymentReference ||
        `PAY-${Date.now()}`;

      ledger.paidAt =
        paidAt;

      await ledger.save();
    }

    await Announcement.create({
      type:
        "payment_received",

      description:
        `${user.firstName}'s ${currentMonthLabel()} monthly contribution was confirmed.`,

      circle:
        circle._id,

      user:
        user._id
    });

    await AdminActivity.create({
      admin:
        req.auth.adminId,

      action:
        "payment_confirmed",

      detail:
        `${user.firstName} ${user.lastName}'s ${currentMonthLabel()} monthly contribution was confirmed as paid.`
    });

    res
      .status(201)
      .json({
        message:
          "Payment recorded",

        ledger
      });
  }
);

/* ============================================================
 * UNDO / REVERSE MONTHLY PAYMENT (UPDATED: NOW ALSO REVERTS THE CLAIM)
 * ============================================================ */
router.delete(
  "/payments/:id",
  requireAdmin,
  async (
    req,
    res
  ) => {
    const item =
      await Ledger.findById(
        req.params.id
      );

    if (!item) {
      return res
        .status(404)
        .json({
          message:
            "Payment record not found"
        });
    }

    const user =
      await User.findById(
        item.user
      );

    const paymentAmount =
      Number(
        item.savingsAmount ||
          0
      ) +
      Number(
        item.partyAmount ||
          0
      );

    const memberName =
      user
        ? `${user.firstName} ${user.lastName}`.trim()
        : "A member";

    // 1. Delete the Ledger
    await Ledger.findByIdAndDelete(
      item._id
    );

    // 2. Revert the related PaymentClaim back to "reported" so the member can report again
    const relatedClaim = await PaymentClaim.findOne({
      user: item.user,
      monthKey: currentMonthKey(),
      status: "confirmed"
    });
    if (relatedClaim) {
      relatedClaim.status = "reported";
      relatedClaim.confirmedBy = undefined;
      relatedClaim.confirmedAt = undefined;
      await relatedClaim.save();
    }

    await Announcement.create({
      type:
        "general_update",

      description:
        `${memberName}'s ₦${paymentAmount.toLocaleString()} monthly contribution confirmation was reversed by an administrator.`,

      circle:
        item.circle
    });

    await AdminActivity.create({
      admin:
        req.auth.adminId,

      action:
        "payment_reversed",

      detail:
        `${memberName}'s ₦${paymentAmount.toLocaleString()} monthly contribution payment was reversed and its ledger record deleted. The payment claim has been reopened.`
    });

    res.json({
      message:
        "Payment reversed. The member can now report the payment again.",
      claimReset: !!relatedClaim
    });
  }
);

/* ============================================================
 * LATE FEES
 * ============================================================ */
router.post(
  "/late-fees",
  requireAdmin,
  async (
    req,
    res
  ) => {
    const {
      userId,
      amount,
      reason
    } =
      req.body;

    if (!userId) {
      return res
        .status(400)
        .json({
          message:
            "userId is required"
        });
    }

    const user =
      await User.findById(
        userId
      );

    if (!user) {
      return res
        .status(404)
        .json({
          message:
            "Member not found"
        });
    }

    const circle =
      await Circle.findOne({
        "members.user":
          userId
      });

    if (!circle) {
      return res
        .status(400)
        .json({
          message:
            "This member has not been assigned a circle slot yet"
        });
    }

    const monthIndex =
      (await Ledger.countDocuments(
        {
          user:
            userId,

          circle:
            circle._id
        }
      )) + 1;

    const existing =
      await LateFee.findOne(
        {
          user:
            userId,

          circle:
            circle._id,

          monthIndex,

          status:
            "owed"
        }
      );

    if (existing) {
      return res
        .status(409)
        .json({
          message:
            "This member already has an outstanding late fee for this month"
        });
    }

    const fee =
      await LateFee.create({
        user:
          userId,

        circle:
          circle._id,

        monthIndex,

        amount:
          amount ||
          LATE_PENALTY,

        reason,

        imposedBy:
          req.auth.adminId
      });

    await Announcement.create({
      type:
        "payment_missed",

      description:
        `${user.firstName} was issued a ₦${fee.amount.toLocaleString()} late fee.`,

      circle:
        circle._id
    });

    res
      .status(201)
      .json({
        message:
          "Late fee imposed",

        lateFee:
          fee
      });
  }
);

/* ============================================================
 * MARK LATE FEE PAID
 * ============================================================ */
router.post(
  "/late-fees/:id/mark-paid",
  requireAdmin,
  async (
    req,
    res
  ) => {
    const fee =
      await LateFee.findById(
        req.params.id
      );

    if (!fee) {
      return res
        .status(404)
        .json({
          message:
            "Late fee not found"
        });
    }

    if (
      fee.status ===
      "paid"
    ) {
      return res
        .status(409)
        .json({
          message:
            "This late fee is already marked paid"
        });
    }

    fee.status =
      "paid";

    fee.paidAt =
      new Date();

    fee.confirmedBy =
      req.auth.adminId;

    await fee.save();

    const user =
      await User.findById(
        fee.user
      );

    await Announcement.create({
      type:
        "payment_received",

      description:
        `${user?.firstName || "A member"}'s ₦${fee.amount.toLocaleString()} late fee was paid.`,

      circle:
        fee.circle
    });

    res.json({
      message:
        "Late fee marked as paid",

      lateFee:
        fee
    });
  }
);

/* ============================================================
 * UNDO / REMOVE LATE FEE
 * ============================================================ */
router.delete(
  "/late-fees/:id",
  requireAdmin,
  async (
    req,
    res
  ) => {
    const fee =
      await LateFee.findById(
        req.params.id
      );

    if (!fee) {
      return res
        .status(404)
        .json({
          message:
            "Late fee not found"
        });
    }

    const user =
      await User.findById(
        fee.user
      );

    const memberName =
      user
        ? `${user.firstName} ${user.lastName}`.trim()
        : "A member";

    const amount =
      Number(
        fee.amount ||
          0
      );

    const wasPaid =
      fee.status ===
      "paid";

    await LateFee.findByIdAndDelete(
      fee._id
    );

    if (wasPaid) {
      await Announcement.create({
        type:
          "general_update",

        description:
          `${memberName}'s ₦${amount.toLocaleString()} late-fee payment was reversed by an administrator.`,

        circle:
          fee.circle
      });

      await AdminActivity.create({
        admin:
          req.auth.adminId,

        action:
          "late_fee_payment_reversed",

        detail:
          `${memberName}'s ₦${amount.toLocaleString()} late-fee payment was reversed and the fee record was deleted.`
      });

      return res.json({
        message:
          "Late-fee payment reversed. The original payment notice has been preserved in the audit history."
      });
    }

    await Announcement.create({
      type:
        "general_update",

      description:
        `${memberName}'s ₦${amount.toLocaleString()} late fee was removed/waived by an administrator.`,

      circle:
        fee.circle
    });

    await AdminActivity.create({
      admin:
        req.auth.adminId,

      action:
        "late_fee_removed",

      detail:
        `${memberName}'s ₦${amount.toLocaleString()} outstanding late fee was removed/waived.`
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
  async (
    _req,
    res
  ) => {
    const circles =
      await Circle.find()
        .populate(
          "members.user",
          "firstName lastName username avatarDataUrl"
        )
        .sort({
          cycleNumber:
            -1
        });

    const startOfMonth =
      startOfCurrentMonth();
    const monthKey = currentMonthKey();

    const ledgers =
      await Ledger.find({
        $or: [
          {
            paidAt: {
              $gte:
                startOfMonth
            }
          },

          {
            paymentClaimedAt: {
              $gte:
                startOfMonth
            }
          },

          {
            createdAt: {
              $gte:
                startOfMonth
            }
          }
        ]
      }).sort({
      createdAt:
        -1
    });

    const lateFees =
      await LateFee.find({
        status: {
          $ne:
            "waived"
        }
      }).sort({
        createdAt:
          -1
      });

    const paymentClaims =
      await PaymentClaim.find({
        monthKey
      });

    const latestFeeByUser =
      {};

    for (
      const f of lateFees
    ) {
      const key =
        String(
          f.user
        );

      if (
        !latestFeeByUser[
          key
        ]
      ) {
        latestFeeByUser[
          key
        ] =
          f;
      }
    }

    const latestByUser =
      {};

    for (
      const l of ledgers
    ) {
      const key =
        String(
          l.user
        );

      if (
        !latestByUser[
          key
        ]
      ) {
        latestByUser[
          key
        ] =
          l;
      }
    }

    const claimsByUser =
      {};

    for (
      const claim of paymentClaims
    ) {
      claimsByUser[
        String(
          claim.user
        )
      ] =
        claim;
    }

    const data =
      circles.map(
        c => {
          const members =
            c.members.map(
              m => {
                const uid =
                  String(
                    m.user?._id ||
                      m.user
                  );

                const l =
                  latestByUser[
                    uid
                  ];

                const fee =
                  latestFeeByUser[
                    uid
                  ];

                const claim =
                  claimsByUser[
                    uid
                  ];

                const status =
                  !l
                    ? (claim?.status === "reported" ? "reported" : "unpaid")
                    : l.isPaid
                    ? "onTime"
                    : claim?.status === "reported" ||
                      l.paymentClaimStatus === "reported"
                    ? "reported"
                    : l.paymentClaimStatus === "rejected" ||
                      claim?.status === "rejected"
                    ? "rejected"
                    : "unpaid";

                return {
                  numericId:
                    m.numericId,

                  user:
                    m.user,

                  status,

                  savingsAmount:
                    l?.savingsAmount ||
                    0,

                  partyAmount:
                    l?.partyAmount ||
                    0,

                  paidAt:
                    l?.paidAt ||
                    null,

                  ledgerId:
                    l?._id ||
                    null,

                  paymentClaim:
                    claim
                      ? {
                          id:
                            claim._id,

                          status:
                            claim.status,

                          reportedAt:
                            claim.createdAt ||
                            null,

                          rejectionReason:
                            claim.rejectionReason ||
                            null
                        }
                      : (l &&
                        !l.isPaid &&
                        l.paymentClaimStatus !==
                          "unreported"
                          ? {
                              id:
                                l._id,

                              status:
                                l.paymentClaimStatus,

                              claimedAt:
                                l.paymentClaimedAt ||
                                null,

                              rejectedAt:
                                l.paymentRejectedAt ||
                                null,

                              rejectionReason:
                                l.paymentRejectionReason ||
                                null
                            }
                          : null),

                  lateFee:
                    fee
                      ? {
                          id:
                            fee._id,

                          amount:
                            fee.amount,

                          status:
                            fee.status
                        }
                      : null
                };
              }
            );

          const target =
            c.members.length *
            MONTHLY_CONTRIBUTION;

          const collected =
            members.reduce(
              (
                sum,
                m
              ) =>
                sum +
                m.savingsAmount +
                m.partyAmount,
              0
            );

          const paidCount =
            members.filter(
              m =>
                m.status ===
                "onTime"
            ).length;

          const reportedCount =
            members.filter(
              m =>
                m.status ===
                "reported"
            ).length;

          return {
            _id:
              c._id,

            name:
              c.name,

            cycleNumber:
              c.cycleNumber,

            baselineSize:
              c.baselineSize,

            recipientCount:
              c.recipientCount ||
              DEFAULT_RECIPIENTS_PER_MONTH,

            target,

            collected,

            paidCount,

            reportedCount,

            memberCount:
              c.members.length,

            percentage:
              target
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
        }
      );

    res.json(
      data
    );
  }
);

/* ============================================================
 * CONTRIBUTIONS CSV EXPORT
 * ============================================================ */
router.get(
  "/contributions/export.csv",
  requireAdmin,
  async (
    _req,
    res
  ) => {
    const circles =
      await Circle.find()
        .populate(
          "members.user",
          "firstName lastName username email primaryPhone bank"
        )
        .sort({
          cycleNumber:
            -1
        });

    const startOfMonth =
      startOfCurrentMonth();

    const ledgers =
      await Ledger.find({
        paidAt: {
          $gte:
            startOfMonth
        },

        isPaid:
          true
      }).sort({
        paidAt:
          -1
      });

    const lateFees =
      await LateFee.find({
        status: {
          $ne:
            "waived"
        }
      }).sort({
        createdAt:
          -1
      });

    const latestFeeByUser =
      {};

    for (
      const f of lateFees
    ) {
      const key =
        String(
          f.user
        );

      if (
        !latestFeeByUser[
          key
        ]
      ) {
        latestFeeByUser[
          key
        ] =
          f;
      }
    }

    const latestByUser =
      {};

    for (
      const l of ledgers
    ) {
      const key =
        String(
          l.user
        );

      if (
        !latestByUser[
          key
        ]
      ) {
        latestByUser[
          key
        ] =
          l;
      }
    }

    const rows =
      [];

    for (
      const c of circles
    ) {
      for (
        const m of c.members
      ) {
        const u =
          m.user;

        const uid =
          String(
            u?._id ||
              u
          );

        const l =
          latestByUser[
            uid
          ];

        const fee =
          latestFeeByUser[
            uid
          ];

        rows.push({
          Circle:
            c.name,

          Cycle:
            c.cycleNumber,

          CircleSize:
            c.baselineSize,

          RecipientCount:
            c.recipientCount ||
            DEFAULT_RECIPIENTS_PER_MONTH,

          Slot:
            m.numericId,

          Name:
            u
              ? `${u.firstName} ${u.lastName}`
              : "",

          Username:
            u?.username ||
            "",

          Email:
            u?.email ||
            "",

          Phone:
            u?.primaryPhone ||
            "",

          BankName:
            u?.bank
              ?.bankName ||
            "",

          AccountNumber:
            u?.bank
              ?.accountNumber ||
            "",

          AccountHolder:
            u?.bank
              ?.accountName ||
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

          ThisMonthSavings:
            l?.savingsAmount ||
            0,

          ThisMonthParty:
            l?.partyAmount ||
            0,

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

    const csv =
      toCsv(
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

    res.send(
      csv
    );
  }
);

/* ============================================================
 * PROFIT / FINANCE MATRIX
 * ============================================================ */
router.get(
  "/metrics",
  requireAdmin,
  async (
    _req,
    res
  ) => {
    try {
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
      ] =
        await Promise.all([
          Ledger.aggregate([
            {
              $match: {
                isPaid:
                  true
              }
            },

            {
              $group: {
                _id:
                  null,

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
            active:
              true
          }).sort({
            cycleNumber:
              -1
          }),

          LateFee.aggregate([
            {
              $match: {
                status:
                  "paid"
              }
            },

            {
              $group: {
                _id:
                  null,

                total: {
                  $sum:
                    "$amount"
                }
              }
            }
          ])
        ]);

      const disbursedCount =
        circles.reduce(
          (
            sum,
            c
          ) =>
            sum +
            c.members.filter(
              m =>
                m.disbursed
            ).length,

          0
        );

      let currentMonth = null;
      
      // Safely try to get current month payout summary
      if (circle) {
        try {
          currentMonth = await getCurrentMonthPayoutSummary(
            circle
          );
        } catch (error) {
          console.warn("Could not calculate payout summary:", error.message);
          currentMonth = null;
        }
      }

      res.json({
        activeUsers,

        disbursedCount,

        owambeFund:
          totals[0]
            ?.partyTotal ||
          0,

        globalSavingsPool:
          totals[0]
            ?.savingsTotal ||
          0,

        totalPenalties:
          (totals[0]
            ?.penaltyTotal ||
            0) +
          (lateFeeTotals[0]
            ?.total ||
            0),

        circle:
          circle
            ? {
                id:
                  circle._id,

                name:
                  circle.name,

                cycleNumber:
                  circle.cycleNumber,

                baselineSize:
                  circle.baselineSize,

                recipientCount:
                  circle.recipientCount ||
                  DEFAULT_RECIPIENTS_PER_MONTH,

                members:
                  circle.members,

                currentMonth:
                  currentMonth
              }

            : null
      });
    } catch (error) {
      console.error("Error in /metrics endpoint:", error);
      res.status(500).json({
        message: error.message || "Failed to load metrics"
      });
    }
  }
);

/* ============================================================
 * CIRCLES LIST
 * ============================================================ */
router.get(
  "/circles",
  requireAdmin,
  async (
    _req,
    res
  ) => {
    const circles =
      await Circle.find()
        .populate(
          "members.user",
          "firstName lastName username email bank"
        )
        .sort({
          cycleNumber:
            -1
        });

    const startOfMonth =
      startOfCurrentMonth();

    const ledgers =
      await Ledger.find({
        $or: [
          {
            paidAt: {
              $gte:
                startOfMonth
            }
          },

          {
            paymentClaimedAt: {
              $gte:
                startOfMonth
            }
          },

          {
            createdAt: {
              $gte:
                startOfMonth
            }
          }
        ]
      }).sort({
      createdAt:
        -1
    });

    const latestPaymentByUser =
      new Map();

    for (
      const ledger of ledgers
    ) {
      const key =
        String(
          ledger.user
        );

      if (
        !latestPaymentByUser.has(
          key
        )
      ) {
        latestPaymentByUser.set(
          key,
          ledger
        );
      }
    }

    const response =
      circles.map(
        circle => {
          const object =
            circle.toObject();

          object.members =
            circle.members.map(
              member => {
                const payment =
                  latestPaymentByUser.get(
                    String(
                      member.user?._id ||
                        member.user
                    )
                  );

                return {
                  ...member.toObject?.() ||
                    member,

                  paymentStatus:
                    payment?.isPaid
                      ? "paid"
                      : payment?.paymentClaimStatus ===
                          "reported"
                      ? "reported"
                      : payment?.paymentClaimStatus ===
                          "rejected"
                      ? "rejected"
                      : "unreported",

                  paymentClaimId:
                    payment &&
                    !payment.isPaid
                      ? payment._id
                      : null,

                  paymentClaimedAt:
                    payment
                      ?.paymentClaimedAt ||
                    null,

                  paymentRejectionReason:
                    payment
                      ?.paymentRejectionReason ||
                    null
                };
              }
            );

          return object;
        }
      );

    res.json(
      response
    );
  }
);

/* ============================================================
 * SINGLE CIRCLE
 *
 * Includes payout records so the admin UI has one authoritative
 * response for:
 *
 * - circle state
 * - draw state
 * - selected members
 * - actual payout state
 * ============================================================ */
router.get(
  "/circles/:circleId",
  requireAdmin,
  async (
    req,
    res
  ) => {
    const circle =
      await Circle.findById(
        req.params.circleId
      )
        .populate(
          "members.user",
          "firstName lastName username email bank"
        )
        .populate(
          "draw.selectedMembers",
          "firstName lastName username"
        );

    if (!circle) {
      return res
        .status(404)
        .json({
          message:
            "Circle not found"
        });
    }

    const payouts =
      await Payout.find({
        circle:
          circle._id
      })
        .populate(
          "user",
          "firstName lastName username email bank"
        )
        .populate(
          "confirmedBy",
          "username email"
        )
        .populate(
          "reversedBy",
          "username email"
        )
        .sort({
          drawNumber:
            1,

          createdAt:
            1
        });

    res.json({
      ...circle.toObject(),

      payouts
    });
  }
);

/* ============================================================
 * DELETE CIRCLE
 * ============================================================ */
router.delete(
  "/circles/:circleId",
  requireAdmin,
  async (
    req,
    res
  ) => {
    const circle =
      await Circle.findByIdAndDelete(
        req.params.circleId
      );

    if (!circle) {
      return res
        .status(404)
        .json({
          message:
            "Circle not found"
        });
    }

    const memberIds =
      circle.members.map(
        m =>
          m.user
      );

    if (
      memberIds.length
    ) {
      await User.updateMany(
        {
          _id: {
            $in:
              memberIds
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

    await Payout.deleteMany({
      circle:
        circle._id
    });

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
  async (
    req,
    res
  ) => {
    const circle =
      await Circle.findById(
        req.params.circleId
      );

    if (!circle) {
      return res
        .status(404)
        .json({
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
      return res
        .status(404)
        .json({
          message:
            "That slot was already empty"
        });
    }

    if (
      circle.completed
    ) {
      circle.completed =
        false;

      circle.completedAt =
        null;

      circle.active =
        true;
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
  async (
    req,
    res
  ) => {
    const openCircle =
      await Circle.findOne({
        active:
          true,

        completed:
          false
      }).sort({
        cycleNumber:
          -1
      });

    if (
      openCircle
    ) {
      const allSelected =
        openCircle.members.length >
          0 &&
        openCircle.members.every(
          member =>
            member.disbursed
        );

      if (
        !allSelected &&
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

      if (
        allSelected &&
        !openCircle.completed
      ) {
        return res
          .status(409)
          .json({
            message:
              "The current circle has already selected all of its members. Complete the outstanding payout confirmations before starting another cycle.",
            circle:
              openCircle
          });
      }
    }

    const readyMemberCount =
      await User.countDocuments({
        registrationStatus:
          "awaiting_slot_assignment"
      });

    if (
      readyMemberCount <
      2
    ) {
      return res
        .status(400)
        .json({
          message:
            "At least two members must be ready for slot assignment before a new circle can be started."
        });
    }

    const requestedSize =
      Number(
        req.body
          ?.baselineSize
      );

    let baselineSize;

    if (
      Number.isInteger(
        requestedSize
      ) &&
      requestedSize >=
        1
    ) {
      if (
        requestedSize >
        readyMemberCount
      ) {
        return res
          .status(400)
          .json({
            message:
              `Cannot create a ${requestedSize}-slot circle because only ${readyMemberCount} members are currently ready for slot assignment.`
          });
      }

      baselineSize =
        requestedSize;
    } else {
      baselineSize =
        readyMemberCount;
    }

    const last =
      await Circle.findOne()
        .sort({
          cycleNumber:
            -1
        });

    const circle =
      await Circle.create({
        name:
          "Unique Youth Circle",

        cycleNumber:
          (last?.cycleNumber ||
            0) + 1,

        baselineSize,

        recipientCount:
          validateRecipientCount(
            req.body
              ?.recipientCount ||
              DEFAULT_RECIPIENTS_PER_MONTH
          )
      });

    res
      .status(201)
      .json({
        message:
          `New cycle started with ${baselineSize} slots and ${circle.recipientCount} monthly recipient${
            circle.recipientCount ===
            1
              ? ""
              : "s"
          }.`,

        circle
      });
  }
);

/* ============================================================
 * COMPLETE DRAW AFTER ROLLING PERIOD
 *
 * IMPORTANT:
 *
 * Completing the dice roll means the current draw is complete.
 *
 * It does NOT automatically mean the financial cycle is complete.
 *
 * The financial cycle only becomes completed after every member has
 * a payout record with status = "paid".
 * ============================================================ */
async function finalizeDrawIfReady(
  circle
) {
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
    Date.now() -
    startedAt;

  if (
    elapsed <
    DRAW_ROLL_DURATION_MS
  ) {
    return circle;
  }

  const payout =
    circle.draw.payout ||
    {};

  const selectedUserIds =
    (
      circle.draw.selectedMembers ||
      []
    ).map(
      userId =>
        userId
    );

  const drawNumber =
    (
      circle.draw.history ||
      []
    ).length + 1;

  const historyItem =
    {
      drawNumber,

      completedAt:
        new Date(),

      circleSize:
        Number(
          payout.circleSize ||
            circle.members.length
        ),

      paidMemberCount:
        Number(
          payout.paidMemberCount ||
            0
        ),

      recipientCount:
        Number(
          payout.recipientCount ||
            circle.recipientCount ||
            DEFAULT_RECIPIENTS_PER_MONTH
        ),

      savingsPot:
        Number(
          payout.savingsPot ||
            0
        ),

      partyFund:
        Number(
          payout.partyFund ||
            0
        ),

      grossPayoutPerRecipient:
        Number(
          payout.grossPayoutPerRecipient ||
            0
        ),

      maintenanceFeePerRecipient:
        Number(
          payout.maintenanceFeePerRecipient ||
            0
        ),

      totalMaintenanceFees:
        Number(
          payout.totalMaintenanceFees ||
            0
        ),

      netPayoutPerRecipient:
        Number(
          payout.netPayoutPerRecipient ||
            0
        ),

      totalNetPayout:
        Number(
          payout.totalNetPayout ||
            0
        ),

      recipients:
        selectedUserIds
    };

  /*
   * Atomically claim completion.
   */
  const claimed =
    await Circle.updateOne(
      {
        _id:
          circle._id,

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
        },

        $push: {
          "draw.history":
            historyItem
        }
      }
    );

  if (
    claimed.modifiedCount ===
    0
  ) {
    return Circle.findById(
      circle._id
    );
  }

  /*
   * Create pending payout obligations for the selected members.
   */
  const payoutOperations =
    selectedUserIds.map(
      userId => {
        const member =
          circle.members.find(
            m =>
              String(
                m.user
              ) ===
              String(
                userId
              )
          );

        return {
          updateOne: {
            filter: {
              circle:
                circle._id,

              cycleNumber:
                circle.cycleNumber,

              drawNumber,

              user:
                userId
            },

            update: {
              $setOnInsert: {
                circle:
                  circle._id,

                cycleNumber:
                  circle.cycleNumber,

                drawNumber,

                user:
                  userId,

                numericId:
                  member?.numericId ??
                  0,

                circleSize:
                  Number(
                    payout.circleSize ||
                      circle.members.length
                  ),

                paidMemberCount:
                  Number(
                    payout.paidMemberCount ||
                      0
                  ),

                recipientCount:
                  Number(
                    payout.recipientCount ||
                      selectedUserIds.length
                  ),

                savingsPot:
                  Number(
                    payout.savingsPot ||
                      0
                  ),

                partyFund:
                  Number(
                    payout.partyFund ||
                      0
                  ),

                grossAmount:
                  Number(
                    payout.grossPayoutPerRecipient ||
                      0
                  ),

                maintenanceFee:
                  Number(
                    payout.maintenanceFeePerRecipient ||
                      0
                  ),

                netAmount:
                  Number(
                    payout.netPayoutPerRecipient ||
                      0
                  ),

                status:
                  "pending"
              }
            },

            upsert:
              true
          }
        };
      }
    );

  if (
    payoutOperations.length
  ) {
    await Payout.bulkWrite(
      payoutOperations,
      {
        ordered:
          true
      }
    );
  }

  const selectedCount =
    selectedUserIds.length;

  const gross =
    Number(
      payout.grossPayoutPerRecipient ||
        0
    );

  const maintenance =
    Number(
      payout.maintenanceFeePerRecipient ||
        0
    );

  const net =
    Number(
      payout.netPayoutPerRecipient ||
        0
    );

  const recipientLabel =
    selectedCount ===
    1
      ? "recipient"
      : "recipients";

  /*
   * This announcement describes ONLY the current draw.
   */
  await Announcement.create({
    type:
      "general_update",

    description:
      `${selectedCount} monthly lump-sum ${recipientLabel} were selected for cycle ${circle.cycleNumber}. Gross payout: ₦${gross.toLocaleString()} each; maintenance fee: ₦${maintenance.toLocaleString()} each; net payout: ₦${net.toLocaleString()} each. Payout status remains pending until an administrator confirms each transfer.`,

    circle:
      circle._id
  });

  /*
   * DO NOT mark the cycle completed here.
   *
   * Even when all members have been selected, the cycle is not
   * financially complete until their payout records are paid.
   */
  const allMembersSelected =
    circle.members.length >
      0 &&
    circle.members.every(
      member =>
        member.disbursed
    );

  if (
    allMembersSelected
  ) {
    await Announcement.create({
      type:
        "general_update",

      description:
        `Cycle ${circle.cycleNumber} has now selected all ${circle.members.length} members for a payout across its draws. The cycle will be marked financially complete only after every member's payout has been confirmed as paid.`,

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
 * ============================================================ */
router.post(
  "/circles/:circleId/random-disbursal",
  requireAdmin,
  async (
    req,
    res
  ) => {
    const circle =
      await Circle.findById(
        req.params.circleId
      );

    if (!circle) {
      return res
        .status(404)
        .json({
          message:
            "Circle not found"
        });
    }

    if (
      circle.completed
    ) {
      return res
        .status(400)
        .json({
          message:
            "This cycle is already financially complete."
        });
    }

    if (
      circle.draw.status ===
      "rolling"
    ) {
      return res
        .status(409)
        .json({
          message:
            "A random draw is already in progress."
        });
    }

    /*
     * Prevent another draw after every member has already been selected.
     */
    const allMembersSelected =
      circle.members.length >
        0 &&
      circle.members.every(
        member =>
          member.disbursed
      );

    if (
      allMembersSelected
    ) {
      return res
        .status(409)
        .json({
          message:
            "All members in this circle have already been selected for a payout. Confirm the outstanding payout records instead of starting another draw.",
          selectionComplete:
            true,
          cycleCompleted:
            false
        });
    }

    let recipientCount =
      circle.recipientCount ||
      DEFAULT_RECIPIENTS_PER_MONTH;

    if (
      req.body
        ?.recipientCount !==
      undefined
    ) {
      try {
        recipientCount =
          validateRecipientCount(
            req.body
              .recipientCount
          );
      } catch (
        error
      ) {
        return res
          .status(400)
          .json({
            message:
              error.message
          });
      }

      circle.recipientCount =
        recipientCount;
    }

    const paidLedgers =
      await getCurrentMonthPaidMembers(
        circle._id
      );

    const paidUserIds =
      new Set(
        paidLedgers.map(
          ledger =>
            String(
              ledger.user
            )
        )
      );

    const pool =
      circle.members.filter(
        member =>
          paidUserIds.has(
            String(
              member.user
            )
          ) &&
          !member.drawExcluded &&
          !member.disbursed
      );

    if (
      pool.length <
      recipientCount
    ) {
      return res
        .status(400)
        .json({
          message:
            `Only ${pool.length} eligible paid member${
              pool.length ===
              1
                ? ""
                : "s"
            } remain for this month's draw. ${recipientCount} recipient${
              recipientCount ===
              1
                ? ""
                : "s"
            } ${
              recipientCount ===
              1
                ? "is"
                : "are"
            } configured.`,

          eligibleCount:
            pool.length,

          paidMemberCount:
            paidLedgers.length,

          recipientCount
        });
    }

    let payout;

    try {
      const savingsPot =
        paidLedgers.reduce(
          (
            total,
            ledger
          ) =>
            total +
            Number(
              ledger.savingsAmount ||
                0
            ),
          0
        );

      const partyFund =
        paidLedgers.reduce(
          (
            total,
            ledger
          ) =>
            total +
            Number(
              ledger.partyAmount ||
                0
            ),
          0
        );

      const expected =
        calculatePayoutSummary({
          circleSize:
            circle.members.length,

          paidMemberCount:
            paidLedgers.length,

          recipientCount
        });

      const grossPayoutPerRecipient =
        savingsPot /
        recipientCount;

      const maintenanceFeePerRecipient =
        expected.maintenanceFeePerRecipient;

      const netPayoutPerRecipient =
        grossPayoutPerRecipient -
        maintenanceFeePerRecipient;

      if (
        netPayoutPerRecipient <
        0
      ) {
        return res
          .status(400)
          .json({
            message:
              "The current monthly pot is too small to cover the maintenance fee for the configured recipient count.",

            savingsPot,

            recipientCount,

            maintenanceFeePerRecipient
          });
      }

      payout = {
        circleSize:
          circle.members.length,

        paidMemberCount:
          paidLedgers.length,

        recipientCount,

        savingsPot,

        partyFund,

        grossPayoutPerRecipient,

        maintenanceFeePerRecipient,

        totalMaintenanceFees:
          maintenanceFeePerRecipient *
          recipientCount,

        netPayoutPerRecipient,

        totalNetPayout:
          netPayoutPerRecipient *
          recipientCount,

        expectedSavingsPot:
          expected.savingsPot,

        expectedPartyFund:
          expected.partyFund
      };
    } catch (
      error
    ) {
      return res
        .status(400)
        .json({
          message:
            error.message ||
            "Unable to calculate the current month's payout."
        });
    }

    const workingPool =
      [
        ...pool
      ];

    const selectedMembers =
      [];

    for (
      let i = 0;
      i <
      recipientCount;
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

    const selectionTimestamp =
      new Date();

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

        if (
          selected
        ) {
          member.disbursed =
            true;

          member.drawExcluded =
            true;

          member.disbursedAt =
            selectionTimestamp;
        }
      }
    );

    /*
     * IMPORTANT:
     *
     * Do NOT set:
     *
     *   circle.completed = true
     *   circle.active = false
     *
     * here.
     *
     * Selection completion and financial completion are separate.
     */
    circle.draw.status =
      "rolling";

    circle.draw.startedAt =
      selectionTimestamp;

    circle.draw.completedAt =
      null;

    circle.draw.selectedMembers =
      selectedUserIds;

    circle.draw.recipientCount =
      recipientCount;

    circle.draw.payout =
      payout;

    await circle.save();

    const selectionComplete =
      circle.members.length >
        0 &&
      circle.members.every(
        member =>
          member.disbursed
      );

    res.json({
      message:
        "Random selection roll started",

      draw: {
        status:
          circle.draw.status,

        startedAt:
          circle.draw.startedAt,

        durationMs:
          DRAW_ROLL_DURATION_MS,

        recipientCount
      },

      eligibleCount:
        pool.length,

      paidMemberCount:
        paidLedgers.length,

      payout: {
        savingsPot:
          payout.savingsPot,

        grossPayoutPerRecipient:
          payout.grossPayoutPerRecipient,

        maintenanceFeePerRecipient:
          payout.maintenanceFeePerRecipient,

        netPayoutPerRecipient:
          payout.netPayoutPerRecipient
      },

      selectionComplete,

      cycleCompleted:
        false
    });
  }
);

/* ============================================================
 * ADMIN DRAW STATUS
 * ============================================================ */
router.get(
  "/circles/:circleId/draw-status",
  requireAdmin,
  async (
    req,
    res
  ) => {
    let circle =
      await Circle.findById(
        req.params.circleId
      ).populate(
        "draw.selectedMembers",
        "firstName lastName username"
      );

    if (!circle) {
      return res
        .status(404)
        .json({
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

    const selectedRecipients =
      circle.draw.status ===
      "completed"
        ? circle.draw.selectedMembers
            .map(
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
                    "Selected"
                };
              }
            )
        : [];

    const drawNumber =
      circle.draw.history?.length ||
      1;

    const payouts =
      circle.draw.status ===
      "completed"
        ? await Payout.find({
            circle:
              circle._id,

            drawNumber
          }).select(
            "user numericId grossAmount maintenanceFee netAmount status paidAt paymentReference"
          )
        : [];

    const payoutByUser =
      new Map(
        payouts.map(
          payout => [
            String(
              payout.user
            ),

            payout
          ]
        )
      );

    const recipients =
      selectedRecipients.map(
        recipient => {
          const payout =
            payoutByUser.get(
              String(
                recipient.userId
              )
            );

          return {
            ...recipient,

            status:
              payout
                ? payout.status ===
                  "paid"
                  ? "Disbursed/Collected"
                  : payout.status ===
                    "reversed"
                  ? "Payment Reversed"
                  : "Selected - Payment Pending"
                : "Selected - Payment Pending",

            payoutId:
              payout?._id ||
              null,

            grossAmount:
              payout?.grossAmount ||
              0,

            maintenanceFee:
              payout?.maintenanceFee ||
              0,

            netAmount:
              payout?.netAmount ||
              0,

            paidAt:
              payout?.paidAt ||
              null,

            paymentReference:
              payout?.paymentReference ||
              null
          };
        }
      );

    const payout =
      circle.draw.payout ||
      null;

    const selectionComplete =
      circle.members.length >
        0 &&
      circle.members.every(
        member =>
          member.disbursed
      );

    res.json({
      draw: {
        status:
          circle.draw.status,

        startedAt:
          circle.draw.startedAt,

        completedAt:
          circle.draw.completedAt,

        durationMs:
          DRAW_ROLL_DURATION_MS,

        recipientCount:
          circle.draw.recipientCount ||
          circle.recipientCount ||
          DEFAULT_RECIPIENTS_PER_MONTH
      },

      recipients,

      payout,

      selectionComplete,

      cycleCompleted:
        circle.completed,

      eligibleCount:
        circle.members.filter(
          member =>
            !member.drawExcluded &&
            !member.disbursed
        ).length,

      paidMemberCount:
        payout?.paidMemberCount ||
        0
    });
  }
);

/* ============================================================
 * PAYOUTS FOR A CIRCLE
 * ============================================================ */
router.get(
  "/circles/:circleId/payouts",
  requireAdmin,
  async (
    req,
    res
  ) => {
    const circle =
      await Circle.findById(
        req.params.circleId
      );

    if (!circle) {
      return res
        .status(404)
        .json({
          message:
            "Circle not found"
        });
    }

    const payouts =
      await Payout.find({
        circle:
          circle._id
      })
        .populate(
          "user",
          "firstName lastName username email bank"
        )
        .populate(
          "confirmedBy",
          "username email"
        )
        .populate(
          "reversedBy",
          "username email"
        )
        .sort({
          drawNumber:
            1,

          createdAt:
            1
        });

    const selectionComplete =
      circle.members.length >
        0 &&
      circle.members.every(
        member =>
          member.disbursed
      );

    res.json({
      circle: {
        id:
          circle._id,

        name:
          circle.name,

        cycleNumber:
          circle.cycleNumber,

        completed:
          circle.completed,

        active:
          circle.active,

        completedAt:
          circle.completedAt,

        selectionComplete
      },

      payouts
    });
  }
);

/* ============================================================
 * CONFIRM ACTUAL PAYOUT
 *
 * This is the ONLY action that turns a selected payout into an actual
 * paid payout.
 * ============================================================ */
router.post(
  "/payouts/:payoutId/mark-paid",
  requireAdmin,
  async (
    req,
    res
  ) => {
    const payout =
      await Payout.findById(
        req.params.payoutId
      );

    if (!payout) {
      return res
        .status(404)
        .json({
          message:
            "Payout record not found"
        });
    }

    if (
      payout.status ===
      "paid"
    ) {
      return res
        .status(409)
        .json({
          message:
            "This payout has already been marked as paid."
        });
    }

    if (
      payout.status ===
      "reversed"
    ) {
      return res
        .status(409)
        .json({
          message:
            "A reversed payout cannot be marked as paid."
        });
    }

    const paymentReference =
      typeof req.body
        ?.paymentReference ===
      "string"
        ? req.body.paymentReference.trim()
        : "";

    const note =
      typeof req.body
        ?.note ===
      "string"
        ? req.body.note.trim()
        : "";

    payout.status =
      "paid";

    payout.paidAt =
      new Date();

    payout.confirmedBy =
      req.auth.adminId;

    payout.paymentReference =
      paymentReference ||
      null;

    payout.note =
      note ||
      null;

    await payout.save();

    const circle =
      await Circle.findById(
        payout.circle
      );

    const user =
      await User.findById(
        payout.user
      );

    if (
      circle &&
      user
    ) {
      await Announcement.create({
        type:
          "payment_received",

        description:
          `${user.firstName} ${user.lastName}'s ₦${Number(
            payout.netAmount
          ).toLocaleString()} lump-sum payout was confirmed as paid.`,

        circle:
          circle._id,

        user:
          user._id
      });
    }

    /*
     * Recalculate financial completion after every payment confirmation.
     */
    const updatedCircle =
      circle
        ? await refreshCircleFinancialCompletion(
            circle._id
          )
        : null;

    /*
     * Announce cycle completion ONLY when every member's payout is
     * actually confirmed as paid.
     */
    if (
      updatedCircle?.completed
    ) {
      const existingCompletionAnnouncement =
        await Announcement.findOne({
          circle:
            updatedCircle._id,

          description: {
            $regex:
              `Cycle ${updatedCircle.cycleNumber} is financially complete`
          }
        });

      if (
        !existingCompletionAnnouncement
      ) {
        await Announcement.create({
          type:
            "general_update",

          description:
            `Cycle ${updatedCircle.cycleNumber} is financially complete — all ${updatedCircle.members.length} members have a confirmed payout record marked as paid.`,

          circle:
            updatedCircle._id
        });
      }
    }

    await AdminActivity.create({
      admin:
        req.auth.adminId,

      action:
        "payout_confirmed",

      detail:
        `${user ? `${user.firstName} ${user.lastName}` : "A member"}'s cycle ${payout.cycleNumber}, draw ${payout.drawNumber} lump-sum payout was confirmed as paid: ₦${Number(
          payout.netAmount
        ).toLocaleString()} net.${
          paymentReference
            ? ` Payment reference: ${paymentReference}.`
            : ""
        }`
    });

    res.json({
      message:
        "Payout marked as paid.",

      payout,

      cycleCompleted:
        updatedCircle?.completed ||
        false
    });
  }
);

/* ============================================================
 * REVERSE ACTUAL PAYOUT
 * ============================================================ */
router.post(
  "/payouts/:payoutId/reverse",
  requireAdmin,
  async (
    req,
    res
  ) => {
    const payout =
      await Payout.findById(
        req.params.payoutId
      );

    if (!payout) {
      return res
        .status(404)
        .json({
          message:
            "Payout record not found"
        });
    }

    if (
      payout.status !==
      "paid"
    ) {
      return res
        .status(409)
        .json({
          message:
            "Only a paid payout can be reversed."
        });
    }

    const reason =
      typeof req.body
        ?.reason ===
      "string"
        ? req.body.reason.trim()
        : "";

    if (!reason) {
      return res
        .status(400)
        .json({
          message:
            "A reversal reason is required."
        });
    }

    payout.status =
      "reversed";

    payout.reversedAt =
      new Date();

    payout.reversedBy =
      req.auth.adminId;

    payout.reversalReason =
      reason;

    await payout.save();

    const user =
      await User.findById(
        payout.user
      );

    const circle =
      await Circle.findById(
        payout.circle
      );

    /*
     * A reversed payout means the cycle is no longer financially
     * complete until that member's payout is paid again.
     */
    const updatedCircle =
      circle
        ? await refreshCircleFinancialCompletion(
            circle._id
          )
        : null;

    await AdminActivity.create({
      admin:
        req.auth.adminId,

      action:
        "payout_reversed",

      detail:
        `${user ? `${user.firstName} ${user.lastName}` : "A member"}'s cycle ${payout.cycleNumber}, draw ${payout.drawNumber} payout of ₦${Number(
          payout.netAmount
        ).toLocaleString()} was reversed. Reason: ${reason}`
    });

    res.json({
      message:
        "Payout reversed. The original financial record has been preserved.",

      payout,

      cycleCompleted:
        updatedCircle?.completed ||
        false
    });
  }
);

/* ============================================================
 * MEMBERS WHO ARE READY FOR A SLOT
 * ============================================================ */
router.get(
  "/unlocked-members",
  requireAdmin,
  async (
    _req,
    res
  ) => {
    const users =
      await User.find({
        registrationStatus:
          "awaiting_slot_assignment"
      })
        .select(
          "firstName lastName username email guarantorName guarantorVerifiedAt"
        )
        .sort({
          guarantorVerifiedAt:
            1
        });

    res.json(
      users
    );
  }
);

/* ============================================================
 * ASSIGN SLOT
 * ============================================================ */
router.post(
  "/circles/:circleId/assign-slot",
  requireAdmin,
  async (
    req,
    res
  ) => {
    const {
      userId,
      numericId
    } =
      req.body;

    const circle =
      await Circle.findById(
        req.params.circleId
      );

    if (!circle) {
      return res
        .status(404)
        .json({
          message:
            "Circle not found"
        });
    }

    if (
      circle.completed
    ) {
      return res
        .status(409)
        .json({
          message:
            "This cycle is already complete"
        });
    }

    const slot =
      Number(
        numericId
      );

    if (
      !Number.isInteger(
        slot
      ) ||
      slot < 1 ||
      slot >
        circle.baselineSize
    ) {
      return res
        .status(400)
        .json({
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
      return res
        .status(409)
        .json({
          message:
            "That slot is already taken"
        });
    }

    const user =
      await User.findById(
        userId
      );

    if (!user) {
      return res
        .status(404)
        .json({
          message:
            "Member not found"
        });
    }

    if (
      user.registrationStatus !==
      "awaiting_slot_assignment"
    ) {
      return res
        .status(409)
        .json({
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
      return res
        .status(409)
        .json({
          message:
            "Member already has a slot in this circle"
        });
    }

    if (
      circle.members.length >=
      circle.baselineSize
    ) {
      return res
        .status(409)
        .json({
          message:
            "This circle has reached its configured capacity."
        });
    }

    circle.members.push({
      user:
        user._id,

      numericId:
        slot
    });

    await circle.save();

    user.registrationStatus =
      "active";

    await user.save();

    /*
     * If this member already had a confirmed payment report before
     * circle assignment, convert it into the real circle ledger now.
     */
    const confirmedClaim =
      await PaymentClaim.findOne({
        user:
          user._id,

        monthKey:
          currentMonthKey(),

        status:
          "confirmed"
      });

    if (
      confirmedClaim
    ) {
      const existingLedger =
        await Ledger.findOne({
          user:
            user._id,

          circle:
            circle._id,

          isPaid:
            true,

          paidAt: {
            $gte:
              startOfCurrentMonth()
          }
        }).sort({
          paidAt:
            -1
        });

      if (!existingLedger) {
        const monthIndex =
          await nextLedgerMonthIndexFor(
            user._id,
            circle._id
          );

        await Ledger.create({
          user:
            user._id,

          circle:
            circle._id,

          monthIndex,

          savingsAmount:
            SAVINGS_AMOUNT,

          partyAmount:
            PARTY_AMOUNT,

          latePenalty:
            0,

          isPaid:
            true,

          confirmedBy:
            confirmedClaim.confirmedBy,

          paymentReference:
            confirmedClaim.paymentReference ||
            `CLAIM-${confirmedClaim._id}`,

          paidAt:
            confirmedClaim.confirmedAt ||
            new Date()
        });
      }
    }

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
  async (
    _req,
    res
  ) => {
    const users =
      await User.find({
        emailVerifiedAt:
          null
      })
        .select(
          "firstName lastName username email primaryPhone preferredOtpChannel createdAt"
        )
        .sort({
          createdAt:
            1
        });

    res.json(
      users
    );
  }
);

/* ============================================================
 * GUARANTOR PORTAL
 * ============================================================ */
router.get(
  "/guarantors/pending",
  requireAdmin,
  async (
    _req,
    res
  ) => {
    const users =
      await User.find({
        registrationStatus:
          "awaiting_guarantor_review"
      })
        .select(
          "firstName lastName username email primaryPhone guarantorName guarantorPhone rulesAcceptedAt"
        )
        .sort({
          rulesAcceptedAt:
            1
        });

    res.json(
      users
    );
  }
);

router.post(
  "/guarantors/:userId/verify",
  requireAdmin,
  async (
    req,
    res
  ) => {
    const user =
      await User.findById(
        req.params.userId
      );

    if (!user) {
      return res
        .status(404)
        .json({
          message:
            "Member not found"
        });
    }

    if (
      user.registrationStatus !==
      "awaiting_guarantor_review"
    ) {
      return res
        .status(409)
        .json({
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
  async (
    req,
    res
  ) => {
    const user =
      await User.findById(
        req.params.userId
      );

    if (!user) {
      return res
        .status(404)
        .json({
          message:
            "Member not found"
        });
    }

    if (
      user.registrationStatus !==
      "awaiting_guarantor_review"
    ) {
      return res
        .status(409)
        .json({
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
  async (
    _req,
    res
  ) => {
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
          createdAt:
            -1
        })
        .limit(100);

    res.json(
      items
    );
  }
);

router.post(
  "/announcements",
  requireAdmin,
  async (
    req,
    res
  ) => {
    const {
      type,
      description,
      circle,
      venue,
      eventDate
    } =
      req.body;

    if (
      !type ||
      !description
    ) {
      return res
        .status(400)
        .json({
          message:
            "Type and description are required"
        });
    }

    const item =
      await Announcement.create(
        buildBroadcastAnnouncementData({
          type,

          description,

          createdBy:
            req.auth.adminId,

          circle,

          venue,

          eventDate
        })
      );

    res
      .status(201)
      .json(
        item
      );
  }
);

router.delete(
  "/announcements/:id",
  requireAdmin,
  async (
    req,
    res
  ) => {
    const item =
      await Announcement.findByIdAndDelete(
        req.params.id
      );

    if (!item) {
      return res
        .status(404)
        .json({
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
  async (
    req,
    res
  ) => {
    const hasValidSecret =
      process.env
        .BACKUP_SECRET &&
      req.headers[
        "x-backup-secret"
      ] ===
        process.env
          .BACKUP_SECRET;

    if (
      hasValidSecret
    ) {
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
      return res
        .status(500)
        .json({
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
  } catch (
    error
  ) {
    console.error(
      "Backup failed:",
      error
    );

    res
      .status(500)
      .json({
        message:
          error.message ||
          "Backup failed"
      });
  }
}

// ============================================================
// PAYMENT WINDOW STATUS – Admin routes
// ============================================================
router.get('/settings/payment-reporting', async (req, res) => {
  try {
    const setting = await Settings.findOne({ key: 'paymentReportingOpen' });
    res.json({ open: setting ? setting.value : true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/settings/payment-reporting', async (req, res) => {
  try {
    const { open } = req.body;
    if (typeof open !== 'boolean') {
      return res.status(400).json({ error: 'open must be boolean' });
    }
    const setting = await Settings.findOneAndUpdate(
      { key: 'paymentReportingOpen' },
      { value: open },
      { upsert: true, new: true }
    );
    res.json({ open: setting.value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// UNCONFIRM A CONFIRMED PAYMENT CLAIM (Revert to reported, no ledger needed)
// ============================================================
router.post("/payment-claims/:claimId/unconfirm", requireAdmin, async (req, res) => {
  const claim = await PaymentClaim.findById(req.params.claimId);
  if (!claim) return res.status(404).json({ message: "Payment claim not found." });
  if (claim.status !== "confirmed") return res.status(400).json({ message: "Only confirmed claims can be unconfirmed." });

  // Try to find and delete any active ledger just in case
  const circle = await Circle.findOne({ "members.user": claim.user });
  if (circle) {
    const ledger = await Ledger.findOne({
      user: claim.user,
      circle: circle._id,
      isPaid: true,
      paidAt: { $gte: startOfCurrentMonth() }
    });
    if (ledger) {
      await Ledger.findByIdAndDelete(ledger._id);
    }
  }

  // Reset the claim
  claim.status = "reported";
  claim.confirmedAt = undefined;
  claim.confirmedBy = undefined;
  claim.paymentReference = undefined;
  await claim.save();

  await AdminActivity.create({
    admin: req.auth.adminId,
    action: "payment_claim_unconfirmed",
    detail: `Confirmed payment claim for ${claim.user} was reverted to reported.`
  });

  res.json({ message: "Claim unconfirmed. The member can now report the payment again." });
});

export default router;