import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { ListAuditLogsResponse } from "@workspace/api-zod";
import { peopleConfirmation } from "../../lib/peopleConfirmation";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@workspace/db", () => ({ pool: { query } }));
vi.mock("../../middlewares/requireAuth", () => ({
  requireRole: (...roles: string[]) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const role = req.header("x-test-role");
    if (!role) { res.sendStatus(401); return; }
    if (!roles.includes(role)) { res.sendStatus(403); return; }
    next();
  },
}));
import auditRouter from "../audit";

const before = {
  local: { id: 7, name: "Cadastro local", decargoId: "local-user:3" },
  duplicate: { id: 8, name: "Cadastro importado", decargoId: "901" },
};
const after = {
  confirmed: true, externalId: "901", cnpj: "12345678000195",
  evidence: "Contrato do titular conferido.\nPágina 2.",
  provider: { id: 7, name: "Cadastro local", decargoId: "901" },
  removedPristineProviderId: 8,
};

describe("People confirmation audit projection", () => {
  it("reads the recorded document and both provider snapshots without a live lookup", () => {
    expect(peopleConfirmation("provider", "identidade People reconciliada", before, after)).toEqual({
      confirmedByName: null,
      externalId: "901", verifiedCnpj: after.cnpj, documentDescription: after.evidence,
      preservedProvider: after.provider, removedProvider: before.duplicate,
    });
  });
  it("does not invent missing evidence, names or removed providers", () => {
    expect(peopleConfirmation("provider", "SYNC", null, after)).toBeNull();
    expect(peopleConfirmation("user", "identidade People reconciliada", before, after)).toBeNull();
    expect(peopleConfirmation("provider", "identidade People reconciliada", null, null)).toBeNull();
    expect(peopleConfirmation("provider", "identidade People reconciliada", null, {
      confirmed: true, removedPristineProviderId: 8,
    })).toEqual({
      confirmedByName: null,
      externalId: null, verifiedCnpj: null, documentDescription: null,
      preservedProvider: null, removedProvider: { id: 8, name: null, decargoId: null },
    });
    expect(peopleConfirmation("provider", "identidade People reconciliada", before, {
      ...after, removedPristineProviderId: null,
    })?.removedProvider).toBeNull();
  });
  it.each([null, "", "   ", 123, { name: "Nome atual" }])("does not infer a historical name from invalid snapshot %j", confirmedByName => {
    expect(peopleConfirmation("provider", "identidade People reconciliada", before, {
      ...after, confirmedByName,
    })?.confirmedByName).toBeNull();
  });
});

describe("Read-only administrator audit endpoint", () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    const app = express();
    app.use("/audit", auditRouter);
    server = app.listen(0);
    await new Promise<void>(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())));
  beforeEach(() => {
    query.mockReset();
    query.mockImplementation(async (sql: string) => sql.includes("COUNT(*)") ? { rows: [{ total: "1" }] } : { rows: [{
      id: 22, entityType: "provider", entityId: 7, action: "identidade People reconciliada",
      userId: 3, userName: null, timestamp: "2026-10-01T10:00:00.000Z",
      oldValues: before, newValues: after,
    }] });
  });
  it.each(["gestor", "prestador", "funcionario"])("blocks %s without querying the audit", async role => {
    const response = await fetch(`${base}/audit`, { headers: { "x-test-role": role } });
    expect(response.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
  it("blocks unauthenticated readers", async () => {
    expect((await fetch(`${base}/audit`)).status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });
  it("returns typed evidence with bound filters and no writes", async () => {
    const action = "identidade People reconciliada";
    const response = await fetch(`${base}/audit?action=${encodeURIComponent(action)}&entityType=provider&entityId=7&userId=3`, { headers: { "x-test-role": "admin" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = ListAuditLogsResponse.parse(await response.json());
    expect(body.data[0].peopleConfirmation?.confirmedByName).toBeNull();
    expect(body.data[0].peopleConfirmation).toMatchObject({
      externalId: after.externalId,
      verifiedCnpj: after.cnpj,
      documentDescription: after.evidence,
      preservedProvider: after.provider,
      removedProvider: before.duplicate,
    });
    expect(body.data[0].userName).toBeNull();
    expect(body.data[0].userNameAtAction).toBeNull();
    expect(query).toHaveBeenCalledTimes(2);
    for (const [statement, params] of query.mock.calls) {
      expect(statement.trim()).toMatch(/^SELECT /);
      expect(statement).not.toContain(action);
      expect(params).toEqual([action, "provider", 7, 3]);
    }
  });
  it("returns an empty page when no audit records match", async () => {
    query.mockImplementation(async (sql: string) => sql.includes("COUNT(*)")
      ? { rows: [{ total: "0" }] } : { rows: [] });
    const response = await fetch(`${base}/audit`, { headers: { "x-test-role": "admin" } });
    expect(response.status).toBe(200);
    expect(ListAuditLogsResponse.parse(await response.json())).toMatchObject({ data: [], total: 0 });
  });
  it.each(["Nome alterado", null])("preserves the snapshot and ID when the current name is %j", async userName => {
    query.mockImplementation(async (sql: string) => sql.includes("COUNT(*)") ? { rows: [{ total: "1" }] } : { rows: [{
      id: 22, entityType: "provider", entityId: 7, action: "identidade People reconciliada",
      userId: 3, userName, timestamp: "2026-10-01T10:00:00.000Z",
      oldValues: before, newValues: { ...after, confirmedByName: "Nome na confirmação" },
    }] });
    const response = await fetch(`${base}/audit`, { headers: { "x-test-role": "admin" } });

    expect(response.status).toBe(200);
    const body = ListAuditLogsResponse.parse(await response.json());
    expect(body.data[0].peopleConfirmation?.confirmedByName).toBe("Nome na confirmação");
    expect(body.data[0].userName).toBe(userName);
    expect(body.data[0].userNameAtAction).toBe("Nome na confirmação");
    expect(body.data[0].userId).toBe(3);
  });
  it.each(["Nome atual alterado", null])("keeps other actions' snapshots when the current name is %j", async userName => {
    query.mockImplementation(async (sql: string) => sql.includes("COUNT(*)") ? { rows: [{ total: "1" }] } : { rows: [{
      id: 23, entityType: "diaria", entityId: 11, action: "aprovado",
      userId: userName == null ? null : 3, userName, userNameAtAction: "Responsável na aprovação",
      timestamp: "2026-10-01T10:00:00.000Z", oldValues: null, newValues: { status: "disponivel_exportacao" },
    }] });
    const response = await fetch(`${base}/audit`, { headers: { "x-test-role": "admin" } });

    expect(response.status).toBe(200);
    const body = ListAuditLogsResponse.parse(await response.json());
    expect(body.data[0].userNameAtAction).toBe("Responsável na aprovação");
    expect(body.data[0].userName).toBe(userName);
    expect(body.data[0].userId).toBe(userName == null ? null : 3);
    expect(body.data[0].peopleConfirmation).toBeNull();
  });
  it.each(["NaN", "0", "1.5"])("rejects invalid page %s", async page => {
    expect((await fetch(`${base}/audit?page=${page}`, { headers: { "x-test-role": "admin" } })).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});
