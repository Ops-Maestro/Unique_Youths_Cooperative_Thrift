// Traditional Ajo math, kept deliberately simple:
// - 20 members per circle, 2 recipients paid out per month (10 months to
//   complete a circle).
// - Each member pays a flat ₦11,000/month: ₦10,000 into the shared pot
//   (their "savings") + ₦1,000 into the circle's Owambe/get-together fund.
// - A recipient's payout has a flat ₦5,000 service fee deducted on payout
//   day (₦100,000 gross -> ₦95,000 net). Members agree to this when they
//   read and accept the Rules during registration - it's not something
//   flagged as "profit" anywhere in the interface, just a quiet, disclosed
//   deduction at the moment of payout.
// - Paying after the 5th of the month attracts a flat ₦4,000 late fee.
export const SAVINGS_AMOUNT=10000;
export const PARTY_AMOUNT=1000;
export const MONTHLY_CONTRIBUTION=11000;
export const GROSS_PAYOUT=100000;
export const SERVICE_FEE=5000;
export const NET_PAYOUT=95000; // what a recipient actually receives
export const LATE_PENALTY=4000;
export const DEADLINE_DAY=5;
export const CIRCLE_SIZE=20;
export const RECIPIENTS_PER_MONTH=2;

export function latePenaltyFor(date=new Date()) {
  return date.getDate()>DEADLINE_DAY ? LATE_PENALTY : 0;
}
