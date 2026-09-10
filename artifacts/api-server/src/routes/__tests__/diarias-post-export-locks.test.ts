import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { and, count, eq, inArray } from "drizzle-orm";
import app from "../../app";
import { signLocalJwt } from "../../lib/localJwt";
import {
  auditLogsTable,
  db,
  diariasTable,
  providersTable,
  teamsTable,
  usersTable,
} from "@workspace/db";

type LockedStatus = "exportada" | "paga";

let server: Server;
let apiBaseUrl = "";
let adminId: number;
let teamId: number;
let providerId: number;
let adminToken: string;
const createdDiariaIds: number[] = [];

async function createLockedDiaria(status: LockedStatus) {
  const [diaria] = await db
    .insert(diariasTable)
    .values({
      providerId,
      teamId,
      managerId: adminId,
      workDate: "2026-08-15",
      value: "175.00",
      paymentDate: "2026-08-31",
      observations: "__TEST_POST_EXPORT_ORIGINAL__",
      status,
      createdBy: adminId,
    })
    .returning({ id: diariasTable.id });
  createdDiariaIds.push(diaria.id);
  return diaria.id;
}

async function readProtectedState(id: number) {
  const [row] = await db
    .select({
      status: diariasTable.status,
      workDate: diariasTable.workDate,
      value: diariasTable.value,
      providerId: diariasTable.providerId,
      typeId: diariasTable.typeId,
      paymentDate: diariasTable.paymentDate,
      observations: diariasTable.observations,
      actionNote: diariasTable.actionNote,
    })
    .from(diariasTable)
    .where(eq(diariasTable.id, id));
  return row;
}

async function auditCount(id: number) {
  const [result] = await db
    .select({ value: count() })
    .from(auditLogsTable)
    .where(and(
      eq(auditLogsTable.entityType, "diaria"),
      eq(auditLogsTable.entityId, id),
    ));
  return result.value;
}

function detailRequest(id: number, suffix: string, body?: Record<string, unknown>) {
  return fetch(`${apiBaseUrl}/api/diarias/${id}${suffix}`, {
    method: suffix === "/payment-date" ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
}

beforeAll(async () => {
  process.env.SESSION_SECRET ??= "test-session-secret";
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  apiBaseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const [admin] = await db
    .insert(usersTable)
    .values({
      decargoId: "__test_post_export_admin__",
      name: "__TEST_POST_EXPORT_ADMIN__",
      email: "__test_post_export_admin@test.invalid__",
      role: "admin",
      active: true,
    })
    .returning();
  adminId = admin.id;

  const [team] = await db
    .insert(teamsTable)
    .values({ name: "__TEST_POST_EXPORT_TEAM__" })
    .returning({ id: teamsTable.id });
  teamId = team.id;

  const [provider] = await db
    .insert(providersTable)
    .values({
      decargoId: "__test_post_export_provider__",
      name: "__TEST_POST_EXPORT_PROVIDER__",
      teamId,
      active: true,
    })
    .returning({ id: providersTable.id });
  providerId = provider.id;

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
  if (createdDiariaIds.length) {
    await db.delete(auditLogsTable).where(and(
      eq(auditLogsTable.entityType, "diaria"),
      inArray(auditLogsTable.entityId, createdDiariaIds),
    ));
    await db.delete(diariasTable).where(inArray(diariasTable.id, createdDiariaIds));
  }
  await db.delete(providersTable).where(eq(providersTable.id, providerId));
  await db.delete(teamsTable).where(eq(teamsTable.id, teamId));
  await db.delete(usersTable).where(eq(usersTable.id, adminId));
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

describe("detail mutation locks after export", () => {
  it.each(["exportada", "paga"] as const)(
    "rejects generic edits to every protected field for a %s diária",
    async (status) => {
      const id = await createLockedDiaria(status);
      const before = await readProtectedState(id);
      const auditsBefore = await auditCount(id);

      const response = await fetch(`${apiBaseUrl}/api/diarias/${id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workDate: "2026-09-10",
          value: 999,
          paymentDate: "2026-09-30",
          observations: "__TEST_POST_EXPORT_CHANGED__",
        }),
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Diária já exportada/paga — não pode mais ser alterada",
      });
      expect(await readProtectedState(id)).toEqual(before);
      expect(await auditCount(id)).toBe(auditsBefore);
    },
  );

  it.each(["exportada", "paga"] as const)(
    "rejects payment-date changes for a %s diária and audits the blocked attempt",
    async (status) => {
      const id = await createLockedDiaria(status);
      const before = await readProtectedState(id);

      const response = await detailRequest(id, "/payment-date", { paymentDate: "2026-09-15" });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Diária já exportada/paga — campos financeiros não podem mais ser alterados",
      });
      expect(await readProtectedState(id)).toEqual(before);

      const audits = await db
        .select()
        .from(auditLogsTable)
        .where(and(
          eq(auditLogsTable.entityType, "diaria"),
          eq(auditLogsTable.entityId, id),
          eq(auditLogsTable.action, "alteracao_bloqueada_pos_exportacao"),
        ));
      expect(audits).toHaveLength(1);
      expect(audits[0].userId).toBe(adminId);
      expect(audits[0].oldValues).toEqual({ status, paymentDate: "2026-08-31" });
      expect(audits[0].newValues).toEqual({ attemptedPaymentDate: "2026-09-15" });
    },
  );

  const blockedStatusChanges = [
    { suffix: "/revert", body: {}, error: "Diária não pode ser revertida no status atual" },
    { suffix: "/approve", body: {}, error: "Diária não pode ser aprovada no status atual" },
    { suffix: "/reject", body: { note: "Não aprovar" }, error: "Diária não pode ser reprovada no status atual" },
    {
      suffix: "/request-correction",
      body: { note: "Corrigir" },
      error: "Diária já exportada/paga — status não pode mais ser alterado",
    },
  ];

  it.each(["exportada", "paga"] as const)(
    "rejects every blocked status change for a %s diária without mutating or auditing success",
    async (status) => {
      for (const operation of blockedStatusChanges) {
        const id = await createLockedDiaria(status);
        const before = await readProtectedState(id);
        const auditsBefore = await auditCount(id);

        const response = await detailRequest(id, operation.suffix, operation.body);

        expect(response.status, operation.suffix).toBe(400);
        await expect(response.json()).resolves.toEqual({ error: operation.error });
        expect(await readProtectedState(id), operation.suffix).toEqual(before);
        expect(await auditCount(id), operation.suffix).toBe(auditsBefore);
      }
    },
  );
});