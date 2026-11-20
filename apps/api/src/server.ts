import { createApp } from "./app.js";
import { connectDb, disconnectDb } from "./config/db.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { startAccountDeletionWorker } from "./services/accountDeletion.js";
import { flushTelemetry } from "./services/telemetry.js";

async function main() {
  await connectDb();
  const stopAccountDeletionWorker = startAccountDeletionWorker();
  const server = createApp().listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT}`);
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    stopAccountDeletionWorker();
    server.close(async () => {
      await flushTelemetry();
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "Failed to start");
  process.exit(1);
});
