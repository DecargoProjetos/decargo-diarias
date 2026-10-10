import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(), clientQuery: vi.fn(), release: vi.fn(), connect: vi.fn(),
}));
vi.mock("@workspace/db", () => ({ pool: { query: mocks.poolQuery, connect: mocks.connect } }));
vi.mock("../../middlewares/requireAuth", () => ({
  requireRole: () => (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.status(401).json({ error: "Unauthorized" });
    if (req.headers.authorization !== "Bearer synthetic-admin") return res.status(403).json({ error: "Forbidden" });
    req.currentUser = { id: 42, role: "admin", name: "Administrador sintético" };
    next();
  },
}));
import router from "../exportCorrection";

const original = {
  id: 101, providerId: 10, providerName: "Prestador de teste", providerDecargoId: "manual-synthetic",
  cnpj: null as string | null, typeId: 8, typeName: "Diária Extra", exportTarget: "diaria_extra",
  status: "disponivel_exportacao", integrationId: null as string | null, exportedAt: null as string | null, exportedBy: null as number | null,
  workDate: "2026-09-07", paymentDate: "2026-10-15", value: "100.00",
  updatedAt: "2026-10-10 00:00:00.123456", approvedAt: "2026-10-09 00:00:00", approvedBy: 7,
};
const integrated = { id: 20, name: "Prestador integrado sintético", decargoId: "9000", cnpj: "12.345.678/0001-95", eligible: true };
const paymentType = { id: 8, name: "Diária Extra", exportTarget: "diaria_extra", active: true };
let records: typeof original[];
let candidates: (typeof integrated)[];
let catalog: (typeof paymentType)[];
let actorColumn: boolean;
let auditFails: boolean;
let server: Server;
let base: string;

function correction(row = original) {
  return { id: row.id, expectedProviderId: row.providerId, expectedTypeId: row.typeId,
    expectedUpdatedAt: row.updatedAt, expectedProviderDecargoId: row.providerDecargoId,
    expectedPeopleId: "9000", providerId: 20, typeId: 8, verifiedCnpj: "12345678000195" };
}
function body() {
  return { corrections: [correction()], confirmed: true, reason: "Conferência documental sintética no People." };
}
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/diarias/export", router);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/diarias/export`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
  vi.clearAllMocks();
  records = [{ ...original }];
  candidates = [{ ...integrated }];
  catalog = [{ ...paymentType }];
  actorColumn = true;
  auditFails = false;
  mocks.poolQuery.mockImplementation(async (sql: string) => ({
    rows: sql.includes("FROM diarias") ? records : sql.includes("FROM providers") ? candidates : catalog,
  }));
  mocks.connect.mockResolvedValue({ query: mocks.clientQuery, release: mocks.release });
  mocks.clientQuery.mockImplementation(async (sql: string, args?: unknown[]) => {
    if (sql.includes("FOR UPDATE")) return { rows: records };
    if (sql.includes("FOR SHARE OF p")) return { rows: candidates };
    if (sql.includes("FROM diaria_types")) return { rows: catalog };
    if (sql.includes("UPDATE diarias")) return { rows: (JSON.parse(String(args?.[0])) as { id: number }[]).map(r => ({ id: r.id })) };
    if (sql.includes("information_schema")) return { rows: [{ present: actorColumn }] };
    if (sql.includes("INSERT INTO audit_logs") && auditFails) throw new Error("Synthetic audit failure");
    return { rows: [] };
  });
});
async function post(path: string, payload: unknown, token = "synthetic-admin") {
  const response = await fetch(`${base}${path}`, { method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload) });
  return { status: response.status, data: await response.json() as Record<string, any> };
}
const writes = () => mocks.clientQuery.mock.calls.filter(([sql]) => /UPDATE diarias|INSERT INTO audit_logs/.test(sql));

