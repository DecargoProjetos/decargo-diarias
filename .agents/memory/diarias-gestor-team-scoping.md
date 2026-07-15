---
name: Diarias gestor team scoping
description: Why a gestor's provider/dashboard/diaria lists can appear empty even when the team has members and a manager assigned.
---

Every authorization scope check for a `gestor` (providers list, dashboard,
diarias, reports) reads `req.currentUser.teamId` — i.e. the `teamId` column
on the gestor's own row in `users`. This is a *different* field from
`teams.managerId`, which only records who is displayed as "Gestor" on the
Equipes page.

**Why:** the two fields were added for different purposes (team roster
display vs. per-request auth scoping) and nothing keeps them in sync
automatically. An admin can fully set up a team, assign a manager via
Equipes, and populate the team with providers, and the gestor will still see
empty lists everywhere because their own `users.teamId` was never set — the
Usuários admin screen originally had no field to set it at all.

**How to apply:** if a gestor reports empty providers/diarias/dashboard data
despite their team clearly having members, check/set the "Equipe" selector
on the Usuários page for that gestor's own user record (backend already
supported `teamId` on `PATCH /api/users/:id`; the selector was added to the
UI). Don't assume `teams.managerId` implies `users.teamId` is set.
