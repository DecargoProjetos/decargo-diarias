import { logger } from "./logger";
import type { RetentionEvent } from "./userSyncRetentionMonitor";

// SQL errors can contain report JSON or identifying query parameters.
export function logUserSyncRetentionFailure(_error: unknown) {
  logger.error({ event: "user_sync_retention_failure" }, "User sync report retention cleanup failed");
}

export function logUserSyncRetentionEvent(event: RetentionEvent) {
  if (event.event === "user_sync_retention_alert") {
    logger.error(event, "Operational alert: user sync report retention repeatedly failed");
  } else {
    logger.info(event, "User sync report retention recovered");
  }
}
