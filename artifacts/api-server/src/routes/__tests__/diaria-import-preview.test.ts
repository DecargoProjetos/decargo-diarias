import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import * as XLSX from "xlsx";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { indexImportProviders, resolveImportProvider } from "../../lib/importProviderLookup";

const fixture = vi.hoisted(() => ({
  role: "admin",
  teams: [10],
  providers: [] as { id: number; name: string; active: boolean; teamId: number | null; dailyRate: string | null }[],
  existing: [] as { providerId: number; workDate: string }[],
  audit: vi.fn(),
}));

// This suite never connects to any database or external service. It exercises
// the real workbook parser and preview HTTP route against read-only fixtures.
vi.mock("@workspace/db", () => ({
  pool: { query: vi.fn(async (query: string) => {
    if (query.includes("FROM providers")) return { rows: fixture.providers };
    if (query.includes("FROM diaria_types")) return { rows: [{ id: 1, description: "Tipo teste", active: true }] };
    if (query.includes("FROM diarias")) return { rows: fixture.existing };
    throw new Error("Unexpected database operation in read-only preview test");
  }) },
  db: {}, diariasTable: {}, providersTable: {}, diariaTypesTable: {},
}));
vi.mock("../../middlewares/requireAuth", () => ({
  requireRole: (...allowed: string[]) => (req: any, res: any, next: any) => {
    if (!allowed.includes(fixture.role)) return res.status(403).json({ error: "Acesso negado" });
    req.currentUser = { id: 1, role: fixture.role };
    next();
  },
}));
vi.mock("../../lib/gestorTeams", () => ({ getGestorTeamIds: async () => fixture.teams }));
vi.mock("../../lib/competenceAuthorization", () => ({
  authorizeCompetenceRegistration: async () => ({ allowed: true }),
}));
vi.mock("../../lib/audit", () => ({ logAudit: fixture.audit }));
import router from "../diariaImport";

const provider = (id: number, name: string, active = true, teamId: number | null = 10) =>
  ({ id, name, active, teamId, dailyRate: "123.45" });

let server: Server;
let base: string;
type PreviewRow = {
  status: string;
  providerId?: number;
  teamId?: number;
  valor?: number;
  errors: { campo: string; motivo: string }[];
};

async function preview(names: string[]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(names.map(name => ({
    Prestador: name, "Tipo de Diária": "Tipo teste", Data: "07/09/2026",
    "Horário Inicial": "", "Horário Final": "", Observações: "", "Valor (R$)": "999,00",
  }))), "Diarias");
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const body = new FormData();
  body.append("file", new Blob([new Uint8Array(bytes)]), "preview.xlsx");
  const response = await fetch(`${base}/preview`, { method: "POST", body });
  return { status: response.status, data: await response.json() as {
    rows: PreviewRow[]; summary: { validos: number; erros: number; duplicados: number };
  } };
}

