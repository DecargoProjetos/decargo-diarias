import type { PeopleConfirmation, ConfirmationProvider } from "@workspace/api-zod";

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

// Older People events already carry a real snapshot inside newValues.
// This is not a lookup or a backfill from today's user record.
export function peopleActorName(entityType: unknown, action: unknown, newValues: unknown): string | null {
  if (entityType !== "provider" ||
      (action !== "identidade People reconciliada" && action !== "importação distinta confirmada")) return null;
  const after = object(newValues);
  return after.confirmed === true ? text(after.confirmedByName) : null;
}

function provider(value: unknown, fallbackId?: unknown): ConfirmationProvider | null {
  const record = object(value);
  const id = record.id ?? fallbackId;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) return null;
  return { id, name: text(record.name), decargoId: text(record.decargoId) };
}

// Read only immutable audit snapshots, never today's provider or People data.
export function peopleConfirmation(
  entityType: unknown, action: unknown, oldValues: unknown, newValues: unknown,
): PeopleConfirmation | null {
  if (entityType !== "provider" || action !== "identidade People reconciliada") return null;
  const before = object(oldValues);
  const after = object(newValues);
  if (after.confirmed !== true) return null;
  return {
    confirmedByName: text(after.confirmedByName),
    externalId: text(after.externalId),
    verifiedCnpj: text(after.cnpj),
    documentDescription: text(after.evidence),
    preservedProvider: provider(after.provider) ?? provider(before.local),
    removedProvider: after.removedPristineProviderId == null
      ? null : provider(before.duplicate, after.removedPristineProviderId),
  };
}
