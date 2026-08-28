import { describe, expect, it } from "vitest";
import { evaluateCompetenceRegistration, isReleaseCurrentlyValid } from "../competenceAuthorization";

const deadline = new Date("2025-03-11T03:00:00.000Z"); // midnight in São Paulo
const period = {
  id: 7, name: "Março/2025", workStartDate: "2025-03-01", workEndDate: "2025-03-31",
  status: "open" as const, deadlineAt: deadline,
};

describe("competence registration policy", () => {
  it("allows exactly at the São Paulo deadline and rejects after it", () => {
    expect(evaluateCompetenceRegistration({ role: "gestor", period, now: deadline })).toMatchObject({ allowed: true, source: "period" });
    expect(evaluateCompetenceRegistration({ role: "gestor", period, now: new Date(deadline.getTime() + 1) })).toMatchObject({ allowed: false, source: "expired" });
  });
  it("allows administrators and rollout with no matching period", () => {
    expect(evaluateCompetenceRegistration({ role: "admin", period: { ...period, status: "closed" }, now: new Date(deadline.getTime() + 1) })).toMatchObject({ allowed: true, source: "admin" });
    expect(evaluateCompetenceRegistration({ role: "gestor", now: new Date() })).toMatchObject({ allowed: true, source: "no_period" });
  });
  it("blocks closed periods unless a valid exceptional release exists", () => {
    expect(evaluateCompetenceRegistration({ role: "gestor", period: { ...period, status: "closed" }, now: deadline })).toMatchObject({ allowed: false, source: "closed" });
    expect(evaluateCompetenceRegistration({ role: "gestor", period: { ...period, status: "closed" }, release: { id: 9 }, now: new Date(deadline.getTime() + 1) })).toMatchObject({ allowed: true, source: "release", releaseId: 9 });
  });
  it("accepts releases only within their inclusive-start, exclusive-end window", () => {
    const startsAt = new Date("2025-03-11T12:00:00.000Z");
    const expiresAt = new Date("2025-03-11T15:00:00.000Z");
    expect(isReleaseCurrentlyValid(startsAt, expiresAt, new Date("2025-03-11T11:59:59.999Z"))).toBe(false);
    expect(isReleaseCurrentlyValid(startsAt, expiresAt, startsAt)).toBe(true);
    expect(isReleaseCurrentlyValid(startsAt, expiresAt, expiresAt)).toBe(false);
  });
});