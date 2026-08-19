import express from "express";
import User from "../models/User.js";
import Circle from "../models/Circle.js";
import Ledger from "../models/Ledger.js";
import PaymentClaim from "../models/PaymentClaim.js";
import LateFee from "../models/LateFee.js";
import Announcement from "../models/Announcement.js";
import {
  requireMember,
  requireRegistration
} from "../middleware/auth.js";
import {
  withExpiry
} from "../utils/announcements.js";
import {
  MONTHLY_CONTRIBUTION,
  SAVINGS_AMOUNT,
  PARTY_AMOUNT,
  LATE_PENALTY,
  DEADLINE_DAY,
  DEFAULT_RECIPIENTS_PER_MONTH,
  MIN_RECIPIENTS_PER_MONTH,
  MAX_RECIPIENTS_PER_MONTH,
  maintenanceFeeForCircleSize
} from "../utils/finance.js";

// ============================================================
// IMPORT SETTINGS MODEL (shared)
// ============================================================
import { Settings } from "../models/Settings.js";

const router = express.Router();

const DRAW_ROLL_DURATION_MS =
  5000;

/* ============================================================
 * SUPPORT EMAIL CONFIGURATION
 * ============================================================ */

const RESEND_API_KEY =
  process.env.RESEND_API_KEY ||
  "";

const RESEND_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ||
  "Unique Youths <noreply@notify.remoteops.online>";

const SUPPORT_EMAIL =
  process.env.SUPPORT_EMAIL ||
  "";

/* ============================================================
 * CURRENT MONTH START
 * ============================================================ */
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

