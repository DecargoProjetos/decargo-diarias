---
name: Diarias db project references
description: How to rebuild shared packages after schema changes so TypeScript consumers see the new types
---

Both `artifacts/api-server` and `lib/api-client-react` use TypeScript project references, resolving `@workspace/db` and `@workspace/api-client-react` from their compiled `dist/` directories — NOT from source.

**After any schema change in `lib/db/src/schema/`:**
1. `cd lib/db && pnpm exec tsc -p tsconfig.json` — rebuilds dist/
2. Then `pnpm --filter @workspace/api-server exec tsc --noEmit` passes

**After any change to `lib/api-client-react/src/generated/api.ts`:**
1. `cd lib/api-client-react && pnpm exec tsc -p tsconfig.json`
2. Then `pnpm --filter @workspace/diarias exec tsc --noEmit -p .` passes

**Why:** Without rebuilding, tsc reads stale `.d.ts` from dist/ and reports "has no exported member" for newly added exports — the source change is invisible to consumers until the package is compiled.

**How to apply:** Always run the relevant `tsc -p tsconfig.json` after touching shared lib sources, before checking for type errors in the apps.
