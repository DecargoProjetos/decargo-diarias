import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { and, eq, inArray } from "drizzle-orm";

const peopleMocks = vi.hoisted(() => ({
  pushDiariasToPeople: vi.fn(),
  pushFaltasToPeople: vi.fn(),
}));

vi.mock("../../lib/peopleClient", () => peopleMocks);

import app from "../../app";
import { signLocalJwt } from "../../lib/localJwt";
import {
  auditLogsTable,
  db,
  diariaTypesTable,
  diariasTable,
  providersTable,
  teamsTable,
  usersTable,
} from "@workspace/db";

let server: Server;
let apiBaseUrl = "";
let adminId: number;
let teamId: number;
let providerId: number;
let secondProviderId: number;
let typeId: number;
let faltaTypeId: number;
let adminToken: string;
const diariaIds: number[] = [];

beforeAll(async () => {
  process.env.SESSION_SECRET ??= "test-session-secret";
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  apiBaseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const [admin] = await db.insert(usersTable).values({
    decargoId: "__test_partial_export_admin__",
    name: "__TEST_PARTIAL_EXPORT_ADMIN__",
    email: "__test_partial_export_admin@test.invalid__",
    role: "admin",
    active: true,
  }).returning();
  adminId = admin.id;

  const [team] = await db.insert(teamsTable).values({
    name: "__TEST_PARTIAL_EXPORT_TEAM__",
  }).returning();
  teamId = team.id;

  const [provider] = await db.insert(providersTable).values({
    decargoId: "987654321",
    name: "__TEST_PARTIAL_EXPORT_PROVIDER__",
    cnpj: "11111111000111",
    teamId,
    active: true,
  }).returning();
  providerId = provider.id;

  const [secondProvider] = await db.insert(providersTable).values({
    decargoId: "987654322",
    name: "__TEST_PARTIAL_EXPORT_SECOND_PROVIDER__",
    cnpj: "22222222000122",
    teamId,
    active: true,
  }).returning();
  secondProviderId = secondProvider.id;

  const [type] = await db.insert(diariaTypesTable).values({
    description: "__TEST_PARTIAL_EXPORT_TYPE__",
    exportTarget: "diaria_extra",
  }).returning();
  typeId = type.id;

  const [faltaType] = await db.insert(diariaTypesTable).values({
    description: "__TEST_PARTIAL_EXPORT_FALTA_TYPE__",
    exportTarget: "falta",
  }).returning();
  faltaTypeId = faltaType.id;

  adminToken = signLocalJwt({
    userId: admin.id,
    decargoId: admin.decargoId,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    teamId: admin.teamId ?? null,
  });
});