function startOfCurrentMonth() {
  const start =
    new Date();

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

/* ============================================================
 * CURRENT-MONTH PAID LEDGERS
 *
 * Returns one latest confirmed payment record per member for
 * the current calendar month.
 * ============================================================ */
async function getCurrentMonthPaidLedgers(
  circleId
) {
  const paid =
    await Ledger.find({
      circle: circleId,
      isPaid: true,
      paidAt: {
        $gte:
          startOfCurrentMonth()
      }
    }).sort({
      paidAt: -1
    });

  const latestByUser =
    new Map();

  for (
    const ledger of paid
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

/* ============================================================
 * CURRENT-MONTH FINANCIAL SUMMARY
 *
 * This is calculated from actual confirmed ledger records.
 *
 * The member dashboard can use this information for display,
 * but the server remains the authority for draw calculations.
 * ============================================================ */
async function getCurrentMonthFinance(
  circle
) {
  const paidLedgers =
    await getCurrentMonthPaidLedgers(
      circle._id
    );

  const paidMemberCount =
    paidLedgers.length;

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

  const recipientCount =
    circle.recipientCount ===
    1
      ? 1
      : DEFAULT_RECIPIENTS_PER_MONTH;

  const maintenanceFeePerRecipient =
    maintenanceFeeForCircleSize(
      Math.max(
        1,
        circle.members.length
      )
    );

  const grossPayoutPerRecipient =
    recipientCount > 0
      ? savingsPot /
        recipientCount
      : 0;

  const netPayoutPerRecipient =
    Math.max(
      0,
      grossPayoutPerRecipient -
        maintenanceFeePerRecipient
    );

  return {
    circleSize:
      circle.members.length,

    baselineSize:
      circle.baselineSize,

    paidMemberCount,

    recipientCount,

    savingsAmountPerMember:
      SAVINGS_AMOUNT,

    partyAmountPerMember:
      PARTY_AMOUNT,

    monthlyContribution:
      MONTHLY_CONTRIBUTION,

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
      recipientCount
  };
}

/* ============================================================
 * SEND SUPPORT EMAIL
 *
 * Sends the member's feedback/support request from the backend
 * through Resend to the configured support inbox.
 *
 * This avoids opening Thunderbird, Gmail, Outlook, or another
 * local mail application on the member's device.
 * ============================================================ */
async function sendSupportEmail({
  member,
  subject,
  message,
  category
}) {
  if (!RESEND_API_KEY) {
    throw new Error(
      "Resend email service is not configured."
    );
  }

  if (!SUPPORT_EMAIL) {
    throw new Error(
      "Support email is not configured."
    );
  }

  const safeSubject =
    String(
      subject ||
        "Unique Youth member support request"
    ).trim();

  const safeMessage =
    String(
      message ||
        ""
    ).trim();

  const safeCategory =
    String(
      category ||
        "General support"
    ).trim();

  if (!safeMessage) {
    throw new Error(
      "Support message cannot be empty."
    );
  }

  const memberName =
    `${member.firstName || ""} ${
      member.lastName || ""
    }`.trim() ||
    "Unique Youth member";

  const memberEmail =
    String(
      member.email ||
        ""
    ).trim();

  const textBody = [
    "Unique Youth Cooperative Thrift",
    "",
    `Member: ${memberName}`,
    `Username: ${member.username || "—"}`,
    `Email: ${memberEmail || "—"}`,
    `Phone: ${member.primaryPhone || "—"}`,
    `Category: ${safeCategory}`,
    "",
    "Message:",
    safeMessage
  ].join("\n");

  const htmlBody = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#172033;">
      <h2 style="margin-bottom:16px;">
        Unique Youth Member Support Request
      </h2>

      <p>
        <strong>Member:</strong>
        ${escapeHtml(memberName)}
      </p>

      <p>
        <strong>Username:</strong>
        ${escapeHtml(member.username || "—")}
      </p>

      <p>
        <strong>Email:</strong>
        ${escapeHtml(memberEmail || "—")}
      </p>

      <p>
        <strong>Phone:</strong>
        ${escapeHtml(member.primaryPhone || "—")}
      </p>

      <p>
        <strong>Category:</strong>
        ${escapeHtml(safeCategory)}
      </p>

      <hr style="border:none;border-top:1px solid #ddd;margin:20px 0;" />

      <h3>Message</h3>

      <p style="white-space:pre-wrap;">
        ${escapeHtml(safeMessage)}
      </p>

      <hr style="border:none;border-top:1px solid #ddd;margin:20px 0;" />

      <p style="font-size:12px;color:#667085;">
        This message was submitted through the Unique Youth
        Cooperative Thrift member support feature.
      </p>
    </div>
  `;

  const payload = {
    from:
      RESEND_FROM_EMAIL,

    to: [
      SUPPORT_EMAIL
    ],

    subject:
      `[Unique Youth Support] ${safeSubject}`,

    text:
      textBody,

    html:
      htmlBody
  };

  if (memberEmail) {
    payload.reply_to =
      memberEmail;
  }

  const response =
    await fetch(
      "https://api.resend.com/emails",
      {
        method:
          "POST",

        headers: {
          Authorization:
            `Bearer ${RESEND_API_KEY}`,

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(
            payload
          )
      }
    );

  let result =
    null;

  try {
    result =
      await response.json();
  } catch {
    result =
      null;
  }

  if (!response.ok) {
    console.error(
      "Resend support email error:",
      result
    );

    throw new Error(
      result?.message ||
        "Resend could not send the support email."
    );
  }

  return result;
}

/* ============================================================
 * HTML ESCAPING
 * ============================================================ */
function escapeHtml(
  value
) {
  return String(
    value
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}

/* ============================================================
 * COMPLETE REGISTRATION
 *
 * Registration no longer creates a circle automatically.
 *
 * A member can register successfully and wait while the admin
 * builds the appropriate circle from the members who are ready
 * for slot assignment.
 * ============================================================ */
router.post(
  "/complete-registration",
  requireRegistration,
  async (
    req,
    res
  ) => {
    const {
      guarantorName,
      guarantorPhone,
      rulesAccepted
    } = req.body;

    if (
      !guarantorName ||
      !guarantorPhone ||
      rulesAccepted !== true
    ) {
      return res
        .status(400)
        .json({
          message:
            "Guarantor and rules agreement are required"
        });
    }

    const user =
      await User.findById(
        req.auth.userId
      );

    if (
      !user ||
      !user.emailVerifiedAt
    ) {
      return res
        .status(400)
        .json({
          message:
            "Email verification is required first"
        });
    }

    if (
      user.registrationStatus !==
        "pending_otp" &&
      user.registrationStatus !==
        "awaiting_guarantor_review"
    ) {
      return res
        .status(409)
        .json({
          message:
            "Registration has already been completed"
        });
    }

    user.guarantorName =
      guarantorName;

    user.guarantorPhone =
      guarantorPhone;

    user.rulesAcceptedAt =
      new Date();

    user.registrationStatus =
      "awaiting_guarantor_review";

    await user.save();

    /*
     * Do NOT create a circle here.
     *
     * The administrator decides when a cohort is ready to form
     * a circle, and the resulting circle capacity is based on the
     * actual members being placed into that circle.
     */
    await Announcement.create([
      withExpiry(
        {
          type:
            "general_update",

          description:
            `Welcome, ${user.firstName}, to Unique Youth Cooperative Thrift! We're glad to have you.`,

          user:
            user._id
        },
        5
      ),

      withExpiry(
        {
          type:
            "general_update",

          description:
            "Finish setting up your profile: open the Profile tab on your dashboard to upload a photo and add your date of birth.",

          user:
            user._id
        },
        5
      )
    ]);

    await Announcement.create(
      withExpiry(
        {
          type:
            "general_update",

          description:
            `${user.firstName} ${user.lastName} just joined Unique Youth Cooperative Thrift — please welcome them!`
        },
        5
      )
    );

    return res.json({
      message:
        "Registration submitted. An administrator will verify your guarantor shortly, after which you can log in and wait for slot assignment.",

      registrationStatus:
        user.registrationStatus
    });
  }
);

