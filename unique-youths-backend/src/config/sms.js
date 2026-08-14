import { toInternationalNigerianPhone } from "../utils/phone.js";

const BASE_URL = process.env.TERMII_BASE_URL || "https://api.ng.termii.com/api";

export async function sendOtpSms({ to, otp }) {
  const apiKey = process.env.TERMII_API_KEY;
  const senderId = process.env.TERMII_SENDER_ID;

  if (!apiKey) throw new Error("TERMII_API_KEY is not configured");
  if (!senderId) throw new Error("TERMII_SENDER_ID is not configured");

  const response = await fetch(`${BASE_URL}/sms/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      to: toInternationalNigerianPhone(to),
      from: senderId,
      sms: `Your Unique Youths verification code is ${otp}. It expires in ${process.env.OTP_EXPIRES_MINUTES || 10} minutes.`,
      type: "plain",
      // The DND route is Termii's transactional lane (as opposed to
      // "generic", which is explicitly for promotional messages only and
      // gets filtered by Nigerian carriers' Do-Not-Disturb rules). An OTP
      // is exactly the kind of message the DND route exists for.
      channel: "dnd"
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || (data.code && data.code !== "ok")) {
    throw new Error(data.message || "SMS delivery failed");
  }

  return data;
}
