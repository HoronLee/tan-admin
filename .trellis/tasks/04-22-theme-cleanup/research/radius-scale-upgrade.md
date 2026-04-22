# Research: Radius scale 新公式对 29 个组件的实际视觉影响

- **Query**: 项目 `--radius: 0.625rem = 10px`，旧公式 `±px` vs 新公式 `*倍率` 的像素 diff
- **Scope**: internal + external（docs 交叉验证公式）
- **Date**: 2026-04-22

## 结论

**视觉回归风险 ≈ 0**。新旧公式在 `--radius: 10px` 下，sm / md / lg / xl **四档像素值完全相同**，2xl/3xl/4xl 是新增档位但**项目所有 28 个 shadcn UI 组件零使用**（本地 grep 已确认）。唯一使用 `rounded-2xl` 的三处全在 legacy demo（`about.tsx` + `(admin)/_layout/dashboard.tsx`），本次 task 本就要删。

**建议 PR2 直接升级**，无需观察期、无需分批。

## 证据

### 像素精确对照表（`--radius: 0.625rem = 10px`）

| Token | 旧公式 | 旧值 | 新公式 | 新值 | Diff |
|---|---|---|---|---|---|
| `--radius-sm` | `calc(var(--radius) - 4px)` | **6 px** | `calc(var(--radius) * 0.6)` | **6 px** | ✅ 0 |
| `--radius-md` | `calc(var(--radius) - 2px)` | **8 px** | `calc(var(--radius) * 0.8)` | **8 px** | ✅ 0 |
| `--radius-lg` | `var(--radius)` | **10 px** | `var(--radius)` | **10 px** | ✅ 0 |
| `--radius-xl` | `calc(var(--radius) + 4px)` | **14 px** | `calc(var(--radius) * 1.4)` | **14 px** | ✅ 0 |
| `--radius-2xl` | （未声明） | n/a | `calc(var(--radius) * 1.8)` | **18 px** | ⚠️ 新增 |
| `--radius-3xl` | （未声明） | n/a | `calc(var(--radius) * 2.2)` | **22 px** | ⚠️ 新增 |
| `--radius-4xl` | （未声明） | n/a | `calc(var(--radius) * 2.6)` | **26 px** | ⚠️ 新增 |

**前 4 档完全对齐**——这不是巧合，而是 shadcn 官方故意选取 `0.6/0.8/1.4` 倍率，让 `--radius = 0.625rem` 时与旧公式 `-4/-2/+4px` 的历史项目**零像素变动**。

官方出处（`ui.shadcn.com/docs/theming`）：

```css
@theme inline {
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}
```

### 项目内 radius 使用统计

**`src/components/ui/` 28 个 shadcn 组件（本地 Grep 结果）**：

- `rounded-md`：button / input / textarea / input-group / field / tooltip / sidebar（10 处）/ dropdown-menu / avatar-group 等——共约 30+ 处
- `rounded-lg`：card（1）/ tabs（2）/ dialog（1）/ alert-dialog（2）/ sidebar（2）——共 8 处
- `rounded-xl`：card.tsx（1 处：`rounded-xl border bg-card`）/ sidebar.tsx（1 处：`inset` variant）——共 2 处
- `rounded-sm`：select / dropdown-menu / checkbox 等
- `rounded-full`：avatar / badge / slider / switch / radio-group
- `rounded-2xl / 3xl / 4xl`：**0 处**
- 硬编码 `rounded-[4px] / rounded-[2px] / rounded-[calc(var(--radius)-5px)]`：checkbox、tooltip、input-group 等——不受公式影响，独立演化

**业务层（非 `ui/` 目录）**：

- `rounded-2xl`：3 处（`about.tsx:10`、`dashboard.tsx:11/26/38`）——**全部是本次 task R5/R7 要删/重写的 legacy demo**
- `rounded-3xl / 4xl`：0 处

### 等价性验证（数学）

`--radius * 0.6 = 10 * 0.6 = 6` vs `--radius - 4px = 10 - 4 = 6` ✅
`--radius * 0.8 = 10 * 0.8 = 8` vs `--radius - 2px = 10 - 2 = 8` ✅
`--radius * 1.4 = 10 * 1.4 = 14` vs `--radius + 4px = 10 + 4 = 14` ✅

**只要 `--radius` 保持 10px，升级零视觉影响。**

### 未来调 --radius 的弹性（新公式优势）

假设主人未来把 `--radius` 改成 `0.5rem = 8px`（更紧凑）：

- 旧公式：sm=4 / md=6 / lg=8 / xl=12（差 4px ratio 变 0.5）
- 新公式：sm=4.8 / md=6.4 / lg=8 / xl=11.2（所有档位保持 0.6/0.8/1.0/1.4 倍率）

新公式在"整体缩放 radius"时视觉节奏更统一。旧的"固定 ±px"在小 --radius 下 sm 会显得过方、xl 会显得过圆。

## 风险与建议

### PR2 做（推荐，零风险）

直接替换 `src/styles.css` 第 146-149 行：

```css
/* 旧 */
--radius-sm: calc(var(--radius) - 4px);
--radius-md: calc(var(--radius) - 2px);
--radius-lg: var(--radius);
--radius-xl: calc(var(--radius) + 4px);

/* 新（与官方 2026 标准对齐） */
--radius-sm: calc(var(--radius) * 0.6);
--radius-md: calc(var(--radius) * 0.8);
--radius-lg: var(--radius);
--radius-xl: calc(var(--radius) * 1.4);
--radius-2xl: calc(var(--radius) * 1.8);
--radius-3xl: calc(var(--radius) * 2.2);
--radius-4xl: calc(var(--radius) * 2.6);
```

前 4 档像素不变，后 3 档是纯新增档位，无旧组件引用。

### PR2 不做

- 不要趁机改 `--radius` 本身的值（`0.625rem`）——那会同时改 4 档像素，增加视觉 regression 面
- 不要只加 `--radius-2xl` 不加 `--radius-3xl / 4xl`——保持与 shadcn docs 完整 scale 对齐，未来 v0 / shadcn blocks 生成的代码里若引用 `rounded-3xl` 会零适配

### 无需验证

由于前 4 档数学恒等，chrome-devtools 双模式视觉 diff **在 radius 维度没有意义**（可以省一次验证，集中精力到 PR3 的 Nova 紧凑 spacing 验证上）。
