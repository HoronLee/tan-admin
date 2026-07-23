# 规划 TODO 架构后续项

## Goal

把根目录 `TODO.md` 中从 `06-19-architecture-layering-cleanup` 延后的三个事项整理为可独立实施、验证和回滚的 Trellis 子任务，并明确它们之间的优先级与集成验收边界。

## Background

- `TODO.md` 记录的三项均为已知后续优化；原任务确认它们当时不影响正确性与安全性，因此有意延后。
- 三项分别属于菜单管理体验、SSR 调用拓扑、身份数据到 ZenStack policy 的 auth context bridge，能够独立交付。
- 当前工作树在规划开始时为 clean，且没有其他活动 Trellis 任务。

## Requirements

- P1. 保留 `TODO.md` 的原始问题、约束和部署注意事项，不把性能优化描述成已经发生的故障。
- P2. 每个子任务必须拥有独立、可测试的需求与验收标准，并在进入实施前补齐技术设计和执行计划。
- P3. 动态菜单是脚手架的正式能力；菜单任务必须统一 workspace/site 导航投影，并且不得削弱 ZenStack `Menu` policy：site admin 可写任意 scope，workspace owner 只能写 active org scope。
- P4. oRPC 任务必须同时守住两个边界：SSR 不再回环 HTTP，浏览器仍通过 `/api/rpc`，且 client-reachable 模块不能 runtime import server router。
- P5. session role 任务把授权一致性置于性能之前；任何缓存方案都必须覆盖 active org 切换、角色变化、成员移除和多 session 场景。

## Child Task Map

| Child | Deliverable | Independent proof |
|---|---|---|
| `07-22-menu-global-scope` | 统一动态菜单投影、super-admin 旁路、surface 与 scope 语义 | 导航投影测试 + UI/纯逻辑测试 + 既有 RBAC policy integration |
| `07-22-orpc-ssr-direct-client` | SSR 使用 in-process router client，浏览器保留 HTTP link | 单元测试 + build/import-boundary 检查 |
| `07-22-session-active-role-cache` | 在不产生过期授权的前提下减少 active-member 查询 | hook/session integration + DB-backed authorization regression |

## Acceptance Criteria

- [ ] 三个子任务均完成 PRD 收敛，且不存在能从仓库证据直接回答的开放问题。
- [ ] 三个子任务均有 `design.md` 与 `implement.md`，包含验证命令和回滚点。
- [ ] 父任务记录推荐实施顺序、跨子任务回归检查和 `TODO.md` 更新时机。
- [ ] 本轮规划经用户评审前，不运行 `task.py start`，不修改业务代码。

## Out of Scope

- 本轮不实施三个子任务。
- 不借机重做菜单管理页、oRPC router 或 Better Auth 组织模型。
- 不启用 session cookie cache；该能力会改变授权数据的新鲜度语义，需独立评估。
