import mongoose from "mongoose";

export async function connectDatabase() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured");
  if (!process.env.MONGODB_DB_NAME) {
    // No silent fallback on purpose. A missing value here used to default
    // to a hardcoded database name - which is safe when that default is an
    // empty/throwaway database, but actively dangerous once that default
    // is the real production database (a forgotten env var on a staging
    // deploy would silently point test traffic at real member data). Every
    // environment - prod, staging, a contributor's local .env - must say
    // explicitly which database it's using. Fail loud at boot instead of
    // guessing, so this can never again be discovered via "why is the
    // member count 0" instead of an immediate crash.
    throw new Error(
      "MONGODB_DB_NAME is not configured. Set it explicitly to the database " +
      "this environment should use (e.g. unique_youths_cooperative_thrift " +
      "for production) - there is no default."
    );
  }
  mongoose.set("strictQuery", true);

  const dbName = process.env.MONGODB_DB_NAME;

  await mongoose.connect(process.env.MONGODB_URI, { dbName });
  console.log(`MongoDB Atlas connected (database: "${dbName}")`);
}
export function databaseState() {
  return mongoose.connection.readyState === 1 ? "connected" : "disconnected";
}