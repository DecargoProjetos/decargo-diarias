---
name: Diarias People sync — root causes found
description: Two real bugs behind the People sync failures in production (Railway), beyond the webhook/deploy issues already documented elsewhere.
---

## Bug 1: synchronous crash before try/catch, no logs, generic 500

`providers/sync` read `req.body.force` directly. The frontend's generated
sync mutation sends no request body and no `Content-Type` header, so
`express.json()` never populates `req.body` — it stays `undefined`. Accessing
`.force` on `undefined` threw synchronously, before the route's own
`req.log.info(...)` line and before its try/catch, so nothing about the
route ever appeared in logs — not even the request completion — and the
global error handler returned a masked generic 500 in ~9ms.

**Why this was hard to find:** the sibling route `users/sync` is structurally
almost identical and works, because it never reads `req.body` at all. Deploy
freshness, routing, middleware, and CORS were all correctly ruled out first;
the actual differentiator was one unguarded property access specific to this
one route.

**How to apply:** never read `req.body.<field>` without a null/undefined
guard (`(req.body as T | undefined)?.field`) on routes that may receive a
body-less POST — check what the actual client call sends (body + headers)
before assuming Express populated `req.body`.

## Bug 2: People API login token silently `undefined`

`peopleClient.ts`'s `login()` blindly trusted `data.token` from the People
API's `/api/auth/login` response. If the real field name differs, that's
`undefined`, producing `Authorization: Bearer undefined` on every subsequent
call — which the API rejects with the exact same "Token inválido ou
expirado" 401 you'd see from genuinely bad credentials, making the two
indistinguishable from the outside.

**Why:** the same client also had to reverse-engineer the *login request*
field names by trial (`username`/`password`, not `login`/`senha` — zod
validation gave no useful hint either). The response shape needed the same
scrutiny but hadn't gotten it.

**How to apply:** when integrating with an API whose docs/contract are
unreliable or unavailable, validate the exact fields you depend on (request
and response) rather than trusting an assumed shape — throw with the actual
keys present so a shape mismatch is diagnosable from logs alone, instead of
surfacing as a generic auth failure.
