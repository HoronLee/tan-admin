# Upgrade all components implementation plan

## Pre-flight

- [x] Confirm current task is `.trellis/tasks/06-09-upgrade-all-components`.
- [x] Confirm working tree is clean or only contains this task's planning artifacts.
- [x] Record current versions:
  - `rtk pnpm --version`
  - `rtk pnpm outdated --format json`
  - `rtk pnpm peers check`

## Dependency update

- [x] Run `rtk pnpm up --latest`.
- [x] Inspect `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml` diffs.
- [x] Run `rtk pnpm install` if pnpm reports lockfile or build-approval follow-up work.
- [x] Run `rtk pnpm outdated --format json` and classify remaining entries:
  - `@react-email/components` may remain because it is a `@better-auth-ui/react` peer dependency
  - any packages blocked by peer dependency or registry constraints

## React Email deprecated package handling

- [x] After upgrading `@better-auth-ui/react`, verify its peer dependencies with `rtk pnpm why @react-email/components` or npm metadata.
- [x] Keep direct `@react-email/components` if `@better-auth-ui/react` still declares it as a peer dependency.
- [x] Upgrade `@react-email/render` and `react-email` normally.
- [x] Do not refresh or overwrite `src/components/email/*` registry templates for this deprecation handling.
- [x] Final summary must explain any remaining `@react-email/components` deprecation as an upstream BA UI peer dependency constraint.

## Generated artifacts

- [x] Before running BA shadow generation, record the CLI/runtime situation:
  - `rtk proxy npm view @better-auth/cli version dist-tags --json`
  - `rtk proxy npm view better-auth version dist-tags --json`
- [x] Replace implicit `npx @better-auth/cli@latest` usage with an explicit newest stable CLI version if validation confirms it is the right target, currently `@better-auth/cli@1.4.22` / `release-1.4`.
- [x] Because Better Auth packages are included, run `rtk pnpm ba:shadow`.
- [x] If `ba:shadow` fails because `src/lib/auth/config.ts` imports runtime DB code, either:
  - start the local Postgres dependency and rerun, or
  - refactor the auth config/codegen import boundary so CLI metadata generation does not require eager DB connectivity
- [x] If `ba:shadow` fails because `@better-auth/cli` cannot generate schema compatible with upgraded `better-auth`, document the CLI/runtime version blocker before continuing.
- [x] Because ZenStack / Prisma packages are included, run `rtk pnpm db:generate`.
- [x] Inspect generated diffs:
  - `zenstack/_better-auth.zmodel`
  - `zenstack/schema.ts`
  - `zenstack/models.ts`
  - `zenstack/input.ts`
- [x] Do not run `db:push`, `db:migrate`, or `auth:migrate` unless validation shows a concrete schema application requirement.

## shadcn/ui primitives

- [x] Preview upstream component differences:
  - `rtk pnpm exec shadcn info`
  - `rtk pnpm exec shadcn add alert-dialog avatar badge breadcrumb button card checkbox collapsible command dialog dropdown-menu field form input-group input label popover radio-group select separator sheet sidebar skeleton slider sonner spinner switch table tabs textarea tooltip --dry-run`
- [x] Apply shadcn/ui primitive updates after preview:
  - `rtk pnpm exec shadcn add alert-dialog avatar badge breadcrumb button card checkbox collapsible command dialog dropdown-menu field form input-group input label popover radio-group select separator sheet sidebar skeleton slider sonner spinner switch table tabs textarea tooltip --overwrite`
- [x] Do not use `shadcn add --all --overwrite`; current dry-run adds uninstalled components and dependencies.
- [x] Inspect changed paths and confirm `src/components/email/*` is unchanged and no uninstalled primitive was added.
- [x] Repair project-specific imports or class composition issues if the registry output needs it.

## Better Auth UI app registries

- [x] Inspect registry updates without writing to the real tree:
  - `rtk pnpm exec shadcn view https://better-auth-ui.com/r/auth.json`
  - `rtk pnpm exec shadcn view https://better-auth-ui.com/r/settings.json`
  - `rtk pnpm exec shadcn view https://better-auth-ui.com/r/user-button.json`
- [x] Do not apply the three app registries directly with overwrite. Current dry-runs target `src/@components/auth/*` and introduce `@base-ui/react`.
- [x] Use a disposable staging directory or `shadcn view` output to compare upstream files against existing local files.
- [x] Port only compatible upstream changes into existing `src/components/{auth,settings,user}/*` paths.
- [x] Skip BA UI app source-copy refresh if the upstream changes require Base UI migration.
- [x] Do not run any `*-email.json` registry refresh unless a validation failure requires it.
- [x] Inspect and repair:
  - imports using `#/*`
  - localization factories
  - `AuthProvider` theme appearance bridge
  - references to local shadcn primitives

## Validation and fixes

- [x] Run `rtk pnpm check`.
- [x] Run `rtk pnpm test`.
- [x] Run `rtk pnpm exec tsc --noEmit`.
- [x] Run `rtk pnpm build`.
- [x] Run `rtk pnpm peers check`.
- [x] Fix upgrade-caused breakages in the responsible owner files.
- [x] Repeat failing validation commands until all required checks pass or a concrete blocker is documented.

## Review gate before completion

- [x] Confirm `src/components/email/*` is unchanged or document why it had to change.
- [x] Confirm generated artifacts were produced by scripts.
- [x] Summarize remaining `pnpm outdated` / deprecated entries.
- [x] Run `rtk git status --short`.
- [x] Prepare final summary with changed files and validation results.
