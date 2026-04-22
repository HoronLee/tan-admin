# Research: base-nova 稳定性与迁移可行性

## 🚨 结论作废（2026-04-22 二次核实）

**原结论"迁 radix-nova"已废弃**。见 `shadcn-apply-command-finding.md` —— 发现 shadcn/create Web UI 默认 **Vega**（不是 Nova），且 ba-ui 本就以 Vega 为基线。正确决策是 **style 留在 Vega 家族（`radix-vega`）**，用 `shadcn apply --preset <id>` 一条命令完成 neutral + radius + font 迁移，**零视觉割裂**。

本文件对 "Nova 含 primitive 库切换（Radix → Base UI）" 的技术分析仍有效（论证了为何不选 `base-nova`），但"推荐 radix-nova" 的最终结论已被新发现覆盖。

---

# 原分析（过时部分保留备查）

---


- **Query**: shadcn `base-nova` style 是否已 stable、CLI overwrite 是否可靠、与 `new-york` 的源码差异
- **Scope**: external
- **Date**: 2026-04-22

## 结论

**Conditional.** `base-nova` 已 **stable 发布**（2025 年 12 月 `npx shadcn create` 上线，2026 年 3 月 shadcn/cli v4 中 `--defaults` 默认 preset = `base-nova`；2026-04-02 schema enum 已包含 `base-nova`）。但 PRD 把它当成 `new-york` 的"包装替换"是**错误认知**——`base-nova` 其实是**两个维度的复合切换**：

1. **primitive 库**从 Radix UI → Base UI（`@base-ui/react`，由 MUI 团队维护）
2. **视觉风格**从 Vega（=new-york）→ Nova（紧凑、padding/margin 更小）

`components.json` 的 `style` 字段格式必须写成 `{library}-{style}`，10 种合法组合：`radix-vega / radix-nova / radix-maia / radix-lyra / radix-mira / base-vega / base-nova / base-maia / base-lyra / base-mira`。PRD 里写的 `style: "base-nova"` 语法正确，**但会同时切换 primitive 库**。

**核心 breaking change**：Radix 用 `asChild` + `Slot` 暴露 trigger，**Base UI 用 `render` prop**。项目里 `asChild` 共 48 处（UI 层 31 + 业务层 17），**全部**要在 `overwrite` 后手工迁移。这比 PRD 预估的"目测 padding/spacing"严重得多。

建议：**走 `radix-nova` 而不是 `base-nova`**。保留 Radix 原语（28 个 UI 组件 + 48 处 asChild 零改动），只拿 Nova 的紧凑视觉变化 + 新 radius scale。若坚持 `base-nova`，单 PR3 要膨胀到 6-8h 来迁移所有 trigger。

## 证据

### shadcn 2026 style 体系（来自 changelog + 官方 docs）

2025-12 `npx shadcn create` 上线，一次性发布 5 个命名视觉风格（引用 `ui.shadcn.com/docs/changelog/2025-12-shadcn-create`）：

- **Vega** — classic（原 new-york）；medium radius，balanced spacing
- **Nova** — reduced padding & margins，compact，dashboards/admin 首选
- **Maia** — soft，大圆角 + 充足间距
- **Lyra** — 零圆角、硬朗
- **Mira** — 最紧凑

2026-03 新增 Luma。2026-04-02 `schema.json` enum 更新为：

```
["default", "new-york",
 "radix-vega", "radix-nova", "radix-maia", "radix-lyra", "radix-mira", "radix-luma",
 "base-vega", "base-nova", "base-maia", "base-lyra", "base-mira", "base-luma"]
```

（`shadcn-ui/ui` commit `95479a0`）

官方 `skills/shadcn/cli.md` 明示 `--defaults` 的 preset = `base-nova`——已是新工程的推荐默认。

### Base UI vs Radix UI 原语切换（关键风险）

来自 DeepWiki `shadcn-ui/ui/6.3-base-vs-radix-component-variants`：

> The most significant developer-facing difference between the two variants is how they handle custom triggers and composition.
>
> Radix-based components use the `Slot` primitive from `@radix-ui/react-slot`. When `asChild` is passed to a trigger...
> Base UI components use a `render` prop (or functional children) to provide state and props to a custom element.

示例（来自 `shadcnblocks.com/docs/blocks/base-ui`）：

```tsx
// Radix UI pattern
<Button asChild>
  <a href="/about">About</a>
</Button>

// Base UI pattern（CLI 会做转换）
<Button render={<a href="/about" />}>
  About
</Button>
```

### Nova 的视觉差异（对 28 个已安装组件的影响）

- Vega：`border-radius` medium（`--radius: 0.5rem/0.625rem`），padding 平衡
- Nova：radius **small**，padding/margin **更紧**，min-height 更小；适合 dashboard/admin

换句话说：`components.json` 从 `new-york` 切到 `radix-nova` 或 `base-nova`，CLI `add --overwrite` 时 **所有 28 个组件的 size tokens（h-9/h-10、px-3/px-4）会改**，不是简单的 className 重排。

### CLI overwrite 稳定性

- `shadcn-ui/ui#7058`（2025-03，已关闭）指出 CLI 对 `style: default` 的处理有 bug，shadcn 本人的回复："`default` was an old style which is going to be deprecated. Use `new-york` for new v4 styles."
- 2026-03 发布的 **shadcn/cli v4** 新增 `--dry-run`、`--diff`、`--view` flags，强化 overwrite 前的可观测性
- 2026-03 base-ui 组件 #9764 radio-group 指示器偏心 bug（非 blocker，PR #9763 修复）——说明 base-ui 组件线**还有小 bug 在修**

结论：CLI overwrite 可靠，但 base-ui 组件不如 radix 稳定，偶发小 bug。

## 风险与建议

### PR3 应做

- **把 PRD R10 的 `style: "new-york" → "base-nova"` 改为 `"new-york" → "radix-nova"`**——只吃 Nova 视觉收益，零 primitive 迁移成本
- `pnpm dlx shadcn@latest add <28 components> --overwrite` 前先用 `--diff` 逐个 review，再 `--overwrite` 应用
- 重点目测：`button.tsx` / `card.tsx` / `sidebar.tsx` / `sheet.tsx` / `alert-dialog.tsx`——Nova 紧凑后 dashboard 可能视觉更"小"，需确认接受
- `biome.json` 里 `src/components/ui/**` 的 a11y overrides 可能不再需要（nova 重构过 role 套路），re-add 后逐个测

### PR3 不应做

- **不要**切 `base-nova`，除非主人接受 48 处 asChild → render 迁移 + Base UI 额外学习成本
- 不要一次性所有组件 `--overwrite`，先在 feature branch 对单个组件 diff（如 `button` + `card` + `sidebar`）验证视觉再扩大范围

### 若决定坚持 base-nova（不推荐）

- PR3 预算从 3h 涨到 6-8h
- 新增一步：全局替换 `asChild` 模式为 Base UI 的 `render` prop
- 检查 `@base-ui/react` 是否已在依赖；不是的话需要 `pnpm add @base-ui/react` 并移除 `@radix-ui/*`
- 所有 TanStack Router 的 `<Link asChild>` 套娃（AppSidebar / AppTabbar / Breadcrumb）都要重写