describe("audited payment correction (only mocked database, no external API)", () => {
  it.each(["", "synthetic-gestor"])("guards BOTH operations (%s)", async token => {
    expect((await post("/correction/preview", { diariaIds: [101] }, token)).status).toBe(token ? 403 : 401);
    expect((await post("/correction", body(), token)).status).toBe(token ? 403 : 401);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it.each([[], [101, 101], [0], ["101"], [2147483648]].map(diariaIds => ({ diariaIds })))("rejects invalid preview IDs %j", async ({ diariaIds }) => {
    expect((await post("/correction/preview", { diariaIds })).status).toBe(400);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });
  it("previews snapshots without writes or choosing a person by name", async () => {
    records.push({ ...original, id: 102, integrationId: "EXP-RESERVED" });
    candidates.push({ ...integrated, id: 21, decargoId: "manual-other" },
      { ...integrated, id: 22, eligible: false });
    const result = await post("/correction/preview", { diariaIds: [101, 102, 999] });
    expect(result.status).toBe(200);
    expect(result.data.rows.map((r: any) => r.id)).toEqual([101]);
    expect(result.data.skipped.map((r: any) => r.id)).toEqual([102, 999]);
    expect(result.data.providers.map((r: any) => r.id)).toEqual([20]);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("changes only payee/type and resets approval, preserving all financial data", async () => {
    const result = await post("/correction", body());
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ correctedIds: [101], unchangedIds: [] });
    const update = writes().find(([sql]) => sql.includes("UPDATE diarias"))!;
    const set = update[0].split(" SET ")[1].split("FROM jsonb")[0];
    expect(set).toContain("status = 'pendente_aprovacao'");
    expect(set).toContain("approved_by = NULL");
    expect(set).not.toMatch(/\b(value|work_date|payment_date|team_id|created_by|created_at|observations)\s*=/);
    const audit = writes().find(([sql]) => sql.includes("INSERT INTO audit_logs"))!;
    expect(JSON.parse(audit[1][0])[0].old_values).toMatchObject({
      providerId: 10, typeId: 8, value: "100.00", workDate: "2026-09-07", paymentDate: "2026-10-15", approvedBy: 7,
    });
    expect(audit[0]).toContain("user_name_at_action");
    expect(mocks.clientQuery.mock.calls.map(([sql]) => sql)).toContain("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("allows TYPE-ONLY extra payment correction without requiring CNPJ", async () => {
    const row = { ...original, providerId: 20, providerDecargoId: "9000", typeId: 9, exportTarget: "falta", typeName: "Falta" };
    records = [row];
    candidates = [{ ...integrated, cnpj: null } as unknown as typeof integrated];
    const item = correction(row);
    delete (item as Partial<typeof item>).verifiedCnpj;
    expect((await post("/correction", { ...body(), corrections: [item] })).status).toBe(200);
  });
  it.each([
    { status: "exportada" }, { status: "paga" }, { status: "cancelada" },
    { integrationId: "EXP-SYNTHETIC" }, { integrationId: "" }, { exportedAt: "2026-10-10" },
    { exportedBy: 7 }, { updatedAt: "another snapshot" }, { providerId: 11 }, { typeId: 9 },
  ])("rejects changed or protected rows %j atomically", async patch => {
    records = [{ ...original, ...patch } as typeof original];
    expect((await post("/correction", body())).status).toBe(409);
    expect(writes()).toHaveLength(0);
    expect(mocks.clientQuery.mock.calls.map(([sql]) => sql)).toContain("ROLLBACK");
  });
  it.each([
    { eligible: false }, { decargoId: "manual-synthetic" }, { decargoId: "0" },
    { decargoId: "2.5" }, { decargoId: "2147483648" }, { cnpj: "malformed" }, { cnpj: "98765432000100" },
  ])("refuses unverified/unavailable recipient %j", async patch => {
    candidates = [{ ...integrated, ...patch } as typeof integrated];
    expect((await post("/correction", body())).status).toBe(409);
    expect(writes()).toHaveLength(0);
  });
  it.each([{ exportTarget: "falta" }, { active: false }])("refuses discount/inactive target type %j", async patch => {
    catalog = [{ ...paymentType, ...patch }];
    expect((await post("/correction", body())).status).toBe(409);
    expect(writes()).toHaveLength(0);
  });
  it("requires checked confirmation and sufficient reason", async () => {
    expect((await post("/correction", { ...body(), confirmed: false })).status).toBe(400);
    expect((await post("/correction", { ...body(), reason: "curto" })).status).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("rejects stale source or target People identity", async () => {
    records = [{ ...original, providerDecargoId: "different-source" }];
    expect((await post("/correction", body())).status).toBe(409);
    expect(writes()).toHaveLength(0);
    records = [{ ...original }];
    candidates = [{ ...integrated, decargoId: "9001" }];
    expect((await post("/correction", body())).status).toBe(409);
    expect(writes()).toHaveLength(0);
  });
  it("records EXPLICIT admin review when the local document is missing, without filling provider data", async () => {
    candidates = [{ ...integrated, cnpj: null } as unknown as typeof integrated];
    expect((await post("/correction", body())).status).toBe(200);
    const audit = writes().find(([sql]) => sql.includes("INSERT INTO audit_logs"))!;
    expect(JSON.parse(audit[1][0])[0].new_values).toMatchObject({
      verifiedCnpj: "12345678000195", confirmed: true, documentVerification: "admin_people_check_without_local_document",
    });
    expect(mocks.clientQuery.mock.calls.some(([sql]) => sql.includes("UPDATE providers"))).toBe(false);
  });
  it("rolls back the WHOLE batch if any snapshot is stale", async () => {
    const second = { ...original, id: 102 };
    records.push({ ...second, updatedAt: "changed" });
    expect((await post("/correction", { ...body(), corrections: [correction(), correction(second)] })).status).toBe(409);
    expect(writes()).toHaveLength(0);
  });
  it("does not reset approval on unchanged rows", async () => {
    records.push({ ...original, id: 102, providerId: 20 });
    expect((await post("/correction", { ...body(), corrections: [correction(), correction(records[1])] })).data)
      .toEqual({ correctedIds: [101], unchangedIds: [102] });
    const update = writes().find(([sql]) => sql.includes("UPDATE diarias"))!;
    expect(JSON.parse(update[1][0]).map((r: any) => r.id)).toEqual([101]);
  });
  it("supports legacy audit columns without losing the actor snapshot", async () => {
    actorColumn = false;
    expect((await post("/correction", body())).status).toBe(200);
    const audit = writes().find(([sql]) => sql.includes("INSERT INTO audit_logs"))!;
    expect(audit[0]).not.toContain("user_name_at_action");
    expect(audit[0]).toContain("jsonb_build_object('confirmedByName', $3::text)");
  });
  it("rolls back corrections if audit insertion fails", async () => {
    auditFails = true;
    expect((await post("/correction", body())).status).toBe(503);
    expect(mocks.clientQuery.mock.calls.map(([sql]) => sql)).not.toContain("COMMIT");
    expect(mocks.clientQuery.mock.calls.map(([sql]) => sql)).toContain("ROLLBACK");
  });
});
