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
let typeId: number;
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
    teamId,
    active: true,
  }).returning();
  providerId = provider.id;

  const [type] = await db.insert(diariaTypesTable).values({
    description: "__TEST_PARTIAL_EXPORT_TYPE__",
    exportTarget: "diaria_extra",
  }).returning();
  typeId = type.id;

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
  await db.delete(diariaTypesTable).where(eq(diariaTypesTable.id, typeId));
  await db.delete(providersTable).where(eq(providersTable.id, providerId));
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
});