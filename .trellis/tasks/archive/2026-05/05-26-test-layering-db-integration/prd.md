# Split unit and database integration tests

## Goal

Make the default test command run deterministic unit/component tests without
requiring a live PostgreSQL database, while preserving real database coverage
for ZenStack policy behavior as an explicit integration test path.

## Requirements

- `pnpm test` must not fail simply because local PostgreSQL is not running.
- Unit tests must avoid importing modules whose top-level side effects connect
  to the database unless the test intentionally belongs to the integration
  layer.
- The `flipEmailVerifiedForAdminCreate` behavior remains covered as a unit test.
- The RBAC/ZenStack policy test remains available, but it must be clearly
  classified as database-backed integration coverage and not part of the default
  unit test command.
- Test commands must use `pnpm`; no npm/yarn scripts or lockfile changes.
- Generated files must not be edited.

## Acceptance Criteria

- [x] `pnpm test` passes without PostgreSQL listening on localhost.
- [x] A dedicated integration command exists for the real database policy test.
- [x] The RBAC policy test file naming or config makes its database dependency
      explicit.
- [x] The auth config unit test imports a pure helper path and does not trigger
      `src/lib/db.ts` module load.
- [x] Existing passing tests remain covered by the default unit test command.

## Notes

- Initial failure observed on 2026-05-26: `src/lib/auth/config.test.ts` and
  `src/orpc/middleware/rbac-policy.test.ts` failed during import with
  `ECONNREFUSED ::1:5432` / `127.0.0.1:5432`.
- `src/lib/db.ts` currently performs a top-level `await db.$connect()`. This
  task should not redesign application boot unless needed to satisfy the test
  layering goal.
- Validation: `pnpm check`, `pnpm test`, and `pnpm exec tsc --noEmit` pass after
  the split. The integration suite is intentionally left behind
  `pnpm test:integration` because it requires `.env.local` and a reachable
  PostgreSQL instance.