/* ============================================================
 * REPORT CURRENT-MONTH PAYMENT
 *
 * The member only reports that the payment was made.
 *
 * This endpoint does NOT mark the ledger paid, so it cannot affect
 * the savings pot or payout calculations until an administrator
 * confirms the report.
 * ============================================================ */
router.post(
  "/payment-claims/current",
  requireMember,
  async (
    req,
    res
  ) => {
    try {
      const user =
        await User.findById(
          req.auth.userId
        );

      if (!user) {
        return res
          .status(404)
          .json({
            message:
              "User not found"
          });
      }

      const monthKey =
        currentMonthKey();

      let claim =
        await PaymentClaim.findOne({
          user:
            user._id,

          monthKey
        });

      if (
        claim?.status ===
        "confirmed"
      ) {
        return res
          .status(409)
          .json({
            message:
              `Your ${currentMonthLabel()} contribution has already been confirmed.`,

            paymentStatus:
              "paid",

            claim
          });
      }

      if (
        claim?.status ===
        "reported"
      ) {
        return res
          .status(409)
          .json({
            message:
              `Your ${currentMonthLabel()} payment has already been reported and is waiting for administrator confirmation.`,

            paymentStatus:
              "reported",

            claim
          });
      }

      claim =
        claim ||
        new PaymentClaim({
          user:
            user._id,

          monthKey,

          amount:
            MONTHLY_CONTRIBUTION
        });

      claim.amount =
        MONTHLY_CONTRIBUTION;

      claim.status =
        "reported";

      claim.reportedAt =
        new Date();

      claim.confirmedAt =
        undefined;

      claim.confirmedBy =
        undefined;

      claim.rejectedAt =
        undefined;

      claim.rejectedBy =
        undefined;

      claim.rejectionReason =
        undefined;

      await claim.save();

      return res
        .status(201)
        .json({
          message:
            `Your ${currentMonthLabel()} payment has been reported. Please make sure your receipt/proof has been sent to the admin via WhatsApp. The payment will appear as confirmed only after an administrator verifies it.`,

          paymentStatus:
            "reported",

          month:
            currentMonthLabel(),

          claim: {
            _id:
              claim._id,

            monthKey:
              claim.monthKey,

            status:
              claim.status,

            reportedAt:
              claim.reportedAt
          }
        });
    } catch (
      error
    ) {
      console.error(
        "Member payment claim error:",
        error
      );

      return res
        .status(500)
        .json({
          message:
            error.message ||
            "Unable to report your payment right now."
        });
    }
  }
);

/* ============================================================
 * MEMBER DASHBOARD DATA
 * ============================================================ */
