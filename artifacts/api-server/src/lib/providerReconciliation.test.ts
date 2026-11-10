import { describe, expect, it } from "vitest";
import type { Provider } from "@workspace/db";
import type { Prestador } from "./peopleClient";
import {
  normalizeCnpj, needsProviderReview, reconciliationConflict, remoteIdentityConflict,
} from "./providerReconciliation";

const remote: Prestador = {
  id_prestador: 901, titular_do_contrato: "Nome remoto", cnpj: "11.222.333/0001-81",
  tem_contrato_ativo: true, data_inicio_contrato: null, data_fim_contrato: null,
};
const local = {
  id: 10, decargoId: "local-user:901", localReference: null, name: "Outro nome",
  cnpj: null, dailyRate: "310.25", email: "local@test.invalid", teamId: 42, active: false,
} as Provider;

describe("Explicit provider reconciliation rules", () => {
  it("validates full CNPJ digits, not partial IDs", () => {
    expect(normalizeCnpj("11.222.333/0001-81")).toBe("11222333000181");
    expect(normalizeCnpj("04.252.011/0001-10")).toBe("04252011000110");
    for (const invalid of [null, "", "901", "00000000000000", "11222333000180", "abc11222333000181"]) {
      expect(normalizeCnpj(invalid)).toBeNull();
    }
  });
  it("withholds unmatched remote records even when a local name is different", () => {
    expect(needsProviderReview(remote, [local], [remote])).toBe(true);
  });
  it("never establishes identity from a name or coincident numeric domain", () => {
    expect(reconciliationConflict(local, { ...remote, cnpj: null }, [local], undefined, false)).toContain("CNPJ válido");
  });
  it("allows an independently confirmed CNPJ while retaining local configuration", () => {
    expect(reconciliationConflict(local, remote, [local], undefined, false)).toBeNull();
    expect(local.active).toBe(false);
    expect(local.dailyRate).toBe("310.25");
  });
  it("blocks shared tax documents and repeated provider IDs in People", () => {
    expect(remoteIdentityConflict(remote, [remote, { ...remote, id_prestador: 902 }])).toContain("mais de um prestador");
    expect(remoteIdentityConflict(remote, [remote, remote])).toContain("identificador");
  });
  it("blocks conflicting local tax documents and ambiguous local matches", () => {
    expect(reconciliationConflict({ ...local, cnpj: "04252011000110" }, remote, [local], undefined, false)).toContain("diverge");
    expect(reconciliationConflict(local, remote, [local, { ...local, id: 11, cnpj: remote.cnpj }], undefined, false)).toContain("ambiguidade");
  });
  it("blocks an already reconciled local identity and an alias collision", () => {
    expect(reconciliationConflict({ ...local, decargoId: "901", localReference: local.decargoId }, remote, [], undefined, false)).toContain("ainda não");
    expect(reconciliationConflict(local, remote, [local, { ...local, id: 11, localReference: local.decargoId }], undefined, false)).toContain("reservado");
  });
  it("never removes an existing remote history or financial/team/email configuration", () => {
    const pristine = { ...local, id: 11, decargoId: "901", name: remote.titular_do_contrato,
      cnpj: remote.cnpj, dailyRate: null, teamId: null, email: null };
    expect(reconciliationConflict(local, remote, [local, pristine], pristine, false)).toBeNull();
    expect(reconciliationConflict(local, remote, [local, pristine], pristine, true)).toContain("histórico");
    for (const configured of [
      { ...pristine, dailyRate: "0.00" }, { ...pristine, teamId: 42 },
      { ...pristine, email: "person@test.invalid" }, { ...pristine, localReference: "local-user:80" },
    ]) expect(reconciliationConflict(local, remote, [local, configured], configured, false)).not.toBeNull();
  });
  it("does not auto-import by matching tax document or name", () => {
    const external = { ...local, decargoId: "500", name: remote.titular_do_contrato };
    expect(needsProviderReview(remote, [external], [remote])).toBe(true);
    expect(needsProviderReview(remote, [{ ...external, name: "Different", cnpj: remote.cnpj }], [remote])).toBe(true);
    expect(needsProviderReview(remote, [], [remote])).toBe(false);
  });
});
