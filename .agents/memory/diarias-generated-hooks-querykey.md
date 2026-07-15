---
name: Diarias generated hooks queryKey requirement
description: tsc error when conditionally enabling a generated react-query hook without an explicit queryKey
---

When calling a generated hook from @workspace/api-client-react (useGetX/useListX) with `{ query: { enabled: someCondition } }`, TypeScript fails with TS2741 "Property 'queryKey' is missing" unless you also pass `queryKey: [...]`.

**Why:** The generated UseQueryOptions type requires queryKey whenever the query object is provided at all — it's not inferred from enabled alone. This is a known pre-existing gap in several pages (TeamsList.tsx, UsersList.tsx, PeopleList.tsx) that never got queryKey added, so `tsc --noEmit` fails there today (tracked as a separate tech-debt follow-up).

**How to apply:** Whenever adding `query.enabled` to a generated hook call, always pair it with an explicit `queryKey: ['someUniqueName', ...anyVarsTheQueryDependsOn]` in the same object, matching the pattern already used correctly in most pages (e.g. `useListTeams({ query: { enabled: ..., queryKey: ['listTeams'] } })`).
