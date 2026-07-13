---
name: Diarias user/provider hard-delete FK constraint
description: Why DELETE on users/providers can fail with a DB error and how it's surfaced
---

`diarias.created_by` (users) and `diarias.provider_id` (providers) have no `ON DELETE` rule (Postgres default RESTRICT) — unlike `approved_by`/`exported_by`/`cancelled_by`/`manager_id` which are `SET NULL`.

**Why:** a user/provider that has ever created or been linked to a diária cannot be hard-deleted; the DB throws an FK violation.

**How to apply:** `DELETE /api/users/:id` and `DELETE /api/providers/:id` wrap the delete in try/catch and return 409 with a message pointing to deactivating (PATCH active:false) instead of excluding, rather than letting it bubble as a generic 500.
