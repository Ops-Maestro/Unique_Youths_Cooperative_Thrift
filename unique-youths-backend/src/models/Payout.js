import mongoose from "mongoose";

const schema =
  new mongoose.Schema(
    {
      /*
       * Circle receiving this payout.
       */
      circle: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref: "Circle",
        required: true,
        index: true
      },

      /*
       * Cycle number is stored directly on the payout.
       */
      cycleNumber: {
        type: Number,
        required: true,
        min: 1
      },

      /*
       * Monthly draw number within the cycle.
       *
       * Draw 1 = first monthly draw
       * Draw 2 = second monthly draw
       * etc.
       */
      drawNumber: {
        type: Number,
        required: true,
        min: 1
      },

      /*
       * Actual recipient.
       */
      user: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
      },

      /*
       * Member's assigned slot.
       *
       * This is for audit/reporting only.
       * It is NEVER used as random-selection input.
       */
      numericId: {
        type: Number,
        required: true,
        min: 1
      },

      /*
       * Financial snapshot captured at draw completion.
       *
       * These values must not change if finance settings change later.
       */
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

      grossAmount: {
        type: Number,
        required: true,
        min: 0
      },

      maintenanceFee: {
        type: Number,
        required: true,
        min: 0
      },

      netAmount: {
        type: Number,
        required: true,
        min: 0
      },

      /*
       * pending:
       *   Member has been selected, but money has not yet been
       *   confirmed as transferred.
       *
       * paid:
       *   Administrator confirmed the actual transfer.
       *
       * reversed:
       *   A previously confirmed payout was reversed.
       */
      status: {
        type: String,
        enum: [
          "pending",
          "paid",
          "reversed"
        ],
        default: "pending",
        index: true
      },

      /*
       * Actual payment confirmation time.
       */
      paidAt: {
        type: Date,
        default: null
      },

      /*
       * Administrator who confirmed payment.
       */
      confirmedBy: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref: "Admin",
        default: null
      },

      /*
       * Optional bank-transfer reference.
       */
      paymentReference: {
        type: String,
        trim: true,
        default: null
      },

      /*
       * Optional administrative note.
       */
      note: {
        type: String,
        trim: true,
        default: null
      },

      /*
       * Reversal audit information.
       */
      reversedAt: {
        type: Date,
        default: null
      },

      reversedBy: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref: "Admin",
        default: null
      },

      reversalReason: {
        type: String,
        trim: true,
        default: null
      }
    },
    {
      timestamps: true
    }
  );

/*
 * One payout obligation per member per draw.
 *
 * This protects against duplicate records if multiple dashboards
 * hit draw-status simultaneously after the 5-second roll.
 */
schema.index(
  {
    circle: 1,
    cycleNumber: 1,
    drawNumber: 1,
    user: 1
  },
  {
    unique: true
  }
);

export default mongoose.model(
  "Payout",
  schema
);