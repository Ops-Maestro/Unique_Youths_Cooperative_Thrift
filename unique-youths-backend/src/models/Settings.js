import mongoose from "mongoose";

const SettingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });

// Use existing model if already compiled, otherwise create it
const Settings = mongoose.models.Settings || mongoose.model("Settings", SettingsSchema);

// Bootstrap function – call after DB connection
const initSettings = async () => {
  try {
    const existing = await Settings.findOne({ key: "paymentReportingOpen" });
    if (!existing) {
      await Settings.create({ key: "paymentReportingOpen", value: true });
      console.log("✅ Settings: paymentReportingOpen initialized to true");
    }
  } catch (err) {
    console.error("❌ Failed to init settings:", err.message);
  }
};

export { Settings, initSettings };