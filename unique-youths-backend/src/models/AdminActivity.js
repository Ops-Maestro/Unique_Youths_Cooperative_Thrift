import mongoose from "mongoose";

const schema = new mongoose.Schema({
  admin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  adminName: String, // denormalized so the log still reads fine if an admin is ever removed
  action: { type: String, required: true }, // "login" | "logout" | "otp_resend" | etc.
  detail: String
}, { timestamps: true });

export default mongoose.model("AdminActivity", schema);
