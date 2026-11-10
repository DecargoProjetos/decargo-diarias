import app from "./app";
import { logger } from "./lib/logger";
import { startUserSyncReportRetention } from "./lib/userSyncReports";
import { logUserSyncRetentionEvent, logUserSyncRetentionFailure } from "./lib/userSyncRetentionLogging";
import { pool } from "@workspace/db";
import { createGracefulShutdown } from "./lib/gracefulShutdown";
import { initializeExportAttempts } from "./lib/exportAttempts";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

await initializeExportAttempts();
const stopRetention = await startUserSyncReportRetention(
  logUserSyncRetentionFailure,
  logUserSyncRetentionEvent,
);

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

const shutdown = createGracefulShutdown({
  stopRetention,
  closeServer: () => new Promise<void>((resolve, reject) => {
    server.close(err => err ? reject(err) : resolve());
  }),
  endPool: () => pool.end(),
});

let shuttingDown = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Server shutdown started");
    void shutdown().then(() => {
      logger.info("Server shutdown completed");
    }).catch(err => {
      logger.error({ err }, "Server shutdown failed");
      process.exitCode = 1;
    });
  });
}
