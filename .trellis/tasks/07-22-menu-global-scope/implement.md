# 统一动态菜单投影与作用域：执行计划

## Checklist

- [x] 在 `schema.zmodel` 增加 `Menu.surface` 与必要的同字段校验；确认生成 schema/input/models 不手改。
- [x] 新增 client-safe surface constants 与 parent/scope 纯函数，先写无 DB 单元测试。
- [x] 更新 seed：标记 SITE/WORKSPACE、禁用无 route placeholders、补 `/site/menus` 与 workspace 菜单入口，确保 upsert 幂等。
- [x] 将 `user-menus.ts` 重构为 `navigation.ts`，实现 surface、admin bypass、global/current-org projection 和 permission filtering。
- [x] 更新 AppSidebar、tabbar、workspace invalidation；把 AppSiteSidebar 改成动态 SITE consumer。
- [x] 新增 `/site/menus` 路由，复用菜单管理组件；workspace 管理页限制为 current org WORKSPACE。
- [x] 实现组织选择、跨组织日志、叶子 re-scope 和 parent compatibility server validation。
- [x] 补齐 navigation projection、surface isolation、admin bypass、owner boundary、cross-org mutation integration tests。
- [x] 更新 route/backend/frontend specs 与 `TODO.md`。

## Validation

```bash
rtk pnpm check
rtk pnpm test
rtk pnpm test:integration
rtk pnpm db:generate
rtk pnpm build
```

依赖 `.env.local` 的 DB 命令必须在配置完整且可回滚的开发数据库执行。

## Risk / rollback

- schema migration：保留 `surface` 默认值；失败时先回滚 consumer，再回滚 migration。
- seed：不使用生产 `--reset-menus`；用显式 upsert/status 更新，保留运营新增菜单。
- navigation rename：consumer 与 invalidation 已同步更新为 `orpc.navigation.key()`，避免 sidebar 空态。
- parent validation：先阻止不安全写入，不自动级联，降低误删/误曝光风险。
