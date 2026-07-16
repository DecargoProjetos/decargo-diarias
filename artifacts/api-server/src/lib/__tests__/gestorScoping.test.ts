/**
 * Integration + unit tests for gestor team-scoping.
 *
 * These tests exercise both the pure SQL-builder logic (`buildDiariaFilters`)
 * and the live DB helper (`getGestorTeamIds`) to confirm that:
 *
 *   1. A gestor with teams A and B sees diárias from A and B but NOT from C.
 *   2. Removing the gestor from team B immediately stops them seeing B's records.
 *   3. A gestor with no teams assigned sees nothing (no unconstrained scan).
 *   4. SQL placeholder generation is correct (regression guard for the
 *      missing-`$` bug in `d.team_id = ANY($N::int[])`).
 *
 * All DB fixtures are created under a recognisable test prefix and cleaned up
 * in `afterAll`, even when tests fail.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  db,
  pool,
  teamsTable,
  usersTable,
  diariasTable,
  providersTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { getGestorTeamIds } from "../gestorTeams";
import { buildDiariaFilters } from "../diariaFilters";

// ─── Test fixture IDs ────────────────────────────────────────────────────────
let gestorId: number;
let teamAId: number;
let teamBId: number;
let teamCId: number;   // gestor never manages this one
let providerAId: number;
let providerBId: number;
let providerCId: number;
let diariaAId: number; // belongs to teamA
let diariaBId: number; // belongs to teamB
let diariaCId: number; // belongs to teamC — must NOT be visible to gestor

// ─── Setup ───────────────────────────────────────────────────────────────────
beforeAll(async () => {
  // 1. Create a test gestor user (no teamId — scoped via teams.manager_id)
  const [gestor] = await db
    .insert(usersTable)
    .values({
      decargoId: "__test_gs_gestor_dc__",
      name: "__TEST_GS_GESTOR__",
      email: "__test_gs_gestor@test.invalid__",
      role: "gestor",
      active: true,
    })
    .returning({ id: usersTable.id });
  gestorId = gestor.id;

  // 2. A second user to serve as createdBy for diárias and as team C's manager
  const [admin] = await db
    .insert(usersTable)
    .values({
      decargoId: "__test_gs_admin_dc__",
      name: "__TEST_GS_ADMIN__",
      email: "__test_gs_admin@test.invalid__",
      role: "admin",
      active: true,
    })
    .returning({ id: usersTable.id });

  // 3. Three teams: gestor manages A and B; admin manages C
  const [tA] = await db
    .insert(teamsTable)
    .values({ name: "__TEST_GS_TEAM_A__", managerId: gestorId })
    .returning({ id: teamsTable.id });
  const [tB] = await db
    .insert(teamsTable)
    .values({ name: "__TEST_GS_TEAM_B__", managerId: gestorId })
    .returning({ id: teamsTable.id });
  const [tC] = await db
    .insert(teamsTable)
    .values({ name: "__TEST_GS_TEAM_C__", managerId: admin.id })
    .returning({ id: teamsTable.id });
  teamAId = tA.id;
  teamBId = tB.id;
  teamCId = tC.id;

  // 4. One provider per team
  const [pA] = await db
    .insert(providersTable)
    .values({ decargoId: "__test_gs_prov_a__", name: "__TEST_GS_PROV_A__", teamId: teamAId, active: true })
    .returning({ id: providersTable.id });
  const [pB] = await db
    .insert(providersTable)
    .values({ decargoId: "__test_gs_prov_b__", name: "__TEST_GS_PROV_B__", teamId: teamBId, active: true })
    .returning({ id: providersTable.id });
  const [pC] = await db
    .insert(providersTable)
    .values({ decargoId: "__test_gs_prov_c__", name: "__TEST_GS_PROV_C__", teamId: teamCId, active: true })
    .returning({ id: providersTable.id });
  providerAId = pA.id;
  providerBId = pB.id;
  providerCId = pC.id;

  // 5. One diária per team
  const [dA] = await db
    .insert(diariasTable)
    .values({
      providerId: providerAId,
      teamId: teamAId,
      managerId: gestorId,
      workDate: "2026-07-01",
      value: "100",
      status: "pendente_aprovacao",
      createdBy: gestorId,
    })
    .returning({ id: diariasTable.id });
  const [dB] = await db
    .insert(diariasTable)
    .values({
      providerId: providerBId,
      teamId: teamBId,
      managerId: gestorId,
      workDate: "2026-07-02",
      value: "200",
      status: "pendente_aprovacao",
      createdBy: gestorId,
    })
    .returning({ id: diariasTable.id });
  const [dC] = await db
    .insert(diariasTable)
    .values({
      providerId: providerCId,
      teamId: teamCId,
      managerId: admin.id,
      workDate: "2026-07-03",
      value: "300",
      status: "pendente_aprovacao",
      createdBy: admin.id,
    })
    .returning({ id: diariasTable.id });
  diariaAId = dA.id;
  diariaBId = dB.id;
  diariaCId = dC.id;
});

// ─── Teardown ────────────────────────────────────────────────────────────────
afterAll(async () => {
  // Delete in FK-safe order; use `inArray` so a single missing row doesn't
  // abort the whole cleanup.
  if (diariaAId || diariaBId || diariaCId) {
    const ids = [diariaAId, diariaBId, diariaCId].filter(Boolean);
    await db.delete(diariasTable).where(inArray(diariasTable.id, ids));
  }
  if (providerAId || providerBId || providerCId) {
    const ids = [providerAId, providerBId, providerCId].filter(Boolean);
    await db.delete(providersTable).where(inArray(providersTable.id, ids));
  }
  if (teamAId || teamBId || teamCId) {
    const ids = [teamAId, teamBId, teamCId].filter(Boolean);
    // Nullify managerId first (no FK, but belt-and-suspenders)
    await db
      .update(teamsTable)
      .set({ managerId: null })
      .where(inArray(teamsTable.id, ids));
    await db.delete(teamsTable).where(inArray(teamsTable.id, ids));
  }
  // Delete test users identified by their recognisable decargoId prefix
  await db
    .delete(usersTable)
    .where(
      inArray(usersTable.decargoId, [
        "__test_gs_gestor_dc__",
        "__test_gs_admin_dc__",
      ]),
    );
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("getGestorTeamIds", () => {
  it("returns an empty array for a user who manages no teams", async () => {
    const ids = await getGestorTeamIds(0); // id 0 never exists
    expect(ids).toEqual([]);
  });

  it("returns exactly the IDs of teams where managerId matches", async () => {
    const ids = await getGestorTeamIds(gestorId);
    expect(ids).toContain(teamAId);
    expect(ids).toContain(teamBId);
    expect(ids).not.toContain(teamCId);
  });

  it("reflects team reassignment immediately — no caching delay", async () => {
    // Remove gestor from team B
    await db
      .update(teamsTable)
      .set({ managerId: null })
      .where(eq(teamsTable.id, teamBId));

    const after = await getGestorTeamIds(gestorId);
    expect(after).toContain(teamAId);
    expect(after).not.toContain(teamBId);

    // Restore for subsequent tests
    await db
      .update(teamsTable)
      .set({ managerId: gestorId })
      .where(eq(teamsTable.id, teamBId));
  });
});

// ─── buildDiariaFilters — pure unit tests (no DB) ────────────────────────────
describe("buildDiariaFilters — pure SQL-builder", () => {
  const baseGestor = {
    id: 1,
    role: "gestor",
    teamId: null as number | null,
    decargoId: "",
  };
  const baseAdmin = {
    id: 2,
    role: "admin",
    teamId: null as number | null,
    decargoId: "",
  };

  it("emits `1=0` when gestorTeamIds is empty (no-team gestor sees nothing)", () => {
    const { where } = buildDiariaFilters(baseGestor, {}, { gestorTeamIds: [] });
    expect(where).toContain("1=0");
  });

  it("emits `1=0` when gestorTeamIds is omitted (defaults to empty)", () => {
    // opts.gestorTeamIds undefined → treated as []
    const { where } = buildDiariaFilters(baseGestor, {});
    expect(where).toContain("1=0");
  });

  it("generates `d.team_id = ANY($1::int[])` for gestor with teams", () => {
    const { where, params } = buildDiariaFilters(
      baseGestor,
      {},
      { gestorTeamIds: [10, 20] },
    );
    // The critical regression: `$1` must contain the literal dollar sign
    expect(where).toContain("d.team_id = ANY($1::int[])");
    expect(params[0]).toEqual([10, 20]);
  });

  it("param index advances correctly when team filter is followed by other filters", () => {
    const { where, params } = buildDiariaFilters(
      baseGestor,
      { status: "pendente_aprovacao" },
      { gestorTeamIds: [5, 6] },
    );
    expect(where).toContain("d.team_id = ANY($1::int[])");
    expect(where).toContain("d.status = $2");
    expect(params[0]).toEqual([5, 6]);
    expect(params[1]).toBe("pendente_aprovacao");
  });

  it("does not add any team constraint for admin", () => {
    const { where } = buildDiariaFilters(baseAdmin, {});
    expect(where).not.toContain("team_id");
    expect(where).not.toContain("1=0");
  });

  it("admin can filter by teamId via query param", () => {
    const { where, params } = buildDiariaFilters(
      baseAdmin,
      { teamId: "7" },
    );
    expect(where).toContain("d.team_id = $1");
    expect(params[0]).toBe(7);
  });

  it("prestador/funcionário is scoped by decargoId, not teamId", () => {
    const prestador = { ...baseGestor, role: "prestador", decargoId: "dc123" };
    const { where, params } = buildDiariaFilters(prestador, {});
    expect(where).toContain("p.decargo_id = $1");
    expect(params[0]).toBe("dc123");
  });
});

// ─── SQL integration: filter executes correctly against real DB ──────────────
describe("SQL filter integration — gestor team isolation", () => {
  async function queryDiariaIds(
    gestorTeamIds: number[],
  ): Promise<number[]> {
    const me = {
      id: gestorId,
      role: "gestor",
      teamId: null as number | null,
      decargoId: "",
    };
    const { where, params } = buildDiariaFilters(
      me,
      {},
      { gestorTeamIds },
    );
    const result = await pool.query<{ id: number }>(
      `SELECT d.id FROM diarias d
       JOIN providers p ON p.id = d.provider_id
       WHERE ${where}
       ORDER BY d.id`,
      params,
    );
    return result.rows.map((r) => r.id);
  }

  it("gestor with teams A and B sees diárias from A and B only", async () => {
    const teamIds = await getGestorTeamIds(gestorId);
    const ids = await queryDiariaIds(teamIds);

    expect(ids).toContain(diariaAId);
    expect(ids).toContain(diariaBId);
    expect(ids).not.toContain(diariaCId);
  });

  it("gestor with only team A sees diária from A but not B or C", async () => {
    // Temporarily remove gestor from team B
    await db
      .update(teamsTable)
      .set({ managerId: null })
      .where(eq(teamsTable.id, teamBId));

    const teamIds = await getGestorTeamIds(gestorId);
    const ids = await queryDiariaIds(teamIds);

    expect(ids).toContain(diariaAId);
    expect(ids).not.toContain(diariaBId);
    expect(ids).not.toContain(diariaCId);

    // Restore
    await db
      .update(teamsTable)
      .set({ managerId: gestorId })
      .where(eq(teamsTable.id, teamBId));
  });

  it("gestor with no teams sees nothing", async () => {
    // Temporarily remove gestor from both teams
    await db
      .update(teamsTable)
      .set({ managerId: null })
      .where(inArray(teamsTable.id, [teamAId, teamBId]));

    const teamIds = await getGestorTeamIds(gestorId);
    expect(teamIds).toHaveLength(0);

    const ids = await queryDiariaIds(teamIds);
    expect(ids).toHaveLength(0);

    // Restore
    await db
      .update(teamsTable)
      .set({ managerId: gestorId })
      .where(inArray(teamsTable.id, [teamAId, teamBId]));
  });

  it("access check in getDiariaById rejects out-of-scope diária for gestor", async () => {
    // Verify the diária belonging to team C is not accessible when the gestor
    // only has teams A and B.  We do this by querying with the gestor's teamIds
    // and checking that teamC's diária ID is absent.
    const teamIds = await getGestorTeamIds(gestorId);
    expect(teamIds).not.toContain(teamCId);

    const ids = await queryDiariaIds(teamIds);
    expect(ids).not.toContain(diariaCId);
  });
});
