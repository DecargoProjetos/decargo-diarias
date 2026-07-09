---
name: Diarias Auth Design
description: DECARGO ID Handoff protocol — replaces OIDC, how the auth flow works end-to-end
---

## Auth Flow (DECARGO ID Handoff — NOT standard OIDC)
app.decargopeople.com.br does NOT expose /.well-known/openid-configuration (confirmed 404).
Authentication uses a custom JWT handoff protocol:

1. User logs into app.decargopeople.com.br (People portal)
2. User selects this app → People calls POST /api/central/handoff { app: "<APP_CODE>" }
3. People responds with { token, redirect_url } and browser navigates to `<redirect_url>#handoff=<TOKEN>`
4. Frontend HandoffGate (App.tsx) captures the #handoff= fragment on load
5. HandoffGate POSTs to /api/auth/handoff { token }
6. Backend verifies JWT (iss: "decargo-id", aud: APP_CODE, secret: DECARGO_ID_HANDOFF_SECRET)
7. Backend JIT-provisions user by email, returns local { access_token }
8. Frontend stores access_token in sessionStorage, configures setAuthTokenGetter
9. All API calls use Bearer <access_token> — no server-side sessions

## Token Details
- Handoff JWT: signed with DECARGO_ID_HANDOFF_SECRET (symmetric), TTL=90s, aud=APP_CODE, iss="decargo-id"
- Local JWT: signed with SESSION_SECRET, TTL=8h, iss="diarias-app"
- Token travels in URL fragment (#) — server never sees it, only JS

## Required Env Vars (consumer side)
- DECARGO_ID_HANDOFF_SECRET — same value as in People
- DECARGO_ID_APP_CODE — the app code People uses in signHandoffToken (e.g., "diarias")
- SESSION_SECRET — for local JWT signing

## Role Mapping (JIT provisioning for new users)
claims.papel → local role:
- "admin"/"administrador" → "admin"
- "gestor"/"manager" → "gestor"
- anything else → "prestador" (least privilege)
Existing users keep their locally-assigned role; only name is synced.

## Record-Level Access Control (prestador role)
getDiariaById must compare row.providerDecargoId (joined from providers.decargo_id) with me.decargoId.
If mismatch → return null → 404. The decargoId in local JWT = String(claims.id_usuario) from handoff.

## Logout
1. POST /api/auth/logout (stateless, returns 200)
2. Frontend: clearToken() removes from sessionStorage
3. Redirect to PEOPLE_PORTAL_URL (https://app.decargopeople.com.br)

## Armadilhas
- If HandoffGate fails, render error screen — NOT the app (would cause redirect loop)
- Token expires in 90s from People — if POST /handoff returns 401, user re-does login flow
- aud must match exactly what People uses — configure DECARGO_ID_APP_CODE to match
- DECARGO_ID_HANDOFF_SECRET must be identical in People and this app
