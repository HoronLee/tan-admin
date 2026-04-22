# Backend Development Guidelines

> Best practices for backend development in this project.

---

## Overview

This directory documents backend-role conventions extracted from real code paths in this TanStack Start repository.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization, file layout, dual-stack (oRPC + ZenStack) topology | Filled |
| [Database Guidelines](./database-guidelines.md) | ORM patterns, queries, migrations, PolicyPlugin, BA `@@ignore` tables | Filled |
| [Authorization Boundary](./authorization-boundary.md) | Better Auth × ZenStack 权限分层契约，业务表 policy 范式 | Filled |
| [Tenancy Modes](./tenancy-modes.md) | `TENANCY_MODE` / `TEAM_ENABLED` product-shape switches; signup auto-join hook | Filled |
| [Email Infrastructure](./email-infrastructure.md) | `EmailTransport` abstraction (console / smtp / resend), react-email templates, boot-time validation | Filled |
| [Error Handling](./error-handling.md) | Error types, ZenStack HTTP error contract, single-source mapping | Filled |
| [Quality Guidelines](./quality-guidelines.md) | Code standards and forbidden patterns | Filled |
| [Logging Guidelines](./logging-guidelines.md) | Logging behavior and guardrails | Filled |

---

## Notes

- Backend routes are implemented via `server.handlers` in route files.
- Two HTTP stacks coexist under `/api/**`: ZenStack Server Adapter (`/api/model/**`) for model CRUD, oRPC (`/api/rpc/**`) for business actions. Auth stays on Better Auth (`/api/auth/**`). See [Directory Structure § Dual-Stack Topology](./directory-structure.md#dual-stack-topology-orpc--zenstack).
- Error mapping between ZenStack `ORMError` and the 7 standard app codes lives at `src/lib/zenstack-error-map.ts`; both backend middleware and frontend reporter import the same function.
- Generated outputs remain read-only and must be regenerated via scripts.

---

**Language**: English.
