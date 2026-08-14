import rateLimit from "express-rate-limit";

/*
 * Applied only to the endpoints someone could actually abuse by guessing:
 * login (password guessing), OTP verify (code guessing), and OTP
 * send/resend (spam / cost-abuse, since SMS costs money per message).
 * Keyed by IP - fine for a small community app, no need for anything
 * fancier than express-rate-limit's default in-memory store.
 */

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please wait a few minutes and try again." }
});

export const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many OTP attempts. Please wait a few minutes and try again." }
});

export const otpSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many OTP requests. Please wait a while before requesting another." }
});
