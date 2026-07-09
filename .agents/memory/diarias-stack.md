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

## Circular FK Avoided
teamsTable.managerId is plain integer (no FK constraint) to avoid circular reference with usersTable.teamId.

## Frontend Route Pattern
Edit route: /diarias/:id/editar → DiariaForm component (same as /diarias/nova, uses useParams id)
