/*
 * Termii (and most SMS APIs) expect international format with no leading
 * "+", e.g. "2348012345678" - but members type their number the way
 * everyone actually writes it locally, e.g. "0801 234 5678" or
 * "+234 801 234 5678". This normalizes any of those to what the API needs.
 */
export function toInternationalNigerianPhone(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");

  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0")) return `234${digits.slice(1)}`;
  if (digits.length === 10) return `234${digits}`; // e.g. 8012345678, no leading 0

  return digits; // fall back to whatever was given - let the API reject it if malformed
}
