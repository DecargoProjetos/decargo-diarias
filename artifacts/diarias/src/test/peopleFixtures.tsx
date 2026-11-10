import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AuditLog, AuditPage, User, Provider } from '@workspace/api-client-react';
import { afterEach, expect, vi } from 'vitest';

export const confirmationAction = 'identidade People reconciliada';
export const longDocument = `INÍCIO DO DOCUMENTO FICTÍCIO\n${'Descrição exclusivamente sintética para conferir a leitura integral. '.repeat(80)}\nFIM DO DOCUMENTO FICTÍCIO`;

export const admin: User = {
  id: 900, decargoId: 'test-admin', name: 'Administrador fictício',
  email: 'admin@example.invalid', role: 'admin', active: true,
  createdAt: '2026-01-01T12:00:00Z',
};
export const users: User[] = [
  { ...admin, id: 11, decargoId: 'test-user-11', name: 'Funcionária Alfa',
    email: 'alfa@example.invalid', role: 'funcionario' },
  { ...admin, id: 12, decargoId: 'test-user-12', name: 'Funcionário sem diárias',
    email: 'sem-diarias@example.invalid', role: 'funcionario' },
];
export const providers: Provider[] = [
  { id: 101, decargoId: 'people-alfa', localReference: 'local-user:11',
    name: 'Cadastro vinculado Alfa', email: 'alfa@example.invalid', active: true, dailyRate: 100 },
  // Collision with user ID 11 is intentional: numeric IDs alone are not identity.
  { id: 11, decargoId: 'people-beta', name: 'Prestador Beta',
    email: 'beta@example.invalid', active: true, dailyRate: 200 },
];

export function confirmation(providerId = 101, id = 501, description = `Documento sintético ${providerId}`): AuditLog {
  return {
    id, entityType: 'provider', entityId: providerId, action: confirmationAction,
    userId: 900, userName: 'Responsável fictício', timestamp: '2026-01-02T12:34:00Z',
    peopleConfirmation: {
      confirmedByName: 'Responsável fictício',
      externalId: `people-${providerId}`, verifiedCnpj: '12345678000190',
      documentDescription: description,
      preservedProvider: { id: providerId, name: `Cadastro histórico ${providerId}`, decargoId: `people-${providerId}` },
      removedProvider: { id: providerId + 1000, name: 'Cadastro retirado fictício', decargoId: 'manual-test' },
    },
  };
}

export function auditPage(data: AuditLog[], page = 1, totalPages = 1): AuditPage {
  return { data, page, pageSize: 10, totalPages, total: totalPages === 1 ? data.length : 21 };
}

const clients: QueryClient[] = [];
const safetyViolations: string[] = [];
afterEach(() => {
  clients.splice(0).forEach(client => client.clear());
  expect(safetyViolations.splice(0), 'No mutations or unhandled network requests are allowed').toEqual([]);
});

export function renderUI(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  clients.push(client);
  return { ...render(<QueryClientProvider client={client}>{element}</QueryClientProvider>), client };
}

type ApiOptions = {
  user?: User;
  audit?: (params: URLSearchParams) => AuditPage | Response | Promise<AuditPage | Response>;
};

/** Real generated hooks + real query cache; only HTTP is replaced, with no passthrough. */
export function mockPeopleApi({ user = admin, audit = () => auditPage([]) }: ApiOptions = {}) {
  const auditRequests: URLSearchParams[] = [];
  const requests: { path: string; method: string }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://synthetic.example.invalid');
    const method = init?.method ?? 'GET';
    requests.push({ path: url.pathname, method });
    if (method !== 'GET') {
      safetyViolations.push(`${method} ${url.pathname}`);
      throw new Error('Read-only test: mutation forbidden');
    }
    let data: unknown;
    switch (url.pathname) {
      case '/api/auth/me': data = user; break;
      case '/api/users': data = users; break;
      case '/api/providers': data = providers; break;
      case '/api/teams': data = []; break;
      case '/api/users/sync-reports':
        data = {
          reports: [], page: Number(url.searchParams.get('page') ?? 1),
          pageSize: Number(url.searchParams.get('pageSize') ?? 10),
          hasMore: false, retentionDays: 30,
        };
        break;
      case '/api/users/sync-reports/latest': data = { report: null, retentionDays: 30 }; break;
      case '/api/audit':
        auditRequests.push(url.searchParams);
        data = await audit(url.searchParams);
        break;
      default:
        safetyViolations.push(`${method} ${url.pathname}`);
        throw new Error(`No synthetic response for ${url.pathname}`);
    }
    return data instanceof Response ? data : new Response(JSON.stringify(data), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { auditRequests, requests, fetchMock };
}

export const failedAudit = () => new Response(JSON.stringify({ message: 'Falha sintética' }), {
  status: 503, headers: { 'Content-Type': 'application/json' },
});
