import { afterEach, describe, expect, it, vi } from "vitest";

import { PeopleBatchExportError, pushDiariasToPeople, pushFaltasToPeople } from "../peopleClient";

describe("pushFaltasToPeople", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.PEOPLE_API_URL;
    delete process.env.DECARGO_PEOPLE_API_KEY;
  });

  it("cumpre o contrato de requisição e resposta do módulo Folha Mensal > Descontos", async () => {
    process.env.PEOPLE_API_URL = "https://people.test";
    process.env.DECARGO_PEOPLE_API_KEY = "test-api-key";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        total: 2,
        inserted: 1,
        updated: 0,
        skipped: 1,
        errors: [{
          cnpj: "22222222000122",
          error: "Falta rejeitada para correção",
        }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await pushFaltasToPeople([
      {
        cnpj: "11111111000111",
        tipo: "Desconto de Diária",
        valor: 140,
        data_desconto: "2026-09-05",
        __localId: 101,
      },
      {
        cnpj: "22222222000122",
        tipo: "Desconto de Diária",
        valor: 145,
        data_desconto: "2026-09-05",
        __localId: 202,
      },
    ]);

    expect(result).toEqual({
      total: 2,
      inserted: 1,
      updated: 0,
      skipped: 1,
      unidentifiedErrors: 0,
      errors: [{
        cnpj: "22222222000122",
        error: "Falta rejeitada para correção",
        __localId: 202,
      }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://people.test/api/integration/descontos",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "test-api-key",
        },
        body: JSON.stringify({
          descontos: [
            {
              cnpj: "11111111000111",
              tipo: "Desconto de Diária",
              valor: 140,
              data_desconto: "2026-09-05",
            },
            {
              cnpj: "22222222000122",
              tipo: "Desconto de Diária",
              valor: 145,
              data_desconto: "2026-09-05",
            },
          ],
        }),
      }),
    );
  });

  it("envia mais de 500 faltas em lotes sem perda ou duplicação e agrega as respostas", async () => {
    process.env.PEOPLE_API_URL = "https://people.test";
    process.env.DECARGO_PEOPLE_API_KEY = "test-api-key";

    const items = Array.from({ length: 501 }, (_, index) => ({
      cnpj: String(index + 1).padStart(14, "0"),
      tipo: "Desconto de Diária",
      valor: 100 + index,
      data_desconto: "2026-09-05",
      __localId: 1_000 + index,
    }));
    const rejectedItem = items[500];

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total: 500,
          inserted: 490,
          updated: 5,
          skipped: 5,
          errors: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total: 1,
          inserted: 0,
          updated: 0,
          skipped: 1,
          errors: [{
            cnpj: rejectedItem.cnpj,
            error: "Falta rejeitada no segundo lote",
          }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await pushFaltasToPeople(items);

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const sentBatches = fetchMock.mock.calls.map(([, init]) => {
      const body = JSON.parse(String((init as RequestInit).body)) as {
        descontos: Array<Record<string, unknown>>;
      };
      return body.descontos;
    });

    expect(sentBatches.map((batch) => batch.length)).toEqual([500, 1]);
    expect(sentBatches.every((batch) => batch.length <= 500)).toBe(true);

    const sentItems = sentBatches.flat();
    expect(sentItems).toHaveLength(items.length);
    expect(new Set(sentItems.map((item) => item.cnpj)).size).toBe(items.length);
    expect(sentItems.map((item) => item.cnpj)).toEqual(items.map((item) => item.cnpj));
    expect(sentItems.every((item) => !("__localId" in item))).toBe(true);

    expect(result).toEqual({
      total: 501,
      inserted: 490,
      updated: 5,
      skipped: 6,
      unidentifiedErrors: 0,
      errors: [{
        cnpj: rejectedItem.cnpj,
        error: "Falta rejeitada no segundo lote",
        __localId: rejectedItem.__localId,
      }],
    });
  });

  it("considera ambígua uma rejeição quando duas faltas têm o mesmo CNPJ", async () => {
    process.env.PEOPLE_API_URL = "https://people.test";
    process.env.DECARGO_PEOPLE_API_KEY = "test-api-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        total: 2, inserted: 1, updated: 0, skipped: 1,
        errors: [{ cnpj: "11111111000111", error: "Rejeitada" }],
      }),
    }));

    await expect(pushFaltasToPeople([
      {
        cnpj: "11111111000111", tipo: "Desconto de Diária", valor: 140,
        data_desconto: "2026-09-05", __localId: 101,
      },
      {
        cnpj: "11111111000111", tipo: "Desconto de Diária", valor: 145,
        data_desconto: "2026-09-06", __localId: 202,
      },
    ])).rejects.toMatchObject({
      completedLocalIds: [],
      rejectedLocalIds: [],
      uncertainLocalIds: [101, 202],
      pendingLocalIds: [],
    });
  });

  it("considera ambígua uma rejeição quando duas diárias têm a mesma chave externa", async () => {
    process.env.PEOPLE_API_URL = "https://people.test";
    process.env.DECARGO_PEOPLE_API_KEY = "test-api-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        total: 2, inserted: 1, updated: 0, skipped: 1,
        errors: [{ id_prestador: 987, dia_trabalhado: "2026-08-07", error: "Rejeitada" }],
      }),
    }));

    const result = await pushDiariasToPeople([
      {
        id_prestador: 987, dia_trabalhado: "2026-08-07", valor_diaria: 155,
        data_pagamento: "2026-08-31", __localId: 303,
      },
      {
        id_prestador: 987, dia_trabalhado: "2026-08-07", valor_diaria: 160,
        data_pagamento: "2026-08-31", __localId: 404,
      },
    ]);

    expect(result.unidentifiedErrors).toBe(1);
    expect(result.errors[0].__localId).toBeUndefined();
  });

  it("informa o progresso após falha de rede no segundo lote para retomar sem reenviar aceitos", async () => {
    process.env.PEOPLE_API_URL = "https://people.test";
    process.env.DECARGO_PEOPLE_API_KEY = "test-api-key";

    const items = Array.from({ length: 1_001 }, (_, index) => ({
      cnpj: String(index + 1).padStart(14, "0"),
      tipo: "Desconto de Diária",
      valor: 100,
      data_desconto: "2026-09-05",
      __localId: index + 1,
    }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ total: 500, inserted: 500, updated: 0, skipped: 0, errors: [] }),
      })
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ total: 1, inserted: 1, updated: 0, skipped: 0, errors: [] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    let failure: PeopleBatchExportError | undefined;
    try {
      await pushFaltasToPeople(items);
    } catch (error) {
      failure = error as PeopleBatchExportError;
    }

    expect(failure).toBeInstanceOf(PeopleBatchExportError);
    expect(failure?.completedLocalIds).toEqual(items.slice(0, 500).map((item) => item.__localId));
    expect(failure?.rejectedLocalIds).toEqual([]);
    expect(failure?.uncertainLocalIds).toEqual(items.slice(500, 1_000).map((item) => item.__localId));
    expect(failure?.pendingLocalIds).toEqual([items[1_000].__localId]);

    const retryItems = items.filter((item) => failure?.pendingLocalIds.includes(item.__localId));
    await expect(pushFaltasToPeople(retryItems)).resolves.toMatchObject({
      total: 1,
      inserted: 1,
      errors: [],
    });

    const sentCnpjs = fetchMock.mock.calls.map(([, init]) => {
      const body = JSON.parse(String((init as RequestInit).body)) as { descontos: Array<{ cnpj: string }> };
      return body.descontos.map((item) => item.cnpj);
    });
    expect(sentCnpjs[2]).toEqual([items[1_000].cnpj]);
    expect(sentCnpjs[2]).not.toContain(items[0].cnpj);
    expect(sentCnpjs[2]).not.toContain(items[500].cnpj);
  });
});