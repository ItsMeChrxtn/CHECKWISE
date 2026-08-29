import app from "./app.js";
import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { ensureBuckets } from "./services/storageService.js";

async function start() {
  await connectDB();
  await ensureBuckets();

  const server = app.listen(env.port, () => {
    console.log(`[CheckWise] API listening on http://localhost:${env.port} (${env.nodeEnv})`);
    console.log(`[CheckWise] Allowing client origin: ${env.clientUrl}`);
  });

  const shutdown = (signal) => {
    console.log(`\n[CheckWise] ${signal} received, shutting down.`);
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    console.error("[CheckWise] Unhandled promise rejection:", reason);
    server.close(() => process.exit(1));
  });
}

start();
