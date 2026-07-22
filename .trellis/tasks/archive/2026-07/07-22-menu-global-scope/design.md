# 统一动态菜单投影与作用域：技术设计

## Data model

- 在 `zenstack/schema.zmodel` 的 `Menu` 增加 `surface String @default("WORKSPACE")`。
- 在 client-safe menu constants 中集中声明 `WORKSPACE` / `SITE`，避免组件和 server handler 各写字符串。
- `SITE` 行强制 `organizationId = null`；`WORKSPACE` 行允许 null 或具体 organizationId。
- 现有 seed 行按实际 route 分类：`/site/*` 为 SITE，workspace path 为 WORKSPACE；未实现 permissions/roles/metrics 等条目改为 DISABLED，避免活动导航指向 404。
- 运行 `pnpm db:generate` 生成客户端产物，再使用项目正常 `db:push`/migration 流程落库；不手改生成文件。

## Navigation projection

将 `src/orpc/router/user-menus.ts` 替换为 `src/orpc/router/navigation.ts`，暴露 `navigation.get`：

1. `surface=SITE`：要求 `context.user.role === "admin"`，查询 ACTIVE + SITE + global；不执行 organization `hasPermission`。
2. `surface=WORKSPACE`：要求 authenticated + active org；查询 ACTIVE + WORKSPACE + (global 或 active org)。普通用户依赖 ZenStack policy 做行隔离，admin 仍由显式 where 防止跨 org 混入。
3. admin 跳过 `requiredPermission`；普通用户沿用当前 BA `hasPermission` 逻辑。
4. 递归过滤后返回树；query key 改为 `orpc.navigation.key()`，mutation 成功后失效对应 key。

`AppSidebar` 与新的动态 `AppSiteSidebar` 只消费 projection，不读取 router 或 DB。`src/routes/site/_layout.tsx` 预取/查询 SITE，workspace layout 继续查询 WORKSPACE。

## Management boundaries

- 新增 `/site/menus`，用 `requireSiteAdmin`，组织下拉复用 `orpc.organizationsAdmin.list`。目标组织不是 active org 的隐式值，而是显式 input。
- 保留 `/settings/organization/menus`，owner 入口隐藏 surface/org selector；server mutation 仍通过 ZenStack policy 拒绝 global/other-org。
- 共享 `MenuManagement` 组件接收 capability：`siteAdmin` 或 `workspaceOwner`。组件负责父节点过滤、叶子 re-scope 提示和 query invalidation；服务端重新校验。
- `SITE` scope 固定 global；`WORKSPACE` scope 可 global/selected organization。跨组织 mutation 使用结构化 logger 记录 actor、target、menu、old/new scope。

## Tree invariants

- 同 surface parent/child；组织 child 不得挂其他组织 parent。
- parent/scope 组合由 `createMenuMutationGuard` 在 generated CRUD 服务端边界校验，不能只依赖浏览器 Select。
- ZenStack v3 的 model-level `@@validate` 不允许读取 relation；同一行 SITE/global 约束留在 zmodel，跨行 parent/children 查询由 ORM mutation plugin 完成。
- super-admin re-scope 只对叶子节点开放；有 children 直接返回可解释的业务错误。

## Compatibility and rollout

- `surface` default WORKSPACE 让旧数据可读；seed 更新会逐步标注 SITE 行。
- `navigation` consumer、Sidebar 和 mutation invalidation 同步切换到 `orpc.navigation.key()`，删除旧 `user-menus` 命名。
- `/api/rpc` transport 不改变；导航 procedure 名称变化只影响类型安全 client。
