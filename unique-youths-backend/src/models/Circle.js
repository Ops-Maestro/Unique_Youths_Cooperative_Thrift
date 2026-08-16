import mongoose from "mongoose";

const member = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    // The member's assigned slot number.
    // It is NEVER used as random selection input.
    numericId: {
      type: Number,
      required: true,
      min: 1
    },

    /*
     * This means the member has already been selected in this cycle
     * and is therefore excluded from future random draws.
     *
     * It does NOT mean that money has actually been transferred.
     *
     * Actual financial payment state is stored in Payout.status.
     */
    drawExcluded: {
      type: Boolean,
      default: false
    },

    /*
     * Historical compatibility field.
     *
     * In the current implementation this means:
     * "selected/locked for payout in this cycle".
     *
     * It does NOT by itself mean the payout has been transferred.
     */
    disbursed: {
      type: Boolean,
      default: false
    },

    /*
     * Timestamp of selection/locking.
     *
     * This is intentionally not named paidAt because selection and
     * actual payment are separate events.
     */
    disbursedAt: Date
  },
  {
    _id: false
  }
);

const payoutHistoryItem =
  new mongoose.Schema(
    {
      drawNumber: {
        type: Number,
        required: true
      },

      completedAt: {
        type: Date,
        default: null
      },

      circleSize: {
        type: Number,
        required: true,
        min: 1
      },

      paidMemberCount: {
        type: Number,
        required: true,
        min: 0
      },

      recipientCount: {
        type: Number,
        required: true,
        min: 1,
        max: 2
      },

      savingsPot: {
        type: Number,
        required: true,
        min: 0
      },

      partyFund: {
        type: Number,
        required: true,
        min: 0
      },

      grossPayoutPerRecipient: {
        type: Number,
        required: true,
        min: 0
      },

      maintenanceFeePerRecipient: {
        type: Number,
        required: true,
        min: 0
      },

      totalMaintenanceFees: {
        type: Number,
        required: true,
        min: 0
      },

      netPayoutPerRecipient: {
        type: Number,
        required: true,
        min: 0
      },

      totalNetPayout: {
        type: Number,
        required: true,
        min: 0
      },

      /*
       * Users selected in this particular draw.
       *
       * This is selection history, not payment confirmation.
       */
      recipients: {
        type: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
          }
        ],
        default: []
      }
    },
    {
      _id: true
    }
  );

const schema =
  new mongoose.Schema(
    {
      name: {
        type: String,
        required: true,
        default:
          "Unique Youth Circle"
      },

      cycleNumber: {
        type: Number,
        required: true,
        default: 1
      },

      /*
       * Capacity of THIS circle.
       *
       * This is dynamic. It is not a global "20-member rule".
       * A circle may contain 4, 5, 20, 25, 30 or another number
       * depending on the members being placed into that circle.
       */
      baselineSize: {
        type: Number,
        required: true,
        min: 1,
        default: () =>
          Number(
            process.env
              .CIRCLE_BASELINE_SIZE
          ) || 20
      },

      /*
       * Number of recipients normally selected at each monthly draw.
       *
       * 1 = one recipient gets the entire savings pot.
       * 2 = two recipients share the savings pot.
       */
      recipientCount: {
        type: Number,
        enum: [1, 2],
        default: 2
      },

      members: {
        type: [member],
        default: []
      },

      // active: circle is still running.
      active: {
        type: Boolean,
        default: true
      },

      /*
       * completed means the entire financial cycle is actually complete.
       *
       * It is NOT set merely because all members have been selected.
       *
       * The admin payout confirmation endpoint sets this to true only
       * after every payout belonging to this circle has status = "paid".
       */
      completed: {
        type: Boolean,
        default: false
      },

      completedAt: Date,

      // ========================================================
      // LIVE RANDOM DRAW STATE
      // ========================================================

      draw: {
        status: {
          type: String,
          enum: [
            "idle",
            "rolling",
            "completed"
          ],
          default: "idle"
        },

        startedAt: {
          type: Date,
          default: null
        },

        completedAt: {
          type: Date,
          default: null
        },

        /*
         * IDs of the recipients for the current draw.
         *
         * This stores selection state only.
         */
        selectedMembers: {
          type: [
            {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User"
            }
          ],
          default: []
        },

        /*
         * Recipient count used by the current draw.
         */
        recipientCount: {
          type: Number,
          enum: [1, 2],
          default: 2
        },

        /*
         * Snapshot of the financial calculation for the current draw.
         */
        payout: {
          circleSize: {
            type: Number,
            default: null
          },

          paidMemberCount: {
            type: Number,
            default: null
          },

          recipientCount: {
            type: Number,
            default: null
          },

          savingsPot: {
            type: Number,
            default: null
          },

          partyFund: {
            type: Number,
            default: null
          },

          grossPayoutPerRecipient: {
            type: Number,
            default: null
          },

          maintenanceFeePerRecipient: {
            type: Number,
            default: null
          },

          totalMaintenanceFees: {
            type: Number,
            default: null
          },

          netPayoutPerRecipient: {
            type: Number,
            default: null
          },

          totalNetPayout: {
            type: Number,
            default: null
          }
        },

        /*
         * Completed draw history for this cycle.
         *
         * This is an audit trail of selection events.
         * Actual payment status lives in the Payout collection.
         */
        history: {
          type: [
            payoutHistoryItem
          ],
          default: []
        }
      }
    },
    {
      timestamps: true
    }
  );

export default mongoose.model(
  "Circle",
  schema
);