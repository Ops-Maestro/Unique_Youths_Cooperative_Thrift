import mongoose from "mongoose";

const schema =
  new mongoose.Schema(
    {
      user: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref:
          "User",
        required:
          true
      },

      monthKey: {
        type:
          String,
        required:
          true,
        match:
          /^\d{4}-\d{2}$/
      },

      amount: {
        type:
          Number,
        required:
          true,
        default:
          11000,
        immutable:
          true
      },

      status: {
        type:
          String,
        enum: [
          "reported",
          "confirmed",
          "rejected"
        ],
        default:
          "reported"
      },

      reportedAt: {
        type:
          Date,
        default:
          Date.now
      },

      confirmedAt:
        Date,

      confirmedBy: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref:
          "Admin"
      },

      rejectedAt:
        Date,

      rejectedBy: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref:
          "Admin"
      },

      rejectionReason: {
        type:
          String,
        trim:
          true,
        maxlength:
          500
      },

      paymentReference: {
        type:
          String,
        trim:
          true,
        maxlength:
          200
      }
    },
    {
      timestamps:
        true
    }
  );

schema.index(
  {
    user:
      1,

    monthKey:
      1
  },
  {
    unique:
      true
  }
);

// ============================================================
// ADDED from simplified version: virtual month & serialization
// ============================================================
schema.virtual("month").get(function() {
  if (!this.monthKey) return null;
  const [year, month] = this.monthKey.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return new Intl.DateTimeFormat("en-NG", { month: "long", year: "numeric" }).format(date);
});

schema.set("toJSON", { virtuals: true });
schema.set("toObject", { virtuals: true });

export default mongoose.model(
  "PaymentClaim",
  schema
);