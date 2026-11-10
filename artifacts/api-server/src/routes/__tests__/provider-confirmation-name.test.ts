import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(), auditValues: vi.fn(), providers: { id: "provider_id" },
  users: { id: "user_id" }, diarias: {}, audits: {},
}));
vi.mock("@workspace/db", () => ({
  db: { transaction: mocks.transaction }, providersTable: mocks.providers,
  usersTable: mocks.users, diariasTable: mocks.diarias, auditLogsTable: mocks.audits,
}));
vi.mock("../../middlewares/requireAuth", () => ({
  requireRole: () => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.currentUser = { id: 3, name: "Nome autenticado na confirmação" } as express.Request["currentUser"];
    next();
  },
}));
vi.mock("../../lib/peopleUserSync", () => ({
  peopleUserSyncEnabled: () => false, getPeopleSyncAccess: vi.fn(),
  PeopleUserSyncError: class extends Error {},
}));
vi.mock("../../lib/peopleClient", () => ({
  fetchPrestadores: async () => [{
    id_prestador: 901, titular_do_contrato: "Nome remoto",
    cnpj: "11.222.333/0001-81", tem_contrato_ativo: true,
  }],
}));
import router from "../providerReconciliation";

const local = {
  id: 7, decargoId: "local-user:3", localReference: null, name: "Nome local",
  cnpj: null, dailyRate: "310.25", email: "local@test.invalid", teamId: 42, active: false,
};

describe("Confirmation actor snapshot writes (isolated, no database)", () => {
  let server: Server, base: string;
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/", router);
    server = app.listen(0);
    await new Promise<void>(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())));
  beforeEach(() => {
    mocks.auditValues.mockReset();
    mocks.transaction.mockImplementation(async callback => callback({
      execute: vi.fn(),
      select: () => ({ from: () => ({ for: async () => [local] }) }),
      insert: (table: unknown) => ({
        values: (values: unknown) => table === mocks.audits
          ? mocks.auditValues(values)
          : { returning: async () => [{ id: 9 }] },
      }),
      update: () => ({ set: () => ({ where: () => ({
        returning: async () => [{ ...local, decargoId: "901" }],
      }) }) }),
    }));
  });
  it.each(["link", "separate"])("records the authenticated name and ID for %s, never a submitted name", async action => {
    const response = await fetch(base, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action, externalId: "901", localProviderId: 7, verifiedCnpj: "11222333000181",
        evidence: "Contrato e documento verificados.", confirmed: true,
        confirmedByName: "Nome enviado pelo cliente", userId: 999,
      }),
    });
    expect(response.status).toBe(200);
    expect(mocks.auditValues).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      userId: 3, newValues: expect.objectContaining({
        confirmed: true, confirmedByName: "Nome autenticado na confirmação",
      }),
    }));
  });
});
