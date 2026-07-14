---
name: Diarias Railway schema drift from drizzle-kit push
description: Why production (Railway) can silently miss schema columns that exist in code and dev, causing 500s on affected tables.
---

The api-server's Railway build ran `drizzle-kit push` (no `--force`) as part of
`buildCommand`. In a non-interactive CI shell, `drizzle-kit push` can skip
applying a pending column/statement that it would normally ask to confirm,
without failing the build (exit code stays 0). Result: the column exists in
the Drizzle schema and works fine in dev, but is missing in the production
DB — every query touching it (even a plain SELECT) fails with a Postgres
"column does not exist" error, surfaced to the client as a generic 500.

**Why:** `--force` = "Auto-approve all data loss statements" per
`drizzle-kit push --help`. Without it, ambiguous/data-loss-risk statements
have no way to get a "yes" in CI, so they're silently dropped instead of
applied.

**How to apply:** `lib/db/package.json` has both a `push` and a `push-force`
script (`drizzle-kit push --force`). If a "column does not exist" / 500 bug
ever appears only in production and not in dev, suspect schema drift first —
check whether a schema column was added recently (`git log` on the relevant
`lib/db/src/schema/*.ts` file).

**Railway ignores `railway.json` for this service.** The api-server's
Railway service has a Custom Start Command set directly in the dashboard
(Settings → Deploy), which takes priority over both `build.buildCommand`
and `deploy.startCommand` in the repo's `railway.json` — edits to that file
silently have no effect (confirmed via Deploy Logs: container went straight
to `node ./dist/index.mjs`, no schema step ran, despite railway.json saying
otherwise). The fix that actually works: edit the **dashboard's Custom Start
Command** directly to
`pnpm --filter @workspace/db run push-force && pnpm --filter @workspace/api-server run start`.
Don't trust a `railway.json` edit alone for this service — verify with a
fresh Deploy Log after redeploying.
