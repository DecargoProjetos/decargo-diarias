import { afterEach, describe, expect, it, vi } from "vitest";

import { pushFaltasToPeople } from "../peopleClient";

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
      errors: [{
        cnpj: rejectedItem.cnpj,
        error: "Falta rejeitada no segundo lote",
        __localId: rejectedItem.__localId,
      }],
    });
  });
});