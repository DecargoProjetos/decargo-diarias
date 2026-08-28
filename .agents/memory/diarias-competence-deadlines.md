---
name: Diarias competence deadlines
description: Non-obvious authorization and time rules for competence-based registration deadlines.
---

Competence deadline checks use timezone-aware instants presented and configured as `America/Sao_Paulo` wall time. Administrators bypass the gate, while dates with no matching configured period remain permitted for a safe incremental rollout. Exceptional releases are manager-specific and valid only inside their configured time window.

**Why:** Browser-local datetime conversion can silently shift operational deadlines, and making missing configuration restrictive would break existing launches during rollout.

**How to apply:** Enforce the gate on every server-side creation path, including spreadsheet confirmation. Resolve a provider's active record and team from the database; never trust a client-supplied team to establish manager scope.