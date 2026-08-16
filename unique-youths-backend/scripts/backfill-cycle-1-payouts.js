import mongoose from "mongoose";
import dotenv from "dotenv";
import Circle from "../src/models/Circle.js";
import Payout from "../src/models/Payout.js";

dotenv.config();

const LEGACY_PAYMENT_REFERENCE =
  "LEGACY-CYCLE1-BACKFILL";

async function connectDatabase() {
  const uri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI;

  const dbName =
    process.env.MONGODB_DB_NAME;

  if (!uri) {
    throw new Error(
      "MONGODB_URI is not configured."
    );
  }

  if (!dbName) {
    throw new Error(
      "MONGODB_DB_NAME is not configured."
    );
  }

  await mongoose.connect(
    uri,
    {
      dbName
    }
  );

  console.log(
    `Connected to MongoDB database "${dbName}".`
  );
}

async function backfillCycle1Payouts() {
  const circles =
    await Circle.find({
      cycleNumber: 1
    });

  if (!circles.length) {
    console.log(
      "No cycle 1 circles found."
    );

    return;
  }

  console.log(
    `Found ${circles.length} cycle 1 circle(s).`
  );

  for (
    const circle of circles
  ) {
    console.log(
      `Processing ${circle.name} (${circle._id})...`
    );

    const history =
      circle.draw?.history || [];

    if (!history.length) {
      console.log(
        "No draw history found. Skipping."
      );

      continue;
    }

    /*
     * Circle 1 currently has one historical draw.
     *
     * This snapshot is the authoritative financial record for the
     * historical draw.
     */
    const firstDraw =
      history[0];

    const circleSize =
      Number(
        firstDraw.circleSize ||
          circle.members.length
      );

    const paidMemberCount =
      Number(
        firstDraw.paidMemberCount ||
          0
      );

    const recipientCount =
      Number(
        firstDraw.recipientCount ||
          circle.recipientCount ||
          1
      );

    const savingsPot =
      Number(
        firstDraw.savingsPot ||
          0
      );

    const partyFund =
      Number(
        firstDraw.partyFund ||
          0
      );

    const grossAmount =
      Number(
        firstDraw.grossPayoutPerRecipient ||
          0
      );

    const maintenanceFee =
      Number(
        firstDraw.maintenanceFeePerRecipient ||
          0
      );

    const netAmount =
      Number(
        firstDraw.netPayoutPerRecipient ||
          0
      );

    /*
     * Payout.drawNumber has a minimum of 1.
     *
     * The historical Circle draw is draw 1, so every migrated
     * Cycle 1 payout belongs to draw 1.
     */
    const drawNumber =
      Number(
        firstDraw.drawNumber ||
          1
      );

    /*
     * These are the two people already recorded in the historical
     * random-draw recipients array:
     *
     * Emmanuel
     * Adetomi
     */
    const historicalRecipients =
      (
        firstDraw.recipients ||
        []
      ).map(
        userId =>
          String(
            userId
          )
      );

    /*
     * ------------------------------------------------------------
     * 1. ENSURE HISTORICAL DRAW RECIPIENT PAYOUTS EXIST
     * ------------------------------------------------------------
     */
    for (
      const userId of historicalRecipients
    ) {
      const member =
        circle.members.find(
          item =>
            String(
              item.user
            ) ===
            userId
        );

      if (!member) {
        console.log(
          `Historical recipient ${userId} is not a member of this circle. Skipping.`
        );

        continue;
      }

      const existing =
        await Payout.findOne({
          circle:
            circle._id,

          cycleNumber:
            circle.cycleNumber,

          drawNumber,

          user:
            member.user
        });

      if (existing) {
        console.log(
          `Payout already exists for historical recipient ${userId}.`
        );

        continue;
      }

      await Payout.create({
        circle:
          circle._id,

        cycleNumber:
          circle.cycleNumber,

        drawNumber,

        user:
          member.user,

        numericId:
          member.numericId,

        circleSize,

        paidMemberCount,

        recipientCount,

        savingsPot,

        partyFund,

        grossAmount,

        maintenanceFee,

        netAmount,

        status:
          "pending"
      });

      console.log(
        `Created pending payout for historical recipient ${userId}.`
      );
    }

    /*
     * ------------------------------------------------------------
     * 2. MIGRATE MEMBERS ALREADY MARKED AS DISBURSED
     * ------------------------------------------------------------
     *
     * David and Toyese already had:
     *
     *   disbursed: true
     *   drawExcluded: true
     *
     * before the Payout collection was introduced.
     *
     * They therefore need historical paid payout records.
     *
     * IMPORTANT:
     *
     * drawNumber must be 1 because Payout.js requires a minimum of 1.
     *
     * We do not create another random draw.
     */
    const legacyMembers =
      circle.members.filter(
        member =>
          member.disbursed === true &&
          !historicalRecipients.includes(
            String(
              member.user
            )
          )
      );

    for (
      const member of legacyMembers
    ) {
      /*
       * Check using draw 1.
       *
       * This prevents the migration from creating duplicates if it is
       * accidentally run more than once.
       */
      const existing =
        await Payout.findOne({
          circle:
            circle._id,

          cycleNumber:
            circle.cycleNumber,

          drawNumber,

          user:
            member.user
        });

      if (existing) {
        console.log(
          `Legacy payout already exists for user ${member.user}.`
        );

        continue;
      }

      await Payout.create({
        circle:
          circle._id,

        cycleNumber:
          circle.cycleNumber,

        /*
         * The old system did not have an independent payout ledger.
         *
         * This payout belongs to the historical Cycle 1 draw.
         */
        drawNumber,

        user:
          member.user,

        numericId:
          member.numericId,

        circleSize,

        paidMemberCount,

        /*
         * Legacy payouts represented a recipient individually.
         */
        recipientCount:
          1,

        savingsPot,

        partyFund,

        grossAmount,

        maintenanceFee,

        netAmount,

        /*
         * Because these members were already recorded as
         * disbursed/collected in the old system, the migrated
         * financial state is "paid".
         */
        status:
          "paid",

        paidAt:
          member.disbursedAt ||
          firstDraw.completedAt ||
          new Date(),

        paymentReference:
          LEGACY_PAYMENT_REFERENCE,

        note:
          "Historical payout migrated from the legacy Circle member disbursed state."
      });

      console.log(
        `Created paid legacy payout for user ${member.user} (slot ${member.numericId}).`
      );
    }

    /*
     * ------------------------------------------------------------
     * 3. VERIFY ALL CYCLE 1 MEMBERS HAVE PAID PAYOUT RECORDS
     * ------------------------------------------------------------
     *
     * A completed cycle must have one paid payout for every member.
     *
     * We deliberately check the payout collection instead of relying
     * only on Circle.members.disbursed because the new payout ledger
     * is now the authoritative financial state.
     */
    const cyclePayouts =
      await Payout.find({
        circle:
          circle._id,

        cycleNumber:
          circle.cycleNumber
      });

    const paidUserIds =
      new Set(
        cyclePayouts
          .filter(
            payout =>
              payout.status ===
              "paid"
          )
          .map(
            payout =>
              String(
                payout.user
              )
          )
      );

    const allMembersPaid =
      circle.members.length >
        0 &&
      circle.members.every(
        member =>
          paidUserIds.has(
            String(
              member.user
            )
          )
      );

    if (
      allMembersPaid &&
      circle.members.length >=
        circle.baselineSize
    ) {
      circle.completed =
        true;

      circle.active =
        false;

      circle.completedAt =
        circle.completedAt ||
        firstDraw.completedAt ||
        new Date();

      await circle.save();

      console.log(
        `Cycle ${circle.cycleNumber} is now financially complete: all ${circle.members.length} members have paid payout records.`
      );
    } else {
      console.log(
        `Cycle ${circle.cycleNumber} is not yet complete. Paid payout records: ${paidUserIds.size}/${circle.members.length}.`
      );
    }
  }
}

async function main() {
  try {
    await connectDatabase();

    await backfillCycle1Payouts();

    console.log(
      "Cycle 1 payout backfill completed."
    );
  } catch (error) {
    console.error(
      "Cycle 1 payout backfill failed:",
      error
    );

    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();

    console.log(
      "MongoDB connection closed."
    );
  }
}

main();