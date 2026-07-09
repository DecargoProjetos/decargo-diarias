---
name: Diarias SQL Pattern
description: How to write dynamic-filter queries safely in the api-server routes
---

## Rule
Use `pool.query(queryString, paramsArray)` for all dynamic-condition SQL in the api-server. Do NOT use `sql.raw(query, params)` — Drizzle's `sql.raw()` accepts only a raw string, params array is silently ignored, causing unparameterized queries.

**Why:** The original design used `sql.raw(query, params as never[])` which does not do parameter binding. This was caught in code review as a security/runtime defect on filtered endpoints.

**How to apply:** Import `pool` from `@workspace/db`. Build conditions array + params array with `$1..$N` placeholders, then call `pool.query(text, params)`. For simple non-dynamic queries, Drizzle query builder (`.select().from().where()`) remains the preferred approach.
