import User from "../models/User.js";
import Circle from "../models/Circle.js";
import Ledger from "../models/Ledger.js";
import LateFee from "../models/LateFee.js";
import Announcement from "../models/Announcement.js";
import Admin from "../models/Admin.js";

/*
 * A free alternative to Atlas's paid Cloud Backup: dump the collections
 * that actually matter to restore (not OTPs or activity logs - those are
 * transient/low-value) to plain JSON, one file per collection. JSON
 * round-trips perfectly (unlike a spreadsheet export, which would lose
 * ObjectId references and nested structure) - each file here is
 * literally an array of documents ready to feed back into
 * Model.insertMany() if ever needed.
 */
const COLLECTIONS = [
  { name: "users", model: User },
  { name: "circles", model: Circle },
  { name: "ledgers", model: Ledger },
  { name: "latefees", model: LateFee },
  { name: "announcements", model: Announcement },
  { name: "admins", model: Admin }
];

export async function runBackup() {
  const attachments = [];
  const summary = [];

  for (const { name, model } of COLLECTIONS) {
    const docs = await model.find().lean();
    const json = JSON.stringify(docs, null, 2);
    attachments.push({
      filename: `${name}.json`,
      content: Buffer.from(json, "utf-8").toString("base64")
    });
    summary.push(`${name}: ${docs.length}`);
  }

  return { attachments, summary };
}
