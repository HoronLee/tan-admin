# Backend Development Guidelines

> Best practices for backend development in this project.

---

## Overview

This directory documents backend-role conventions extracted from real code paths in this TanStack Start repository.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | Filled |
| [Database Guidelines](./database-guidelines.md) | ORM patterns, queries, migrations, PolicyPlugin, BA `@@ignore` tables | Filled |
| [Error Handling](./error-handling.md) | Error types, handling strategies, `import.meta.env` gotcha | Filled |
| [Quality Guidelines](./quality-guidelines.md) | Code standards and forbidden patterns | Filled |
| [Logging Guidelines](./logging-guidelines.md) | Logging behavior and guardrails | Filled |

---

## Notes

- Backend routes are implemented via `server.handlers` in route files.
- oRPC, Prisma, Auth, and MCP concerns are documented with file-backed examples.
- Generated outputs remain read-only and must be regenerated via scripts.

---

**Language**: English.
