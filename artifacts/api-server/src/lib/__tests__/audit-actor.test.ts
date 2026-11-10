import { beforeEach, describe, expect, it, vi } from "vitest";

const { insert, values, table } = vi.hoisted(() => ({
  insert: vi.fn(), values: vi.fn(), table: {},
}));
vi.mock("@workspace/db", () => ({
  db: { insert }, auditLogsTable: table,
}));
import { logAudit } from "../audit";

describe("authenticated audit actor snapshots", () => {
  beforeEach(() => {
    insert.mockReset().mockReturnValue({ values });
    values.mockReset().mockResolvedValue(undefined);
  });

  it("stores the authenticated name separately from the entity's values", async () => {
    const actor = { id: 7, name: "Nome na ação" };
    const newValues = { name: "Nome editado", userNameAtAction: "Nome enviado no corpo" };
    await logAudit({ entityType: "user", entityId: 7, action: "atualizado", actor, newValues });
    actor.name = "Nome posterior";
    expect(insert).toHaveBeenCalledWith(table);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7, userNameAtAction: "Nome na ação", newValues,
    }));
  });

  it("requires explicit null for system events without inventing a name", async () => {
    await logAudit({ entityType: "provider", entityId: 0, action: "sync", actor: null });
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      userId: null, userNameAtAction: null, oldValues: null, newValues: null,
    }));
  });

  it("propagates write failures instead of silently dropping the snapshot", async () => {
    values.mockRejectedValueOnce(new Error("Audit write failed"));
    await expect(logAudit({
      entityType: "diaria", entityId: 1, action: "aprovado", actor: { id: 7, name: "Responsável" },
    })).rejects.toThrow("Audit write failed");
  });
});
