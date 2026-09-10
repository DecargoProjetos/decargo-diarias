import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { and, eq, inArray } from "drizzle-orm";
import {
  auditLogsTable,
  db,
  diariasTable,
  diariaTypesTable,
  providersTable,
  teamsTable,
  usersTable,
} from "@workspace/db";
import { signLocalJwt } from "../../lib/localJwt";

const { pushDiariasToPeople } = vi.hoisted(() => ({
  pushDiariasToPeople: vi.fn(),
}));

vi.mock("../../lib/peopleClient", () => ({
  pushDiariasToPeople,
  pushFaltasToPeople: vi.fn(),
}));

import app from "../../app";

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

  const suffix = `${process.pid}_${Date.now()}`;
  const [admin] = await db
    .insert(usersTable)
    .values({
      decargoId: `__test_mixed_export_admin_${suffix}__`,
      name: "__TEST_MIXED_EXPORT_ADMIN__",
      email: `mixed-export-${suffix}@test.invalid`,
      role: "admin",
      active: true,
    })
    .returning();
  adminId = admin.id;

  const [team] = await db
    .insert(teamsTable)
    .values({ name: `__TEST_MIXED_EXPORT_TEAM_${suffix}__` })
    .returning({ id: teamsTable.id });
  teamId = team.id;

  const [provider] = await db
    .insert(providersTable)
    .values({
      decargoId: "987654",
      name: "__TEST_MIXED_EXPORT_PROVIDER__",
      teamId,
      active: true,
    })
    .returning({ id: providersTable.id });
  providerId = provider.id;

  const [type] = await db
    .insert(diariaTypesTable)
    .values({
      description: `__TEST_MIXED_EXPORT_TYPE_${suffix}__`,
      exportTarget: "diaria_extra",
    })
    .returning({ id: diariaTypesTable.id });
  typeId = type.id;

  adminToken = signLocalJwt({
    userId: admin.id,
    decargoId: admin.decargoId,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    teamId: admin.teamId ?? null,
  });

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  apiBaseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  if (diariaIds.length) {
    await db.delete(auditLogsTable).where(
      and(
        eq(auditLogsTable.entityType, "diaria"),
        inArray(auditLogsTable.entityId, diariaIds),
      ),
    );
    await db.delete(diariasTable).where(inArray(diariasTable.id, diariaIds));
  }
  await db.delete(diariaTypesTable).where(eq(diariaTypesTable.id, typeId));
  await db.delete(providersTable).where(eq(providersTable.id, providerId));
  await db.delete(teamsTable).where(eq(teamsTable.id, teamId));
  await db.delete(usersTable).where(eq(usersTable.id, adminId));
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
});

describe("POST /api/diarias/export — mixed valid and invalid batch", () => {
  it("exports and reserves only the valid diária", async () => {
    const [valid, invalid] = await db
      .insert(diariasTable)
      .values([
        {
          providerId,
          teamId,
          managerId: adminId,
          workDate: "2026-09-01",
          value: "150.00",
          typeId,
          paymentDate: "2026-09-15",
          status: "disponivel_exportacao",
          createdBy: adminId,
        },
        {
          providerId,
          teamId,
          managerId: adminId,
          workDate: "2026-09-02",
          value: "175.00",
          typeId,
          paymentDate: null,
          status: "disponivel_exportacao",
          createdBy: adminId,
        },
      ])
      .returning({ id: diariasTable.id });
    diariaIds.push(valid.id, invalid.id);

    pushDiariasToPeople.mockResolvedValueOnce({
      total: 1,
      inserted: 1,
      updated: 0,
      skipped: 0,
      errors: [],
    });

    const response = await fetch(`${apiBaseUrl}/api/diarias/export`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ diariaIds: [valid.id, invalid.id] }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      exported: number;
      integrationRef: string;
      skipped: Array<{ id: number; reason: string }>;
    };
    expect(body.exported).toBe(1);
    expect(body.skipped).toEqual([
      { id: invalid.id, reason: "Data de pagamento não preenchida" },
    ]);
    expect(body.integrationRef).toEqual(expect.stringMatching(/^EXP-/));

    expect(pushDiariasToPeople).toHaveBeenCalledOnce();
    expect(pushDiariasToPeople).toHaveBeenCalledWith([
      expect.objectContaining({
        __localId: valid.id,
        id_prestador: 987654,
        dia_trabalhado: "2026-09-01",
        valor_diaria: 150,
        data_pagamento: "2026-09-15",
      }),
    ]);

    const persisted = await db
      .select({
        id: diariasTable.id,
        status: diariasTable.status,
        integrationId: diariasTable.integrationId,
        exportedAt: diariasTable.exportedAt,
      })
      .from(diariasTable)
      .where(inArray(diariasTable.id, [valid.id, invalid.id]));
    const byId = new Map(persisted.map((row) => [row.id, row]));

    expect(byId.get(valid.id)).toMatchObject({
      status: "exportada",
      integrationId: body.integrationRef,
    });
    expect(byId.get(valid.id)?.exportedAt).toBeInstanceOf(Date);
    expect(byId.get(invalid.id)).toEqual({
      id: invalid.id,
      status: "disponivel_exportacao",
      integrationId: null,
      exportedAt: null,
    });
  });
});