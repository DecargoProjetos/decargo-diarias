---
name: Diarias permanent deletion
description: Product decision governing permanent removal of daily-rate records.
---

Administrators may permanently delete a diária provided it has not been exported to DECARGO People, is not marked as paid, and is not reserved for an in-progress People export. The deletion must have an explicit irreversible-action confirmation and leave an audit trace.

**Why:** The product owner explicitly selected permanent deletion to remove incorrect operational entries, while exported, paid, or export-reserved records must remain locally available for financial reconciliation with DECARGO People.

**How to apply:** Keep this restriction in server-side authorization and in every administrator-facing delete control. Export must atomically reserve records before calling DECARGO People, and deletion must atomically reject a reserved record. Do not offer recovery or bulk deletion unless the product owner requests it separately.