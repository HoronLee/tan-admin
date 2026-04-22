# Research: ba-hooks-usage

- **Query**: Exact signatures for Better Auth `organizationHooks.beforeAcceptInvitation` (transfer ownership) and `databaseHooks.user.create.after` (signUp auto-join)
- **Scope**: external
- **Date**: 2026-04-22

Sources checked (latest as of 2026-04-22):

- https://www.better-auth.com/docs/plugins/organization — "Lifecycle hooks" section
- https://better-auth.com/docs/reference/options — `databaseHooks` reference
- https://better-auth.com/docs/concepts/users-accounts — databaseHooks example
- GitHub issues: #4614 (after-hook timing), #7260 (tx-commit fix), #6791 (allowUserToCreateOrganization workaround)

## 1. `organizationHooks` — shape

From docs:

```ts
organization({
  organizationHooks: {
    beforeCreateOrganization:   async ({ organization, user })            => { return { data: { ...organization } } },
    afterCreateOrganization:    async ({ organization, member, user })    => {},
    beforeUpdateOrganization:   async ({ organization, user, member })    => { return { data: { ...organization } } },
    afterUpdateOrganization:    async ({ organization })                  => {},

    beforeCreateInvitation:     async ({ invitation, inviter, organization }) => { return { data: { ...invitation } } },
    afterCreateInvitation:      async ({ invitation, inviter, organization }) => {},
    beforeAcceptInvitation:     async ({ invitation, member, user, organization }) => { return { data: invitation } },
    afterAcceptInvitation:      async ({ invitation, member, user, organization }) => {},
    afterRejectInvitation:      async ({ invitation })                    => {},
    afterCancelInvitation:      async ({ invitation })                    => {},
  }
})
```

### Return shape

- `before*` hooks: **must return `{ data: <entity> }`** if they want to mutate; returning `undefined` means "proceed unchanged". This is the canonical BA hook contract (same as `databaseHooks`).
- `after*` hooks: return value ignored (`void | Promise<void>`).

PRD §Technical Notes warns specifically about this — `return { data: invitation }` not `return invitation`.

### Transfer-ownership flow (PRD R7)

Because BA doesn't expose a native `transferOwnership`, we ride the invitation pipe:

1. Owner clicks "转让所有权" → UI calls `authClient.organization.inviteMember({ email: target.user.email, role: "owner", organizationId })`.
2. Invitee receives email (our `transfer-ownership.tsx` template).
3. Invitee clicks → `authClient.organization.acceptInvitation({ invitationId })`.
4. BA emits `beforeAcceptInvitation({ invitation, user, organization })`.
5. In that hook, when `invitation.role === "owner"`:
   - Find current owner via `ctx.adapter` / raw Kysely: `SELECT id, userId FROM member WHERE organizationId = ? AND role = 'owner'`.
   - Downgrade them to `admin`: `UPDATE member SET role = 'admin' WHERE id = <oldOwnerMemberId>`.
   - Return `{ data: invitation }` to let BA proceed with the normal member upsert (which will create the accepting user's member row with `role='owner'` because that's what invitation said).

Skeleton:

```ts
organization({
  organizationHooks: {
    beforeAcceptInvitation: async ({ invitation, user, organization }) => {
      if (invitation.role === "owner") {
        // atomic-ish downgrade of existing owner(s)
        await pool.query(
          'UPDATE "member" SET role = $1 WHERE "organizationId" = $2 AND role = $3',
          ["admin", organization.id, "owner"],
        );
        log.info(
          { orgId: organization.id, newOwner: user.id },
          "Owner transferred via invitation accept",
        );
      }
      return { data: invitation };   // REQUIRED shape
    },
  },
}),
```

Note: `cancelPendingInvitationsOnReInvite: true` (PRD R12) means if the owner re-invites the same email with role=member first, the previous owner-invitation is cancelled — expected per PRD §Technical Notes #7.

## 2. `databaseHooks.user.create.after` — signUp auto-join (R4)

Canonical signature (from reference docs + PR sources):

```ts
betterAuth({
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => { return { data: { ...user, /* mutate */ } } },
        after:  async (user, ctx) => { /* side effects, no return */ },
      },
    },
  },
});
```

