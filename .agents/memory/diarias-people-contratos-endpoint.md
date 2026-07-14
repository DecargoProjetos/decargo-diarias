---
name: Diarias People Contratos endpoint
description: Why /api/prestadores/contratos-prestacao (the "objeto do contrato" field) is not reachable from the api-server sync, even with valid admin credentials.
---

The People web app's "Contratos" screen calls `/api/prestadores/contratos-prestacao`
(and a related `/api/prestadores/objeto-contratual` lookup) successfully when logged
in through the browser. The api-server's sync service account uses the exact same
underlying login (`admin`, via `PEOPLE_SERVICE_LOGIN`/`PEOPLE_SERVICE_PASSWORD` on
Railway) but authenticates through `POST /api/auth/login` + Bearer JWT — and that
same path returns a generic "id must be a number" 400 (Express matched it against a
`/api/prestadores/:id` route), as if the static route doesn't exist at all.

**Why:** since both access paths use the same admin account, this isn't a permissions
gap — it strongly suggests `contratos-prestacao` is a BFF/session-only route on the
People frontend, not part of the token-authenticated public API surface the sync
integration uses. `/api/funcionarios`, `/api/prestadores`, `/api/prestadores/:id`, and
`/api/auth/login` all work fine via JWT; contract data apparently doesn't.

**How to apply:** don't re-attempt fetching "objeto do contrato" (Motorista/Ajudante/
Transporte de Mercadorias) via JWT-authenticated calls to that path — it's a dead end
without changes on the People side (e.g. a real public API endpoint for contracts).
If this becomes needed again, the practical options are (a) ask DECARGO People's devs
to expose a token-accessible contracts endpoint, or (b) capture that field manually in
Diárias instead of syncing it. User deferred this (2026-07-14) — not urgent for now.
