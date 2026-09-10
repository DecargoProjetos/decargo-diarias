import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import type { Diaria, User } from '@workspace/api-client-react';

export type CalendarViewMode = 'month' | 'week' | 'day';
export type UserRole = User['role'];

const EDITABLE_STATUSES = new Set<Diaria['status']>([
  'pendente_aprovacao',
  'solicitacao_correcao',
]);

export function canCreateDiaria(role: UserRole): boolean {
  return role === 'admin' || role === 'gestor';
}

export function canEditDiaria(role: UserRole, status: Diaria['status']): boolean {
  return role === 'admin' && EDITABLE_STATUSES.has(status);
}

export function canSeeCalendarFinancials(role: UserRole): boolean {
  return role === 'admin';
}

export function getCalendarRange(viewMode: CalendarViewMode, anchorDate: Date) {
  if (viewMode === 'month') {
    return {
      rangeStart: startOfWeek(startOfMonth(anchorDate)),
      rangeEnd: endOfWeek(endOfMonth(anchorDate)),
    };
  }
  if (viewMode === 'week') {
    return {
      rangeStart: startOfWeek(anchorDate),
      rangeEnd: endOfWeek(anchorDate),
    };
  }
  return { rangeStart: anchorDate, rangeEnd: anchorDate };
}

export function getCalendarDays(viewMode: CalendarViewMode, anchorDate: Date): Date[] {
  const { rangeStart, rangeEnd } = getCalendarRange(viewMode, anchorDate);
  const days: Date[] = [];
  let cursor = rangeStart;
  while (cursor <= rangeEnd) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

export function groupVisibleDiariasByDay(diarias: Diaria[]): Map<string, Diaria[]> {
  const grouped = new Map<string, Diaria[]>();
  for (const diaria of diarias) {
    if (diaria.status === 'cancelada') continue;
    const key = diaria.workDate.split('T')[0];
    grouped.set(key, [...(grouped.get(key) ?? []), diaria]);
  }
  return grouped;
}

export function countDiariasForDay(grouped: Map<string, Diaria[]>, date: Date): number {
  return grouped.get(format(date, 'yyyy-MM-dd'))?.length ?? 0;
}