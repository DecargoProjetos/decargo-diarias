import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), transaction: vi.fn(), update: vi.fn(), audit: vi.fn(),
  checkPeopleExportAvailability: vi.fn(),
  pushDiariasToPeople: vi.fn(), pushFaltasToPeople: vi.fn(),
}));
// Import only table definitions: never construct a pg Pool or read DATABASE_URL.
vi.mock("@workspace/db", async () => ({
  ...await import("../../../../../lib/db/src/schema"),
  pool: { query: mocks.query },
  db: { transaction: mocks.transaction, update: mocks.update },
}));
vi.mock("../../lib/peopleClient", () => ({
  checkPeopleExportAvailability: mocks.checkPeopleExportAvailability,
  pushDiariasToPeople: mocks.pushDiariasToPeople,
  pushFaltasToPeople: mocks.pushFaltasToPeople,
}));
vi.mock("../../lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("../../middlewares/requireAuth", () => ({
  requireAuth: vi.fn(), requireRole: () => vi.fn(),
}));
import router from "../diarias";
import { diariasTable, exportAttemptsTable } from "@workspace/db";

type Row = {
  id: number; exportTarget: string; integrationId: string | null; status: string;
  providerDecargoId: string; cnpj: string; workDate: string; value: string;
  paymentDate: string; observations: null;
};
let rows: Row[];
let events: string[];
function record(id: number, exportTarget = "diaria_extra"): Row {
  return {
    id, exportTarget, integrationId: null, status: "disponivel_exportacao",
    providerDecargoId: "123", cnpj: "11111111000111", workDate: "2026-09-01",
    value: "100", paymentDate: "2026-09-30", observations: null,
  };
}
async function exportRequest(ids = rows.map(r => r.id)) {
  // Exercise the real handler, not auth/session or unrelated app bootstrap.
  const layer = router.stack.find(l => l.route?.path === "/export")!;
  const handler = layer.route!.stack.at(-1)!.handle;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await handler({
    body: { diariaIds: ids },
    currentUser: { id: 1, name: "Test admin", role: "admin" },
  } as never, res as never, vi.fn());
  return { status: res.status.mock.calls.at(-1)?.[0] ?? 200, body: res.json.mock.calls.at(-1)?.[0] };
}
beforeEach(() => {
  vi.resetAllMocks();
  rows = [record(1)];
  events = [];
  mocks.query.mockImplementation(async () => ({ rows: rows.map(r => ({ ...r })) }));
  mocks.checkPeopleExportAvailability.mockImplementation(async () => { events.push("preflight"); });
  const result = { total: 1, inserted: 1, updated: 0, skipped: 0, errors: [] };
  mocks.pushDiariasToPeople.mockImplementation(async () => { events.push("extra"); return result; });
  mocks.pushFaltasToPeople.mockImplementation(async () => { events.push("falta"); return result; });
  mocks.transaction.mockImplementation(async callback => {
    events.push("reserve");
    const snapshot = rows.map(r => ({ ...r }));
    try {
      return await callback({
        insert: () => ({ values: async () => {} }),
        update: () => ({
          set: (values: Partial<Row>) => ({
            where: () => ({
              returning: async () => {
                const available = rows.filter(r => r.status === "disponivel_exportacao" && r.integrationId === null);
                available.forEach(r => Object.assign(r, values));
                return available.map(r => ({ id: r.id }));
              },
            }),
          }),
        }),
      });
    } catch (error) {
      rows = snapshot;
      throw error;
    }
  });
  mocks.update.mockImplementation(table => ({
    set: (values: Partial<Row>) => ({
      where: async () => { if (table === diariasTable) rows.forEach(r => Object.assign(r, values)); },
    }),
  }));
});

