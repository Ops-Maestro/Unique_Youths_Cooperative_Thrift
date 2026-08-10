import mongoose from "mongoose";

export async function connectDatabase() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured");
  mongoose.set("strictQuery", true);
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB Atlas connected");
}
export function databaseState() {
  return mongoose.connection.readyState === 1 ? "connected" : "disconnected";
}
