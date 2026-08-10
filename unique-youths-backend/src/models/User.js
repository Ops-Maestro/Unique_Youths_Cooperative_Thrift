import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  primaryPhone: { type: String, required: true, unique: true, trim: true },
  residentialAddress: { type: String, required: true },
  bank: {
    bankName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    accountName: { type: String, required: true }
  },

  /*
   * Registration lifecycle:
   * pending_otp             -> account created, email not verified yet
   * awaiting_guarantor_review -> email verified, rules accepted, waiting on admin to check the guarantor
   * awaiting_slot_assignment  -> guarantor verified by admin, waiting to be placed in a circle slot
   * active                    -> placed in a circle slot, can use the full member dashboard
   * rejected                  -> guarantor check failed
   */
  registrationStatus: {
    type: String,
    enum: [
      "pending_otp",
      "awaiting_guarantor_review",
      "awaiting_slot_assignment",
      "active",
      "rejected"
    ],
    default: "pending_otp"
  },

  emailVerifiedAt: Date,
  rulesAcceptedAt: Date,

  guarantorName: String,
  guarantorPhone: String,
  guarantorVerifiedAt: Date,
  guarantorVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  guarantorRejectionReason: String,

  /*
   * Profile extras - filled in by the member themselves from the Profile
   * page once they can log in. Not required at registration.
   */
  avatarDataUrl: String, // small base64 data: URI, resized/compressed client-side
  dateOfBirthDay: { type: Number, min: 1, max: 31 },
  dateOfBirthMonth: { type: Number, min: 1, max: 12 }, // day + month only, no year requested
  profileCompletedAt: Date, // set the first time avatar + DOB are both present

  // Updated on every authenticated request (see requireMember middleware).
  // "Online now" is derived from this at read time (within the last ~45s),
  // not stored as a boolean - there's no separate process needed to flip it
  // back to "offline" when someone closes the tab.
  lastSeenAt: Date
}, { timestamps: true });

export default mongoose.model("User", userSchema);
