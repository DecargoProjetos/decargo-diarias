---
name: Diarias tipo export routing
description: How diaria_types.export_target drives which People API endpoint receives the export payload
---

The `diaria_types` table has an `export_target` enum (`diaria_extra` | `falta`).

**diaria_extra** → `POST /api/integration/diarias` (existing endpoint, uses `id_prestador`)
**falta** → `POST /api/integration/descontos` (new, uses CNPJ + calculated `data_desconto`)

**Discount date rule (faltas):**
- workDate day ≤ 15 → 15th of next month
- workDate day > 15 → last day of next month (handles Feb/leap year via `new Date(year, nextMonth, 0).getDate()`)

**TODO:** The `/api/integration/descontos` endpoint path and exact field names (`cnpj`, `tipo`, `valor`, `data_desconto`) must be verified with the DECARGO People team before going live with falta exports.

**Why:** Falta records reduce payroll (descontos) while diária_extra records add payment — they go to different sections of Folha Mensal and need separate API calls.

**How to apply:** When adding new diaria types in Configurações, the admin selects which export destination applies. Old diárias without a typeId will fail export validation ("Tipo de diária não definido").
