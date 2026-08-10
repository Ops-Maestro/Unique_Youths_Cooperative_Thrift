import { Resend } from "resend";
let client;

function resend() {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");
  client ??= new Resend(process.env.RESEND_API_KEY);
  return client;
}

export async function sendOtpEmail({to, otp}) {
  const from=process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is not configured");
  const {data,error}=await resend().emails.send({
    from, to:[to], subject:"Your Unique Youth verification code",
    html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px">
      <h2 style="color:#173ea5">Unique Youth</h2>
      <p>Use the verification code below to continue your registration.</p>
      <div style="font-size:36px;font-weight:700;letter-spacing:10px;padding:18px 0">${otp}</div>
      <p>This code expires in ${process.env.OTP_EXPIRES_MINUTES||10} minutes.</p>
      <p>If you did not request this code, ignore this email.</p>
    </div>`
  });
  if (error) throw new Error(error.message || "Email delivery failed");
  return data;
}
