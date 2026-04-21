# Layout Guidelines

> Admin shell layout and route-group conventions for the TanStack Start frontend.

---

## Admin Route Group: `(admin)/`

Authenticated management pages live under the `(admin)/` route group. The parentheses signal a layout-only group that does not appear in the URL — `src/routes/(admin)/roles/index.tsx` routes to `/roles`, not `/(admin)/roles`.

### When to Use `(admin)/`

- The page requires the sidebar + admin header chrome.
- The page is part of the internal management surface (RBAC, audit, config).

Non-admin pages (marketing, login, public demo) remain at the root level without the group prefix.

### Evidence

Source: `src/routes/(admin)/_layout.tsx`, `src/routes/(admin)/dashboard.tsx`, `src/routes/(admin)/roles/index.tsx`.

```text
src/routes/(admin)/
├── _layout.tsx            # Layout route — sidebar + header + outlet
├── dashboard.tsx          # /dashboard
└── roles/index.tsx        # /roles
```

```ts
// _layout.tsx
createFileRoute("/(admin)/_layout")({ component: AdminLayout })

// roles/index.tsx
createFileRoute("/(admin)/roles/")({ component: RolesPage })
```

## Admin Shell Composition (L1)

The L1 shell uses shadcn `Sidebar` + a thin header strip; no multi-level menu, no tabs, no dynamic menu rendering. These are deferred to a later layout iteration.

### Evidence

Source: `src/routes/(admin)/_layout.tsx`.

```tsx
<SidebarProvider>
  <AppSidebar />
  <SidebarInset>
    <header className="flex h-14 ...">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-6" />
      <div className="flex flex-1 flex-col">...</div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <BetterAuthHeader />
      </div>
    </header>
    <div className="flex-1 p-4 sm:p-6"><Outlet /></div>
  </SidebarInset>
</SidebarProvider>
```

### Convention: Use `SidebarProvider` at the Layout Root

Any page tree that renders a shadcn `Sidebar` must be wrapped in `SidebarProvider`. The provider owns the collapsed/expanded state (persisted via cookie) and the mobile `Sheet` behavior. Do not instantiate a raw `<aside>` or hand-roll mobile switching — the shadcn component already handles both.

### Convention: Sidebar Menu Is Hardcoded at L1

The current sidebar enumerates items statically in `AppSidebar.tsx`. Dynamic menu rendering (from `Menu` / `Permission` tables via ZenStack hooks) is a later-task concern; do not introduce a dynamic data source until dedicated work is scheduled.

Source: `src/components/layout/AppSidebar.tsx:15-26`.

```ts
const adminNavItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { to: "/roles", label: "Roles", icon: ShieldIcon },
] as const
```

### Convention: Determine Active State via `useLocation`

TanStack Router's `Link activeProps` styles the anchor, but shadcn's `SidebarMenuButton` renders its own active affordance via `isActive`. Resolve the active flag from the current path and pass it through:

Source: `src/components/layout/AppSidebar.tsx:29-64`.

```tsx
const { pathname } = useLocation()
// ...
const isActive = pathname === item.to || pathname.startsWith(`${item.to}/`)
<SidebarMenuButton asChild isActive={isActive}>
  <Link to={item.to}>
    <Icon />
    <span>{item.label}</span>
  </Link>
</SidebarMenuButton>
```

## Dialog vs AlertDialog

Destructive confirmations must use shadcn `AlertDialog`, not `Dialog`.

| Use case | Component |
|----------|-----------|
| Non-destructive create/edit drawer | `Sheet` (preferred) or `Dialog` |
| Destructive confirm (delete, revoke, disable) | `AlertDialog` |

### Why

`AlertDialog` renders with `role="alertdialog"`, which screen readers announce as an interruption requiring user response. `Dialog` (`role="dialog"`) is a generic modal — assistive tech does not distinguish it from an informational popup.

### Evidence

Source: `src/routes/(admin)/roles/index.tsx` delete confirmation.

```tsx
<AlertDialog open={Boolean(deletingRole)} onOpenChange={...}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete role</AlertDialogTitle>
      <AlertDialogDescription>...</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction className="bg-destructive ..." onClick={handleDelete}>
        Delete role
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

## Out of Scope for L1

The L1 shell deliberately omits the following — they belong to a dedicated shell task:

- Multi-level nested menus.
- Tabbed page navigation.
- Breadcrumb synced with `Router.state.matches`.
- Menu items sourced from `Menu` / `Permission` models.
- Route-level authorization guards.
- Dark-mode preference persistence.
- `ProTable` / `ProForm` high-level wrappers.

Hardcoded sidebar items + the current header strip are **intentional replaceables**, not technical debt.
