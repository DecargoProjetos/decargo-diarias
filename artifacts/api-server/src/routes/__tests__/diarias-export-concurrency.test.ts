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
  const suffix = `${process.pid}_${Date.now()}`;

  const [admin] = await db.insert(usersTable).values({
    decargoId: `__test_concurrent_export_admin_${suffix}__`,
    name: "__TEST_CONCURRENT_EXPORT_ADMIN__",
    email: `concurrent-export-${suffix}@test.invalid`,
    role: "admin",
    active: true,
  }).returning();
  adminId = admin.id;

  const [team] = await db.insert(teamsTable).values({
    name: `__TEST_CONCURRENT_EXPORT_TEAM_${suffix}__`,
  }).returning();
  teamId = team.id;

  const [provider] = await db.insert(providersTable).values({
    decargoId: "987654322",
    name: "__TEST_CONCURRENT_EXPORT_PROVIDER__",
    teamId,
    active: true,
  }).returning();
  providerId = provider.id;

  const [type] = await db.insert(diariaTypesTable).values({
    description: `__TEST_CONCURRENT_EXPORT_TYPE_${suffix}__`,
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

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  apiBaseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
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

describe("POST /api/diarias/export — concorrência", () => {
  it("envia uma diária somente uma vez quando dois lotes tentam reservá-la", async () => {
    const [diaria] = await db.insert(diariasTable).values({
      providerId,
      teamId,
      managerId: adminId,
      typeId,
      workDate: "2026-09-10",
      value: "200.00",
      paymentDate: "2026-09-30",
      status: "disponivel_exportacao",
      createdBy: adminId,
    }).returning({ id: diariasTable.id });
    diariaIds.push(diaria.id);

    let signalExternalCall!: () => void;
    const externalCallStarted = new Promise<void>((resolve) => {
      signalExternalCall = resolve;
    });
    let releaseExternalCall!: () => void;
    const externalCallReleased = new Promise<void>((resolve) => {
      releaseExternalCall = resolve;
    });

    peopleMocks.pushDiariasToPeople.mockImplementationOnce(async () => {
      signalExternalCall();
      await externalCallReleased;
      return { total: 1, inserted: 1, updated: 0, skipped: 0, errors: [] };
    });

    const exportRequest = () => fetch(`${apiBaseUrl}/api/diarias/export`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ diariaIds: [diaria.id] }),
    });

    const firstRequest = exportRequest();
    await externalCallStarted;

    const conflictingResponse = await exportRequest();
    expect(conflictingResponse.status).toBe(409);
    expect(await conflictingResponse.json()).toEqual({
      error: "Uma ou mais diárias já estão sendo exportadas ou foram alteradas",
    });
    expect(peopleMocks.pushDiariasToPeople).toHaveBeenCalledOnce();

    releaseExternalCall();
    const successfulResponse = await firstRequest;
    expect(successfulResponse.status).toBe(200);
    const successfulBody = await successfulResponse.json() as {
      exported: number;
      integrationRef: string;
    };
    expect(successfulBody.exported).toBe(1);

    const [persisted] = await db.select({
      status: diariasTable.status,
      integrationId: diariasTable.integrationId,
    }).from(diariasTable).where(eq(diariasTable.id, diaria.id));

    expect(persisted).toEqual({
      status: "exportada",
      integrationId: successfulBody.integrationRef,
    });
  });
});