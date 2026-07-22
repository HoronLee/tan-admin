# Dynamic Navigation Contract

> Executable contract for the shared `Menu` table, `navigation.get`, and menu mutation invariants.

## 1. Scope / Trigger

Apply this spec when changing `Menu`, menu seed data, either sidebar, `navigation.get`, or either menu-management route. Dynamic navigation controls visibility and ordering; it never creates TanStack Router routes at runtime.

## 2. Signatures

```zmodel
model Menu {
  surface        String  @default("WORKSPACE") // WORKSPACE | SITE
  organizationId String?                       // null = global
  parentId        Int?
}
```

```ts
navigation.get({
  surface: "SITE" | "WORKSPACE",
  organizationId?: string | null,
})
```

Generated Menu CRUD stays under `/api/model/**`. Do not add a second ordinary oRPC Menu CRUD router.

## 3. Contracts

- `SITE`: global only, super-admin only, independent of `session.activeOrganizationId`.
- `WORKSPACE`: global plus the explicit target organization. Ordinary users are forced to their active organization; super-admin may pass any organization or `null` for global-only.
- `status=ACTIVE` is required for navigation projection. Seed placeholders without a real file route stay `DISABLED`.
- Super-admin bypasses `requiredPermission`; ordinary users use Better Auth `hasPermission` for the active organization.
- Both `AppSidebar` and `AppSiteSidebar` consume `orpc.navigation.get` and write the returned tree to `menuStore`.
- `bindAuthDb` attaches both `PolicyPlugin` identity and `createMenuMutationGuard` to generated CRUD requests.

## 4. Validation & Error Matrix

| Condition | Result |
|---|---|
| SITE with non-null organizationId | `ORMError(INVALID_INPUT)` |
| Child surface differs from parent | `ORMError(INVALID_INPUT)` |
| Organization child uses another organization parent | `ORMError(INVALID_INPUT)` |
| Global child uses organization parent | `ORMError(INVALID_INPUT)` |
| Parent with children changes surface/scope | `ORMError(INVALID_INPUT)` |
| Leaf changes surface/scope as super-admin | allowed |
| Owner writes global/other-org/SITE | rejected by ZenStack policy |
| Ordinary caller requests SITE or another organization | `FORBIDDEN` |

ZenStack v3 `@@validate` cannot read relation fields. Cross-row parent/child checks therefore belong in the ORM mutation plugin, not in a browser-only Select or a relation-based zmodel expression.

## 5. Good / Base / Bad Cases

- Good: SITE global parent with SITE global children.
- Good: WORKSPACE organization child under a WORKSPACE global or same-organization parent.
- Base: WORKSPACE global tree with no active organization is readable only when super-admin explicitly asks for global scope.
- Bad: infer SITE from `/site/*`, `requiredPermission`, or `organizationId`; `surface` must be explicit.
- Bad: query nested children without applying the same scope. Fetch scoped flat rows first, then build the tree.

## 6. Tests Required

- Unit: scope normalization and leaf/parent re-scope decision.
- Integration: SITE global validation, owner post-update boundary, parent compatibility, parent re-scope rejection, leaf re-scope success.
- Browser smoke: SaaS super-admin without active org loads SITE navigation; `/site/menus` switches between SITE, global WORKSPACE, and an explicit organization.
- Quality gate: `pnpm db:generate`, `pnpm check`, `pnpm test`, `pnpm test:integration`, `pnpm build`.

## 7. Wrong vs Correct

### Wrong

```ts
// Leaks unrelated organization rows to an admin projection.
db.menu.findMany({ where: { surface: "WORKSPACE" } })
```

### Correct

```ts
db.menu.findMany({
  where: {
    status: "ACTIVE",
    surface: "WORKSPACE",
    OR: [{ organizationId: null }, { organizationId: targetOrganizationId }],
  },
})
```
