import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), transaction: vi.fn(), update: vi.fn(), audit: vi.fn(), fetch: vi.fn(),
}));
// Schema-only import: never instantiate a Pool or load database credentials.
vi.mock("@workspace/db", async () => ({
  ...await import("../../../../../lib/db/src/schema"),
  pool: { query: mocks.query },
  db: { transaction: mocks.transaction, update: mocks.update },
}));
vi.mock("../../lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("../../middlewares/requireAuth", () => ({
  requireAuth: vi.fn(), requireRole: () => vi.fn(),
}));
import router from "../diarias";

type Row = {
  id: number; exportTarget: string; integrationId: string | null; status: string;
  providerDecargoId: string; cnpj: string; workDate: string; value: string;
  paymentDate: string | null; observations: null; exportedAt?: Date;
};
let rows: Row[];
function record(id: number, target: string): Row {
  return {
    id, exportTarget: target, integrationId: null, status: "disponivel_exportacao",
    providerDecargoId: String(id), cnpj: String(id).padStart(14, "0"),
    workDate: "2026-10-01", value: "100", paymentDate: null, observations: null,
  };
}
async function exportRequest() {
  const handler = router.stack.find(layer => layer.route?.path === "/export")!.route!.stack.at(-1)!.handle;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await handler({
    body: { diariaIds: rows.map(row => row.id), paymentDate: "2026-10-31" },
    currentUser: { id: 1, name: "Test admin", role: "admin" },
  } as never, res as never, vi.fn());
  return { status: res.status.mock.calls.at(-1)?.[0] ?? 200, body: res.json.mock.calls.at(-1)?.[0] };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.stubEnv("PEOPLE_API_URL", "https://people.test");
  vi.stubEnv("DECARGO_PEOPLE_API_KEY", "fake-test-key");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.query.mockImplementation(async () => ({ rows: rows.map(row => ({ ...row })) }));
  mocks.transaction.mockImplementation(async callback => callback({
    insert: () => ({ values: async () => {} }),
    update: () => ({
      set: (values: Partial<Row>) => ({
        where: () => ({
          returning: async () => {
            const available = rows.filter(row => row.integrationId === null && row.status === "disponivel_exportacao");
            available.forEach(row => Object.assign(row, values));
            return available.map(row => ({ id: row.id }));
          },
        }),
      }),
    }),
  }));
  mocks.update.mockImplementation(() => ({
    set: (values: Partial<Row>) => ({
      where: async (condition: SQL) => {
        // Enforce actual route predicates, including reservation ownership.
        const { params } = new PgDialect().sqlToQuery(condition);
        const ids = params.filter((param): param is number => typeof param === "number");
        const ref = params.find(param => typeof param === "string" && param.startsWith("EXP-"));
        expect(ref).toBeDefined();
        rows.filter(row => ids.includes(row.id) && row.integrationId === ref)
          .forEach(row => Object.assign(row, values));
      },
    }),
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe.each(["diaria_extra", "falta"])("export %s timeout — real client, in-memory reservations", target => {
  it("persists earlier receipts, retains only the uncertain batch and releases rejected/unsent records", async () => {
    rows = Array.from({ length: 1_001 }, (_, index) => record(index + 1, target));
    if (target === "diaria_extra") rows.push(record(2_001, "falta"));
    else rows.unshift(record(2_001, "diaria_extra"));
    mocks.fetch.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith("/availability")) return new Response(JSON.stringify({
        service: "people-financial-integration", version: 2, ready: true,
        supportedTargets: ["diarias", "descontos"],
      }));
      const payload = JSON.parse(String(init.body));
      const batch = payload.diarias ?? payload.descontos;
      if (batch.length === 1) return new Response(JSON.stringify({
        total: 1, inserted: 1, updated: 0, skipped: 0, errors: [],
      }));
      const firstId = Number(batch[0].id_prestador ?? batch[0].cnpj);
      if (firstId === 1) return new Response(JSON.stringify({
        total: 500, inserted: 499, updated: 0, skipped: 1,
        errors: [{ ...batch[0], error: "Rejected" }],
      }));
      // Headers arrived, but the receipt body never finishes, even on abort.
      return { ok: true, json: () => new Promise(() => {}) };
    });
    const request = exportRequest();
    await vi.advanceTimersByTimeAsync(30_000);
    const response = await request;
    expect(response.status).toBe(502);
    const confirmed = rows.filter(row => row.id >= 2 && row.id <= 500).map(row => row.id);
    if (target === "falta") confirmed.unshift(2_001);
    const uncertain = Array.from({ length: 500 }, (_, index) => index + 501);
    const retryable = [1, 1_001, ...(target === "diaria_extra" ? [2_001] : [])];
    expect(response.body).toMatchObject({
      exported: confirmed, awaitingConfirmation: uncertain, retryable,
      integrationRef: expect.stringMatching(/^EXP-/),
    });
    for (const row of rows) {
      if (confirmed.includes(row.id)) {
        expect(row).toMatchObject({
          status: "exportada", integrationId: response.body.integrationRef,
          exportedAt: expect.any(Date),
          paymentDate: row.exportTarget === "falta" ? "2026-11-15" : "2026-10-31",
        });
      } else if (uncertain.includes(row.id)) {
        expect(row).toMatchObject({ status: "disponivel_exportacao", integrationId: response.body.integrationRef });
        expect(row.exportedAt).toBeUndefined();
      } else {
        expect(row).toMatchObject({ status: "disponivel_exportacao", integrationId: null });
      }
    }
    const auditedUncertain = mocks.audit.mock.calls
      .filter(([entry]) => entry.action === "exportacao_aguardando_conferencia").map(([entry]) => entry.entityId);
    expect(auditedUncertain).toEqual(uncertain);
    expect(mocks.fetch.mock.calls.filter(([, init]) => init.method === "POST"))
      .toHaveLength(target === "falta" ? 3 : 2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
