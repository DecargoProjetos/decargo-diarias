import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PeopleBatchExportError, pushDiariasToPeople, pushFaltasToPeople,
} from "../peopleClient";

const items = Array.from({ length: 1_001 }, (_, index) => ({
  __localId: index + 1,
  cnpj: String(index + 1).padStart(14, "0"), tipo: "Desconto de Diária",
  valor: 100, data_desconto: "2026-11-15",
  id_prestador: index + 1, dia_trabalhado: "2026-10-01",
  valor_diaria: 100, data_pagamento: "2026-10-31",
}));

describe.each([
  ["diarias", pushDiariasToPeople],
  ["descontos", pushFaltasToPeople],
] as const)("People POST %s — bounded and uncertain, no network or database", (target, push) => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
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
  const success = () => new Response(JSON.stringify({
    total: 1, inserted: 1, updated: 0, skipped: 0, errors: [],
  }));
  const never = () => new Promise<never>(() => {});

  it.each(["fetch", "json", "text"])("bounds stalled %s even if abort is ignored", async phase => {
    fetchMock.mockImplementation(() => phase === "fetch" ? never() : Promise.resolve({
      ok: phase !== "text", status: phase === "text" ? 503 : 200,
      json: never, text: never,
    }));
    const assertion = expect(push(items.slice(0, 1))).rejects.toMatchObject({
      name: "PeopleBatchExportError", message: expect.stringContaining("30 segundos"),
      completedLocalIds: [], rejectedLocalIds: [], uncertainLocalIds: [1], pendingLocalIds: [],
    });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses one deadline across sending and body reading, not a fresh body deadline", async () => {
    fetchMock.mockImplementation(() => new Promise(resolve => {
      setTimeout(() => resolve({ ok: true, json: never }), 20_000);
    }));
    const assertion = expect(push(items.slice(0, 1))).rejects.toBeInstanceOf(PeopleBatchExportError);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["fetch", "json", "text", "invalid-json", "network"])(
    "preserves all four groups after a confirmed first batch and second-batch %s failure",
    async phase => {
      const error = target === "diarias"
        ? { id_prestador: items[0].id_prestador, dia_trabalhado: items[0].dia_trabalhado }
        : { cnpj: items[0].cnpj };
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        total: 500, inserted: 499, updated: 0, skipped: 1,
        errors: [{ ...error, error: "Rejected" }],
      }))).mockImplementationOnce(() => {
        if (phase === "fetch") return never();
        if (phase === "network") return Promise.reject(new Error("connection reset"));
        if (phase === "invalid-json") return Promise.resolve(new Response("{"));
        return Promise.resolve({
          ok: phase !== "text", status: phase === "text" ? 503 : 200, json: never, text: never,
        });
      });
      const assertion = expect(push(items)).rejects.toMatchObject({
        completedLocalIds: items.slice(1, 500).map(item => item.__localId),
        rejectedLocalIds: [1],
        uncertainLocalIds: items.slice(500, 1_000).map(item => item.__localId),
        pendingLocalIds: [1_001],
      });
      await vi.advanceTimersByTimeAsync(30_000);
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("clears deadlines on success and strips tracking IDs from each payload", async () => {
    fetchMock.mockResolvedValue(success());
    await expect(push(items.slice(0, 1))).resolves.toMatchObject({ inserted: 1, errors: [] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://people.test/api/integration/${target}`);
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)[target][0]).not.toHaveProperty("__localId");
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(init.signal.aborted).toBe(false);
  });
});
