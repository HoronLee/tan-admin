# Research: shadcn/create Web UI 默认 Vega + `shadcn apply` 命令（二次核实）

- **Query**: 验证"是否应该用 Nova"——结果发现两条颠覆性事实
- **Scope**: external
- **Date**: 2026-04-22

## 结论

**Vega 才是 shadcn/create Web UI 的官方推荐默认**（主人亲眼在 UI 上看到 Style 第一位 + 已勾选 Vega），而不是 PR0 研究里说的 Nova。同时 **2026-04 新增的 `shadcn apply --preset <id>` 命令**让整个迁移从"手工 `shadcn add --overwrite × 28`"变成**一条命令**——这是 PRD PR3 章节最大的游戏规则改变。

**推荐决策**：style 选 `radix-vega`（保留 new-york 视觉连续性 + 与 ba-ui 天然匹配 = **零视觉割裂**），用 `shadcn apply --preset bIkez2m` 一次性应用 neutral + radius 新公式 + font + 28 组件 reinstall。

## 证据

### CLI 和 Web UI 的默认不一致

**shadcn CLI docs**（`ui.shadcn.com/docs/cli`）：

```
-d, --defaults   use default configuration: --template=next --preset=nova (default: false)
```

CLI `--defaults` 用的是 Nova。

**shadcn/create Web UI**（主人 2026-04-22 截图，URL `ui.shadcn.com/create?preset=blkeymG`）：

Style 下拉菜单顺序 + 默认选择：
1. **Vega** ✅（勾选状态）
2. Nova
3. Maia
4. Lyra
5. Mira
6. Luma
7. **Sera**（2026-04 新增，PR0 研究时还没出现）

Base Color: Neutral
Theme: Neutral
Chart Color: Neutral
Heading: Inter

**解读**：CLI `--defaults` 走 Nova 可能是针对"admin/dashboard 快速跑通"的 opinion，而 Web UI 以 Vega 为首位推荐——Vega = 原 new-york 改名，生态积累最深（blocks / v0 生成示例 / third-party registry 全部以 Vega 为基线）。

### shadcn apply 命令（2026-04 新增）

**来源**：`ui.shadcn.com/docs/changelog` 2026-04 条目 + `ui.shadcn.com/docs/cli#apply`：

> "We added `shadcn apply` so you can switch presets in an existing project without starting over.
>
> When you run `npx shadcn@latest apply` in an existing project, we apply a new preset, reinstall your existing components, and update your theme, colors, CSS variables, fonts, and icons."

```
Usage: shadcn apply [options] [preset]
 
apply a preset to an existing project
 
Options:
  --preset <preset>  preset configuration to apply
  --only [parts]     apply only parts of a preset: theme, font
  -y, --yes          skip confirmation prompt. (default: false)
  -c, --cwd <cwd>    the working directory. defaults to the current directory.
  -s, --silent       mute output. (default: false)
```

**关键点**：
- **没有 `--dry-run`**（只有 `add` 有 `--dry-run` / `--diff` / `--view`）
- 支持 `--only theme` / `--only font` 分步应用
- 自动完成：`components.json` 更新 / styles.css 色值换 / radius 公式 / font / icons / 28 组件 reinstall

### ba-ui 与 Vega 的天然匹配

PR0 研究（`ba-ui-base-nova-compat.md`）已证：
- ba-ui registry 是扁平 URL（`/r/auth.json`），单套源码，不分 style
- ba-ui 官网 demo / docs 全部以 new-york (= Vega) 为视觉基线

**结论顺推**：只要项目 style 保持 Vega 家族（`radix-vega`），ba-ui 三个 registry (`src/components/auth | user | settings/`) 与项目主站**自动视觉匹配**。原计划的"R11 条件 re-add"彻底没必要。

### Sera 补充（2026-04 新增）

