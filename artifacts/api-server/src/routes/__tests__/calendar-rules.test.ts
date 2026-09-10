import { describe, expect, it } from "vitest";
import {
  canCreateDiaria,
  canEditDiaria,
  canSeeCalendarFinancials,
  countDiariasForDay,
  getCalendarDays,
  groupVisibleDiariasByDay,
} from "../../../../diarias/src/lib/calendarRules";
import {
  canSeeDiariaValue,
  redactProviderDailyRates,
} from "../../lib/diariaPermissions";

const roles = ["admin", "gestor", "prestador", "funcionario"] as const;
const statuses = [
  "pendente_aprovacao",
  "em_analise",
  "aprovada",
  "rejeitada",
  "solicitacao_correcao",
  "disponivel_exportacao",
  "exportada",
  "paga",
  "cancelada",
] as const;

function diaria(id: number, workDate: string, status = "pendente_aprovacao") {
  return {
    id,
    providerId: id,
    providerName: `Pessoa ${id}`,
    teamId: 1,
    teamName: "Equipe",
    workDate,
    value: 150,
    status,
  } as any;
}

describe("calendar role permissions", () => {
  it.each([
    ["admin", true],
    ["gestor", true],
    ["prestador", false],
    ["funcionario", false],
  ] as const)("sets create visibility for %s", (role, expected) => {
    expect(canCreateDiaria(role)).toBe(expected);
  });

  it("allows only admins to edit the two correction workflow statuses", () => {
    for (const role of roles) {
      for (const status of statuses) {
        const expected =
          role === "admin" &&
          (status === "pendente_aprovacao" || status === "solicitacao_correcao");
        expect(canEditDiaria(role, status), `${role}/${status}`).toBe(expected);
      }
    }
  });

  it.each([
    ["admin", true],
    ["gestor", false],
    ["prestador", false],
    ["funcionario", false],
  ] as const)("sets financial visibility for %s", (role, expected) => {
    expect(canSeeCalendarFinancials(role)).toBe(expected);
    expect(canSeeDiariaValue(role)).toBe(expected);
  });

  it.each(["gestor", "prestador", "funcionario"] as const)(
    "removes provider rates from API responses for %s",
    (role) => {
      expect(redactProviderDailyRates(role, [{ id: 1, dailyRate: "150.00" }])).toEqual([
        { id: 1, dailyRate: null },
      ]);
    },
  );
});

describe("calendar views and daily counts", () => {
  const anchor = new Date(2026, 8, 9, 12);

  it("builds the complete month grid", () => {
    const days = getCalendarDays("month", anchor);
    expect(days).toHaveLength(35);
    expect(days[0].getDay()).toBe(0);
    expect(days[days.length - 1]?.getDay()).toBe(6);
  });

  it("builds exactly one Sunday-to-Saturday week", () => {
    const days = getCalendarDays("week", anchor);
    expect(days).toHaveLength(7);
    expect(days[0].getDay()).toBe(0);
    expect(days[6].getDay()).toBe(6);
  });

  it("builds only the selected date in day view", () => {
    const days = getCalendarDays("day", anchor);
    expect(days).toHaveLength(1);
    expect(days[0]).toBe(anchor);
  });

  it("counts visible entries per day and excludes cancelled entries", () => {
    const grouped = groupVisibleDiariasByDay([
      diaria(1, "2026-09-09"),
      diaria(2, "2026-09-09T03:00:00.000Z"),
      diaria(3, "2026-09-09", "cancelada"),
      diaria(4, "2026-09-10"),
    ]);

    expect(countDiariasForDay(grouped, anchor)).toBe(2);
    expect(grouped.get("2026-09-10")).toHaveLength(1);
  });
});