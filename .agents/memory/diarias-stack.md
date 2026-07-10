---
name: Diarias Stack
description: Technical stack decisions for the Controle de Diárias app
---

## Stack
- Frontend: React + Vite (`artifacts/diarias`, preview `/`)
- Backend: Express 5 (`artifacts/api-server`, port 8080)
- DB: PostgreSQL + Drizzle ORM (`lib/db`)
- Sessions: express-session + connect-pg-simple
- Auth: openid-client@5 (OIDC/PKCE)
- API codegen: @workspace/api-client-react (generated hooks)

## Key Exports from @workspace/db
- `db` — Drizzle ORM instance
- `pool` — raw pg Pool (use for dynamic parameterized queries)
- All schema tables exported directly
- `lib/db` has NO build step — exports raw `.ts` via `exports` field; tsc errors against stale `dist/` are pre-existing noise, not real failures

## People API Sync Pattern (api-server)
- Client: `src/lib/peopleClient.ts` — service-account JWT, retry-on-401, fetchFuncionarios (paginated) + fetchPrestadores
- Provider sync: transactional upsert + deactivation; safety circuit aborts on empty/suspicious shrink (>50%), pass `force=true` to override
- User sync: upserts name/email only, never deactivates (id_funcionario ≠ id_usuario risk); role/teamId managed by admin
- Needs secrets: PEOPLE_API_URL, PEOPLE_SERVICE_LOGIN, PEOPLE_SERVICE_PASSWORD

## Circular FK Avoided
teamsTable.managerId is plain integer (no FK constraint) to avoid circular reference with usersTable.teamId.

## Frontend Route Pattern
Edit route: /diarias/:id/editar → DiariaForm component (same as /diarias/nova, uses useParams id)
