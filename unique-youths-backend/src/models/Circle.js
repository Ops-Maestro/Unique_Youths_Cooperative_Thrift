import mongoose from "mongoose";

const member = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  numericId: { type: Number, required: true, min: 1 },
  drawExcluded: { type: Boolean, default: false },
  disbursed: { type: Boolean, default: false },
  disbursedAt: Date
}, { _id: false });

const schema = new mongoose.Schema({
  name: { type: String, required: true, default: "Unique Youth Circle" },
  cycleNumber: { type: Number, required: true, default: 1 },
  baselineSize: { type: Number, default: 20 },
  members: { type: [member], default: [] },

  // active: still running (accepting registration and/or draws)
  active: { type: Boolean, default: true },

  // completed: every slot has been disbursed - the cycle is fully wrapped up
  completed: { type: Boolean, default: false },
  completedAt: Date
}, { timestamps: true });

export default mongoose.model("Circle", schema);