describe("export preflight — isolated handler with in-memory reservations", () => {
  it.each(["diaria_extra", "falta", "mixed"])("does not mutate or send %s when preflight fails", async target => {
    rows = target === "mixed" ? [record(1), record(2, "falta")] : [record(1, target)];
    // Include an old uncertain reservation as well as a new eligible record.
    rows.push({ ...record(3), integrationId: "OLD-UNCERTAIN" });
    const before = structuredClone(rows);
    mocks.checkPeopleExportAvailability.mockRejectedValue(new Error("401: sensitive upstream details"));
    const response = await exportRequest();
    expect(response.status).toBe(503);
    expect(response.body.code).toBe("PEOPLE_EXPORT_UNAVAILABLE");
    expect(JSON.stringify(response.body)).not.toContain("sensitive");
    expect(rows).toEqual(before);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.pushDiariasToPeople).not.toHaveBeenCalled();
    expect(mocks.pushFaltasToPeople).not.toHaveBeenCalled();
  });
  it("waits for preflight before reserving or sending", async () => {
    let resolve!: () => void;
    mocks.checkPeopleExportAvailability.mockReturnValue(new Promise<void>(r => { resolve = r; }));
    const request = exportRequest();
    await vi.waitFor(() => expect(mocks.checkPeopleExportAvailability).toHaveBeenCalledOnce());
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.pushDiariasToPeople).not.toHaveBeenCalled();
    resolve();
    expect((await request).status).toBe(200);
  });
  it("checks once then reserves atomically before both financial targets", async () => {
    rows = [record(1), record(2, "falta")];
    expect((await exportRequest()).status).toBe(200);
    expect(events).toEqual(["preflight", "reserve", "extra", "falta"]);
    expect(mocks.checkPeopleExportAvailability).toHaveBeenCalledOnce();
    expect(mocks.checkPeopleExportAvailability).toHaveBeenCalledWith(["diarias", "descontos"]);
    expect(rows.every(r => r.status === "exportada")).toBe(true);
  });
  it.each(["diaria_extra", "falta"])("requests only the eligible destination for %s", async target => {
    rows = [record(1, target)];
    expect((await exportRequest()).status).toBe(200);
    expect(mocks.checkPeopleExportAvailability).toHaveBeenCalledWith([
      target === "falta" ? "descontos" : "diarias",
    ]);
  });
  it.each(["falta", "mixed"])("blocks all of %s when only diarias is supported", async target => {
    rows = target === "mixed" ? [record(1), record(2, "falta")] : [record(1, "falta")];
    rows.push({ ...record(3), integrationId: "OLD-UNCERTAIN" });
    const before = structuredClone(rows);
    mocks.checkPeopleExportAvailability.mockImplementation(async targets => {
      if (targets.includes("descontos")) throw new Error("destination unavailable");
    });
    expect((await exportRequest()).status).toBe(503);
    expect(rows).toEqual(before);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.pushDiariasToPeople).not.toHaveBeenCalled();
    expect(mocks.pushFaltasToPeople).not.toHaveBeenCalled();
  });
  it("does not require descontos for a falta rejected by local validation", async () => {
    rows = [record(1), { ...record(2, "falta"), cnpj: "" }];
    // Model this request's WHERE id IN (eligibleIds), not every available row.
    mocks.transaction.mockImplementation(async callback => callback({
      insert: () => ({ values: async () => {} }),
      update: () => ({
        set: (values: Partial<Row>) => ({
          where: () => ({
            returning: async () => {
              Object.assign(rows[0], values);
              return [{ id: rows[0].id }];
            },
          }),
        }),
      }),
    }));
    expect((await exportRequest()).status).toBe(200);
    expect(mocks.checkPeopleExportAvailability).toHaveBeenCalledWith(["diarias"]);
    expect(mocks.pushFaltasToPeople).not.toHaveBeenCalled();
  });
  it("preserves a concurrent reservation acquired during preflight", async () => {
    mocks.checkPeopleExportAvailability.mockImplementation(async () => { rows[0].integrationId = "OTHER-EXPORT"; });
    expect((await exportRequest()).status).toBe(409);
    expect(rows[0].integrationId).toBe("OTHER-EXPORT");
    expect(mocks.pushDiariasToPeople).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("sends only once while the first export awaits its response", async () => {
    let resolve!: (value: unknown) => void;
    mocks.pushDiariasToPeople.mockReturnValue(new Promise(r => { resolve = r; }));
    const first = exportRequest();
    await vi.waitFor(() => expect(mocks.pushDiariasToPeople).toHaveBeenCalledOnce());
    expect((await exportRequest()).status).toBe(409);
    resolve({ total: 1, inserted: 1, updated: 0, skipped: 0, errors: [] });
    expect((await first).status).toBe(200);
    expect(mocks.pushDiariasToPeople).toHaveBeenCalledOnce();
  });
  it.each(["network", "unidentified"])("retains uncertain reservations after %s failure despite successful preflight", async failure => {
    if (failure === "network") mocks.pushDiariasToPeople.mockRejectedValue(new Error("connection reset"));
    else mocks.pushDiariasToPeople.mockResolvedValue({ errors: [{}], unidentifiedErrors: 1 });
    expect((await exportRequest()).status).toBe(502);
    const reservation = rows[0].integrationId;
    expect(reservation).toMatch(/^EXP-/);
    expect(rows[0].status).toBe("disponivel_exportacao");
    mocks.checkPeopleExportAvailability.mockRejectedValue(new Error("unavailable"));
    expect((await exportRequest()).status).toBe(503);
    expect(rows[0].integrationId).toBe(reservation);
    expect(mocks.pushDiariasToPeople).toHaveBeenCalledOnce();
    expect(mocks.update).not.toHaveBeenCalledWith(diariasTable);
    expect(mocks.update).toHaveBeenCalledWith(exportAttemptsTable);
  });
  it("does not contact People when no record passes local validation", async () => {
    rows[0].status = "pendente_aprovacao";
    expect((await exportRequest()).status).toBe(400);
    expect(mocks.checkPeopleExportAvailability).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("can export after access recovers without releasing any old reservation", async () => {
    mocks.checkPeopleExportAvailability.mockRejectedValueOnce(new Error("unavailable"));
    expect((await exportRequest()).status).toBe(503);
    expect(rows[0].integrationId).toBeNull();
    expect(mocks.update).not.toHaveBeenCalled();
    expect((await exportRequest()).status).toBe(200);
    expect(rows[0].status).toBe("exportada");
    expect(mocks.pushDiariasToPeople).toHaveBeenCalledOnce();
  });
});