afterAll(async () => {
  if (diariaIds.length) {
    await db.delete(auditLogsTable).where(and(
      eq(auditLogsTable.entityType, "diaria"),
      inArray(auditLogsTable.entityId, diariaIds),
    ));
    await db.delete(diariasTable).where(inArray(diariasTable.id, diariaIds));
  }
  await db.delete(diariaTypesTable).where(inArray(diariaTypesTable.id, [typeId, faltaTypeId]));
  await db.delete(providersTable).where(inArray(providersTable.id, [providerId, secondProviderId]));
  await db.delete(teamsTable).where(eq(teamsTable.id, teamId));
  await db.delete(usersTable).where(eq(usersTable.id, adminId));
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

describe("POST /api/diarias/export — lote misto", () => {
  it("exporta somente a diária válida e mantém a inválida disponível para correção", async () => {
    peopleMocks.pushDiariasToPeople.mockResolvedValueOnce({
      total: 1,
      inserted: 1,
      updated: 0,
      skipped: 0,
      errors: [],
    });

    const [valid, invalid] = await db.insert(diariasTable).values([
      {
        providerId,
        teamId,
        managerId: adminId,
        typeId,
        workDate: "2026-08-01",
        value: "100.00",
        paymentDate: "2026-08-31",
        status: "disponivel_exportacao",
        createdBy: adminId,
      },
      {
        providerId,
        teamId,
        managerId: adminId,
        typeId,
        workDate: "2026-08-02",
        value: "100.00",
        paymentDate: "2026-08-31",
        status: "pendente_aprovacao",
        createdBy: adminId,
      },
    ]).returning({ id: diariasTable.id });
    diariaIds.push(valid.id, invalid.id);

    const response = await fetch(`${apiBaseUrl}/api/diarias/export`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ diariaIds: [valid.id, invalid.id] }),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as {
      exported: number;
      integrationRef: string;
      skipped: Array<{ id: number; reason: string }>;
    };
    expect(body.exported).toBe(1);
    expect(body.integrationRef).toMatch(/^EXP-\d+-[A-F0-9]{8}$/);
    expect(body.skipped).toEqual([{
      id: invalid.id,
      reason: "Diária não está aprovada/disponível para exportação",
    }]);
    expect(peopleMocks.pushDiariasToPeople).toHaveBeenCalledWith([
      expect.objectContaining({ __localId: valid.id }),
    ]);

    const rows = await db.select({
      id: diariasTable.id,
      status: diariasTable.status,
      integrationId: diariasTable.integrationId,
    }).from(diariasTable).where(inArray(diariasTable.id, [valid.id, invalid.id]));
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(byId.get(valid.id)).toMatchObject({
      status: "exportada",
      integrationId: body.integrationRef,
    });
    expect(byId.get(invalid.id)).toMatchObject({
      status: "pendente_aprovacao",
      integrationId: null,
    });
  });

  it("libera a reserva da diária rejeitada pelo People para correção e reenvio", async () => {
    const [accepted, rejected] = await db.insert(diariasTable).values([
      {
        providerId,
        teamId,
        managerId: adminId,
        typeId,
        workDate: "2026-08-03",
        value: "125.00",
        paymentDate: "2026-08-31",
        status: "disponivel_exportacao",
        createdBy: adminId,
      },
      {
        providerId,
        teamId,
        managerId: adminId,
        typeId,
        workDate: "2026-08-04",
        value: "130.00",
        paymentDate: "2026-08-31",
        status: "disponivel_exportacao",
        createdBy: adminId,
      },
    ]).returning({ id: diariasTable.id });
    diariaIds.push(accepted.id, rejected.id);

    peopleMocks.pushDiariasToPeople.mockResolvedValueOnce({
      total: 2,
      inserted: 1,
      updated: 0,
      skipped: 1,
      errors: [{
        id_prestador: "987654321",
        dia_trabalhado: "2026-08-04",
        error: "Registro rejeitado para correção",
        __localId: rejected.id,
      }],
    });

    const response = await fetch(`${apiBaseUrl}/api/diarias/export`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ diariaIds: [accepted.id, rejected.id] }),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as {
      exported: number;
      integrationRef: string;
      skipped: Array<{ id: number; reason: string }>;
    };
    expect(body.exported).toBe(1);
    expect(body.skipped).toEqual([{
      id: rejected.id,
      reason: "Rejeitado pelo DECARGO People",
    }]);

    expect(peopleMocks.pushDiariasToPeople).toHaveBeenCalledWith([
      expect.objectContaining({ __localId: accepted.id }),
      expect.objectContaining({ __localId: rejected.id }),
    ]);

    const rows = await db.select({
      id: diariasTable.id,
      status: diariasTable.status,
      integrationId: diariasTable.integrationId,
      exportedAt: diariasTable.exportedAt,
    }).from(diariasTable).where(inArray(diariasTable.id, [accepted.id, rejected.id]));
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(byId.get(accepted.id)).toMatchObject({
      status: "exportada",
      integrationId: body.integrationRef,
    });
    expect(byId.get(accepted.id)?.exportedAt).toBeInstanceOf(Date);
    expect(byId.get(rejected.id)).toEqual({
      id: rejected.id,
      status: "disponivel_exportacao",
      integrationId: null,
      exportedAt: null,
    });

    const correctionResponse = await fetch(`${apiBaseUrl}/api/diarias/${rejected.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ value: 135 }),
    });
    expect(correctionResponse.status).toBe(200);
    expect(await correctionResponse.json()).toMatchObject({
      id: rejected.id,
      value: "135.00",
      status: "disponivel_exportacao",
      integrationId: null,
    });

    peopleMocks.pushDiariasToPeople.mockResolvedValueOnce({
      total: 1,
      inserted: 1,
      updated: 0,
      skipped: 0,
      errors: [],
    });

    const retryResponse = await fetch(`${apiBaseUrl}/api/diarias/export`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ diariaIds: [rejected.id] }),
    });

    expect(retryResponse.status).toBe(200);
    const retryBody = await retryResponse.json() as {
      exported: number;
      integrationRef: string;
      skipped: Array<{ id: number; reason: string }>;
    };
    expect(retryBody).toMatchObject({ exported: 1, skipped: [] });
    expect(retryBody.integrationRef).not.toBe(body.integrationRef);
    expect(peopleMocks.pushDiariasToPeople).toHaveBeenLastCalledWith([
      expect.objectContaining({
        __localId: rejected.id,
        valor_diaria: 135,
      }),
    ]);

    const [retried] = await db.select({
      status: diariasTable.status,
      integrationId: diariasTable.integrationId,
      exportedAt: diariasTable.exportedAt,
      value: diariasTable.value,
    }).from(diariasTable).where(eq(diariasTable.id, rejected.id));
    expect(retried).toMatchObject({
      status: "exportada",
      integrationId: retryBody.integrationRef,
      value: "135.00",
    });
    expect(retried.exportedAt).toBeInstanceOf(Date);
  });

  it("libera somente a falta rejeitada pelo People para correção e reenvio", async () => {
    const [accepted, rejected] = await db.insert(diariasTable).values([
      {
        providerId,
        teamId,
        managerId: adminId,
        typeId: faltaTypeId,
        workDate: "2026-08-05",
        value: "140.00",
        status: "disponivel_exportacao",
        createdBy: adminId,
      },
      {
        providerId: secondProviderId,
        teamId,
        managerId: adminId,
        typeId: faltaTypeId,
        workDate: "2026-08-06",
        value: "145.00",
        status: "disponivel_exportacao",
        createdBy: adminId,
      },
    ]).returning({ id: diariasTable.id });
    diariaIds.push(accepted.id, rejected.id);

    peopleMocks.pushFaltasToPeople.mockResolvedValueOnce({
      total: 2,
      inserted: 1,
      updated: 0,
      skipped: 1,
      errors: [{
        cnpj: "22222222000122",
        error: "Falta rejeitada para correção",
        __localId: rejected.id,
      }],
    });

    const response = await fetch(`${apiBaseUrl}/api/diarias/export`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ diariaIds: [accepted.id, rejected.id] }),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as {
      exported: number;
      integrationRef: string;
      skipped: Array<{ id: number; reason: string }>;
    };
    expect(body.exported).toBe(1);
    expect(body.integrationRef).toMatch(/^EXP-\d+-[A-F0-9]{8}$/);
    expect(body.skipped).toEqual([{
      id: rejected.id,
      reason: "Rejeitado pelo DECARGO People",
    }]);
    expect(peopleMocks.pushFaltasToPeople).toHaveBeenCalledWith([
      expect.objectContaining({
        cnpj: "11111111000111",
        __localId: accepted.id,
      }),
      expect.objectContaining({
        cnpj: "22222222000122",
        __localId: rejected.id,
      }),
    ]);

    const rows = await db.select({
      id: diariasTable.id,
      status: diariasTable.status,
      integrationId: diariasTable.integrationId,
      exportedAt: diariasTable.exportedAt,
    }).from(diariasTable).where(inArray(diariasTable.id, [accepted.id, rejected.id]));
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(byId.get(accepted.id)).toMatchObject({
      status: "exportada",
      integrationId: body.integrationRef,
    });
    expect(byId.get(accepted.id)?.exportedAt).toBeInstanceOf(Date);
    expect(byId.get(rejected.id)).toEqual({
      id: rejected.id,
      status: "disponivel_exportacao",
      integrationId: null,
      exportedAt: null,
    });

    const correctionResponse = await fetch(`${apiBaseUrl}/api/diarias/${rejected.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ value: 150 }),
    });
    expect(correctionResponse.status).toBe(200);
    expect(await correctionResponse.json()).toMatchObject({
      id: rejected.id,
      value: "150.00",
      status: "disponivel_exportacao",
      integrationId: null,
    });

    peopleMocks.pushFaltasToPeople.mockResolvedValueOnce({
      total: 1,
      inserted: 1,
      updated: 0,
      skipped: 0,
      errors: [],
    });

    const retryResponse = await fetch(`${apiBaseUrl}/api/diarias/export`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ diariaIds: [rejected.id] }),
    });

    expect(retryResponse.status).toBe(200);
    const retryBody = await retryResponse.json() as {
      exported: number;
      integrationRef: string;
      skipped: Array<{ id: number; reason: string }>;
    };
    expect(retryBody).toMatchObject({ exported: 1, skipped: [] });
    expect(retryBody.integrationRef).not.toBe(body.integrationRef);
    expect(peopleMocks.pushFaltasToPeople).toHaveBeenLastCalledWith([
      expect.objectContaining({
        cnpj: "22222222000122",
        valor: 150,
        __localId: rejected.id,
      }),
    ]);

    const [retried] = await db.select({
      status: diariasTable.status,
      integrationId: diariasTable.integrationId,
      exportedAt: diariasTable.exportedAt,
      value: diariasTable.value,
    }).from(diariasTable).where(eq(diariasTable.id, rejected.id));
    expect(retried).toMatchObject({
      status: "exportada",
      integrationId: retryBody.integrationRef,
      value: "150.00",
    });
    expect(retried.exportedAt).toBeInstanceOf(Date);
  });

  it("mantém o lote reservado quando o People devolve erro sem identificação local", async () => {
    const [first, second] = await db.insert(diariasTable).values([
      {
        providerId,
        teamId,
        managerId: adminId,
        typeId,
        workDate: "2026-08-07",
        value: "155.00",
        paymentDate: "2026-08-31",
        status: "disponivel_exportacao",
        createdBy: adminId,
      },
      {
        providerId,
        teamId,
        managerId: adminId,
        typeId,
        workDate: "2026-08-07",
        value: "160.00",
        paymentDate: "2026-08-31",
        status: "disponivel_exportacao",
        createdBy: adminId,
      },
    ]).returning({ id: diariasTable.id });
    diariaIds.push(first.id, second.id);

    peopleMocks.pushDiariasToPeople.mockResolvedValueOnce({
      total: 2,
      inserted: 1,
      updated: 0,
      skipped: 1,
      errors: [{ error: "Rejeição sem campos de identificação" }],
      unidentifiedErrors: 1,
    });

    const response = await fetch(`${apiBaseUrl}/api/diarias/export`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ diariaIds: [first.id, second.id] }),
    });

    expect(response.status).toBe(502);
    const body = await response.json() as { error: string; integrationRef: string };
    expect(body.error).toContain("resultado externo não identificável");
    expect(body.error).toContain("bloqueados para conferência");

    const rows = await db.select({
      status: diariasTable.status,
      integrationId: diariasTable.integrationId,
      exportedAt: diariasTable.exportedAt,
    }).from(diariasTable).where(inArray(diariasTable.id, [first.id, second.id]));

    for (const row of rows) {
      expect(row).toMatchObject({
        status: "disponivel_exportacao",
        integrationId: body.integrationRef,
        exportedAt: null,
      });
    }

    const callsBeforeRetry = peopleMocks.pushDiariasToPeople.mock.calls.length;
    const retryResponse = await fetch(`${apiBaseUrl}/api/diarias/export`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ diariaIds: [first.id, second.id] }),
    });
    expect(retryResponse.status).toBe(409);
    expect(peopleMocks.pushDiariasToPeople).toHaveBeenCalledTimes(callsBeforeRetry);
  });

  it("mantém faltas com CNPJ repetido reservadas quando a rejeição é ambígua", async () => {
    const [first, second] = await db.insert(diariasTable).values([
      {
        providerId,
        teamId,
        managerId: adminId,
        typeId: faltaTypeId,
        workDate: "2026-08-09",
        value: "165.00",
        status: "disponivel_exportacao",
        createdBy: adminId,
      },
      {
        providerId,
        teamId,
        managerId: adminId,
        typeId: faltaTypeId,
        workDate: "2026-08-10",
        value: "170.00",
        status: "disponivel_exportacao",
        createdBy: adminId,
      },
    ]).returning({ id: diariasTable.id });
    diariaIds.push(first.id, second.id);

    peopleMocks.pushFaltasToPeople.mockResolvedValueOnce({
      total: 2,
      inserted: 1,
      updated: 0,
      skipped: 1,
      errors: [{ cnpj: "11111111000111", error: "Rejeição ambígua" }],
      unidentifiedErrors: 1,
    });

    const response = await fetch(`${apiBaseUrl}/api/diarias/export`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ diariaIds: [first.id, second.id] }),
    });

    expect(response.status).toBe(502);
    const body = await response.json() as { error: string; integrationRef: string };
    expect(body.error).toContain("resultado externo não identificável");

    const rows = await db.select({
      status: diariasTable.status,
      integrationId: diariasTable.integrationId,
      exportedAt: diariasTable.exportedAt,
    }).from(diariasTable).where(inArray(diariasTable.id, [first.id, second.id]));

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toEqual({
        status: "disponivel_exportacao",
        integrationId: body.integrationRef,
        exportedAt: null,
      });
    }
  });

  it("retoma somente faltas ainda não enviadas após falha de rede entre lotes", async () => {
    const created = await db.insert(diariasTable).values([
      {
        providerId, teamId, managerId: adminId, typeId: faltaTypeId,
        workDate: "2026-08-11", value: "140.00",
        status: "disponivel_exportacao", createdBy: adminId,
      },
      {
        providerId: secondProviderId, teamId, managerId: adminId, typeId: faltaTypeId,
        workDate: "2026-08-12", value: "145.00",
        status: "disponivel_exportacao", createdBy: adminId,
      },
      {
        providerId, teamId, managerId: adminId, typeId: faltaTypeId,
        workDate: "2026-08-13", value: "150.00",
        status: "disponivel_exportacao", createdBy: adminId,
      },
    ]).returning({ id: diariasTable.id });
    const [confirmed, uncertain, pending] = created;
    diariaIds.push(...created.map(({ id }) => id));

    peopleMocks.pushFaltasToPeople.mockRejectedValueOnce(Object.assign(new Error("connection reset"), {
      completedLocalIds: [confirmed.id],
      rejectedLocalIds: [],
      uncertainLocalIds: [uncertain.id],
      pendingLocalIds: [pending.id],
    }));

    const response = await fetch(`${apiBaseUrl}/api/diarias/export`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ diariaIds: created.map(({ id }) => id) }),
    });

    expect(response.status).toBe(502);
    const body = await response.json() as {
      exported: number[];
      awaitingConfirmation: number[];
      retryable: number[];
      integrationRef: string;
    };
    expect(body).toMatchObject({
      exported: [confirmed.id],
      awaitingConfirmation: [uncertain.id],
      retryable: [pending.id],
    });

    const afterFailure = await db.select({
      id: diariasTable.id,
      status: diariasTable.status,
      integrationId: diariasTable.integrationId,
    }).from(diariasTable).where(inArray(diariasTable.id, created.map(({ id }) => id)));
    const byId = new Map(afterFailure.map((row) => [row.id, row]));
    expect(byId.get(confirmed.id)).toMatchObject({ status: "exportada", integrationId: body.integrationRef });
    expect(byId.get(uncertain.id)).toMatchObject({ status: "disponivel_exportacao", integrationId: body.integrationRef });
    expect(byId.get(pending.id)).toMatchObject({ status: "disponivel_exportacao", integrationId: null });

    peopleMocks.pushFaltasToPeople.mockResolvedValueOnce({
      total: 1, inserted: 1, updated: 0, skipped: 0, errors: [], unidentifiedErrors: 0,
    });
    const retryResponse = await fetch(`${apiBaseUrl}/api/diarias/export`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ diariaIds: body.retryable }),
    });

    expect(retryResponse.status).toBe(200);
    expect(peopleMocks.pushFaltasToPeople).toHaveBeenLastCalledWith([
      expect.objectContaining({ __localId: pending.id }),
    ]);
  });
});