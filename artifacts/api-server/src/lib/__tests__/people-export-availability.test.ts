import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkPeopleExportAvailability, getPeopleExportCapabilities } from "../peopleClient";

describe("People export availability — no network or real credentials", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv("PEOPLE_API_URL", "https://people.test");
    vi.stubEnv("DECARGO_PEOPLE_API_KEY", "fake-test-key");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it.each([
    { advertised: ["diarias"], expected: ["diarias"] },
    { advertised: ["diarias", "descontos"], expected: ["diarias", "descontos"] },
    { advertised: [], expected: [] },
    { advertised: ["future", "descontos", "diarias", "diarias"], expected: ["diarias", "descontos"] },
  ])("returns capabilities without requiring a financial destination: %j", async ({ advertised, expected }) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      service: "people-financial-integration", version: 2, ready: true,
      supportedTargets: advertised,
    })));
    await expect(getPeopleExportCapabilities()).resolves.toEqual(expected);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("https://people.test/api/integration/availability");
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
  });
  it("uses only the authenticated non-personal GET, without redirects or cache", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      service: "people-financial-integration", version: 2, ready: true,
      supportedTargets: ["diarias"],
    })));
    await checkPeopleExportAvailability();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "https://people.test/api/integration/availability",
      expect.objectContaining({
        method: "GET", headers: { "x-api-key": "fake-test-key", Accept: "application/json" },
        redirect: "error", cache: "no-store", signal: expect.any(AbortSignal),
      }),
    );
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("body");
  });
  it.each([401, 403, 404, 500, 503, 302, 204])("rejects HTTP %i without fallback", async status => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    await expect(checkPeopleExportAvailability()).rejects.toThrow(`HTTP ${status}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([
    { targets: ["diarias"], required: ["diarias"], succeeds: true },
    { targets: ["diarias"], required: ["descontos"], succeeds: false },
    { targets: ["diarias"], required: ["diarias", "descontos"], succeeds: false },
    { targets: ["descontos"], required: ["diarias"], succeeds: false },
    { targets: ["descontos"], required: ["descontos"], succeeds: true },
    { targets: ["diarias", "descontos"], required: ["diarias", "descontos"], succeeds: true },
    { targets: [], required: ["diarias"], succeeds: false },
  ] as const)("requires every selected destination: %j", async ({ targets, required, succeeds }) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      service: "people-financial-integration", version: 2, ready: true,
      supportedTargets: targets,
    })));
    const check = checkPeopleExportAvailability(required);
    if (succeeds) await expect(check).resolves.toBeUndefined();
    else await expect(check).rejects.toThrow("destination unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
  });
  it.each([undefined, null, {}, "diarias", [true], ["diarias", 1]])(
    "rejects missing or malformed capabilities: %j", async supportedTargets => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({
        service: "people-financial-integration", version: 2, ready: true, supportedTargets,
      })));
      await expect(checkPeopleExportAvailability()).rejects.toThrow("invalid capabilities");
    },
  );
  it.each([1, 3])("rejects unverified protocol version %i", async version => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      service: "people-financial-integration", version, ready: true,
      supportedTargets: ["diarias", "descontos"],
    })));
    await expect(checkPeopleExportAvailability()).rejects.toThrow("invalid response");
  });
  it.each(["<html>login</html>", "null", "{}", '{"ready":true}', JSON.stringify({
    service: "people-financial-integration", version: 1, ready: false,
  })])("rejects a false or malformed success: %s", async body => {
    fetchMock.mockResolvedValue(new Response(body));
    await expect(checkPeopleExportAvailability()).rejects.toThrow();
  });
  it.each(["PEOPLE_API_URL", "DECARGO_PEOPLE_API_KEY"])("fails before fetch without %s", async key => {
    vi.stubEnv(key, "");
    await expect(checkPeopleExportAvailability()).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects a network failure without retrying", async () => {
    fetchMock.mockRejectedValue(new Error("network unavailable"));
    await expect(checkPeopleExportAvailability()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("aborts a stalled request after five seconds", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    const assertion = expect(checkPeopleExportAvailability()).rejects.toThrow("aborted");
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("also bounds reading the response body", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url, { signal }) => Promise.resolve({
      status: 200,
      json: () => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("body aborted")));
      }),
    }));
    const assertion = expect(checkPeopleExportAvailability()).rejects.toThrow("body aborted");
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});
