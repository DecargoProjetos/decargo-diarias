import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCapabilities: vi.fn(), verifyJwt: vi.fn(), select: vi.fn(), role: "admin", active: true,
  query: vi.fn(),
}));
vi.mock("@workspace/db", () => ({
  usersTable: { id: "id" }, db: { select: mocks.select },
  pool: { query: mocks.query },
}));
vi.mock("../../lib/localJwt", () => ({ verifyLocalJwt: mocks.verifyJwt }));
vi.mock("../../lib/peopleClient", () => ({
  getPeopleExportCapabilities: mocks.getCapabilities,
}));
import router from "../peopleExportCapabilities";

async function request(authorization?: string, path = "/capabilities", body?: unknown) {
  const stack = router.stack.find(layer => layer.route?.path === path)!.route!.stack;
  const req = { headers: { authorization }, body };
  const res = {
    status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };
  const next = vi.fn();
  await stack[0].handle(req as never, res as never, next);
  if (next.mock.calls.length) await stack[1].handle(req as never, res as never, vi.fn());
  return { status: res.status.mock.calls.at(-1)?.[0] ?? 200, body: res.json.mock.calls.at(-1)?.[0], res };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.role = "admin";
  mocks.active = true;
  mocks.verifyJwt.mockReturnValue({ userId: 1 });
  mocks.select.mockImplementation(() => ({
    from: () => ({ where: () => ({ limit: async () => [{ id: 1, role: mocks.role, active: mocks.active }] }) }),
  }));
});

describe("batch review derives destinations locally without writes or upstream person queries", () => {
  const token = "Bearer synthetic-local-token";
  const extra = { id: 1, providerName: "Pessoa teste", workDate: "2026-10-01", typeName: "Extra", exportTarget: "diaria_extra" };
  const falta = { ...extra, id: 22, typeName: "Falta", exportTarget: "falta" };
  const unconfigured = { ...extra, id: 33, typeName: null, exportTarget: null };
  it("identifies the off-page incompatible record in a mixed selection and reports missing IDs", async () => {
    mocks.query.mockResolvedValue({ rows: [extra, falta, unconfigured] });
    mocks.getCapabilities.mockResolvedValue(["diarias"]);
    const response = await request(token, "/review", { diariaIds: [1, 22, 33, 99], supportedTargets: ["descontos"] });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      supportedTargets: ["diarias"], reviewedCount: 4, missingIds: [99],
      incompatibleRecords: [
        { id: 22, providerName: falta.providerName, workDate: falta.workDate, typeName: "Falta", requiredTarget: "descontos", reason: "unsupported_target" },
        { id: 33, providerName: extra.providerName, workDate: extra.workDate, typeName: null, requiredTarget: null, reason: "unconfigured_type" },
      ],
    });
    expect(mocks.query).toHaveBeenCalledOnce();
    const [sql, params] = mocks.query.mock.calls[0];
    expect(sql).toMatch(/^SELECT /);
    expect(sql).not.toMatch(/UPDATE|INSERT|DELETE|audit_logs|integration_id/i);
    expect(params).toEqual([[1, 22, 33, 99]]);
    expect(mocks.getCapabilities).toHaveBeenCalledExactlyOnceWith();
    expect(response.res.set).toHaveBeenCalledWith("Cache-Control", "no-store");
  });
  it.each([
    { targets: ["diarias", "descontos"], blocked: [] },
    { targets: ["descontos"], blocked: [1] },
    { targets: [], blocked: [1, 22] },
  ])("reviews all selected types with supported destinations $targets", async ({ targets, blocked }) => {
    mocks.query.mockResolvedValue({ rows: [extra, falta] });
    mocks.getCapabilities.mockResolvedValue(targets);
    const response = await request(token, "/review", { diariaIds: [1, 22] });
    expect(response.body.incompatibleRecords.map((r: { id: number }) => r.id)).toEqual(blocked);
  });
  it.each([undefined, {}, { diariaIds: [] }, { diariaIds: [0] }, { diariaIds: [-1] }, { diariaIds: [1.5] }, { diariaIds: ["1"] }, { diariaIds: [2147483648] }])("rejects malformed selection %j before querying", async body => {
    expect((await request(token, "/review", body)).status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.getCapabilities).not.toHaveBeenCalled();
  });
  it.each(["gestor", "funcionario", "prestador"])("denies review to %s before reading metadata", async role => {
    mocks.role = role;
    expect((await request(token, "/review", { diariaIds: [1] })).status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.getCapabilities).not.toHaveBeenCalled();
  });
  it("requires an active authenticated admin", async () => {
    expect((await request(undefined, "/review", { diariaIds: [1] })).status).toBe(401);
    mocks.active = false;
    expect((await request(token, "/review", { diariaIds: [1] })).status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.getCapabilities).not.toHaveBeenCalled();
  });
  it.each(["local", "upstream"])("does not turn a %s failure into an unsupported result", async failure => {
    mocks.query.mockResolvedValue({ rows: [extra] });
    mocks.getCapabilities.mockResolvedValue(["diarias"]);
    if (failure === "local") mocks.query.mockRejectedValue(new Error("private SQL"));
    else mocks.getCapabilities.mockRejectedValue(new Error("private credentials"));
    const response = await request(token, "/review", { diariaIds: [1] });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Não foi possível revisar o lote no DECARGO People. Tente novamente." });
  });
});

describe("read-only financial capabilities, with real local authentication middleware", () => {
  it.each([["diarias"], ["diarias", "descontos"], []])("returns only capabilities: %j", async (...targets) => {
    // it.each passes array entries as positional arguments.
    mocks.getCapabilities.mockResolvedValue(targets);
    const response = await request("Bearer synthetic-local-token");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ supportedTargets: targets });
    expect(response.res.set).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(mocks.getCapabilities).toHaveBeenCalledExactlyOnceWith();
  });
  it("requires login before contacting People", async () => {
    expect((await request()).status).toBe(401);
    expect(mocks.getCapabilities).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it.each(["gestor", "funcionario", "prestador"])("rejects %s without contacting People", async role => {
    mocks.role = role;
    expect((await request("Bearer synthetic-local-token")).status).toBe(403);
    expect(mocks.getCapabilities).not.toHaveBeenCalled();
  });
  it("revalidates inactive accounts", async () => {
    mocks.active = false;
    expect((await request("Bearer synthetic-local-token")).status).toBe(401);
    expect(mocks.getCapabilities).not.toHaveBeenCalled();
  });
  it("rejects an invalid token", async () => {
    mocks.verifyJwt.mockImplementation(() => { throw new Error("bad token"); });
    expect((await request("Bearer invalid")).status).toBe(401);
    expect(mocks.getCapabilities).not.toHaveBeenCalled();
  });
  it.each(["401 upstream fake-key", "timeout", "invalid v2 contract"])("sanitizes upstream failure %s", async message => {
    mocks.getCapabilities.mockRejectedValue(new Error(message));
    const response = await request("Bearer synthetic-local-token");
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: "Não foi possível consultar os destinos do DECARGO People. Verifique o acesso e tente novamente.",
    });
    expect(response.body).not.toHaveProperty("supportedTargets");
    expect(response.res.set).toHaveBeenCalledWith("Cache-Control", "no-store");
  });
});
