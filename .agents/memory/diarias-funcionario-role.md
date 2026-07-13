---
name: Diarias "funcionario" role treatment
description: How the funcionario role is scoped relative to prestador/gestor/admin across diárias, dashboard, reports
---

`funcionario` was added as a 4th role (alongside admin/gestor/prestador) with no DB enum — it's free-text, validated only in the API layer.

Decision: everywhere the backend/frontend special-cased `role === "prestador"` for scoping (diárias list/detail, dashboard summary/by-provider/recent-activity, reports) or hiding financial values, `funcionario` was folded into the same bucket (`role !== "admin" && role !== "gestor"` instead of `=== "prestador"`).

**Why:** funcionario has no linked `providers` record (no `decargo_id` match), so provider-scoped SQL filters naturally return empty results for them — safe by construction, not a special case that needs new business rules. Reports page still hard-denies prestador+funcionario entirely (gestor/admin only).

**How to apply:** if a new role-gated feature is added, treat `funcionario` as equivalent to `prestador` (least-privileged, no financials, provider-scoped queries yield nothing) unless the user specifies different semantics.
