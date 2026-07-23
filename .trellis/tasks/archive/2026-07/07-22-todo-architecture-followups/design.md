# TODO 架构后续项：总体设计

## 目标架构

三个子任务保持独立交付，但共享以下契约：

1. `Menu` 是动态导航定义，不是运行时路由注册表。TanStack Router 仍由 `src/routes/**` 生成静态 route tree。
2. `Menu.surface` 显式区分 `SITE` 与 `WORKSPACE`；`organizationId` 只表达 global（null）或某个组织，不再承担 surface 语义。
3. 导航查询是“当前主体在指定 surface 下的可见投影”。super-admin 绕过 `requiredPermission`，但仍受 `ACTIVE`、surface 和 global/目标组织约束。
4. `/site` 与 workspace 使用同一张表、同一套投影逻辑和同一套菜单管理组件；它们不是两份菜单数据。
5. SaaS super-admin 继续没有默认组织，只进入 `/site`。SITE 导航和 site 菜单管理不能依赖 active org。

## 数据流

```text
Menu 表
  -> navigation.get({ surface })
  -> surface/auth/org 投影 + permission 过滤
  -> AppSidebar 或 AppSiteSidebar
  -> menuStore / tabbar
```

菜单管理走两条入口但共享实现：

```text
/site/menus                         /settings/organization/menus
super-admin                         workspace owner
surface + global/任意 org           WORKSPACE + 当前 org 固定
跨组织目标显式选择                  不可选择组织或 surface
```

## 授权边界

- Better Auth admin role 决定是否可访问 `SITE` surface 和跨组织管理能力。
- ZenStack policy 继续负责 Menu 行级读写与 owner 防逃逸。
- 导航 handler 不能把 `organizationId` 输入直接当作权限证明：
  - `SITE` 只能 global，且仅 site admin；
  - `WORKSPACE` 只能 global + 当前 active org；
  - super-admin 的 admin policy 读全表后，handler 仍需做上述显式 projection，避免把所有租户菜单混在一起。
- `requiredPermission` 只在非 admin 的 WORKSPACE 投影中执行；admin 旁路该检查，但不旁路 surface、status、tenant scope 和产品能力显示规则。

## 命名与模块边界

- 将 `src/orpc/router/user-menus.ts` 改为 `src/orpc/router/navigation.ts`。
- 将扁平 `getUserMenus` 改为 `navigation.get`（或等价的 `getNavigation`），输入包含显式 `surface`。
- 不恢复 `src/orpc/router/menus.ts`：ZenStack generated hooks 已是 Menu CRUD 边界，`menus.ts` 会把 CRUD 与派生导航投影混在一起。
- 共享 surface/scope 常量放在 client-safe 的 menu 模块，避免 route/component 直接 import server-only router、DB 或 auth server。

## 数据模型与树约束

- `Menu.surface` 新增字符串字段，默认 `WORKSPACE`；代码侧集中维护 `MenuSurface` 常量与校验。
- `SITE` 菜单必须 global；`WORKSPACE` 菜单可以 global 或组织 scoped。
- parent 必须与 child 同 surface；组织 scoped child 的 parent 只能是 global parent 或同组织 parent，不能是其他组织 parent。
- 这些关系约束需要在管理服务边界验证；`@@validate` 可承担同一行字段约束，但不能把复杂 parent 查询假设成 query-builder 会自动执行。ZenStack 生成产物仍只通过 `db:generate` 更新。
- super-admin re-scope 只允许叶子菜单。含 children 的节点先拒绝，要求先处理 children，避免隐式级联改变可见范围。

## 管理页面

- 新增 `/site/menus` 路由和 site sidebar 动态入口。它使用 site-admin guard，默认 global 视图；WORKSPACE 组织 scope 需要从 `organizationsAdmin.list` 选择明确目标组织。
- 现有 `/settings/organization/menus` 保留给 workspace owner，固定 WORKSPACE + active org；admin 在 private 模式进入 workspace 时可看到，但不能用该入口伪装跨组织操作。
- 两个页面复用树、表单、scope/parent 校验和 mutation feedback；服务端仍以当前入口能力重新校验。
- seed 中不存在对应静态 route 的 ACTIVE 菜单必须改为 DISABLED 或移除；不让 `/site/metrics`、未实现 permissions/roles 等入口继续指向 404。

## 审计与可观测性

当前没有独立 audit 表，因此本任务不新增审计域模型。跨组织 mutation 通过现有结构化 module logger 记录 actor、target organization、menu id、surface、old/new scope；将来接入审计表时保留这些字段契约。

## 三项任务的依赖

- 菜单任务先定义 navigation/surface API；oRPC SSR 任务只消费 client，不改变其业务语义。
- session role 任务必须保持 `AuthSessionContext` 和 ZenStack bridge 字段兼容；不得把导航 surface 逻辑塞进 session。
- 父任务集成时，先验证菜单权限 projection，再验证 SSR direct client，最后验证 role cache 的 policy 回归。

## 回滚形状

- 菜单：先保留旧字段和旧 route，`surface` 默认 WORKSPACE；projection 可暂时回退到 workspace-only，管理入口可回退静态链接。
- oRPC：保留 `/api/rpc` route 和浏览器 link；移除 server registration 即可回到显式失败/旧实现的可控状态，不能恢复未经审查的 server HTTP self-call。
- session role：保留 nullable additional field；任何同步不完整时回退到当前 `getActiveMember` 查询，优先 fail closed，不沿用旧 owner role。

