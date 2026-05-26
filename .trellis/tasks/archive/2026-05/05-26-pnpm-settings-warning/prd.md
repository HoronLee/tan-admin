# Move pnpm settings out of package manifest

## Goal

Remove the pnpm v11 warning by moving deprecated `package.json#pnpm`
configuration to the supported project settings file and current build-script
approval setting.

## Requirements

- Preserve the existing allowlist intent from `pnpm.onlyBuiltDependencies`.
- Use pnpm v11's supported settings surface, not deprecated package manifest
  configuration.
- Verify the warning no longer appears for normal pnpm commands.
- Keep the change scoped to package-manager configuration and Trellis task
  metadata.

## Acceptance Criteria

- [x] `package.json` no longer has a top-level `pnpm` field.
- [x] `pnpm-workspace.yaml` contains the equivalent build-script approvals using
      `allowBuilds`.
- [x] `pnpm --version` no longer emits the ignored `package.json#pnpm` warning.
- [x] `pnpm check` still passes.

## Notes

- Current local pnpm: `11.3.0`.
- npm registry latest checked on 2026-05-26: `11.3.0`, published
  `2026-05-24T08:43:45.834Z`.
- pnpm v11.0.0 was published on 2026-04-28. Official pnpm 11 docs state project
  settings now live in `pnpm-workspace.yaml`, and the removed
  `onlyBuiltDependencies` family is replaced by `allowBuilds`.
- Validation: `pnpm --version`, `pnpm check`, and `pnpm test` pass without the
  ignored `package.json#pnpm` warning.
