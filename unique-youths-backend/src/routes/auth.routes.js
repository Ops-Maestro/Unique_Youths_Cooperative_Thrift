import express from "express";
import User from "../models/User.js";
import Admin from "../models/Admin.js";
import OTP from "../models/OTP.js";
import Announcement from "../models/Announcement.js";
import AdminActivity from "../models/AdminActivity.js";
import MemberActivity from "../models/MemberActivity.js";
import { withExpiry } from "../utils/announcements.js";
import { hashPassword, comparePassword, issueToken } from "../utils/auth.js";
import { generateOtp, hashOtp } from "../utils/otp.js";
import { sendOtpEmail } from "../config/email.js";
import { requireAdmin, requireMember } from "../middleware/auth.js";

const router = express.Router();

/* ============================================================
 * ADMIN BOOTSTRAP
 * ============================================================ */
export async function bootstrapAuthorizedAdmins() {
  const configuredAdmins = [
    {
      email: process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase(),
      username: process.env.SUPER_ADMIN_USERNAME?.trim().toLowerCase() || "superadmin",
      password: process.env.SUPER_ADMIN_INITIAL_PASSWORD,
      role: "master_supervisor"
    },
    {
      email: process.env.SUPERVISOR_EMAIL?.trim().toLowerCase(),
      username: process.env.SUPERVISOR_USERNAME?.trim().toLowerCase() || "supervisor",
      password: process.env.SUPERVISOR_INITIAL_PASSWORD,
      role: "staff_auditor"
    }
  ];

  for (const config of configuredAdmins) {
    if (!config.email || !config.password) {
      throw new Error(`${config.role} admin configuration is incomplete. Check the environment variables.`);
    }
    if (config.password.length < 12) {
      throw new Error(`${config.role} initial password must be at least 12 characters.`);
    }

    const existingByEmail = await Admin.findOne({ email: config.email });
    if (existingByEmail) {
      if (existingByEmail.role !== config.role) {
        throw new Error(`Admin ${config.email} already exists with role "${existingByEmail.role}", expected "${config.role}".`);
      }
      continue;
    }

    const existingByUsername = await Admin.findOne({ username: config.username });
    if (existingByUsername) {
      throw new Error(`Admin username "${config.username}" is already in use.`);
    }

    const admin = await Admin.create({
      email: config.email,
      username: config.username,
      password: await hashPassword(config.password),
      role: config.role,
      isActive: true
    });

    console.log(`Initialized ${admin.role}: ${admin.email}`);
  }
}

/* ============================================================
 * MEMBER OTP (email only - no SMS, keeps this free-tier friendly)
 * ============================================================ */
async function sendOtp(user) {
  const cooldown = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60);

  const last = await OTP.findOne({ user: user._id }).sort({ createdAt: -1 });
  if (last && (Date.now() - last.createdAt.getTime()) / 1000 < cooldown) {
    const wait = Math.ceil(cooldown - (Date.now() - last.createdAt.getTime()) / 1000);
    const error = new Error(`Please wait ${wait} seconds before requesting another OTP`);
    error.status = 429;
    throw error;
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + Number(process.env.OTP_EXPIRES_MINUTES || 10) * 60 * 1000);

  await OTP.create({ user: user._id, email: user.email, otpHash: hashOtp(otp), expiresAt });
  await sendOtpEmail({ to: user.email, otp });
}

/* ============================================================
 * MEMBER REGISTRATION - step 1: create account + send OTP
 * ============================================================ */
router.post("/register", async (req, res) => {
  try {
    const { firstName, lastName, username, email, password, primaryPhone, residentialAddress, bank } = req.body;

    if (!firstName || !lastName || !username || !email || !password || !primaryPhone || !residentialAddress ||
        !bank?.bankName || !bank?.accountNumber || !bank?.accountName) {
      return res.status(400).json({ message: "All required registration fields must be supplied" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim().toLowerCase();

    const exists = await User.findOne({
      $or: [{ email: normalizedEmail }, { username: normalizedUsername }, { primaryPhone }]
    });

    if (exists) {
      return res.status(409).json({ message: "Email, username, or phone already exists" });
    }

    const user = await User.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      username: normalizedUsername,
      email: normalizedEmail,
      password: await hashPassword(password),
      primaryPhone,
      residentialAddress,
      bank,
      registrationStatus: "pending_otp"
    });

    try {
      await sendOtp(user);
    } catch (error) {
      await User.findByIdAndDelete(user._id);
      throw error;
    }

    return res.status(201).json({
      message: "Registration started. Check your email for the OTP.",
      userId: user._id
    });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Registration failed" });
  }
});

/* ============================================================
 * VERIFY EMAIL OTP - step 2
 * Issues a short-lived "registration" token, NOT a member session.
 * ============================================================ */
router.post("/verify-otp", async (req, res) => {
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({ message: "User ID and OTP are required" });
    }

    const record = await OTP.findOne({ user: userId, verified: false }).sort({ createdAt: -1 });

    if (!record || record.expiresAt <= new Date()) {
      return res.status(400).json({ message: "OTP is invalid or expired" });
    }

    if (record.attempts >= Number(process.env.OTP_MAX_ATTEMPTS || 5)) {
      return res.status(429).json({ message: "Maximum OTP attempts exceeded" });
    }

    record.attempts += 1;

    if (record.otpHash !== hashOtp(otp)) {
      await record.save();
      return res.status(400).json({ message: "Incorrect OTP" });
    }

    record.verified = true;
    await record.save();

    const user = await User.findByIdAndUpdate(
      userId,
      { emailVerifiedAt: new Date() },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Deliberately much shorter than a normal login session (JWT_EXPIRES_IN,
    // default 1 day) - this token's only job is to bridge the few minutes
    // between "OTP verified" and "guarantor + rules submitted." It's also
    // already scope-limited (see requireRegistration) so it can't be used
    // to log in or reach any member route even before it expires.
    const registrationToken = issueToken(
      { type: "registration", userId: user._id },
      { expiresIn: process.env.REGISTRATION_TOKEN_EXPIRES_IN || "45m" }
    );

    return res.json({
      message: "Email verified",
      registrationToken
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "OTP verification failed" });
  }
});

/* ============================================================
 * RESEND OTP
 * ============================================================ */
router.post("/resend-otp", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: "User ID is required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.emailVerifiedAt) return res.status(400).json({ message: "Email already verified" });

    await sendOtp(user);
    return res.json({ message: "A new OTP was sent to your email" });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Unable to resend OTP" });
  }
});

