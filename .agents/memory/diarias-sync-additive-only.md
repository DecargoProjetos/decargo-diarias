---
name: Diarias People sync is additive-only
description: Why /users/sync and /providers/sync never update existing rows, only insert new ones.
---

Sync from DECARGO People (`POST /api/users/sync`, `POST /api/providers/sync`)
only inserts rows that don't already exist locally (matched by decargoId,
falling back to email for users). It never updates name/email/active on an
existing row.

**Why:** the previous version re-applied the remote-derived `active` value to
every existing row on each sync. That silently reverted any manual
deactivation done in the app, because the remote system still considered the
person "active" (contract/employment still open) even after an admin
deactivated them locally for unrelated reasons. It also did unnecessary
writes for people already on file.

**How to apply:** if a future request needs sync to reflect remote name
changes or remote-driven deactivation again, don't just re-add a blanket
update — preserve the local `active` flag specifically (never let sync flip
inactive→active), and get explicit confirmation this is what's wanted, since
it reintroduces the exact bug this design avoids.
