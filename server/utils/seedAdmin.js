/**
 * Creates (or promotes) the CheckWise administrator account.
 *
 *   npm run seed:admin -- --email admin@checkwise.app --password "S3cure!pass" --name "System Admin"
 *
 * Values may also come from ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME in .env.
 * Passwords are hashed by the User model - nothing plain text is written.
 */
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { connectDB } from "../config/db.js";
import User from "../models/User.js";

function arg(flag) {
  const index = process.argv.indexOf(`--${flag}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

const name = arg("name") || process.env.ADMIN_NAME || "CheckWise Admin";
const email = (arg("email") || process.env.ADMIN_EMAIL || "").toLowerCase().trim();
const password = arg("password") || process.env.ADMIN_PASSWORD || "";

if (!email || !password) {
  console.error(
    "Provide an email and password:\n" +
      '  npm run seed:admin -- --email admin@checkwise.app --password "YourPassword123"'
  );
  process.exit(1);
}

if (password.length < 8) {
  console.error("The admin password must be at least 8 characters.");
  process.exit(1);
}

await connectDB();

const existing = await User.findOne({ email });

if (existing) {
  existing.role = "admin";
  existing.isActive = true;
  existing.password = password;
  await existing.save();
  console.log(`[CheckWise] Updated existing account and ensured admin role: ${email}`);
} else {
  await User.create({ name, email, password, role: "admin" });
  console.log(`[CheckWise] Admin account created: ${email}`);
}

console.log(`[CheckWise] Sign in at ${env.clientUrl}/login`);
await mongoose.connection.close();