Changelog 2026-04：
> "Introducing Sera, a new shadcn/ui style. Minimal. Editorial. Typographic. Underline Controls and Uppercase Headings. Shaped by Print Design Principles."

Typography-first 风格，用 serif 标题 + sans-serif 正文 + 方角 + 大写字母间距 + 下划线控件。**编辑类产品用**，后台管理不适合，略过。

## 风险与建议

### PR3 重写（最大改动）

**原计划**（基于 radix-nova）：
```bash
# 手工改 components.json
# 然后：
pnpm dlx shadcn@latest add button card ... <28 组件> --overwrite
# 手工修自写组件的破相点（DataTable / FormDrawer / ConfirmDialog）
# 预估 3h
```

**新计划**（基于 apply --preset + Vega）：
```bash
# 一条命令：
pnpm dlx shadcn@latest apply --preset bIkez2m
# 然后 git diff review
# 预估 0.5-1h
```

收益：
- 工作量 3h → 0.5-1h
- 零手工改 components.json / styles.css 色值的错误面
- 28 组件 reinstall 由 CLI 完成，diff 清晰
- Vega 视觉 = new-york 视觉 → 自写组合组件（DataTable / FormDrawer / ConfirmDialog）大概率**零破相**
- ba-ui 三个 registry 保持不动就能视觉统一

### 风险兜底

- 没有 `--dry-run`，只能用 git 做 undo 层：先 commit brainstorm 产出（PRD + research）建立锚点 → 跑 apply → `git diff` review → 不满意 `git reset --hard HEAD^`
- `apply` 是 2026-04 新命令，可能有 bug——如果 reinstall 组件时覆盖了 biome 豁免相关的结构（比如 a11y role），review 时重点看 diff
- `--only theme` / `--only font` 分步应用可降低单次 diff review 负担，但主人选了路径 2（全量一把），依赖 git reset 兜底

### preset id 包含什么

preset id `bIkez2m` 对应 shadcn/create 的可视化配置。主人确认了 Style=Vega + Base Color=Neutral + Theme=Neutral + Chart Color=Neutral + Heading=Inter（Body font 未确认，由 apply 实际应用后看）。URL 里 `template=start` 参数对 `apply` 无影响（只影响 `init` 新建项目场景）。

### 终止 PR4 / 不需要 Nova

- PR4（ba-ui re-add）**彻底删除**：Vega 方案下 ba-ui 天然匹配
- 原"R10 改为 radix-nova"的结论作废：改为 **radix-vega**
- 原"ba-ui Nova 不兼容"的担忧消解：根本不迁 Nova

## 对 PR0 研究结论的修订

| 研究文件 | 原结论 | 修订后 |
|---|---|---|
| `base-nova-style-migration.md` | "迁 radix-nova" | **作废，改为 radix-vega**（保留 Vega 生态 + ba-ui 天然匹配） |
| `ba-ui-base-nova-compat.md` | "跳过 ba-ui re-add（Nova 不兼容）" | **结论仍然有效**，但理由换成"Vega 本就是 ba-ui 基线，无需 re-add" |
| `next-themes-tanstack-start.md` | 原推荐 tanstack-theme-kit，已在前轮修正为 shadcn 官方自写 ThemeProvider | **保持** |
| `radius-scale-upgrade.md` | "零视觉风险可直接升" | **保持**（apply 命令会自动升级） |

## 下一步

1. 主人 commit 本次 brainstorm 产出（PRD + 5 份 research）
2. 我跑 `pnpm dlx shadcn@latest apply --preset bIkez2m`（路径 2 · 全量）
3. `git diff` review 变更
4. 跑 dev server 浏览器走查 dashboard / users / menus / organization / /auth/sign-in / /settings/account
5. 满意 → 继续 PR1（theme-provider 自写 + ThemeToggle 重写）+ PR2（清 legacy tokens / body gradient / demo classes / about.tsx）
6. 不满意 → `git reset --hard HEAD^` 回滚到 brainstorm commit
