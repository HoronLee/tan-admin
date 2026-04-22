# Spec 体系浓缩：去重 + 沉淀 tenancy-phase1 遗漏

## 背景

经过 identity-layer-v2 / theme-cleanup / tenancy-phase1 三个大任务，`.trellis/spec/` 已膨胀到 22 份文件 / 4488 行。问题：

1. **局部肥大**：`error-handling.md` 391 行、`database-guidelines.md` 453 行、`theming.md` 285 行——单文件过长影响 AI 上下文加载和人工 scan
2. **跨文件可能有重复**：`directory-structure.md` 前后端各一份、`quality-guidelines.md` 前后端各一份，未做过差异审计
3. **历史 "Why we chose X over Y" 段落开始占比上升**：这些在决策当时有价值，但执行时更像噪音
4. **tenancy-phase1 两个关键产出未沉淀**：
   - BA `organizationHooks` 是组织生命周期约束的唯一正确位置（authorization-boundary 只讲了表归属，没讲 hooks 归属）
   - `translateAuthError` 作为 BA 错误码 → 中文文案的集中映射（error-handling 只讲 oRPC 链路，没讲 BA 客户端错误）

## 目标

- **量化目标**：总行数压到 **≤ 3600 行**（-20%）、单文件 **≤ 350 行**
- **质量目标**：每份 spec 首屏（前 30 行）必须是可操作的"契约表 / 规则列表 / 锚点"，而非叙事
- **补齐目标**：把 tenancy-phase1 的 BA hooks 归属 + translateAuthError Convention 以**浓缩**形态补进对应 spec，而非新增章节堆料

## 不做

- 不合并 spec 文件（directory-structure 前后端分离是刻意设计）
- 不改 `guides/*.md`（thinking 层本来就短）
- 不动 `index.md`（仅做文末锚点更新）
- 不新写 spec 文件

## 范围

### 阶段 A：全量 audit（不改内容，只产审计清单）

对 19 份 spec 文件（不含 3 个 index.md）各读一遍，每份产出：
- 当前行数 / 目标行数
- 可删内容（重复、过时锚点、过度叙事）
- 可压内容（长 code block → 锚点 + 短片段、FAQ 合并）
- 本次 tenancy-phase1 是否有内容待补

### 阶段 B：执行浓缩（按优先级批次）

**P0 — 肥大且有历史包袱**
- `backend/error-handling.md` 391 → ≤ 320
- `backend/database-guidelines.md` 453 → ≤ 350
- `backend/authorization-boundary.md` 241 → 保持 ~260（+BA hooks 归属，需挤其他段落 20 行）

**P1 — 新写的可能偏铺张**
- `backend/tenancy-modes.md` 266 → ≤ 240
- `backend/email-infrastructure.md` 266 → ≤ 240
- `frontend/i18n.md` 241 → ≤ 220

**P2 — 中等体量 + 可能跨前后端重复**
- `frontend/theming.md` 285 → ≤ 260
- `backend/directory-structure.md` + `frontend/directory-structure.md` 差异审计，消除重复表述
- `backend/quality-guidelines.md` + `frontend/quality-guidelines.md` 同上

**P3 — 已经够短，跳过**
- `hook-guidelines.md` / `state-management.md` / `logging-guidelines.md` / `component-guidelines.md` / `type-safety.md` / `layout-guidelines.md`

### 阶段 C：补齐 tenancy-phase1 遗漏（浓缩形态）

**`authorization-boundary.md` 新增 "BA Hooks 的归属"** ≤ 25 行：
- 4 行 hook 位点表（beforeAcceptInvitation / beforeUpdateMemberRole / beforeRemoveMember / user.create.after）
- 3 条规则：throw 即否决、共享 pool 裸 SQL、不在 handler 重复
- 1 对 Wrong/Correct（policy 管 @@ignore 表 → hook 里判定）

**`error-handling.md` 新增 "BA 错误分流 Convention"** ≤ 15 行：
- 2×2 表：oRPC typed errors / BA client errors × reportError / translateAuthError
- 1 条混合 catch pattern

总补齐增量 ≤ 40 行（而不是第一次尝试的 111 行）。

## 验证

- `wc -l .trellis/spec/**/*.md` 总行数 ≤ 3600
- 每份改过的 spec 首屏（前 30 行）过目——是否一眼可操作
- `.trellis/spec/backend/index.md` / `frontend/index.md` 里的文件链接全部可达
- BA hooks / translateAuthError 规则存在且简短

## 风险

- **信息丢失**：压缩时可能删掉将来会用到的"为什么"。缓解：历史决策段落保留 1-2 句精华 + 指向 task archive 的链接（而非删除）
- **AI 误解加剧**：浓缩后缺少上下文反而让 AI 更难理解。缓解：浓缩前后用典型 prompt 做一次对照（比如"在 tan-admin 里写一张业务表，policy 怎么写"），看 spec 召回是否仍准确

## 交付物

一个 commit：`docs(spec): 批量浓缩 spec 体系 + 补齐 tenancy-phase1 产出`

commit body 列出每份文件的 -N 行变化。
