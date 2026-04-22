# Research: current-org-ui

- **Query**: State of organization-related UI vs PRD R7 / R9 / R10
- **Scope**: internal
- **Date**: 2026-04-22

## Routes present

```
src/routes/(admin)/_layout/
├── dashboard.tsx
├── invitations/index.tsx          ← user-facing "my pending invites"
├── menus/index.tsx
├── organization/index.tsx         ← current org page (members + invites + edit name/slug)
├── settings/$path.tsx              ← BA-UI settings wrapper (account / security only)
└── users/index.tsx
```

There is **no** `settings/organization/` route, **no** `teams/` route, **no** `organizations/` route, **no** `tenants/` route.

Note: git status shows untracked `src/routes/(admin)/tenants/` and `src/routes/(admin)/users/` at the top level (outside `_layout/`). The tenants dir exists but is not under `_layout/`, so it won't render in the admin shell. PRD R10 explicitly renames the concept to `/organizations` — the `tenants/` placeholder should be deleted or repurposed.

## `organization/index.tsx` — current capabilities

Source: `src/routes/(admin)/_layout/organization/index.tsx:58-537`.

Sections:

1. **`OrgInfoSection`** (`:92-167`) — card showing name + slug; "Edit" opens `FormDrawer` with only `name` and `slug` inputs. Uses `authClient.organization.update({ organizationId, data: { name, slug } })`. No logo, no plan/industry/billingEmail.
2. **`MembersSection`** (`:169-450`) — table of members (user / role / joined / actions). Actions dropdown: "Change role" + "Remove". Invite form (email + role: `owner | admin | member`). Uses `authClient.organization.{listMembers,inviteMember,removeMember,updateMemberRole}`.
3. **`PendingInvitationsSection`** (`:452-537`) — table of `pending` invitations with "Cancel" action. No distinction between owner-invitations (transfer ownership) and regular invites.

**All labels are English** (`"Edit"`, `"Invite member"`, `"Members"`, `"Remove"`). No i18n.

## Switcher & header

`src/components/layout/OrganizationSwitcher.tsx` (all labels English):

- Uses `authClient.useListOrganizations()` + `authClient.useActiveOrganization()`.
- `setActive({ organizationId })` on click.
- "New organization" menu item is `disabled` with a "soon" badge (`:83-87`). PRD R1: in `multi` mode this must become enabled + wire to `createOrganization` modal; in `single` mode must stay hidden.

`src/routes/(admin)/_layout.tsx:83-87` places `OrganizationSwitcher`, `ThemeToggle`, and `UserButton` in the admin header.

`UserButton` source: `src/components/user/user-button.tsx` (uses `@better-auth-ui/react`). PRD doesn't require changes unless i18n migration extends to its labels (it doesn't own org/tenant concepts).

## Settings shell

`src/routes/(admin)/_layout/settings/$path.tsx:5-12`:

```ts
beforeLoad: ({ params: { path } }) => {
  if (!Object.values(viewPaths.settings).includes(path)) throw notFound();
}
```

`viewPaths.settings` comes from `@better-auth-ui/react/core`. The shell (`src/components/settings/settings.tsx`) only renders **account** and **security** tabs. No "organization" tab exists.

PRD R7 wants `/settings/organization` — two options:
- Create a *separate* file-route `src/routes/(admin)/_layout/settings/organization/index.tsx` that bypasses the BA-UI shell (recommended — easier to expose bespoke fields).
- Or extend `Settings` component with a third tab (requires mapping against `viewPaths.settings.organization` which BA-UI does define).

## Gaps vs PRD

### R7 Organization settings deepening
- **Logo upload** — no upload widget anywhere; `organization` table's `logo` column is unused. Need `<input type="file">` + `browser-image-compression` (see `email-libs-usage.md`) + `FileReader.readAsDataURL()`. Data-url string assigned via `authClient.organization.update({ data: { logo } })`.
- **Business profile fields** (`plan`, `industry`, `billingEmail`) — require `additionalFields` in `auth.ts` first, then surface in the edit form.
- **Dissolve organization** — no delete button. Add `authClient.organization.delete({ organizationId })` call gated by ConfirmDialog that requires typing the slug. `ConfirmDialog` already supports a "type to confirm" pattern (see `src/components/confirm-dialog.tsx:70-74`).
- **Transfer ownership** — no UI. Needs row-level "Transfer ownership" button on `MembersSection` (visible only when current user is owner). Flow: `inviteMember({ email: targetMember.user.email, role: "owner" })`. Pending-invitations list must visually distinguish `role: "owner"` invites.

### R9 Teams UI
- **No `/teams` route.** Need new file `src/routes/(admin)/_layout/teams/index.tsx` with CRUD against `authClient.organization.{createTeam,listTeams,updateTeam,removeTeam,addTeamMember,removeTeamMember,listTeamMembers}`.
- **Sidebar gating** — `AppSidebar.tsx` renders menu tree from DB; the "Teams" menu would need a `requiredPermission` / env flag. Grey-out + tooltip when `env.TEAM_ENABLED=false` likely handled by rendering disabled `SidebarMenuButton` (lucide icon + `<Tooltip>`), not by hiding.

### R10 Global organizations list (super-admin)
- **No `/organizations` route.** Must create `src/routes/(admin)/_layout/organizations/index.tsx` + a fresh oRPC router `src/orpc/router/organizations-admin.ts`. `authClient.useListOrganizations()` is user-scoped, so super-admin view must fetch via oRPC that reads directly from `db.$qbRaw.selectFrom("organization")` (Kysely). Must join `member` for counts, or run two queries.
- **Permission gate** — `requireSuperAdmin` middleware needed in oRPC. Frontend must also gate the sidebar item on `session.user.role === "admin"` (see `src/lib/auth-session.ts:30-33`).

## Existing helpful building blocks (reuse)

| Component | Path | Why useful |
|---|---|---|
| `FormDrawer` | `src/components/form-drawer.tsx` | Used by Org edit + Invite flows already |
| `ConfirmDialog` | `src/components/confirm-dialog.tsx` | Already supports "type to confirm" (slug check) |
| `DataTable` | `src/components/data-table/data-table.tsx` | Reusable for members / invites / orgs list / teams |
| `Badge`, `Skeleton` | `src/components/ui/*` | Standard shadcn |

## Surprises

- `organization/index.tsx:107-110` already allows editing `slug` — BA allows slug changes but this is a footgun (URL/active-org invariants). Recommend wrapping slug edit behind a confirm flow in R7.
- There is no `type="owner"` badge rendering; all roles render via `<Badge variant="outline">{role}</Badge>` uniformly (`:277`). Transfer-ownership UX can key off `role === "owner"` at the invitation rendering layer without schema changes.
- `member/{leader,role}` custom concepts — PRD §R9 explicitly excludes. BA teams have no leader; stick to native endpoints.
