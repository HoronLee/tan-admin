# 统一动态菜单投影与作用域

## Goal

把数据库驱动菜单确立为脚手架的正式能力，统一 workspace 与 site 的导航投影语义；super-admin 绕过权限过滤但仍遵守导航上下文，普通用户按 active org 与权限过滤，同时补齐菜单 scope 管理。

## Confirmed Decisions

- 动态菜单继续保留；它负责导航树、权限可见性、排序和 tab 标题，不负责运行时生成 TanStack Router 页面。
- `/site` 与 workspace 共用同一张 `Menu` 表和同一套动态导航投影，通过显式 `SITE` / `WORKSPACE` surface 分流。
- SaaS super-admin 只负责 `/site` 平台管理，不创建默认 org，也不引入 system org；SITE 导航和 `/site/menus` 在没有 active org 时必须可用。
- `/site/menus` 的 super-admin 可以显式选择任意组织，直接管理该组织的 WORKSPACE 菜单；默认视图为 global，组织上下文必须明确展示。
- super-admin 编辑时允许 global/任意组织 re-scope；含子节点的菜单禁止直接 re-scope，必须先处理子节点，不做静默级联。

## Background

- `src/routes/(workspace)/_layout/settings/organization/menus.tsx:238-243` 的 create mutation 固定写入 `organizationId: activeOrganizationId`。
- `src/orpc/router/user-menus.ts:39-102` 当前是当前登录主体的 workspace 派生菜单树；历史契约是 super-admin 全量、普通用户按权限过滤。
- workspace `AppSidebar` 从 oRPC 查询菜单并写入 `menuStore`；site `AppSiteSidebar` 当前仍使用静态 `SITE_MENU`。
- `organizationId = null` 表示 global，`organizationId = activeOrg.id` 表示组织菜单；seed 当前把部分 `/site/*` 和未实现路径混进 workspace 菜单。

## Requirements

- M0. 菜单必须有明确的 navigation surface：至少 `WORKSPACE` / `SITE`；不能继续用 organizationId 或 requiredPermission 隐式推断 shell。
- M1. super-admin 在指定 surface 内绕过 `requiredPermission` 检查；仍只读取 ACTIVE、目标 surface、global/目标组织的菜单。
- M2. 普通 workspace 用户读取 WORKSPACE global + active-org 菜单，再按 requiredPermission 过滤；无 active org 时不能读取 workspace 导航。
- M3. SITE surface 仅 super-admin 可读，固定 global，不接受普通用户或任意 org scope 输入。
- M4. 派生查询改名为 `navigation` 语义，不能暗示只服务非超管，也不能与 ZenStack Menu CRUD 混淆。
- M5. `/site` 和 workspace Sidebar 都由同一动态投影驱动，不再维护静态 `SITE_MENU`。
- M6. `/site/menus` 是 super-admin 管理入口且不依赖 active org；`/settings/organization/menus` 是 owner 管理当前 org WORKSPACE 菜单入口，二者复用组件但由服务端能力重新授权。
- M7. super-admin 可从现有组织列表选择任意组织管理其 WORKSPACE 菜单；跨组织上下文必须显式展示并记录结构化审计日志。
- M8. SITE 菜单始终 global；WORKSPACE 菜单可 global 或组织 scoped。parent 必须同 surface，组织 child 只能挂 global 或同组织 parent。
- M9. owner 不显示可改变 surface/scope 的控件，mutation 始终 current org WORKSPACE；super-admin 可 create/edit scope。
- M10. super-admin 只能对叶子菜单 re-scope；有 children 时阻止并要求先处理 children。
- M11. 不存在对应文件路由的菜单不得保持 ACTIVE 可点击状态；seed 需清理或 DISABLED 未实现 placeholders。

## Acceptance Criteria

- [x] SITE surface 在 SaaS super-admin 无 active org 时正常加载，普通用户无法读取。
- [x] super-admin 的 WORKSPACE 投影只包含 global + 指定 org，不混入其他 org；requiredPermission 不会错误过滤 admin。
- [x] 普通用户只看到 WORKSPACE global + active-org 中通过权限的菜单。
- [x] workspace/site 两个 Sidebar 都由同一动态投影驱动，静态 `SITE_MENU` 删除。
- [x] `/site/menus` 可从现有组织列表选择任意 org 管理 WORKSPACE 菜单；`/settings/organization/menus` 只能操作当前 org。
- [x] super-admin 能创建 global/SITE、global/WORKSPACE、任意 org/WORKSPACE 菜单；SITE 不可绑定组织。
- [x] super-admin 叶子菜单 re-scope 可用；有子节点的菜单 re-scope 被阻止。
- [x] ZenStack admin/owner/read-isolation/post-update tests 继续通过；新增 surface、projection、跨 org 管理 integration 覆盖。
- [x] `pnpm check`、`pnpm test`、`pnpm test:integration`、`pnpm build` 通过。

## Out of Scope

- 不做运行时动态路由或动态组件加载；TanStack Router 继续使用文件路由。
- 不恢复 oRPC Menu CRUD；CRUD 继续使用 ZenStack generated hooks。
- 不新增独立 audit 表；跨组织操作先用结构化日志记录审计字段。
