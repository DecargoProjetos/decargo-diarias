import type { Provider } from "@workspace/db";
import type { Prestador } from "./peopleClient";
import { hasLocalProviderReference } from "./providerIdentity";
import { normalizePersonName } from "./personIdentity";

/** Compare complete valid tax documents, not partial numbers or names. */
export function normalizeCnpj(value: string | null | undefined): string | null {
  const digits = value?.replace(/[.\-/\s]/g, "") ?? "";
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return null;
  const check = (length: number) => {
    let weight = length - 7;
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += Number(digits[i]) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return check(12) === Number(digits[12]) && check(13) === Number(digits[13]) ? digits : null;
}

export function isUnreconciledLocal(provider: Pick<Provider, "decargoId" | "localReference">): boolean {
  return hasLocalProviderReference(provider.decargoId) && !provider.localReference;
}

export function remoteProviderId(remote: Prestador): string | null {
  return Number.isSafeInteger(remote.id_prestador) && remote.id_prestador > 0
    ? String(remote.id_prestador) : null;
}

export function remoteIdentityConflict(remote: Prestador, allRemote: Prestador[]): string | null {
  const id = remoteProviderId(remote);
  if (!id) return "Identificador de prestador inválido no People.";
  if (allRemote.filter(p => remoteProviderId(p) === id).length !== 1) {
    return "O People retornou mais de um registro com este identificador.";
  }
  const cnpj = normalizeCnpj(remote.cnpj);
  if (cnpj && allRemote.filter(p => normalizeCnpj(p.cnpj) === cnpj).length !== 1) {
    return "O CNPJ está associado a mais de um prestador no People. Corrija a origem antes de vincular.";
  }
  return null;
}

export function needsProviderReview(remote: Prestador, providers: Provider[], allRemote: Prestador[]): boolean {
  // The remote contract has no attested personal email. Even dissimilar names
  // cannot rule out a duplicate local person; withhold until an admin decides.
  if (remoteIdentityConflict(remote, allRemote)) return true;
  if (providers.some(isUnreconciledLocal)) return true;
  const cnpj = normalizeCnpj(remote.cnpj);
  return providers.some(p =>
    (cnpj && normalizeCnpj(p.cnpj) === cnpj) ||
    normalizePersonName(p.name) === normalizePersonName(remote.titular_do_contrato)
  );
}

export function reconciliationConflict(
  local: Provider, remote: Prestador, providers: Provider[],
  duplicate: Provider | undefined, hasDuplicateHistory: boolean,
): string | null {
  if (!isUnreconciledLocal(local)) return "Selecione um vínculo local ainda não reconciliado.";
  const cnpj = normalizeCnpj(remote.cnpj);
  if (!cnpj) return "O People não possui um CNPJ válido para comprovar este vínculo.";
  if (local.cnpj && normalizeCnpj(local.cnpj) !== cnpj) return "O CNPJ local diverge do People. Nenhum cadastro foi alterado.";
  if (providers.some(p => p.id !== local.id && p.id !== duplicate?.id && normalizeCnpj(p.cnpj) === cnpj)) {
    return "Mais de um cadastro local corresponde ao CNPJ. Resolva a ambiguidade antes de vincular.";
  }
  if (providers.some(p => p.id !== local.id && p.localReference === local.decargoId)) {
    return "O vínculo local já está reservado por outro prestador.";
  }
  if (duplicate?.cnpj && normalizeCnpj(duplicate.cnpj) !== cnpj) {
    return "O CNPJ do cadastro People importado diverge da origem atual. Nenhum cadastro foi alterado.";
  }
  if (duplicate && duplicate.name !== remote.titular_do_contrato) {
    return "O nome do cadastro People existente foi alterado. Revise os dados antes de reconciliar.";
  }
  if (duplicate && (duplicate.localReference || hasDuplicateHistory ||
      duplicate.dailyRate !== null || duplicate.teamId !== null || duplicate.email !== null)) {
    return "O cadastro People existente possui histórico, vínculo ou configurações próprias. A reconciliação não pode descartá-los.";
  }
  return null;
}
