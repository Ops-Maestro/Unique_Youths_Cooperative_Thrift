// ============================================================
// UNIQUE YOUTH AJO FINANCIAL MODEL
// ============================================================
//
// Core rules:
//
// 1. Every paying member contributes:
//      ₦10,000 savings + ₦1,000 party fund = ₦11,000.
//
// 2. The monthly payout pot is built ONLY from the savings
//    portion of contributions that were actually paid.
//
// 3. A monthly draw can select 1 or 2 recipients.
//    Default = 2.
//
// 4. Gross payout per recipient:
//      monthly savings pot / recipient count
//
// 5. Maintenance fee is separate from the payout pot and is
//    charged to each selected recipient.
//
// 6. Maintenance fee scales with the size of the circle:
//      ₦500 × ceil(circle size / 2)
//
//    Examples:
//      4 members  = ₦1,000 each
//      5-6        = ₦1,500 each
//      19-20      = ₦5,000 each
//      25-26      = ₦6,500 each
//
// 7. Net payout:
//      gross payout - maintenance fee
//
// 8. Late contribution after the 5th:
//      flat ₦4,000 late penalty.
//
// IMPORTANT:
// Do not put a fixed gross payout, service fee, or net payout
// in this file. Those values are calculated from the actual
// circle and actual monthly payment data.
// ============================================================

export const SAVINGS_AMOUNT = 10000;
export const PARTY_AMOUNT = 1000;
export const MONTHLY_CONTRIBUTION =
  SAVINGS_AMOUNT + PARTY_AMOUNT;

export const LATE_PENALTY = 4000;
export const DEADLINE_DAY = 5;

export const DEFAULT_RECIPIENTS_PER_MONTH = 2;
export const MIN_RECIPIENTS_PER_MONTH = 1;
export const MAX_RECIPIENTS_PER_MONTH = 2;

/*
 * Used only as a fallback/default configuration value.
 *
 * It is NOT the permanent size of every circle.
 * Individual Circle documents store their own baselineSize.
 */
export const DEFAULT_CIRCLE_BASELINE_SIZE =
  Number(process.env.CIRCLE_BASELINE_SIZE) || 20;

/*
 * Legacy compatibility exports.
 *
 * These are intentionally undefined rather than fixed financial
 * values. Any route/UI that still imports GROSS_PAYOUT,
 * SERVICE_FEE or NET_PAYOUT must be refactored to use
 * calculatePayoutSummary() instead.
 */
export const GROSS_PAYOUT = null;
export const SERVICE_FEE = null;
export const NET_PAYOUT = null;

export function latePenaltyFor(
  date = new Date()
) {
  return date.getDate() > DEADLINE_DAY
    ? LATE_PENALTY
    : 0;
}

export function validateRecipientCount(
  recipientCount
) {
  const count = Number(
    recipientCount
  );

  if (
    !Number.isInteger(count) ||
    count <
      MIN_RECIPIENTS_PER_MONTH ||
    count >
      MAX_RECIPIENTS_PER_MONTH
  ) {
    throw new Error(
      `Recipient count must be ${MIN_RECIPIENTS_PER_MONTH} or ${MAX_RECIPIENTS_PER_MONTH}.`
    );
  }

  return count;
}

/*
 * Maintenance fee per selected recipient.
 *
 * Examples:
 *
 * 4  -> ₦1,000
 * 5  -> ₦1,500
 * 6  -> ₦1,500
 * 20 -> ₦5,000
 * 25 -> ₦6,500
 * 30 -> ₦7,500
 */
export function maintenanceFeeForCircleSize(
  circleSize
) {
  const size = Number(
    circleSize
  );

  if (
    !Number.isInteger(size) ||
    size < 1
  ) {
    throw new Error(
      "Circle size must be a positive whole number."
    );
  }

  return (
    500 *
    Math.ceil(size / 2)
  );
}

/*
 * Calculate the complete payout model for a monthly draw.
 *
 * paidMemberCount:
 *   Number of members whose monthly contribution was actually
 *   confirmed for the month.
 *
 * circleSize:
 *   Total capacity of this particular circle.
 *
 * recipientCount:
 *   1 or 2.
 */
export function calculatePayoutSummary({
  circleSize,
  paidMemberCount,
  recipientCount =
    DEFAULT_RECIPIENTS_PER_MONTH
}) {
  const size = Number(
    circleSize
  );

  const paid = Number(
    paidMemberCount
  );

  if (
    !Number.isInteger(size) ||
    size < 1
  ) {
    throw new Error(
      "Circle size must be a positive whole number."
    );
  }

  if (
    !Number.isInteger(paid) ||
    paid < 0
  ) {
    throw new Error(
      "Paid member count must be a non-negative whole number."
    );
  }

  const recipients =
    validateRecipientCount(
      recipientCount
    );

  if (
    paid < recipients
  ) {
    throw new Error(
      `At least ${recipients} paid members are required for ${recipients} recipient${recipients === 1 ? "" : "s"} to be selected.`
    );
  }

  const savingsPot =
    paid * SAVINGS_AMOUNT;

  const partyFund =
    paid * PARTY_AMOUNT;

  const grossPayoutPerRecipient =
    savingsPot / recipients;

  const maintenanceFeePerRecipient =
    maintenanceFeeForCircleSize(
      size
    );

  const netPayoutPerRecipient =
    grossPayoutPerRecipient -
    maintenanceFeePerRecipient;

  if (
    netPayoutPerRecipient < 0
  ) {
    throw new Error(
      "Calculated net payout cannot be negative."
    );
  }

  return {
    circleSize: size,
    paidMemberCount: paid,
    recipientCount: recipients,

    savingsAmountPerMember:
      SAVINGS_AMOUNT,

    partyAmountPerMember:
      PARTY_AMOUNT,

    monthlyContribution:
      MONTHLY_CONTRIBUTION,

    savingsPot,

    partyFund,

    grossPayoutPerRecipient,

    maintenanceFeePerRecipient,

    totalMaintenanceFees:
      maintenanceFeePerRecipient *
      recipients,

    netPayoutPerRecipient,

    totalNetPayout:
      netPayoutPerRecipient *
      recipients
  };
}