import mongoose from "mongoose";

/*
 * Deliberately its own model, not a field on Ledger: a late fee is imposed
 * by the admin on their own judgment (not auto-computed from a date), and
 * gets paid - if at all - on its own separate schedule, days or weeks
 * after the member's actual monthly contribution. Keeping it separate
 * means it never gets silently folded into "this month's contribution
 * target" math, and shows as its own distinct line on the member's
 * dashboard with its own "mark as paid" action.
 */
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  circle: { type: mongoose.Schema.Types.ObjectId, ref: "Circle", required: true },
  monthIndex: { type: Number, required: true, min: 1 },
  amount: { type: Number, required: true, default: 4000 },
  status: { type: String, enum: ["owed", "paid", "waived"], default: "owed" },
  reason: String,
  imposedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  paidAt: Date,
  confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" }
}, { timestamps: true });

export default mongoose.model("LateFee", schema);
