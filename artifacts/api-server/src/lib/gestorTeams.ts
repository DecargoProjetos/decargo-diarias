import { db, teamsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Returns all team IDs where the given user is the designated manager
 * (`teams.manager_id = userId`). Used to scope gestor access without
 * relying on `users.team_id`, which is no longer the authoritative
 * source for gestor–team relationships.
 *
 * Returns an empty array when the gestor has no teams assigned yet
 * (which means they should see nothing — safer than an unconstrained query).
 */
export async function getGestorTeamIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ id: teamsTable.id })
    .from(teamsTable)
    .where(eq(teamsTable.managerId, userId));

  return rows.map((r) => r.id);
}
