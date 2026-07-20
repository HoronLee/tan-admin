# Implementation Plan

## Preconditions

- Task status is `in_progress`; planning has been reviewed and `task.py start` has been run.
- Before edits, load relevant specs through `trellis-before-dev`.
- Do not touch generated files by hand:
  - `src/routeTree.gen.ts`
  - `src/paraglide/**`
  - `zenstack/{schema,models,input}.ts`
  - `zenstack/_better-auth.zmodel`

## Phase 1: Planning and Spec Alignment

- [x] Create Trellis task.
- [x] Record current state and evidence in `prd.md`.
- [x] Record layer design in `design.md`.
- [x] Record implementation order in this file.
- [x] Load backend/frontend/guides specs before implementation.
- [x] Record Context7/codegraph research in `research/online-best-practices.md`.
- [x] Update stale spec references:
  - `.inputValidator(...)` -> `.validator(...)`.
  - clarify `src/queries/` cannot call React hooks.
  - clarify ZenStack CRUD vs oRPC business action boundary.

## Phase 2: Low-Risk Query Boundary Slice

- [x] Add `src/queries/organizations-admin.ts`.
- [x] Export list query factory using `orpc.organizationsAdmin.list.queryOptions({ input: {} })`.
- [x] Update `src/routes/site/_layout/organizations/index.tsx`.
- [x] Update `src/routes/site/_layout/users/-components/add-to-organization-drawer.tsx`.
- [x] Use official oRPC key helpers for invalidation.
- [x] Run `pnpm check` and `pnpm exec tsc --noEmit`.

## Phase 3: Menu Policy/Auth Context Slice

- [x] Decide final menu write semantics before code:
  - recommended: site-admin can edit global menus; active org owner can edit org-scoped menus.
- [x] Update `Auth` type in `zenstack/schema.zmodel`.
- [x] Update `src/lib/auth/session.ts` to include active org role or `isOrgOwner`.
- [x] Update `src/orpc/middleware/auth.ts` and `src/routes/api/model/$.ts` if needed.
- [x] Update `Menu` policy.
- [x] Add or update focused tests for policy behavior.
- [x] Regenerate ZenStack artifacts if required by the toolchain.

## Phase 4: Menu CRUD Migration Slice

- [x] Update menu management page to use `useZenStackQueries().menu.*` hooks for CRUD.
- [x] Keep `getUserMenus` in oRPC for sidebar filtering.
- [x] Invalidate `orpc.getUserMenus.key()` after menu mutations.
- [x] Remove unused oRPC menu CRUD procedures and router exports once callers are gone.
- [x] Run check/test/tsc/build.

## Phase 5: Import Boundary Slice

- [x] Add a targeted check for client build logger leakage.
- [x] If logger is still parsed in client build, split server function wrappers from server-only helpers or add stricter server-only entrypoints.
- [x] Re-run `pnpm build` and confirm no `node:module` logger warning remains.

## Phase 6: Route/View Separation Slice

- [x] Extract organization creation trigger to `src/routes/site/_layout/organizations/-components/create-organization-button.tsx`.
- [x] Extract organization creation drawer/form to `src/routes/site/_layout/organizations/-components/create-organization-drawer.tsx`.
- [x] Extract organization member drawer/form to `src/routes/site/_layout/organizations/-components/add-organization-member-drawer.tsx`.
- [x] Keep `src/routes/site/_layout/organizations/index.tsx` focused on route gate, query loading, table composition, and dissolve action.
- [x] Run check/test/tsc/build after route-private component extraction.

## Validation Commands

```bash
rtk pnpm check
rtk pnpm test
rtk pnpm exec tsc --noEmit
rtk pnpm exec dotenv -e .env.local -- vitest run src/orpc/middleware/rbac-policy.integration.test.ts
rtk pnpm build
```

Optional when zmodel/auth shadow changes:

```bash
rtk pnpm ba:shadow
rtk pnpm db:generate
```

## Review Gate

Planning is ready for review when:

- `prd.md`, `design.md`, and `implement.md` are complete.
- Remaining product decision is explicit: menu write ownership.
- First implementation slice can be executed independently.

Implementation starts only after review/approval and `task.py start`.
