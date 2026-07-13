---
name: Diarias People API real field names
description: Confirmed field names for active/inactive status on DECARGO People API records — funcionario has no "ativo" field.
---

- Funcionários (`/api/funcionarios`) have **no** `ativo` field. The real
  employment-status signal is `demitido` (boolean, true = terminated). A
  funcionário is active when `demitido === false`. Records for both active
  and terminated employees are returned by this endpoint — filtering must be
  done client-side, `todos=false` does not filter by demitido.
- Prestadores (`/api/prestadores?ativo=true`) already expose the field the
  app expects: `tem_contrato_ativo` (boolean) is the correct active-status
  field and was already being used correctly.
- No "objeto do contrato" field (Motorista/Ajudante/Transporte de
  Mercadorias classification) has been found in the `/api/prestadores`
  response yet — it may live on a different endpoint. Still unconfirmed as
  of 2026-07-13.
