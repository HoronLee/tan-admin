# Upgrade all components design

## Objective

Bring the project dependency and source-copy component stack up to date while preserving the existing TanStack Start, Better Auth, ZenStack, shadcn/ui, and email-template contracts.

## Upgrade surfaces

Included:

- `package.json` / `pnpm-lock.yaml` dependency and devDependency versions.
- shadcn/ui primitives under `src/components/ui/*`.
- Better Auth UI application registry copies under:
  - `src/components/auth/*`
  - `src/components/settings/*`
  - `src/components/user/*`
  only after a staging diff proves the current upstream registry still maps cleanly onto this repo.
- Generated artifacts that are normally produced by project scripts when upgraded packages require them.

Excluded by default:

- Better Auth UI email registry copies under `src/components/email/*`.
- Project-owned email templates under `src/emails/*`.
- shadcn primitives that are not currently installed.
- Database mutations such as `pnpm db:push` or `pnpm auth:migrate`.

The email files are refreshed only if validation fails in a way that proves the dependency upgrade requires syncing them.

Email import maintenance is not required for this upgrade. The template source content stays unchanged unless validation proves otherwise.

## Batch strategy

### 1. Dependency update batch

Run the npm package update through pnpm, then inspect the manifest and lockfile diff.

Expected high-risk groups:

- Better Auth and `@better-auth/*`: may change auth option types, plugin schema, or generated BA table shape.
- ZenStack and Prisma: may change generated ORM output, policy behavior, or generated type signatures.
- TanStack Start / Router / Query / Form: may change route generation, SSR integration, loaders, or query utilities.
- Vite / React / React Compiler / TypeScript: may expose stricter compile behavior.
- shadcn / Tailwind / Radix / lucide: may change primitive component code and CSS token usage.
- React Email: `@react-email/components` is deprecated and has no newer `latest`, but `@better-auth-ui/react` still declares it as a peer dependency. Keep it while BA UI requires it and document the upstream constraint.

### 2. shadcn/ui source-copy batch

Use the local shadcn CLI after dependency update:

- preview updates with `diff`, `--dry-run`, and file-level `--diff`
- apply shadcn/ui primitive updates only for components reported under `shadcn info` → Installed Components
- verify that `src/components/email/*` is not changed by this batch

The project stays on `components.json#style = "radix-vega"` and keeps `shadcn` in runtime dependencies because `src/styles.css` imports `shadcn/tailwind.css`.

Do not use `shadcn add --all --overwrite` for this task. Current dry-run shows it creates new primitives and dependencies instead of only refreshing installed files.

Do not use `pnpm dlx shadcn@latest` as the primary execution path. It currently fails in this repo's environment before command execution due to a temporary dependency-resolution issue around `@modelcontextprotocol/sdk` and `zod/v3`. Use the project-local `pnpm exec shadcn` after `shadcn` itself is upgraded.

### 3. Better Auth UI source-copy batch

Assess only the application registries that map to current app UI:

- `https://better-auth-ui.com/r/auth.json`
- `https://better-auth-ui.com/r/settings.json`
- `https://better-auth-ui.com/r/user-button.json`

Do not refresh `*-email.json` registries unless validation requires it.

Current dry-run findings make direct overwrite unsafe:

- files are targeted at `src/@components/auth/*`, not the existing `src/components/{auth,settings,user}/*`
- registries introduce `@base-ui/react`, while the project is explicitly locked to `radix-vega`
- registries also overwrite shadcn primitives as side effects

Therefore BA UI app registry refresh is a staged-diff activity, not a direct command:

- use `shadcn view <registry-url>` or a disposable staging directory to inspect upstream files
- compare upstream source with existing local files
- manually port only compatible changes into existing repo paths
- skip the registry refresh if the upstream registry has crossed into Base UI semantics

- `#/*` alias imports
- Paraglide localization factories
- auth client wiring
- theme bridge through `AuthProvider appearance`

