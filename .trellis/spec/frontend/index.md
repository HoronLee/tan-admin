# Frontend Development Guidelines

> Best practices for frontend development in this project.

---

## Overview

This directory documents the current frontend conventions based on real source files.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | Filled |
| [Component Guidelines](./component-guidelines.md) | Component patterns, props, composition | Filled |
| [Hook Guidelines](./hook-guidelines.md) | Custom hooks, ZenStack CRUD hooks vs oRPC actions, data access patterns | Filled |
| [Layout Guidelines](./layout-guidelines.md) | Admin route group `(admin)/`, shadcn sidebar shell (L1), Dialog vs AlertDialog | Filled |
| [Theming](./theming.md) | shadcn style schema (`radix-vega`), baseColor, ThemeProvider contract, AuthProvider appearance bridge, `shadcn apply` workflow | Filled |
| [i18n](./i18n.md) | Paraglide message catalog, menu-title dynamic resolution, BA error translation | Filled |
| [State Management](./state-management.md) | Local state, server cache, global store | Filled |
| [Quality Guidelines](./quality-guidelines.md) | Code standards and forbidden patterns | Filled |
| [Type Safety](./type-safety.md) | Type patterns and runtime validation | Filled |

---

## Notes

- Generated artifacts mentioned in these guides are read-only (`routeTree.gen.ts`, `src/generated/prisma/*`, `src/paraglide/*`).
- Route files can mix frontend and backend roles; each guide classifies patterns by runtime role.
- All examples in this directory are file-backed and based on current repository state.

---

**Language**: English.