describe("Spreadsheet provider lookup and preview", () => {
  beforeAll(async () => {
    const app = express().use(express.json()).use(router);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  beforeEach(() => {
    fixture.role = "admin";
    fixture.teams = [10];
    fixture.providers = [];
    fixture.existing = [];
    fixture.audit.mockClear();
  });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  it("normalizes both full names: accents, case, outer/repeated spaces and NBSP", async () => {
    fixture.providers = [provider(1, "  Pessoa  Júlia\u00a0de Souza  ")];
    const result = await preview(["PESSOA JULIA DE SOUZA"]);
    expect(result.status).toBe(200);
    expect(result.data.rows[0]).toMatchObject({ status: "valido", providerId: 1, teamId: 10 });
    expect(fixture.audit).not.toHaveBeenCalled();
  });
  it.each([true, false])("uses the sole active record regardless of database order (%s)", async inactiveLast => {
    const active = provider(1, "Pessoa Exemplo");
    const inactive = provider(2, "Pessoa Exemplo", false);
    fixture.providers = inactiveLast ? [active, inactive] : [inactive, active];
    expect((await preview(["Pessoa Exemplo"])).data.rows[0]).toMatchObject({ status: "valido", providerId: 1 });
  });
  it("does not choose between multiple active homonyms, including accent variants", async () => {
    fixture.providers = [provider(1, "Pessoa Júlia"), provider(2, "Pessoa Julia")];
    const row = (await preview(["Pessoa Julia"])).data.rows[0];
    expect(row.status).toBe("erro");
    expect(row.providerId).toBeUndefined();
    expect(row.errors[0].motivo).toContain("mais de um prestador ativo");
  });
  it("still rejects an inactive-only match", async () => {
    fixture.providers = [provider(1, "Pessoa Exemplo", false)];
    const row = (await preview(["Pessoa Exemplo"])).data.rows[0];
    expect(row.status).toBe("erro");
    expect(row.errors[0].motivo).toContain("está inativo");
  });
  it("does not accept partial or approximate names", async () => {
    fixture.providers = [provider(1, "Pessoa Exemplo Completo")];
    const row = (await preview(["Pessoa Exemplo"])).data.rows[0];
    expect(row.status).toBe("erro");
    expect(row.errors[0].motivo).toContain("não localizado");
  });
  it("reports missing team in preview rather than only during confirmation", async () => {
    fixture.providers = [provider(1, "Pessoa Exemplo", true, null), provider(2, "Pessoa Exemplo", false, 10)];
    const row = (await preview(["Pessoa Exemplo"])).data.rows[0];
    expect(row.status).toBe("erro");
    expect(row.providerId).toBeUndefined();
    expect(row.errors[0].motivo).toContain("sem equipe vinculada");
  });
  it("uses the manager's uniquely eligible active record and authoritative daily rate", async () => {
    fixture.role = "gestor";
    fixture.providers = [provider(1, "Pessoa Exemplo", true, 20), provider(2, "Pessoa Exemplo", true, 10)];
    expect((await preview(["Pessoa Exemplo"])).data.rows[0])
      .toMatchObject({ status: "valido", providerId: 2, teamId: 10, valor: 123.45 });
  });
  it("blocks ambiguity within the manager's own scope", async () => {
    fixture.role = "gestor";
    fixture.providers = [provider(1, "Pessoa Exemplo"), provider(2, "Pessoa Exemplo")];
    expect((await preview(["Pessoa Exemplo"])).data.rows[0].errors[0].motivo)
      .toContain("mais de um prestador ativo");
  });
  it("does not import an active person outside the manager's scope", async () => {
    fixture.role = "gestor";
    fixture.providers = [provider(1, "Pessoa Exemplo", true, 20)];
    const row = (await preview(["Pessoa Exemplo"])).data.rows[0];
    expect(row.status).toBe("erro");
    expect(row.providerId).toBeUndefined();
    expect(row.errors[0].motivo).toContain("não tem permissão");
  });
  it("handles a mix of valid, existing diaria, missing and inactive records", async () => {
    fixture.providers = [provider(1, "Pessoa A"), provider(2, "Pessoa B"), provider(3, "Pessoa C", false)];
    fixture.existing = [{ providerId: 2, workDate: "2026-09-07" }];
    const result = await preview(["Pessoa A", "Pessoa B", "Pessoa C", "Pessoa D"]);
    expect(result.data.summary).toMatchObject({ validos: 1, duplicados: 1, erros: 2 });
    expect(fixture.audit).not.toHaveBeenCalled();
  });
  it("retains inactive, missing and out-of-scope distinctions without order-based selection", () => {
    const index = indexImportProviders([provider(1, "Pessoa Exemplo", true, 20), provider(2, "Pessoa Exemplo", true, 30)]);
    expect(resolveImportProvider(index, "Pessoa Exemplo", [10])).toEqual({ status: "forbidden" });
    expect(resolveImportProvider(index, "Desconhecido")).toEqual({ status: "not_found" });
  });
  it("keeps provider/employee roles forbidden from preview", async () => {
    fixture.role = "prestador";
    expect((await preview(["Pessoa Exemplo"])).status).toBe(403);
  });
});
