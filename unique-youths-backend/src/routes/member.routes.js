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

const DRAW_ROLL_DURATION_MS = 5000;

/* ============================================================
 * Make sure there is always an open (active, not-completed, not-full)
 * circle for an admin to assign new members into. Without this, the
 * Member Slot Grid has nothing to show until an admin remembers to
 * click "Start new cycle" on the Ajo Recipient Draw page first.
 * ============================================================ */
async function ensureOpenCircle() {
  const openCircle = await Circle.findOne({
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
    return openCircle;
  }

  const last =
    await Circle.findOne()
      .sort({
        cycleNumber: -1
      });

  const baselineSize =
    Number(
      process.env.CIRCLE_BASELINE_SIZE
    ) ||
    last?.baselineSize ||
    20;

  return Circle.create({
    name:
      "Unique Youth Circle",
    cycleNumber:
      (last?.cycleNumber ||
        0) + 1,
    baselineSize
  });
}

/* ============================================================
 * COMPLETE REGISTRATION - step 3
 * ============================================================ */
router.post(
  "/complete-registration",
  requireRegistration,
  async (req, res) => {
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
      return res.status(400).json({
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
      return res.status(400).json({
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
      return res.status(409).json({
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

    await ensureOpenCircle();

    await Announcement.create([
      withExpiry(
        {
          type:
            "general_update",
          description:
            `Welcome, ${user.firstName}, to Unique Youth Cooperative Thrift! We're glad to have you.`,
          user: user._id
        },
        5
      ),
      withExpiry(
        {
          type:
            "general_update",
          description:
            "Finish setting up your profile: open the Profile tab on your dashboard to upload a photo and add your date of birth.",
          user: user._id
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
        "Registration submitted. An administrator will verify your guarantor shortly, after which you can log in.",
      registrationStatus:
        user.registrationStatus
    });
  }
);

/* ============================================================
 * MEMBER DASHBOARD DATA
 * ============================================================ */
router.get(
  "/me",
  requireMember,
  async (req, res) => {
    const user =
      await User.findById(
        req.auth.userId
      ).select("-password");

    if (!user) {
      return res.status(404).json({
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
        user: user._id
      })
        .sort({
          monthIndex: -1
        })
        .limit(12);

    let monthProgress =
      null;

    if (circle) {
      const startOfMonth =
        new Date();

      startOfMonth.setDate(1);
      startOfMonth.setHours(
        0,
        0,
        0,
        0
      );

      const paidThisMonth =
        await Ledger.find({
          circle:
            circle._id,
          isPaid: true,
          paidAt: {
            $gte: startOfMonth
          }
        });

      const memberCount =
        circle.members.length;

      const target =
        memberCount *
        MONTHLY_CONTRIBUTION;

      const collected =
        paidThisMonth.reduce(
          (sum, l) =>
            sum +
            l.savingsAmount +
            l.partyAmount,
          0
        );

      const paidCount =
        new Set(
          paidThisMonth.map(
            l => String(l.user)
          )
        ).size;

      monthProgress = {
        memberCount,
        paidCount,
        target,
        collected,
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
            memberCount &&
          memberCount > 0
      };
    }

    const lateFeeDoc =
      await LateFee.findOne({
        user: user._id,
        status: {
          $ne: "waived"
        }
      }).sort({
        createdAt: -1
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

    res.json({
      user,

      // Never expose the roster. A member only sees their own slot.
      circle: circle
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
            myNumber:
              circle.members.find(
                m =>
                  String(
                    m.user
                  ) ===
                  String(
                    user._id
                  )
              )?.numericId ||
              null,
            myDisbursed:
              circle.members.find(
                m =>
                  String(
                    m.user
                  ) ===
                  String(
                    user._id
                  )
              )?.disbursed ||
              false
          }
        : null,

      ledgers,
      monthProgress,
      lateFee,

      finance: {
        monthlyContribution:
          MONTHLY_CONTRIBUTION,
        savings:
          SAVINGS_AMOUNT,
        party:
          PARTY_AMOUNT,
        grossPayout:
          GROSS_PAYOUT,
        serviceFee:
          SERVICE_FEE,
        netPayout:
          NET_PAYOUT,
        latePenalty:
          LATE_PENALTY
      }
    });
  }
);

/* ============================================================
 * MEMBER DRAW STATUS
 *
 * This endpoint deliberately does NOT expose:
 * - selected member IDs
 * - selected member names
 * - other members' slots
 * - the draw selection numbers
 *
 * Members only need to know that a draw is happening and when
 * it has completed.
 *
 * If a member's dashboard reaches this endpoint after the 5-second
 * roll has elapsed but before the admin dashboard has finalized it,
 * this endpoint finalizes the shared draw state as well. This keeps
 * the member dashboard from being stuck on "rolling".
 * ============================================================ */
router.get(
  "/draw-status",
  requireMember,
  async (req, res) => {
    let circle =
      await Circle.findOne({
        "members.user":
          req.auth.userId
      });

    if (!circle) {
      return res.json({
        available: false,
        draw: {
          status: "idle",
          startedAt: null,
          completedAt: null,
          durationMs:
            DRAW_ROLL_DURATION_MS
        },
        selectedCount: 0
      });
    }

    const draw =
      circle.draw || {
        status: "idle",
        startedAt: null,
        completedAt: null,
        selectedMembers: []
      };

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
        }
      }
    }

    const currentDraw =
      circle?.draw || {
        status: "idle",
        startedAt: null,
        completedAt: null,
        selectedMembers: []
      };

    res.json({
      available: true,

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
          DRAW_ROLL_DURATION_MS
      },

      // This is deliberately only a count.
      // No identity information is exposed.
      selectedCount:
        currentDraw.status ===
        "completed"
          ? 2
          : 0
    });
  }
);

router.get(
  "/announcements",
  requireMember,
  async (req, res) => {
    const circle =
      await Circle.findOne({
        "members.user":
          req.auth.userId
      });

    const items =
      await Announcement.find({
        $or: [
          {
            user:
              req.auth.userId
          },
          {
            user: null,
            circle: null
          },
          {
            user: null,
            circle:
              circle?._id
          }
        ]
      })
        .sort({
          createdAt: -1
        })
        .limit(40);

    res.json(items);
  }
);

/* ============================================================
 * PROFILE
 * ============================================================ */
router.put(
  "/profile",
  requireMember,
  async (req, res) => {
    const user =
      await User.findById(
        req.auth.userId
      );

    if (!user) {
      return res.status(404).json({
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
      avatarDataUrl !== undefined
    ) {
      if (
        avatarDataUrl === null ||
        avatarDataUrl === ""
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
          return res.status(400).json({
            message:
              "Invalid image data."
          });
        }

        if (
          avatarDataUrl.length >
          400000
        ) {
          return res.status(400).json({
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
        return res.status(400).json({
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
        return res.status(400).json({
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
            user: user._id
          },
          5
        )
      );
    }

    const clean =
      await User.findById(
        user._id
      ).select("-password");

    res.json({
      message:
        "Profile updated",
      user: clean,
      justCompleted:
        !wasComplete &&
        isNowComplete
    });
  }
);

// Payments are never recorded by the member themselves.

router.get(
  "/constants",
  requireMember,
  (_req, res) => {
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
  }
);

export default router;