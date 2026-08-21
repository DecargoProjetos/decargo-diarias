---
name: Diarias OpenAPI coverage
description: Contract-first rule for generated client operations.
---

Every API endpoint used by the frontend must be represented in the OpenAPI specification before client generation. Do not preserve missing operations by manually editing generated code.

**Why:** Regeneration removes hand-maintained generated hooks that do not exist in the specification, which can make unrelated frontend screens fail to compile.

**How to apply:** Whenever changing an endpoint response or adding a route consumed by the web app, update the operation, request/response schemas, and error responses in OpenAPI; regenerate the client and typecheck all consumers.