/* ============================================================
 * MEMBER LOGIN - email or username + password
 * Only works once registration has actually started (email verified).
 * ============================================================ */
router.post("/login", async (req, res) => {
  try {
    const identifier = String(req.body.usernameOrEmail || req.body.username || req.body.email || "")
      .trim()
      .toLowerCase();
    const password = req.body.password;

    if (!identifier || !password) {
      return res.status(400).json({ message: "Email/username and password are required" });
    }

    const user = await User.findOne({
      $or: [{ email: identifier }, { username: identifier }]
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const passwordMatches = await comparePassword(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.emailVerifiedAt) {
      return res.status(403).json({ message: "Please verify your email before logging in" });
    }

    if (user.registrationStatus === "rejected") {
      return res.status(403).json({
        message: user.guarantorRejectionReason
          ? `Your registration was not approved: ${user.guarantorRejectionReason}`
          : "Your registration was not approved. Contact an administrator."
      });
    }

    const token = issueToken({ type: "member", userId: user._id });

    // A short-lived, private "welcome back" greeting every time a member
    // logs in (not just their very first login). Clears itself out after
    // 15 minutes so it doesn't linger in the ticker.
    await Announcement.create(withExpiry({
      type: "general_update",
      description: `Welcome back, ${user.firstName}!`,
      user: user._id
    }, 5));

    await MemberActivity.create({
      user: user._id,
      userName: `${user.firstName} ${user.lastName}`,
      action: "login",
      detail: "Logged in"
    });

    // Also counts as "seen right now" - no need to wait for their first
    // dashboard poll for the online dot to go green.
    await User.updateOne({ _id: user._id }, { $set: { lastSeenAt: new Date() } });

    return res.json({
      message: "Login successful",
      token,
      registrationStatus: user.registrationStatus
    });
  } catch (error) {
    console.error("Member login error:", error);
    return res.status(500).json({ message: "Login failed" });
  }
});

/* ============================================================
 * ADMIN LOGIN - only the two configured administrators
 * ============================================================ */
router.post("/admin/login", async (req, res) => {
  try {
    const identifier = String(req.body.usernameOrEmail || req.body.username || req.body.email || "")
      .trim()
      .toLowerCase();
    const password = req.body.password;

    if (!identifier || !password) {
      return res.status(400).json({ message: "Username/email and password are required" });
    }

    const authorizedEmails = [
      process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase(),
      process.env.SUPERVISOR_EMAIL?.trim().toLowerCase()
    ].filter(Boolean);

    if (!authorizedEmails.length) {
      return res.status(503).json({ message: "Administrator authentication is not configured" });
    }

    const admin = await Admin.findOne({
      isActive: true,
      $or: [{ email: identifier }, { username: identifier }]
    });

    if (!admin) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!authorizedEmails.includes(admin.email)) {
      return res.status(403).json({ message: "Administrator account is not authorized" });
    }

    const passwordMatches = await comparePassword(password, admin.password);
    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = issueToken({ type: "admin", adminId: admin._id, role: admin.role });

    await AdminActivity.create({
      admin: admin._id,
      adminName: admin.username,
      action: "login",
      detail: `Logged in (${admin.role.replace("_", " ")})`
    });

    return res.json({
      token,
      admin: { id: admin._id, email: admin.email, username: admin.username, role: admin.role }
    });
  } catch (error) {
    console.error("Admin login error:", error);
    return res.status(500).json({ message: "Login failed" });
  }
});

/* ============================================================
 * ADMIN LOGOUT - just records it in the activity log. The token itself
 * is stateless (JWT), so "logging out" is really the client discarding it;
 * this call just gives other admins visibility into who's active.
 * ============================================================ */
router.post("/admin/logout", requireAdmin, async (req, res) => {
  try {
    const admin = await Admin.findById(req.auth.adminId);
    await AdminActivity.create({
      admin: req.auth.adminId,
      adminName: admin?.username || "Unknown admin",
      action: "logout",
      detail: "Logged out"
    });
    return res.json({ message: "Logged out" });
  } catch (error) {
    return res.status(500).json({ message: "Could not record logout" });
  }
});

/* ============================================================
 * MEMBER LOGOUT - same idea as admin logout above: records it in the
 * activity log so an admin can see who's logging in/out and when. Also
 * clears lastSeenAt immediately so the member's dot goes red right away
 * instead of waiting ~45s for the online window to lapse.
 * ============================================================ */
router.post("/member/logout", requireMember, async (req, res) => {
  try {
    const user = await User.findById(req.auth.userId);
    await MemberActivity.create({
      user: req.auth.userId,
      userName: user ? `${user.firstName} ${user.lastName}` : "Unknown member",
      action: "logout",
      detail: "Logged out"
    });
    if (user) {
      user.lastSeenAt = new Date(0);
      await user.save();
    }
    return res.json({ message: "Logged out" });
  } catch (error) {
    return res.status(500).json({ message: "Could not record logout" });
  }
});

export default router;