### Single-mode auto-join skeleton

```ts
import { env } from "#/env";
import { pool } from "#/db";
import { randomUUID } from "node:crypto";

databaseHooks: {
  user: {
    create: {
      after: async (user) => {
        if (env.TENANCY_MODE !== "single") return;
        // Super-admin bootstrapping handles itself in seed; skip if that email.
        if (env.SEED_SUPER_ADMIN_EMAIL && user.email === env.SEED_SUPER_ADMIN_EMAIL) {
          return;
        }

        // Find default org (seed created it).
        const { rows } = await pool.query<{ id: string }>(
          'SELECT id FROM "organization" WHERE slug = $1 LIMIT 1',
          [env.SEED_DEFAULT_ORG_SLUG ?? "default"],
        );
        const orgId = rows[0]?.id;
        if (!orgId) {
          log.warn({ slug: env.SEED_DEFAULT_ORG_SLUG }, "Default org missing — cannot auto-join.");
          return;
        }

        // Idempotent member insert.
        const existing = await pool.query(
          'SELECT 1 FROM "member" WHERE "organizationId" = $1 AND "userId" = $2 LIMIT 1',
          [orgId, user.id],
        );
        if (existing.rowCount && existing.rowCount > 0) return;

        await pool.query(
          'INSERT INTO "member" (id, "organizationId", "userId", role, "createdAt") VALUES ($1, $2, $3, $4, now())',
          [randomUUID(), orgId, user.id, "member"],
        );
      },
    },
  },
},
```

### Known timing pitfalls (issues referenced)

- **#4614** — `user.create.after` may fire **before** the INSERT row is visible via a *separate* Prisma/Kysely client because BA wraps creation in a transaction. Using the **same `pool`** (`src/db.ts` shares pool with BA) usually sidesteps this, but not always. The workaround pattern used in community (#6791) is to wrap dependent work in `setTimeout(fn, 0)` to yield microtask + next tick. Check at impl time — #7260 says a fix was shipped queueing after-hooks post-commit; if better-auth ^1.6.5 contains it, no workaround needed. Verify with a smoke test (sign up fresh user, check `member` row exists synchronously).
- **`ctx`** (second arg) gives you `ctx.adapter` for DB access matching BA's own connection — preferable to raw pool when available.

## 3. `auth.api` calls from inside hooks — caveats

- `auth.api.createOrganization` from `user.create.after` requires `allowUserToCreateOrganization: true` (#6791). Since PRD R1 *may* want `allowUserToCreateOrganization: false` in single-mode (only super-admin creates orgs — but seed handles the single default org), **we don't need to create orgs from hooks**; we only need to add a `member` row pointing at an already-seeded org. Bypass `auth.api` entirely and use raw SQL → avoids that class of bugs.

## 4. Multi-owner guard (PRD R11)

No native `beforeRemoveMember` in BA organizationHooks docs — the hook set is limited to the list above. Strategy:

- Wrap remove/updateRole at the **oRPC layer**: new `organizations.ts` / `members.ts` router endpoints that validate "at least one owner remains" before forwarding to `auth.api.removeMember` / `auth.api.updateMemberRole`.
- Frontend calls these oRPC wrappers instead of `authClient.organization.{removeMember,updateMemberRole}` directly.

## Surprises

1. `beforeAcceptInvitation` is specifically documented on the current BA org plugin page; an unrelated *third-party* "Better Auth Invite Plugin" (mintlify.com/0-Sandy/better-auth-invite-plugin) uses `beforeAcceptInvite` with different shape (`{ ctx, invitedUser }` → returns `{ user }`). **Don't conflate** — we're using the first-party `organization` plugin.
2. PRD §Technical Notes #2 reminds us to return `{ data: invitation }`; docs snippet confirms.
3. BA invitation already tracks `role`, so `invitation.role === "owner"` check is sufficient; no extra payload needed.
4. #7260 shipped a fix making after-hooks run post-commit — reduces but doesn't eliminate the need for the idempotent-insert pattern above. Keep idempotent INSERT for safety.
