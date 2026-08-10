import mongoose from "mongoose";

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  userName: String, // denormalized so the log still reads fine if a member is ever removed
  action: { type: String, required: true }, // "login" | "logout"
  detail: String
}, { timestamps: true });

export default mongoose.model("MemberActivity", schema);
