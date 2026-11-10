/** Use normalized spreadsheet dates, never locale-dependent raw cell values. */
export function importAnalysisUrl(rows: { workDate?: string }[]): string {
  const dates = rows.map(row => row.workDate).filter((date): date is string =>
    !!date && /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
  const params = new URLSearchParams({ fromImport: '1' });
  if (dates.length) {
    params.set('startDate', dates[0]);
    params.set('endDate', dates[dates.length - 1]);
  }
  return `/analise-diarias?${params}`;
}
