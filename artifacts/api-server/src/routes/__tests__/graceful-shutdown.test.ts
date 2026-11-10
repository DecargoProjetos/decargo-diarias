import { describe, expect, it, vi } from "vitest";
import { createGracefulShutdown } from "../../lib/gracefulShutdown";

function barrier() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("graceful server shutdown", () => {
  it.each(["retention", "http"] as const)("waits for both resources when %s finishes first and ends the pool once", async first => {
    const retention = barrier();
    const http = barrier();
    const stopRetention = vi.fn(() => retention.promise);
    const closeServer = vi.fn(() => http.promise);
    const endPool = vi.fn(async () => {});
    const shutdown = createGracefulShutdown({ stopRetention, closeServer, endPool });
    const completion = shutdown();
    expect(shutdown()).toBe(completion);
    expect(stopRetention).toHaveBeenCalledTimes(1);
    expect(closeServer).toHaveBeenCalledTimes(1);
    (first === "retention" ? retention : http).resolve();
    await Promise.resolve();
    expect(endPool).not.toHaveBeenCalled();
    (first === "retention" ? http : retention).resolve();
    await completion;
    await shutdown();
    expect(endPool).toHaveBeenCalledTimes(1);
  });

  it.each(["retention", "http"] as const)("closes the pool after the other resource drains and propagates a %s failure", async failed => {
    const retention = barrier();
    const http = barrier();
    const endPool = vi.fn(async () => {});
    const shutdown = createGracefulShutdown({
      stopRetention: () => retention.promise, closeServer: () => http.promise, endPool,
    });
    const completion = shutdown();
    const failure = new Error(`${failed} failed`);
    const observed = expect(completion).rejects.toBe(failure);
    (failed === "retention" ? retention : http).reject(failure);
    await Promise.resolve();
    expect(endPool).not.toHaveBeenCalled();
    (failed === "retention" ? http : retention).resolve();
    await observed;
    expect(endPool).toHaveBeenCalledTimes(1);
  });

  it("propagates failure to close the pool without repeating shutdown", async () => {
    const failure = new Error("pool close failed");
    const endPool = vi.fn(async () => { throw failure; });
    const shutdown = createGracefulShutdown({
      stopRetention: async () => {}, closeServer: async () => {}, endPool,
    });
    const completion = shutdown();
    await expect(completion).rejects.toBe(failure);
    expect(shutdown()).toBe(completion);
    expect(endPool).toHaveBeenCalledTimes(1);
  });
});