router.get(
  "/me",
  requireMember,
  async (
    req,
    res
  ) => {
    const user =
      await User.findById(
        req.auth.userId
      ).select(
        "-password"
      );

    if (!user) {
      return res
        .status(404)
        .json({
          message:
            "User not found"
        });
    }

    const circle =
      await Circle.findOne({
        "members.user":
          user._id
      });

    const ledgers =
      await Ledger.find({
        user:
          user._id
      })
        .sort({
          monthIndex:
            -1
        })
        .limit(12);

    const currentMonth =
      startOfCurrentMonth();

    const monthKey =
      currentMonthKey();

    const paymentClaim =
      await PaymentClaim.findOne({
        user:
          user._id,

        monthKey
      });

    const currentMonthLedger =
      circle
        ? await Ledger.findOne({
            user:
              user._id,

            circle:
              circle._id,

            isPaid:
              true,

            paidAt: {
              $gte:
                currentMonth
            }
          }).sort({
            paidAt:
              -1
          })
        : null;

    const currentMonthPayment =
      currentMonthLedger ||
      paymentClaim ||
      null;

    const currentMonthPaymentStatus =
      currentMonthLedger?.isPaid
        ? "paid"
        : paymentClaim?.status ===
            "reported"
        ? "reported"
        : paymentClaim?.status ===
            "rejected"
        ? "rejected"
        : paymentClaim?.status ===
            "confirmed"
        ? "paid"
        : "unreported";

    let monthProgress =
      null;

    let currentMonthFinance =
      null;

    if (circle) {
      const startOfMonth =
        startOfCurrentMonth();

      const paidThisMonth =
        await Ledger.find({
          circle:
            circle._id,

          isPaid:
            true,

          paidAt: {
            $gte:
              startOfMonth
          }
        });

      /*
       * The current contribution target is based on all members
       * assigned to this particular circle.
       *
       * The actual collected amount remains based on confirmed
       * payments.
       */
      const memberCount =
        circle.members.length;

      const target =
        memberCount *
        MONTHLY_CONTRIBUTION;

      const collected =
        paidThisMonth.reduce(
          (
            sum,
            ledger
          ) =>
            sum +
            Number(
              ledger.savingsAmount ||
                0
            ) +
            Number(
              ledger.partyAmount ||
                0
            ),
          0
        );

      const paidCount =
        new Set(
          paidThisMonth.map(
            ledger =>
              String(
                ledger.user
              )
          )
        ).size;

      monthProgress = {
        memberCount,

        paidCount,

        target,

        collected,

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
            memberCount &&
          memberCount >
            0
      };

      currentMonthFinance =
        await getCurrentMonthFinance(
          circle
        );
    }

    const lateFeeDoc =
      await LateFee.findOne({
        user:
          user._id,

        status: {
          $ne:
            "waived"
        }
      }).sort({
        createdAt:
          -1
      });

    const lateFee =
      lateFeeDoc
        ? {
            amount:
              lateFeeDoc.amount,

            status:
              lateFeeDoc.status,

            imposedAt:
              lateFeeDoc.createdAt,

            paidAt:
              lateFeeDoc.paidAt
          }
        : null;

    const myCircleMember =
      circle?.members.find(
        member =>
          String(
            member.user
          ) ===
          String(
            user._id
          )
      );

    /*
     * Do not return the stored WebAuthn credential objects,
     * public keys, or authentication/registration challenges.
     *
     * The frontend only needs the number of registered
     * credentials to decide whether biometric/passkey login
     * is enabled in the profile UI.
     */
    const cleanUser =
      user.toObject();

    const passkeyCount =
      Array.isArray(
        cleanUser.passkeys
      )
        ? cleanUser.passkeys.length
        : 0;

    delete cleanUser.passkeys;
    delete cleanUser.webAuthnUserId;
    delete cleanUser.passkeyRegistrationChallenge;
    delete cleanUser.passkeyRegistrationChallengeExpiresAt;
    delete cleanUser.passkeyAuthenticationChallenge;
    delete cleanUser.passkeyAuthenticationChallengeExpiresAt;

    cleanUser.passkeyCount =
      passkeyCount;

    res.json({
      user:
        cleanUser,

      /*
       * Never expose the roster.
       *
       * The member only receives:
       * - their slot
       * - circle capacity
       * - current assigned size
       * - remaining slots
       * - recipient count
       * - whether they already received a payout
       */
      circle:
        circle
          ? {
              _id:
                circle._id,

              name:
                circle.name,

              cycleNumber:
                circle.cycleNumber,

              baselineSize:
                circle.baselineSize,

              size:
                circle.members.length,

              slotsRemaining:
                Math.max(
                  0,
                  circle.baselineSize -
                    circle.members.length
                ),

              active:
                circle.active,

              completed:
                circle.completed,

              recipientCount:
                circle.recipientCount ===
                1
                  ? 1
                  : DEFAULT_RECIPIENTS_PER_MONTH,

              myNumber:
                myCircleMember
                  ?.numericId ||
                null,

              myDisbursed:
                !!myCircleMember
                  ?.disbursed
            }
          : null,

      ledgers,

      monthProgress,

      lateFee,

      /*
       * Dynamic current-month Ajo financial picture.
       *
       * These values come from actual confirmed payments and the
       * circle's configured recipient count.
       */
      currentMonthFinance,

      currentMonthPayment: {
        month:
          currentMonthLabel(),

        monthKey,

        status:
          currentMonthPaymentStatus,

        ledgerId:
          currentMonthLedger?._id ||
          null,

        claimId:
          paymentClaim?._id ||
          null,

        claimedAt:
          paymentClaim?.reportedAt ||
          null,

        rejectedAt:
          paymentClaim?.rejectedAt ||
          null,

        rejectionReason:
          paymentClaim?.rejectionReason ||
          null,

        confirmedAt:
          currentMonthLedger?.paidAt ||
          paymentClaim?.confirmedAt ||
          null,

        isPaid:
          currentMonthPaymentStatus ===
            "paid"
      },

      finance: {
        monthlyContribution:
          MONTHLY_CONTRIBUTION,

        savings:
          SAVINGS_AMOUNT,

        party:
          PARTY_AMOUNT,

        latePenalty:
          LATE_PENALTY,

        deadlineDay:
          DEADLINE_DAY,

        minRecipients:
          MIN_RECIPIENTS_PER_MONTH,

        maxRecipients:
          MAX_RECIPIENTS_PER_MONTH,

        defaultRecipients:
          DEFAULT_RECIPIENTS_PER_MONTH,

        // ✅ CORRECTED: removed the incorrect "max(3, …) × 2" formula
        maintenanceFeeFormula:
          "₦500 × ceil(circle size ÷ 2)"
      }
    });
  }
);

