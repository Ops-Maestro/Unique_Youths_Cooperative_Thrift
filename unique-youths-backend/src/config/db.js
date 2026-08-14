import mongoose from "mongoose";

export async function connectDatabase() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured");
  mongoose.set("strictQuery", true);

  // Deliberately explicit, not left to whatever's (or isn't) in the URI's
  // path segment - MongoDB Atlas's own "Connect" button generates a
  // connection string with NO database name in it at all, which silently
  // makes the driver default to a database literally called "test". This
  // makes the real database name a config decision, not an accident of
  // which connection string got pasted into .env.
  const dbName = process.env.MONGODB_DB_NAME || "unique_youths_cooperative_thrift";

  await mongoose.connect(process.env.MONGODB_URI, { dbName });
  console.log(`MongoDB Atlas connected (database: "${dbName}")`);
}
export function databaseState() {
  return mongoose.connection.readyState === 1 ? "connected" : "disconnected";
}