### 4. Generated artifact batch

When Better Auth, ZenStack, Prisma, or TanStack packages change, regenerate through project scripts instead of hand-editing generated files.

Default regeneration and checks:

- `pnpm ba:shadow` after Better Auth package changes
- `pnpm db:generate` after ZenStack / Prisma package changes or BA shadow changes
- route tree generation through normal Vite/TanStack tooling during `pnpm build`

Current Better Auth shadow generation has two known risks:

- `pnpm ba:shadow` reaches runtime DB code because `authConfig` imports `pool` from `src/lib/db.ts`; `db.ts` verifies connectivity at module load. Without PostgreSQL running, codegen fails before writing `_better-auth.zmodel`.
- `ba:shadow` invokes `npx @better-auth/cli@latest`, but current npm tags put `@better-auth/cli@latest` on 1.4.x while runtime Better Auth is moving through 1.6.x.
- The CLI upgrade target must be explicit: use the newest available stable CLI line (`@better-auth/cli@1.4.22` / `release-1.4` at planning time), then validate the generated shadow against the upgraded Better Auth runtime. Do not rely on implicit `latest`.

Implementation must handle this explicitly. Acceptable outcomes:

- start local Postgres and prove the existing codegen path works with the upgraded stack, while documenting CLI/runtime version skew
- or refactor the codegen import path so BA metadata generation can load shared config without eager runtime DB connection
- or stop the task with a documented blocker if Better Auth 1.6 runtime cannot be paired safely with the available CLI

Database mutation commands are held back from the default plan:

- `pnpm db:push`
- `pnpm db:migrate`
- `pnpm auth:migrate`

Those commands are only used if a concrete schema diff or runtime requirement appears during validation.

### 5. React Email deprecation handling

The repository currently uses:

- `@react-email/components` for JSX email building blocks
- `@react-email/render` for `render` and `toPlainText`
- `react-email` as a devDependency for the local preview CLI

React Email v6 exports both components and render utilities from `react-email`. The implementation should:

- not remove `@react-email/components` while `@better-auth-ui/react` declares it as a peer dependency
- keep the direct dependency if pnpm would otherwise report an unmet peer for `@better-auth-ui/react`
- consider moving imports to `react-email` in a separate email-stack cleanup only when BA UI no longer requires the old peer or the project intentionally accepts a peer override
- continue upgrading `@react-email/render` and `react-email` normally

This is not a registry-template refresh. It is a dependency-owner classification.

## Compatibility contracts

- Package manager remains pnpm only.
- Imports continue to use `#/*` from `package.json#imports`.
- Generated files are changed only by generators.
- `src/components/ui/*` remains the primitive UI tier.
- BA email templates remain stable unless forced by validation.
- BA email template contents remain stable.
- `VITE_*` env conventions and server-only secret boundaries are unchanged.
- Sentry preload wiring in dev/start scripts remains intact.

## Validation design

Required checks:

- `rtk pnpm check`
- `rtk pnpm test`
- `rtk pnpm exec tsc --noEmit`
- `rtk pnpm build`
- `rtk pnpm peers check`
- `rtk pnpm outdated --format json` after the update, to confirm remaining items are explainable

Generated artifact checks:

- inspect `git diff zenstack/_better-auth.zmodel`
- inspect `git diff zenstack/schema.ts zenstack/models.ts zenstack/input.ts`
- inspect `git diff src/routeTree.gen.ts`

Manual diff checks:

- verify `src/components/email/*` stayed unchanged unless explicitly refreshed
- verify shadcn/BA UI registry refreshes did not overwrite project-owned composition code unexpectedly

## Rollback points

- After dependency update, before source-copy component refresh.
- After shadcn/ui refresh, before Better Auth UI registry refresh.
- After generated artifacts, before broad validation fixes.

Each rollback point is a git diff boundary, not a commit boundary. The working tree starts clean, so unintended changes can be inspected precisely.
