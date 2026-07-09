---
name: Diarias Auth Design
description: OIDC auth flow and record-level access control rules
---

## Auth Flow
OIDC via DECARGO ID using openid-client@5. Login redirects to /api/auth/login which initiates PKCE flow. Callback at /api/auth/callback. Session stored in PostgreSQL via connect-pg-simple. Secrets: DECARGO_ID_CLIENT_ID, DECARGO_ID_CLIENT_SECRET, DECARGO_ID_ISSUER_URL, SESSION_SECRET.

## Record-Level Access Control (prestador role)
getDiariaById must compare `row.providerDecargoId` (joined from providers.decargo_id) with `me.decargoId` from session. If mismatch → return null → 404. Do NOT compare with userId (wrong identifier).

**Why:** Original code had an incomplete prestador check that never enforced the deny path — caught in code review as IDOR-style vulnerability.

## Role Hierarchy
- admin: full access, all financials visible
- gestor: filtered to their teamId, financials visible
- prestador: filtered to their decargoId, value field always returned null by API
