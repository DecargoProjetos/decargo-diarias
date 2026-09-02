import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import app from "../../app";
import { db, usersTable } from "@workspace/db";

let server: Server;
let apiBaseUrl = "";
const createdUserIds: number[] = [];

beforeAll(async () => {
  process.env.DECARGO_ID_HANDOFF_SECRET = "test-handoff-secret";
  process.env.DECARGO_ID_APP_CODE = "test-diarias";
  process.env.SESSION_SECRET ??= "test-session-secret";

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  apiBaseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

describe("POST /api/auth/handoff", () => {
  it("uses the verified email when id_usuario collides with an inactive HR-synced row", async () => {
    const suffix = randomUUID();
    const managerEmail = `__test_handoff_manager_${suffix}@test.invalid`;
    const collidingDecargoId = String(Date.now());

    const [inactiveCollision, activeManager] = await db
      .insert(usersTable)
      .values([
        {
          decargoId: collidingDecargoId,
          name: "__TEST_HANDOFF_INACTIVE_COLLISION__",
          email: `__test_handoff_collision_${suffix}@test.invalid`,
          role: "prestador",
          active: false,
        },
        {
          decargoId: `__test_handoff_hr_${suffix}`,
          name: "__TEST_HANDOFF_MANAGER__",
          email: managerEmail,
          role: "gestor",
          active: true,
        },
      ])
      .returning();
    createdUserIds.push(inactiveCollision.id, activeManager.id);

    const handoffToken = jwt.sign(
      {
        sub: managerEmail,
        email: managerEmail,
        name: activeManager.name,
        id_usuario: Number(collidingDecargoId),
        papel: "gestor",
        jti: randomUUID(),
      },
      process.env.DECARGO_ID_HANDOFF_SECRET!,
      {
        issuer: "decargo-id",
        audience: process.env.DECARGO_ID_APP_CODE!,
        expiresIn: 90,
      },
    );

    const response = await fetch(`${apiBaseUrl}/api/auth/handoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: handoffToken }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      usuario: {
        id: activeManager.id,
        email: managerEmail,
        role: "gestor",
      },
    });

    const [stillInactive] = await db
      .select({ active: usersTable.active })
      .from(usersTable)
      .where(eq(usersTable.id, inactiveCollision.id));
    expect(stillInactive.active).toBe(false);
  });

  it("rejects an id_usuario collision when the verified email has no local match", async () => {
    const suffix = randomUUID();
    const collidingDecargoId = String(Date.now() + 1);

    const [unrelatedUser] = await db
      .insert(usersTable)
      .values({
        decargoId: collidingDecargoId,
        name: "__TEST_HANDOFF_UNRELATED__",
        email: `__test_handoff_unrelated_${suffix}@test.invalid`,
        role: "admin",
        active: true,
      })
      .returning();
    createdUserIds.push(unrelatedUser.id);

    const handoffEmail = `__test_handoff_unknown_${suffix}@test.invalid`;
    const handoffToken = jwt.sign(
      {
        sub: handoffEmail,
        email: handoffEmail,
        name: "__TEST_HANDOFF_UNKNOWN__",
        id_usuario: Number(collidingDecargoId),
        papel: "gestor",
        jti: randomUUID(),
      },
      process.env.DECARGO_ID_HANDOFF_SECRET!,
      {
        issuer: "decargo-id",
        audience: process.env.DECARGO_ID_APP_CODE!,
        expiresIn: 90,
      },
    );

    const response = await fetch(`${apiBaseUrl}/api/auth/handoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: handoffToken }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "Não foi possível associar sua conta pelo e-mail. Contate o administrador.",
    });
  });

  it("rejects duplicate local accounts for the same verified email", async () => {
    const suffix = randomUUID();
    const duplicateEmail = `__test_handoff_duplicate_${suffix}@test.invalid`;

    const duplicateUsers = await db
      .insert(usersTable)
      .values([
        {
          decargoId: `__test_handoff_duplicate_a_${suffix}`,
          name: "__TEST_HANDOFF_DUPLICATE_A__",
          email: duplicateEmail,
          role: "gestor",
          active: true,
        },
        {
          decargoId: `__test_handoff_duplicate_b_${suffix}`,
          name: "__TEST_HANDOFF_DUPLICATE_B__",
          email: duplicateEmail,
          role: "admin",
          active: true,
        },
      ])
      .returning();
    createdUserIds.push(...duplicateUsers.map((user) => user.id));

    const handoffToken = jwt.sign(
      {
        sub: duplicateEmail,
        email: duplicateEmail,
        name: "__TEST_HANDOFF_DUPLICATE__",
        id_usuario: Date.now() + 2,
        papel: "gestor",
        jti: randomUUID(),
      },
      process.env.DECARGO_ID_HANDOFF_SECRET!,
      {
        issuer: "decargo-id",
        audience: process.env.DECARGO_ID_APP_CODE!,
        expiresIn: 90,
      },
    );

    const response = await fetch(`${apiBaseUrl}/api/auth/handoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: handoffToken }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "Há mais de um cadastro local para este e-mail. Contate o administrador.",
    });
  });
});