# Research: better-auth-ui shadcn registry 对 base-nova / radix-nova 的适配

## 🚨 结论修订理由更新（2026-04-22 二次核实）

**"跳过 ba-ui re-add" 的结论仍然有效**，但**理由替换**：

- ~~旧理由~~：ba-ui 不支持 Nova，re-add 可能引入 Vega token 与 Nova 框架割裂
- **新理由**：项目 style 留在 Vega 家族（`radix-vega`），ba-ui 本就以 Vega 为视觉基线，**自动视觉匹配**，根本不需要 re-add

详见 `shadcn-apply-command-finding.md`。下方原分析作为论据基础保留。

---

# 原分析

---


- **Query**: `better-auth-ui.com/r/auth.json | user-button.json | settings.json` 的 `style` 字段、是否已适配 2026 新 style
- **Scope**: external
- **Date**: 2026-04-22

## 结论

**Conditional / 偏保守——建议 PR4 跳过 re-add。**

- **better-auth-ui 本身在积极维护**：npm `@daveyplate/better-auth-ui` 3.4.0（2026-03-23 发布），周下载 50.5K，last push 2026-04-03
- 无法直接验证 `r/*.json` 里的 `style` 字段内容（官网内容被 JS hydration 包裹，jina/exa 都只拿到首屏 marketing 文案，未见 JSON 原文）
- **间接证据不乐观**：ba-ui 官网 landing 页示例截图 + v3.x 文档都以 shadcn `new-york` 为演示基线，没有任何 changelog 条目显式提到 "Nova / Vega / base-ui / radix-nova" 字样
- 即便 re-add 成功，shadcn CLI 在 `style: "radix-nova"` 下会**尝试用 Nova 的 class/size tokens 重写 ba-ui 组件**，但 ba-ui 组件源码里可能硬编码了 Vega/new-york 的 `h-9 / px-3 / rounded-md`——diff 不可预测

**推荐决策**：PR3 切到 `radix-nova` 后，**不要重新 add ba-ui 的三个 registry**。接受 `/auth/sign-in` 和 `/settings/*` 保留 Vega 视觉、其他业务页面走 Nova 的"小面积双轨"。视觉割裂度评估：登录页是入口单页、`/settings` 在侧边深层路由——用户几乎不会在同屏对比两种 style，心理冲击低。

## 证据

### better-auth-ui 维护状态（积极）

来自 `registry.npmjs.org/@daveyplate/better-auth-ui`：

```
Version: 3.4.0 (Published Mar 23, 2026)
Weekly Downloads: 50.5K
License: MIT
11 Dependencies
```

来自 GitHub 仓库元信息：

```
Repository: better-auth-ui/better-auth-ui
Stars: 1554 / Forks: 151 / Open issues: 65
Last push: 2026-04-03T20:26:22Z
Contributors: 50
Releases: 11
```

### 三个 registry JSON 的可达性

`https://better-auth-ui.com/r/auth.json` / `user-button.json` / `settings.json`——这三个路径在 exa 搜索结果里没有返回 JSON 原文（只有 marketing 首页和 API reference），我（受限于 jina 工具不可用）**无法确认 `style` 字段的当前值**。

`ui.shadcn.com/docs/registry/namespace` 文档显示 shadcn registry 支持 `{style}` 占位符：

```json
{
  "@themes": "https://registry.example.com/{style}/{name}.json"
}
```

**但 ba-ui 是扁平 URL 分发（`/r/auth.json`），没有 `{style}` 占位**——说明 ba-ui 单套源码，不为多 style 提供分支。

### 维护者公开立场（未找到 base-nova 相关说明）

- ba-ui landing 页 / docs 只提 "shadcn/ui and HeroUI"，未区分 Radix/Base
- 无 ba-ui changelog 发布 "support base-nova" / "migrate to 2026 styles" 的条目
- GitHub commits/main 页内容被 GitHub React SSR 包裹，exa 无法穿透拿到具体 commit title

### 切 nova 后 re-add ba-ui 的潜在 diff（推测）

shadcn CLI overwrite 时会尝试按当前 `style` 重新生成组件。但 ba-ui registry 的 JSON 里如果硬编码了 `className: "h-9 px-3 rounded-md"` 这种 Vega 专属 token，CLI 不会自动替换成 Nova 的紧凑版。结果是**形式上切了 style、实际仍是 Vega 视觉**，而且把主人现在已经手工定制过的 ba-ui 源码（`src/components/auth/` `src/components/user/` `src/components/settings/`）一次性 overwrite 掉。

## 风险与建议

### PR4 建议：**跳过**（除非主人开 PR0 后期用 chrome-devtools 亲自对比）

- 不重新 add ba-ui 三个 registry，保留当前 `src/components/auth/ | user/ | settings/` 不动
- 视觉割裂度可控：
  - `/auth/*` — 独立入口页，无侧栏，用户从 `/login` 直接看到，不与 dashboard 同屏
  - `<UserButton />` — 头像按钮，在 Header/Sidebar 内 32px 圆形，受 `radius-full` 控制，Vega/Nova 无差异
  - `/settings/*` — 深层路由，用户进入后专注表单，不会对比 dashboard
- 接受 "框架 radix-nova + auth 页面 radix-vega" 割裂，在 session record 里记 TODO

### PR4 不该做

- 不要盲目 `--overwrite` ba-ui 三个 registry——会一次性覆盖三个子目录十几个文件，diff 读不过来
- 不要改 ba-ui 源码 className 来手工 "Nova 化"——下次 `pnpm dlx shadcn@latest add ba-ui` 时全丢失

### 主动验证手段（若主人仍想 re-add）

在本地开一个临时分支：

```bash
git checkout -b test/ba-ui-nova
# 改 components.json 的 style 到 radix-nova
pnpm dlx shadcn@latest add https://better-auth-ui.com/r/auth.json --overwrite
git diff src/components/auth/
```

目视 diff：若 className 里仍是 `h-9 rounded-md border`（Vega token）→ 说明 ba-ui 不适配 → 回滚分支。若出现 `h-8 rounded-sm`（Nova token）→ 说明已适配 → PR4 可执行。

### 长期建议

在 session record 里加 TODO：半年后（2026-Q4）再检查 ba-ui changelog 是否显式 support base-nova，届时统一再 re-add。
