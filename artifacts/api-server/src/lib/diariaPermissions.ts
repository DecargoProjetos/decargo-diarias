export function canSeeDiariaValue(role: string): boolean {
  return role === "admin";
}

export function redactProviderDailyRates<T extends { dailyRate: unknown }>(
  role: string,
  providers: T[],
): T[] {
  if (role === "admin") return providers;
  return providers.map((provider) => ({ ...provider, dailyRate: null }));
}