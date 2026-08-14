import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { pool, db, diariasTable, providersTable, diariaTypesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { getGestorTeamIds } from "../lib/gestorTeams";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── helpers ─────────────────────────────────────────────────────────────────

function parseDateField(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  // xlsx with raw:false usually gives "dd/mm/yyyy" for date cells
  const s = String(raw).trim();
  // dd/mm/yyyy
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (dmy) {
    const iso = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    return isCalendarDate(iso) ? iso : null;
  }
  // yyyy-MM-dd
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (ymd) return isCalendarDate(s) ? s : null;
  // Excel serial number (raw:true path)
  const n = Number(s);
  if (!Number.isNaN(n) && n > 0) {
    const parsed = XLSX.SSF.parse_date_code(n);
    if (parsed) {
      const iso = `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
      return isCalendarDate(iso) ? iso : null;
    }
  }
  return null;
}

function isCalendarDate(iso: string): boolean {
  const d = new Date(iso + "T12:00:00");
  return !isNaN(d.getTime());
}

function parseTimeField(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const s = String(raw).trim();
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  // Excel time fraction
  const n = Number(s);
  if (!isNaN(n) && n >= 0 && n < 1) {
    const totalMin = Math.round(n * 24 * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  return null;
}

function parseValueField(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const s = String(raw).replace(",", ".").trim();
  // Remove "R$" prefix if user copied from a formatted cell
  const n = Number(s.replace(/[R$\s]/g, ""));
  if (isNaN(n) || n <= 0) return null;
  return n;
}

function parseSheetRows(buffer: Buffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  // raw:false → formats numbers/dates as strings using SSF
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
  return rows;
}

// Map a raw sheet row (by position) to named fields regardless of header casing
function extractFields(row: Record<string, unknown>, headers: string[]) {
  const get = (idx: number) => row[headers[idx]] ?? "";
  return {
    prestadorRaw: get(0),
    tipoRaw:      get(1),
    dataRaw:      get(2),
    horarioIni:   get(3),
    horarioFim:   get(4),
    observacoes:  get(5),
    valorRaw:     get(6),
  };
}

// ─── GET /template ────────────────────────────────────────────────────────────

router.get("/template", requireRole("admin", "gestor"), (_req, res) => {
  const wb = XLSX.utils.book_new();
  const header = [
    "Prestador*",
    "Tipo de Diária*",
    "Data* (dd/mm/aaaa)",
    "Horário Inicial (HH:MM)",
    "Horário Final (HH:MM)",
    "Observações",
    "Valor (R$)",
  ];
  const exemplo1 = ["Alessandra Alves Ferreira", "Diária Extra", "09/08/2026", "08:00", "17:00", "Exemplo de observação", "87.50"];
  const exemplo2 = ["João Gabriel Santos Laranjeiras", "Falta", "10/08/2026", "", "", "", ""];
  const ws = XLSX.utils.aoa_to_sheet([header, exemplo1, exemplo2]);
  ws["!cols"] = [
    { wch: 38 }, { wch: 25 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 32 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Diárias");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  res.setHeader("Content-Disposition", 'attachment; filename="modelo-diarias.xlsx"');
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.end(buf);
});

// ─── POST /preview ────────────────────────────────────────────────────────────

export interface PreviewRow {
  line: number;
  prestadorRaw: string;
  tipoRaw: string;
  dataRaw: string;
  horarioInicial: string | null;
  horarioFinal: string | null;
  observacoes: string | null;
  valor: number | null;
  status: "valido" | "duplicado" | "erro";
  errors: { campo: string; motivo: string }[];
  // resolved — only present when status !== "erro"
  providerId?: number;
  providerName?: string;
  teamId?: number;
  typeId?: number;
  workDate?: string;
  startTime?: string | null;
  endTime?: string | null;
}

router.post("/preview", requireRole("admin", "gestor"), upload.single("file"), async (req, res) => {
  const me = req.currentUser!;
  if (!req.file) { res.status(400).json({ error: "Arquivo não enviado." }); return; }

  let rawRows: Record<string, unknown>[];
  try {
    rawRows = parseSheetRows(req.file.buffer);
  } catch {
    res.status(400).json({ error: "Não foi possível ler o arquivo. Verifique se é um .xlsx ou .csv válido." });
    return;
  }

  if (rawRows.length === 0) {
    res.status(400).json({ error: "A planilha está vazia ou não contém dados após o cabeçalho." });
    return;
  }

  // Headers are the keys of the first row
  const headers = Object.keys(rawRows[0]);

  // Pre-load lookup tables
  const [providers, types, gestorTeamIds] = await Promise.all([
    pool.query<{ id: number; name: string; teamId: number | null; active: boolean; dailyRate: string | null }>(
      `SELECT id, name, team_id AS "teamId", active, daily_rate AS "dailyRate" FROM providers`
    ).then(r => r.rows),
    pool.query<{ id: number; description: string; active: boolean }>(
      `SELECT id, description, active FROM diaria_types`
    ).then(r => r.rows),
    me.role === "gestor" ? getGestorTeamIds(me.id) : Promise.resolve<number[]>([]),
  ]);

  // Build lookup maps (name → provider, case-insensitive)
  const providerByName = new Map<string, typeof providers[0]>();
  for (const p of providers) {
    providerByName.set(p.name.toLowerCase(), p);
  }
  const typeByDesc = new Map<string, typeof types[0]>();
  for (const t of types) {
    typeByDesc.set(t.description.toLowerCase(), t);
  }

  // Build set of existing (providerId, workDate) pairs to detect duplicates
  const existingResult = await pool.query<{ providerId: number; workDate: string }>(
    `SELECT provider_id AS "providerId", work_date::text AS "workDate"
     FROM diarias WHERE status NOT IN ('cancelada')`
  );
  const existingSet = new Set(existingResult.rows.map(r => `${r.providerId}:${r.workDate}`));

  const preview: PreviewRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const line = i + 2; // 1-based + header row
    const f = extractFields(raw, headers);
    const errors: { campo: string; motivo: string }[] = [];

    // ── Required fields ───────────────────────────────────────────────────
    const prestadorNome = String(f.prestadorRaw ?? "").trim();
    const tipoNome = String(f.tipoRaw ?? "").trim();
    const dataStr = String(f.dataRaw ?? "").trim();

    if (!prestadorNome) errors.push({ campo: "Prestador", motivo: "Campo obrigatório não preenchido." });
    if (!tipoNome) errors.push({ campo: "Tipo de Diária", motivo: "Campo obrigatório não preenchido." });
    if (!dataStr) errors.push({ campo: "Data", motivo: "Campo obrigatório não preenchido." });

    // ── Date ──────────────────────────────────────────────────────────────
    const workDate = parseDateField(f.dataRaw);
    if (dataStr && !workDate) {
      errors.push({ campo: "Data", motivo: `Formato inválido ("${dataStr}"). Use dd/mm/aaaa.` });
    }

    // ── Times ─────────────────────────────────────────────────────────────
    const startTimeRaw = String(f.horarioIni ?? "").trim();
    const endTimeRaw = String(f.horarioFim ?? "").trim();
    const startTime = parseTimeField(f.horarioIni) ?? (startTimeRaw ? null : null);
    const endTime = parseTimeField(f.horarioFim) ?? (endTimeRaw ? null : null);
    if (startTimeRaw && !parseTimeField(f.horarioIni)) {
      errors.push({ campo: "Horário Inicial", motivo: `Formato inválido ("${startTimeRaw}"). Use HH:MM.` });
    }
    if (endTimeRaw && !parseTimeField(f.horarioFim)) {
      errors.push({ campo: "Horário Final", motivo: `Formato inválido ("${endTimeRaw}"). Use HH:MM.` });
    }
    if (startTime && endTime && startTime >= endTime) {
      errors.push({ campo: "Horário Final", motivo: "Horário final deve ser maior que o horário inicial." });
    }

    // ── Valor ─────────────────────────────────────────────────────────────
    const valorRawStr = String(f.valorRaw ?? "").trim();
    const valor = parseValueField(f.valorRaw);
    if (valorRawStr && valor === null) {
      errors.push({ campo: "Valor (R$)", motivo: `Valor inválido ("${valorRawStr}"). Informe um número positivo.` });
    }

    // ── Lookup provider ───────────────────────────────────────────────────
    let resolvedProvider: typeof providers[0] | undefined;
    if (prestadorNome) {
      resolvedProvider = providerByName.get(prestadorNome.toLowerCase());
      if (!resolvedProvider) {
        errors.push({ campo: "Prestador", motivo: `Prestador não localizado: "${prestadorNome}".` });
      } else if (!resolvedProvider.active) {
        errors.push({ campo: "Prestador", motivo: `Prestador "${prestadorNome}" está inativo.` });
        resolvedProvider = undefined;
      } else if (me.role === "gestor") {
        const provTeam = resolvedProvider.teamId;
        if (provTeam === null || !gestorTeamIds.includes(provTeam)) {
          errors.push({ campo: "Prestador", motivo: `Você não tem permissão para lançar diárias do prestador "${prestadorNome}".` });
          resolvedProvider = undefined;
        }
      }
    }

    // ── Lookup type ───────────────────────────────────────────────────────
    let resolvedType: typeof types[0] | undefined;
    if (tipoNome) {
      resolvedType = typeByDesc.get(tipoNome.toLowerCase());
      if (!resolvedType) {
        errors.push({ campo: "Tipo de Diária", motivo: `Tipo não localizado: "${tipoNome}".` });
      } else if (!resolvedType.active) {
        errors.push({ campo: "Tipo de Diária", motivo: `Tipo "${tipoNome}" está inativo.` });
        resolvedType = undefined;
      }
    }

    // ── Gestor: value must come from dailyRate ────────────────────────────
    let effectiveValue = valor;
    if (me.role === "gestor" && resolvedProvider) {
      const dr = resolvedProvider.dailyRate != null ? Number(resolvedProvider.dailyRate) : null;
      if (dr === null || isNaN(dr)) {
        errors.push({ campo: "Valor (R$)", motivo: `Prestador "${prestadorNome}" não tem valor de diária configurado.` });
        effectiveValue = null;
      } else {
        effectiveValue = dr;
      }
    }
    if (me.role === "admin" && !valorRawStr && !effectiveValue) {
      // Admin must provide value (or provider must have dailyRate — allow 0-value for admin only if explicit)
      // We'll be lenient: if not provided, flag as warning but treat as 0 for now.
      // Actually: admin is responsible for setting value. We require it.
      errors.push({ campo: "Valor (R$)", motivo: "Campo obrigatório para o administrador." });
    }

    const row: PreviewRow = {
      line,
      prestadorRaw: prestadorNome,
      tipoRaw: tipoNome,
      dataRaw: dataStr,
      horarioInicial: parseTimeField(f.horarioIni),
      horarioFinal: parseTimeField(f.horarioFim),
      observacoes: String(f.observacoes ?? "").trim() || null,
      valor: effectiveValue,
      status: "valido",
      errors,
    };

    if (errors.length > 0) {
      row.status = "erro";
    } else if (resolvedProvider && workDate) {
      // Check for duplicate
      const dupKey = `${resolvedProvider.id}:${workDate}`;
      if (existingSet.has(dupKey)) {
        row.status = "duplicado";
        row.errors = [{ campo: "Data", motivo: `Já existe uma diária para este prestador em ${dataStr}.` }];
      } else {
        row.status = "valido";
        row.providerId = resolvedProvider.id;
        row.providerName = resolvedProvider.name;
        row.teamId = resolvedProvider.teamId ?? undefined;
        row.typeId = resolvedType?.id;
        row.workDate = workDate;
        row.startTime = parseTimeField(f.horarioIni);
        row.endTime = parseTimeField(f.horarioFim);
      }
    }

    preview.push(row);
  }

  const validos = preview.filter(r => r.status === "valido").length;
  const erros = preview.filter(r => r.status === "erro").length;
  const duplicados = preview.filter(r => r.status === "duplicado").length;

  res.json({
    rows: preview,
    summary: { total: preview.length, validos, erros, duplicados },
  });
});

// ─── POST /confirm ────────────────────────────────────────────────────────────

router.post("/confirm", requireRole("admin", "gestor"), async (req, res) => {
  const me = req.currentUser!;
  const { rows } = req.body as { rows: PreviewRow[] };

  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: "Nenhum registro para importar." });
    return;
  }

  // Re-validate permissions and uniqueness server-side (security)
  const gestorTeamIds = me.role === "gestor" ? await getGestorTeamIds(me.id) : [];

  // Load current duplicates again
  const existingResult = await pool.query<{ providerId: number; workDate: string }>(
    `SELECT provider_id AS "providerId", work_date::text AS "workDate"
     FROM diarias WHERE status NOT IN ('cancelada')`
  );
  const existingSet = new Set(existingResult.rows.map(r => `${r.providerId}:${r.workDate}`));

  const imported: number[] = [];
  const skipped: { line: number; motivo: string }[] = [];

  for (const row of rows) {
    if (row.status !== "valido") {
      skipped.push({ line: row.line, motivo: "Linha marcada como inválida ou duplicada na pré-visualização." });
      continue;
    }

    if (!row.providerId || !row.workDate || !row.typeId || !row.teamId) {
      skipped.push({ line: row.line, motivo: "Dados incompletos na linha." });
      continue;
    }

    // Re-check duplicate
    const dupKey = `${row.providerId}:${row.workDate}`;
    if (existingSet.has(dupKey)) {
      skipped.push({ line: row.line, motivo: `Duplicata detectada durante confirmação (linha ${row.line}).` });
      continue;
    }

    // Re-check gestor scope
    if (me.role === "gestor" && !gestorTeamIds.includes(row.teamId)) {
      skipped.push({ line: row.line, motivo: "Sem permissão para lançar para este prestador." });
      continue;
    }

    // Re-fetch provider dailyRate if gestor
    let effectiveValue = row.valor;
    if (me.role === "gestor") {
      const [prov] = await db
        .select({ dailyRate: providersTable.dailyRate })
        .from(providersTable)
        .where(eq(providersTable.id, row.providerId));
      if (!prov || prov.dailyRate == null) {
        skipped.push({ line: row.line, motivo: `Prestador sem valor de diária configurado.` });
        continue;
      }
      effectiveValue = Number(prov.dailyRate);
    }

    if (effectiveValue == null || effectiveValue <= 0) {
      skipped.push({ line: row.line, motivo: "Valor inválido ou não informado." });
      continue;
    }

    try {
      const [diaria] = await db
        .insert(diariasTable)
        .values({
          providerId: row.providerId,
          teamId: row.teamId,
          typeId: row.typeId,
          managerId: me.id,
          workDate: row.workDate,
          startTime: row.startTime ?? null,
          endTime: row.endTime ?? null,
          value: String(effectiveValue),
          observations: row.observacoes ?? null,
          status: "pendente_aprovacao",
          createdBy: me.id,
        })
        .returning();

      await logAudit({
        entityType: "diaria",
        entityId: diaria.id,
        action: "importado",
        userId: me.id,
        newValues: {
          providerId: row.providerId,
          teamId: row.teamId,
          typeId: row.typeId,
          workDate: row.workDate,
          value: effectiveValue,
          source: "planilha",
        },
      });

      existingSet.add(dupKey); // Prevent duplicates within the same batch
      imported.push(diaria.id);
    } catch (err: any) {
      skipped.push({ line: row.line, motivo: `Erro ao inserir: ${err?.message ?? "erro desconhecido"}` });
    }
  }

  res.json({
    imported: imported.length,
    skipped: skipped.length,
    details: skipped,
  });
});

export default router;
