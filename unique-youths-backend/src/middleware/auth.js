import jwt from "jsonwebtoken";
import User from "../models/User.js";

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    req.auth = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function requireMember(req, res, next) {
  return requireAuth(req, res, () => {
    if (req.auth.type !== "member") {
      return res.status(403).json({ message: "Member access required" });
    }
    // Fire-and-forget - never await this or let it block/fail the request.
    // This is what powers "online now" in the admin Members page: every
    // authenticated call from a member's dashboard (including the regular
    // 8-second polling) refreshes this timestamp.
    User.updateOne({ _id: req.auth.userId }, { $set: { lastSeenAt: new Date() } }).catch(() => {});
    next();
  });
}

export function requireAdmin(req, res, next) {
  return requireAuth(req, res, () => {
    if (req.auth.type !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  });
}

/*
 * Short-lived token issued only after OTP verification, used solely to
 * submit guarantor details + rules acceptance. It cannot access the
 * member dashboard or any other member route.
 */
export function requireRegistration(req, res, next) {
  return requireAuth(req, res, () => {
    if (req.auth.type !== "registration") {
      return res.status(403).json({ message: "Registration session required" });
    }
    next();
  });
}
