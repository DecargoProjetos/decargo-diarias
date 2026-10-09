/** Match manual registrations against both local people sources. */
export function normalizePersonName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizePersonEmail(value: string): string {
  return value.trim().toLowerCase();
}
