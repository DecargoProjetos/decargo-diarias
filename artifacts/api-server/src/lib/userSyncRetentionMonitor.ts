/** Per-process operational state. Never accepts reports or database errors. */
export const USER_SYNC_RETENTION_ALERT_THRESHOLD = 3;

export type RetentionEvent = {
  event: "user_sync_retention_alert" | "user_sync_retention_recovered";
  consecutiveFailures: number;
  firstFailureAt: string;
  occurredAt: string;
};

let consecutiveFailures = 0;
let firstFailureAt: string | null = null;
let lastSuccessAt: string | null = null;
let alertActive = false;

export function getUserSyncRetentionHealth() {
  return {
    status: alertActive ? "degraded" as const : "ok" as const,
    alertActive,
    consecutiveFailures,
    threshold: USER_SYNC_RETENTION_ALERT_THRESHOLD,
    firstFailureAt,
    lastSuccessAt,
  };
}

export function recordUserSyncRetentionFailure(now = new Date()): RetentionEvent | undefined {
  consecutiveFailures = Math.min(consecutiveFailures + 1, Number.MAX_SAFE_INTEGER);
  firstFailureAt ??= now.toISOString();
  if (alertActive || consecutiveFailures < USER_SYNC_RETENTION_ALERT_THRESHOLD) return;
  alertActive = true;
  return {
    event: "user_sync_retention_alert",
    consecutiveFailures,
    firstFailureAt,
    occurredAt: now.toISOString(),
  };
}

export function recordUserSyncRetentionSuccess(now = new Date()): RetentionEvent | undefined {
  const recovery: RetentionEvent | undefined = alertActive && firstFailureAt ? {
    event: "user_sync_retention_recovered",
    consecutiveFailures,
    firstFailureAt,
    occurredAt: now.toISOString(),
  } : undefined;
  consecutiveFailures = 0;
  firstFailureAt = null;
  alertActive = false;
  lastSuccessAt = now.toISOString();
  return recovery;
}
