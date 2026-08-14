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

export async function sendBackupEmail({ to, attachments, summary }) {
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is not configured");
  const { data, error } = await resend().emails.send({
    from, to: [to], subject: `Unique Youth database backup - ${new Date().toLocaleDateString("en-NG", { dateStyle: "medium" })}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px">
      <h2 style="color:#173ea5">Unique Youth - Database Backup</h2>
      <p>Attached: one JSON file per collection, current as of right now.</p>
      <ul>${(summary || []).map(s => `<li>${s}</li>`).join("")}</ul>
      <p style="color:#666;font-size:13px">Keep this email somewhere safe - these files can be restored if the live database is ever lost, without needing a paid Atlas backup plan.</p>
    </div>`,
    attachments: (attachments || []).map(a => ({ filename: a.filename, content: a.content }))
  });
  if (error) throw new Error(error.message || "Email delivery failed");
  return data;
}

export async function sendNewDeviceAlertEmail({ to, firstName, when }) {
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is not configured");
  const time = (when || new Date()).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
  const { data, error } = await resend().emails.send({
    from, to: [to], subject: "New sign-in to your Unique Youth account",
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px">
      <h2 style="color:#173ea5">Unique Youth</h2>
      <p>Hi ${firstName || "there"}, your account was just signed in to from a device we haven't seen before, on ${time}.</p>
      <p><b>If this was you</b> (a new phone, a new browser, etc.) - no action needed, you can ignore this email.</p>
      <p><b>If this was not you</b> - please contact an administrator right away so they can help secure your account.</p>
    </div>`
  });
  if (error) throw new Error(error.message || "Email delivery failed");
  return data;
}
