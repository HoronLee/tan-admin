# Reference Projects

本任务的参考源。**借鉴结构不直接 copy JSX**，所有 UI 重写对齐 tan-admin 的 shadcn 默认黑白主题。

## 1. servora-iam（TS / React / 前端参考）

**路径**：`/Users/horonlee/projects/go/servora-legacys/servora-iam/web/iam/src/`

**可参考的组件结构**：
- `components/ui/data-table/` — TanStack Table 封装：分页、loading skeleton、空态、可选 row actions 列
- `components/ui/form-drawer` — Sheet 侧抽屉表单容器（title / description / 内容区 / footer 双按钮）
- `components/ui/confirm-dialog` — AlertDialog，支持"输入名字二次确认"模式
- `components/ui/data-state` — loading / error / empty 三态包装
- `components/ui/page` — 页面容器（title + extra + content + footer）
- `components/layout/sidebar` — 基于 shadcn sidebar，collapse / 分组 / 子菜单
- CRUD 页面模式：`columns.tsx`（列定义）→ `index.tsx`（页面组合 DataTable + Drawer + Dialog）

**不直接复用**：
- `authStore` — servora-iam 用 JWT + localStorage；tan-admin 用 Better Auth session cookie
- `iamClients` — servora-iam 调 gRPC/REST；tan-admin 用 oRPC server function
- `app-shell.tsx` 里的 hardcode 菜单 — tan-admin 要动态菜单

## 2. go-wind-admin（Go + Vue / 架构参考）

**路径**：`/Users/horonlee/projects/go/tx7do/go-wind-admin/`

**可参考**：
- 多租户 RBAC 数据模型：`Tenant` / `Role` / `Permission` / `Menu` / `UserRole` / `RolePermission` / `PermissionMenu` 关系（已在 zmodel 落地）
- Tenant 字段：`code / domain / type / status / auditStatus / adminUserId / subscriptionAt / expiredAt`
- 多标签页 Tabbar 交互：打开 / 关闭 / 关闭其他 / 关闭右侧 / 刷新 / active 高亮
- Tenant 管理页 UI：列表 + 基本信息编辑 + 指派管理员
- 菜单-权限映射配置 UI：角色编辑弹窗里的权限树多选

**不直接复用**：
- Vue 组件（tan-admin 是 React）
- Go 后端（tan-admin 是 oRPC + ZenStack）

## 3. 借鉴原则（呼应 `code-reuse-thinking-guide.md`）

1. **结构可参考，JSX 必重写** — 参考文件结构、props 设计、交互流程；不 copy-paste 样式 / 文案
2. **主题对齐** — shadcn 默认黑白，禁止 gradient / 自定义配色 / emoji 装饰
3. **类型全重写** — 重写类型对齐 oRPC 返回值和 ZenStack 生成类型
4. **路径对齐** — 所有 import 走 `#/*` 别名（package.json imports 字段），不用 `@/*`
