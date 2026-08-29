import dotenv from "dotenv";

dotenv.config();

const required = ["MONGODB_URI", "JWT_SECRET"];

const missing = required.filter((key) => !process.env[key]);

if (missing.length) {
  console.error(
    `\n[CheckWise] Missing required environment variables: ${missing.join(", ")}\n` +
      `Copy server/.env.example to server/.env and fill in the values.\n`
  );
  process.exit(1);
}

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || "development",
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 15,
};

export const isProduction = env.nodeEnv === "production";
