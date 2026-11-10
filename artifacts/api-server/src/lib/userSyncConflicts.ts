import type { UserSyncConflict, UserSyncEmployee } from "@workspace/api-zod";
import type { Funcionario } from "./peopleClient";
import { normalizePersonEmail } from "./personIdentity";

type LocalAccount = { id: number; decargoId: string; name: string; email: string; active: boolean };

const employeeSummary = (employee: Funcionario): UserSyncEmployee => ({
  employeeId: String(employee.id_funcionario),
  name: employee.nome,
  email: normalizePersonEmail(employee.email_principal ?? "") || null,
  active: !employee.demitido,
});

/** Reports evidence only. Never links identities or changes an existing account. */
export function inspectUserSyncEmployee(employee: Funcionario, remote: Funcionario[], users: LocalAccount[]) {
  const summary = employeeSummary(employee);
  const email = summary.email;
  const idMatches = users.filter(user => user.decargoId === summary.employeeId);
  const emailMatches = email ? users.filter(user => normalizePersonEmail(user.email) === email) : [];
  const sourceMatches = remote.filter(other =>
    String(other.id_funcionario) === summary.employeeId ||
    (email && normalizePersonEmail(other.email_principal ?? "") === email));
  const reasons: UserSyncConflict["reasons"] = [];
  if (!Number.isSafeInteger(employee.id_funcionario) || employee.id_funcionario <= 0) reasons.push("invalid_employee_id");
  if (sourceMatches.length !== 1) reasons.push("duplicate_source");
  if (emailMatches.length > 1) reasons.push("ambiguous_local_email");
  if (idMatches.some(user => normalizePersonEmail(user.email) !== (email ?? ""))) reasons.push("employee_id_account_collision");
  const conflict: UserSyncConflict | null = reasons.length ? {
    employee: summary, reasons,
    localAccounts: users.filter(user => idMatches.includes(user) || emailMatches.includes(user)).map(user => ({
      localUserId: user.id, externalReference: user.decargoId,
      name: user.name, email: user.email, active: user.active,
    })),
    sourceEmployees: sourceMatches.map(employeeSummary),
  } : null;
  return { email, existing: idMatches.length > 0 || emailMatches.length === 1, conflict };
}
