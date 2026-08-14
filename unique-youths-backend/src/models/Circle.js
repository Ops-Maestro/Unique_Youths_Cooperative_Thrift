import mongoose from "mongoose";

const member = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  // This is the member's assigned slot number.
  // It is NOT used as the random draw input.
  numericId: {
    type: Number,
    required: true,
    min: 1
  },

  // Once a member receives their lump-sum payout,
  // they are locked out of future draws for this cycle.
  drawExcluded: {
    type: Boolean,
    default: false
  },

  disbursed: {
    type: Boolean,
    default: false
  },

  disbursedAt: Date
}, { _id: false });

const schema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    default: "Unique Youth Circle"
  },

  cycleNumber: {
    type: Number,
    required: true,
    default: 1
  },

  baselineSize: {
    type: Number,
    default: 20
  },

  members: {
    type: [member],
    default: []
  },

  // active: still running (accepting registration and/or draws)
  active: {
    type: Boolean,
    default: true
  },

  // completed: every slot has been disbursed
  completed: {
    type: Boolean,
    default: false
  },

  completedAt: Date,

  // ============================================================
  // LIVE RANDOM DRAW STATE
  // ============================================================
  //
  // This allows both the admin dashboard and member dashboards
  // to know that a draw is currently taking place.
  //
  // The actual random selection is still performed on the server.
  // This state is only used to synchronize the UI.
  // ============================================================

  draw: {
    status: {
      type: String,
      enum: ["idle", "rolling", "completed"],
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

    // IDs of the two selected members.
    // These are stored temporarily so the dashboards can display
    // the result before the next draw.
    selectedMembers: {
      type: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }],
      default: []
    }
  }
}, {
  timestamps: true
});

export default mongoose.model("Circle", schema);
