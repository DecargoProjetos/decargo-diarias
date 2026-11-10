/** Drain HTTP and background work before closing their shared database pool. */
export function createGracefulShutdown(resources: {
  stopRetention: () => Promise<void>;
  closeServer: () => Promise<void>;
  endPool: () => Promise<void>;
}) {
  let completion: Promise<void> | undefined;
  return () => {
    completion ??= (async () => {
      // Both calls start immediately; neither is allowed to close the pool early.
      const outcomes = await Promise.allSettled([
        resources.stopRetention(),
        resources.closeServer(),
      ]);
      await resources.endPool();
      const failed = outcomes.find(outcome => outcome.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
    })();
    return completion;
  };
}
