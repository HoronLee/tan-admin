# Research: current-auth-setup

- **Query**: Map current Better Auth wiring; identify gaps vs PRD R5/R6/R7/R11/R12
- **Scope**: internal
- **Date**: 2026-04-22

## Files

| Path | Role |
|---|---|
| `src/lib/auth.ts` | Server BA config (betterAuth factory) |
| `src/lib/auth-client.ts` | Browser BA client (`createAuthClient`) |
| `src/lib/auth-session.ts` | `getSessionUser` helper exposing `{session,user,policyAuth,activeOrganizationId}` to oRPC / server fns |
| `src/lib/permissions.ts` | AC statements + `owner / adminRole / member` roles |
| `src/components/auth/sign-in.tsx` | Uses `@better-auth-ui/react` hooks (`useSignInEmail`, `useSendVerificationEmail`) |
| `src/components/auth/sign-up.tsx` | Uses `useSignUpEmail`; already branches on `emailAndPassword.requireEmailVerification` |
| `src/routes/auth/$path.tsx` | Single catch-all route that wires Better Auth UI views |
| `src/integrations/better-auth/` | Directory does **not exist** (only `tanstack-query/` under `src/integrations/`) |

## Current `auth.ts` (verbatim, `src/lib/auth.ts:10-70`)

```ts
export const auth = betterAuth({
  database: pool,
  emailAndPassword: { enabled: true },      // only `enabled` — no verification / reset
  databaseHooks: {
    session: {
      create: {
        before: async (session) => { /* auto-pick activeOrganizationId from member table */ },
      },
    },
  },
  plugins: [
    admin(),
    organization({
      ac,
      roles: { owner, admin: adminRole, member },
      teams: { enabled: true },             // teams is currently hardcoded ON
    }),
    multiSession(),
    tanstackStartCookies(),
  ],
  user: {
    additionalFields: {
      nickname: { type: "string", required: false },
      avatar:   { type: "string", required: false },
      status:   { type: "string", defaultValue: "ACTIVE" },
    },
  },
  logger: { /* forwards to pino via createModuleLogger("better-auth") */ },
});
```

## Current `auth-client.ts` (`src/lib/auth-client.ts:9-21`)

```ts
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_APP_URL ?? (typeof window !== "undefined" ? window.location.origin : undefined),
  plugins: [
    adminClient(),
    organizationClient({ ac, roles: { owner, admin: adminRole, member } }),
    multiSessionClient(),
  ],
});
```

No `inferOrgAdditionalFields`; no `teams.enabled` flag on client.

## How auth reaches oRPC / TanStack Start

- `src/lib/auth-session.ts:20` — `getSessionUser(request|headers)` calls `auth.api.getSession({ headers })`, extracts `role==="admin"` → `policyAuth.isAdmin`, plus `session.activeOrganizationId`.
- Server fns / oRPC middleware (`src/lib/server-fn-middleware.ts`) consumes `AuthSessionContext`.
- `src/routes/(admin)/_layout.tsx:26-43` — `requireAuth` server fn gates the admin tree.
- API catch-all: `src/routes/api.$.ts` mounts BA at `/api/auth/*`.

## Existing hooks

- **Only** `databaseHooks.session.create.before` to auto-select `activeOrganizationId` (raw SQL on `member`).
- **No** `organizationHooks` at all.
- **No** `databaseHooks.user.create.before / after`.
- **No** `sendVerificationEmail`, **no** `sendResetPassword`.

## Existing email hooks referenced by UI

- `src/components/auth/sign-in.tsx:70-89` — already wires `useSendVerificationEmail({ onSuccess: toast })` and re-sends if BA returns `EMAIL_NOT_VERIFIED`. Server side currently can't honour this because `emailAndPassword.requireEmailVerification` is not set.
- `src/components/auth/sign-up.tsx:102-116` — branches on `emailAndPassword.requireEmailVerification`, navigates to sign-in with `verifyYourEmail` toast.

## Gaps vs PRD

| PRD | Current | Delta |
|---|---|---|
| R5 EmailTransport + `sendEmail()` | Missing | Build `src/lib/email.ts`, `src/lib/email-transport.ts`, templates in `src/emails/` |
| R6 `emailAndPassword.requireEmailVerification` + `sendVerificationEmail` + `sendResetPassword` + `autoSignInAfterVerification` | Missing | Add to `emailAndPassword` block |
| R7/R8 `schema.organization.additionalFields` (plan/industry/billingEmail) | Missing | Extend `organization({ schema: { organization: { additionalFields } } })`; mirror on client via `inferOrgAdditionalFields` (`src/lib/auth-client.ts`) |
| R11 Transfer ownership via `organizationHooks.beforeAcceptInvitation` | No hooks | New `organizationHooks` block |
| R12 `cancelPendingInvitationsOnReInvite: true` | Not set | Pass in `organization({...})` |
| R2 `teams.enabled` gated by env `TEAM_ENABLED` | Hardcoded `true` | Replace with `env.TEAM_ENABLED` |
| Multi-owner guard (R11) in `updateMemberRole` / `removeMember` | Not enforced | Add `beforeUpdateMemberRole` / `beforeRemoveMember` hooks or validate in a wrapper |
| Database hook `user.create.after` for signUp auto-join (R4, single mode) | Absent | Add hook; branch on `env.TENANCY_MODE` |

## Notable constraints surfaced during research

- `src/lib/auth.ts:22-31` session hook already uses raw `pool.query` on `member` table — pattern to copy for `user.create.after` (raw SQL avoids FK timing issue documented in better-auth#6791 workaround).
- `roles` include `adminRole` imported as `admin: adminRole` (alias). Keep alignment when adding new role perms.
- Settings UI uses `@better-auth-ui/react` (`src/components/settings/settings.tsx`) — any new BA features must be exposed via this shell or via bespoke shadcn pages.
