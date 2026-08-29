import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDB() {
  mongoose.set("strictQuery", true);

  try {
    const conn = await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`[CheckWise] MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error(`[CheckWise] MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }
}

mongoose.connection.on("disconnected", () => {
  console.warn("[CheckWise] MongoDB disconnected");
});
