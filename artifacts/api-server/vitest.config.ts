import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Run tests serially inside the suite so DB mutations don't race
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    // 30s timeout per test (DB queries can be slow under load)
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
