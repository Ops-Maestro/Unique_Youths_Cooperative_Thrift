import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      index: true
    },

    // Which channel this specific code was actually sent through - kept
    // per-OTP (not just per-user) so the history is accurate even if a
    // member's preferred channel changes between one code and the next.
    channel: {
      type: String,
      enum: ["email", "sms"],
      default: "email"
    },

    otpHash: {
      type: String,
      required: true
    },

    expiresAt: {
      type: Date,
      required: true
    },

    attempts: {
      type: Number,
      default: 0
    },

    verified: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// Automatically remove OTP documents when they expire.
schema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

export default mongoose.model("OTP", schema);