/* ============================================================
 * MEMBER DRAW STATUS
 *
 * Members never receive:
 * - winner identities
 * - winner names
 * - winner slot numbers
 *
 * They only receive:
 * - whether the draw exists
 * - rolling/completed state
 * - draw timing
 * - recipient count
 * - payout summary after completion
 *
 * The server remains authoritative.
 * ============================================================ */
router.get(
  "/draw-status",
  requireMember,
  async (
    req,
    res
  ) => {
    let circle =
      await Circle.findOne({
        "members.user":
          req.auth.userId
      });

    if (!circle) {
      return res.json({
        available:
          false,

        draw: {
          status:
            "idle",

          startedAt:
            null,

          completedAt:
            null,

          durationMs:
            DRAW_ROLL_DURATION_MS,

          recipientCount:
            DEFAULT_RECIPIENTS_PER_MONTH
        },

        selectedCount:
          0,

        payout:
          null
      });
    }

    let draw =
      circle.draw || {
        status:
          "idle",

        startedAt:
          null,

        completedAt:
          null,

        selectedMembers:
          []
      };

    /*
     * If the five-second rolling period has ended, allow the member
     * endpoint to claim completion as well.
     */
    if (
      draw.status ===
        "rolling" &&
      draw.startedAt
    ) {
      const elapsed =
        Date.now() -
        new Date(
          draw.startedAt
        ).getTime();

      if (
        elapsed >=
        DRAW_ROLL_DURATION_MS
      ) {
        const claimed =
          await Circle.updateOne(
            {
              _id:
                circle._id,

              "draw.status":
                "rolling",

              "draw.startedAt":
                draw.startedAt
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
          claimed.modifiedCount >
          0
        ) {
          circle =
            await Circle.findById(
              circle._id
            );

          draw =
            circle.draw;
        }
      }
    }

    const currentDraw =
      circle.draw || {
        status:
          "idle",

        startedAt:
          null,

        completedAt:
          null,

        selectedMembers:
          []
      };

    const recipientCount =
      currentDraw
        .recipientCount ||
      circle.recipientCount ||
      DEFAULT_RECIPIENTS_PER_MONTH;

    const completed =
      currentDraw.status ===
      "completed";

    const payout =
      completed
        ? currentDraw.payout ||
          null
        : null;

    res.json({
      available:
        true,

      draw: {
        status:
          currentDraw.status,

        startedAt:
          currentDraw.startedAt ||
          null,

        completedAt:
          currentDraw.completedAt ||
          null,

        durationMs:
          DRAW_ROLL_DURATION_MS,

        recipientCount
      },

      selectedCount:
        completed
          ? (
              currentDraw
                .selectedMembers
                ?.length ||
              recipientCount
            )
          : 0,

      payout
    });
  }
);

/* ============================================================
 * MEMBER ANNOUNCEMENTS
 * ============================================================ */
router.get(
  "/announcements",
  requireMember,
  async (
    req,
    res
  ) => {
    const circle =
      await Circle.findOne({
        "members.user":
          req.auth.userId
      });

    const items =
      await Announcement.find({
        $or: [
          /*
           * Private member notices.
           */
          {
            user:
              req.auth.userId
          },

          /*
           * Global announcements.
           */
          {
            user:
              null,
            circle:
              null
          },

          /*
           * Circle-scoped announcements.
           */
          {
            user:
              null,
            circle:
              circle?._id
          }
        ]
      })
        .sort({
          createdAt:
            -1
        })
        .limit(40);

    res.json(
      items
    );
  }
);

/* ============================================================
 * MEMBER SUPPORT / FEEDBACK
 *
 * POST /api/member/support
 *
 * Requires the member to be authenticated.
 *
 * The frontend sends:
 * {
 *   subject: "Help",
 *   message: "I need help with my account.",
 *   category: "Contact Support"
 * }
 *
 * The backend then sends the email through Resend to:
 * SUPPORT_EMAIL
 *
 * It does NOT open the member's mail application.
 * ============================================================ */
router.post(
  "/support",
  requireMember,
  async (
    req,
    res
  ) => {
    try {
      const {
        subject,
        message,
        category
      } = req.body;

      if (
        !message ||
        typeof message !==
          "string" ||
        !message.trim()
      ) {
        return res
          .status(400)
          .json({
            message:
              "Please enter a support message."
          });
      }

      if (
        message.trim().length >
        5000
      ) {
        return res
          .status(400)
          .json({
            message:
              "Support messages cannot exceed 5,000 characters."
          });
      }

      if (
        subject &&
        String(
          subject
        ).length >
          200
      ) {
        return res
          .status(400)
          .json({
            message:
              "The support subject is too long."
          });
      }

      const user =
        await User.findById(
          req.auth.userId
        ).select(
          "-password"
        );

      if (!user) {
        return res
          .status(404)
          .json({
            message:
              "User not found."
          });
      }

      if (
        !RESEND_API_KEY
      ) {
        console.error(
          "Support email failed: RESEND_API_KEY is missing."
        );

        return res
          .status(503)
          .json({
            message:
              "Support email is temporarily unavailable. Please try again later."
          });
      }

      if (
        !SUPPORT_EMAIL
      ) {
        console.error(
          "Support email failed: SUPPORT_EMAIL is missing."
        );

        return res
          .status(503)
          .json({
            message:
              "Support email is not configured yet."
          });
      }

      await sendSupportEmail({
        member:
          user,

        subject:
          subject ||
          "Member support request",

        message:
          message.trim(),

        category:
          category ||
          "General support"
      });

      /*
       * Keep a record in the member activity history.
       */
      await Announcement.create(
        withExpiry(
          {
            type:
              "general_update",

            description:
              `Your support request has been sent successfully, ${user.firstName}.`,

            user:
              user._id
          },
          5
        )
      );

      return res.status(
        201
      ).json({
        message:
          "Your message has been sent to Unique Youth support successfully."
      });
    } catch (
      error
    ) {
      console.error(
        "Member support request error:",
        error
      );

      return res
        .status(500)
        .json({
          message:
            error.message ||
            "Unable to send your support message right now."
        });
    }
  }
);

/* ============================================================
 * PROFILE
 *
 * Supports:
 * - profile photo add/change
 * - profile photo delete
 * - date of birth day/month
 *
 * Password changes are handled by the authentication routes.
 * ============================================================ */
router.put(
  "/profile",
  requireMember,
  async (
    req,
    res
  ) => {
    const user =
      await User.findById(
        req.auth.userId
      );

    if (!user) {
      return res
        .status(404)
        .json({
          message:
            "User not found"
        });
    }

    const {
      avatarDataUrl,
      dateOfBirthDay,
      dateOfBirthMonth
    } = req.body;

    if (
      avatarDataUrl !==
      undefined
    ) {
      /*
       * null or empty string means remove the current avatar.
       */
      if (
        avatarDataUrl ===
          null ||
        avatarDataUrl ===
          ""
      ) {
        user.avatarDataUrl =
          undefined;
      } else {
        if (
          typeof avatarDataUrl !==
            "string" ||
          !avatarDataUrl.startsWith(
            "data:image/"
          )
        ) {
          return res
            .status(400)
            .json({
              message:
                "Invalid image data."
            });
        }

        /*
         * Roughly 400 KB of base64 text.
         */
        if (
          avatarDataUrl.length >
          400000
        ) {
          return res
            .status(400)
            .json({
              message:
                "That photo is too large. Please choose a smaller image."
            });
        }

        user.avatarDataUrl =
          avatarDataUrl;
      }
    }

    if (
      dateOfBirthDay !==
        undefined ||
      dateOfBirthMonth !==
        undefined
    ) {
      const day =
        Number(
          dateOfBirthDay
        );

      const month =
        Number(
          dateOfBirthMonth
        );

      if (
        !Number.isInteger(
          day
        ) ||
        day < 1 ||
        day > 31
      ) {
        return res
          .status(400)
          .json({
            message:
              "Day of birth must be between 1 and 31."
          });
      }

      if (
        !Number.isInteger(
          month
        ) ||
        month < 1 ||
        month > 12
      ) {
        return res
          .status(400)
          .json({
            message:
              "Month of birth must be between 1 and 12."
          });
      }

      user.dateOfBirthDay =
        day;

      user.dateOfBirthMonth =
        month;
    }

    const wasComplete =
      !!user.profileCompletedAt;

    const isNowComplete =
      !!user.avatarDataUrl &&
      !!user.dateOfBirthDay &&
      !!user.dateOfBirthMonth;

    if (
      !wasComplete &&
      isNowComplete
    ) {
      user.profileCompletedAt =
        new Date();
    }

    /*
     * If a member removes their avatar or somehow clears a required
     * profile field later, keep the existing completion timestamp.
     *
     * profileCompletedAt is a historical marker rather than a live
     * boolean, so it is not removed here.
     */
    await user.save();

    if (
      !wasComplete &&
      isNowComplete
    ) {
      await Announcement.create(
        withExpiry(
          {
            type:
              "general_update",

            description:
              `${user.firstName}, your profile is now fully set up. Thanks for keeping your details current!`,

            user:
              user._id
          },
          5
        )
      );
    }

    const clean =
      await User.findById(
        user._id
      )
        .select(
          "-password -passkeys -webAuthnUserId -passkeyRegistrationChallenge -passkeyRegistrationChallengeExpiresAt -passkeyAuthenticationChallenge -passkeyAuthenticationChallengeExpiresAt"
        )
        .lean();

    res.json({
      message:
        "Profile updated",

      user:
        clean,

      justCompleted:
        !wasComplete &&
        isNowComplete
    });
  }
);

/* ============================================================
 * MEMBER FINANCIAL CONSTANTS
 *
 * Only truly fixed contribution rules are returned here.
 *
 * Payout amounts are dynamic and must be obtained from:
 * - /api/member/me
 * - /api/member/draw-status
 * ============================================================ */
router.get(
  "/constants",
  requireMember,
  (_req, res) => {
    res.json({
      MONTHLY_CONTRIBUTION,
      SAVINGS_AMOUNT,
      PARTY_AMOUNT,
      LATE_PENALTY,
      DEADLINE_DAY,

      MIN_RECIPIENTS:
        MIN_RECIPIENTS_PER_MONTH,

      MAX_RECIPIENTS:
        MAX_RECIPIENTS_PER_MONTH,

      DEFAULT_RECIPIENTS:
        DEFAULT_RECIPIENTS_PER_MONTH,

      // ✅ CORRECTED: removed the incorrect "max(3, …) × 2" formula
      MAINTENANCE_FEE_FORMULA:
        "₦500 × ceil(circle size ÷ 2)"
    });
  }
);

// ============================================================
// PAYMENT WINDOW STATUS – read‑only for members
// ============================================================
router.get('/settings/payment-reporting', async (req, res) => {
  try {
    const setting = await Settings.findOne({ key: 'paymentReportingOpen' });
    res.json({ open: setting ? setting.value : true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;