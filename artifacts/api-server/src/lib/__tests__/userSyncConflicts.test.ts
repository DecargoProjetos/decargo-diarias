import { describe, expect, it } from "vitest";
import { inspectUserSyncEmployee } from "../userSyncConflicts";
import type { Funcionario } from "../peopleClient";

const employee = (id = 10, email: string | null = "person@example.invalid", demitido = false): Funcionario =>
  ({ id_funcionario: id, email_principal: email, nome: "Pessoa na origem", demitido });
const account = (id = 1, decargoId = "99", email = "person@example.invalid", active = true) =>
  ({ id, decargoId, email, active, name: "Conta local" });

describe("read-only employee conflict evidence", () => {
  it("distinguishes employee, local and account-reference domains without changing inactive users", () => {
    const source = employee(10, " OTHER@example.invalid ", true);
    const local = account(2, "10", "person@example.invalid", false);
    const before = structuredClone(local);
    expect(inspectUserSyncEmployee(source, [source], [local]).conflict).toEqual({
      employee: { employeeId: "10", name: source.nome, email: "other@example.invalid", active: false },
      reasons: ["employee_id_account_collision"],
      localAccounts: [{ localUserId: 2, externalReference: "10", name: local.name, email: local.email, active: false }],
      sourceEmployees: [{ employeeId: "10", name: source.nome, email: "other@example.invalid", active: false }],
    });
    expect(local).toEqual(before);
  });

  it("normalizes emails and includes inactive accounts when checking ambiguity", () => {
    const source = employee(10, " PERSON@EXAMPLE.INVALID ");
    const users = [account(1), account(2, "88", " PERSON@example.invalid ", false)];
    const before = structuredClone(users);
    expect(inspectUserSyncEmployee(source, [source], users).conflict?.reasons).toEqual(["ambiguous_local_email"]);
    expect(inspectUserSyncEmployee(source, [source], users).conflict?.localAccounts).toHaveLength(2);
    expect(users).toEqual(before);
    expect(inspectUserSyncEmployee(source, [source], [users[1]])).toMatchObject({ existing: true, conflict: null });
  });

  it.each([
    [employee(10), employee(10, "other@example.invalid", true)],
    [employee(10), employee(11, " PERSON@example.invalid ", true)],
  ])("reports every involved source duplicate, including terminated employees", (first, second) => {
    for (const source of [first, second]) {
      const result = inspectUserSyncEmployee(source, [first, second], []);
      expect(result.conflict?.reasons).toEqual(["duplicate_source"]);
      expect(result.conflict?.sourceEmployees).toHaveLength(2);
    }
  });

  it("collects simultaneous reasons but represents a skipped employee only once", () => {
    const source = employee();
    const duplicate = employee(11);
    const local = [account(1, "10", "other@example.invalid"), account(2), account(3, "88")];
    expect(inspectUserSyncEmployee(source, [source, duplicate], local).conflict?.reasons).toEqual([
      "duplicate_source", "ambiguous_local_email", "employee_id_account_collision",
    ]);
  });

  it("handles missing email and invalid identifiers explicitly", () => {
    const missing = employee(10, null);
    expect(inspectUserSyncEmployee(missing, [missing], [])).toMatchObject({ email: null, existing: false, conflict: null });
    expect(inspectUserSyncEmployee(missing, [missing], [account(1, "10")]).conflict?.reasons).toEqual(["employee_id_account_collision"]);
    const invalid = employee(0);
    expect(inspectUserSyncEmployee(invalid, [invalid], []).conflict?.reasons).toEqual(["invalid_employee_id"]);
  });
});
