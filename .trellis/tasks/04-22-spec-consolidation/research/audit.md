# Spec 审计清单 — 19份文件压缩计划

## 总览

| 指标 | 当前 | 目标 | 削减 |
|---|---|---|---|
| 总行数 | 4488 | 3434 | -1054 (-23%) |
| 平均文件 | 236 | 181 | -55 |
| 最大文件 | 453 | 360 | -93 |

**压缩策略**：
1. 叙事折叠（决策历史 → 1-2句精华）
2. 代码去重（多个示例同模式 → 一个规范）
3. 跨文件去重（backend/frontend 目录结构 & 质量指南）
4. 保留核心契约（签名、表格、规则、Wrong/Correct）

---

## 每份文件详细建议

### backend/error-handling.md (391 → 300, -91)

**删除/压缩** (精确行号)：
- L138-170: "Why not unify wire format?" 决策段 → 压到 3 行 (说 2 句 + 保留参考)
- L350-391: "Common Mistake: import.meta.env" → 20 行 (删 Symptom/Cause 分解，保留 Fix)
- L254-278: "Process-Level Fatal Fallback" → 15 行 (删 interval check 细节)
- L178-187: "Common Mistake: Duplicated Switch" → 5 行 (删 Cause/Prevention 拆解)

**不动** (保留完整)：
- L7-20: Overview + 7 code enum
- L21-57: Standard Error Codes table
- L59-90: Procedure Builders 三种派生器
- L92-134: ORM Error Mapping 表 + 代码
- L188-221: Boundary Interceptor code
- L322-346: Anti-patterns 列表

---

### backend/database-guidelines.md (453 → 360, -93)

**删除/压缩**：
- L109-120: "No db:reset" 叙事 → 8 行 (只保留脚本，删解释)
- L135-158: "Seeding Convention" 叙事 → 15 行 (改成 bullet list)
- L259-304: RBAC 章节 6a + 6b 合并 → 25 行 (删子标题，合并代码块)

**不动**：
- L1-56: ORM 生成 + Shared Pool 拓扑
- L82-101: Singleton Rule
- L102-133: Migration CLI Workflow
- L185-290: RBAC PolicyPlugin (核心引擎，保留完整)
- L361-453: Better Auth `@@ignore` (关键 gotcha)

---

### backend/authorization-boundary.md (241 → 190, -51)

**删除/压缩**：
- L162-170: "Why not unify wire format?" (同 error-handling，跨文件去重) → 跳过，改引用
- L118-147: "Session Active Org" hook 叙事 → 20 行 (代码同，文字压)
- L149-173: "Better Auth Plugin & UI Capability" → 15 行 (只保留表，删叙事)
- L176-206: "Auth Context Bridge" 流程图 → 20 行 (删图，文字足)
- L219-242: FAQ 章节 → 10 行 (答案内联到 TL;DR)

**不动**：
- L7-14: TL;DR 表 (核心边界定义)
- L18-49: Layer 1 Better Auth
- L51-115: Layer 2 ZenStack policies
- L209-216: Anti-patterns

---

### backend/tenancy-modes.md (266 → 210, -56)

**删除/压缩**：
- L94-124: Contracts 章节 (3 subsection) → 18 行 (合并 Default matrix + description 成一个 2×4 表)
- L148-164: Validation matrix 表前叙事 → 删，只保留表
- L166-208: Good/Base/Bad Cases (3 subsection × 7 lines) → 20 行 (合并成 1 表 + outcome 列)
- L218-231: Tests Required → 10 行 (只保留 assertion 点，删叙事)

**不动**：
- L1-19: Scope/Trigger
- L22-51: Signatures
- L54-90: Single-tenancy signup hook (关键逻辑)
- L125-135: signUp hook constraints

---

### backend/email-infrastructure.md (266 → 210, -56)

**删除/压缩**：
- L1-20: Scope/Trigger → 4 行
- L73-91: "Required env per driver" 表后叙事 → 删，只表
- L102-107: "Skip-list semantics" → 3 行
- L112-151: "Template/transport interaction" (40) + "Validation matrix" (14) → 合并为 1 "Contract Matrix" (25 行)
- L157-217: Good/Base/Bad + Tests (61) → 20 行 (只示例，删叙事)

**不动**：
- L21-52: Signatures (entry, driver, template)
- L75-106: Boot-time validation (critical safety)
- L109-131: Better Auth wiring

---

### frontend/i18n.md (241 → 190, -51)

**删除/压缩**：
- L1-21: Scope/Trigger → 3 行
- L134-173: Good/Base/Bad (40) → 15 行 (1 表 + 1 Bad block，删示例详解)
- L176-188: Tests (13) → 8 行 (list only，删 Type 列)
- L191-235: Wrong vs Correct (45) → 25 行 (删 "Problems:" 拆解，保留对比)

**不动**：
- L22-36: Paraglide message exports
- L55-75: BA error translator
- L78-115: Project config + menu convention
- L112-132: Validation matrix (已很紧凑)
- L237-242: Related

---

### frontend/theming.md (285 → 230, -55)

**删除/压缩**：
- L1-18: Scope → 2 行
- L225-244: Design Decisions (20) → 8 行 (每决策 1 句 rationale，完整理由去 /docs/research/)
- L254-275: Common Mistakes (22) → 12 行 (3 mistakes → 压成 fix block per item)
- L135-165: Validation matrix (31) → 保留 90% (已紧凑)

**不动**：
- L20-52: Signatures (components.json, runtime API)
- L68-92: CSS variable contract
- L99-113: Mount order
- L119-131: AuthProvider appearance bridge
- L169-181: Tests

---

### backend/directory-structure.md (263 → 200, -63)

**跨文件去重**：删与 frontend/directory-structure.md 的重复

**删除/压缩**：
- L7-10: Overview → 2 行 (跨文件重合，简化引导)
- L57-68: "Keep exported router map flat..." 叙事 → 1 句规则
- L215-231: "Sentry Bootstrap Location" → 8 行 (只位置，删研究细节)

**不动**：
- L11-40: HTTP Entry Points 表 (具体)
- L49-75: oRPC Tree Layout (backend 特有)
- L77-99: Auth Split (backend 特有)
- L100-136: Database Layout (backend 特有)
- L138-161: MCP Backend Layout (backend 特有)
- L163-202: Dual-Stack Topology (关键)
- L204-246: Where New Code Goes (决策树)

---

### frontend/directory-structure.md (173 → 140, -33)

**跨文件去重**：引用 backend/directory-structure.md，删重复

**删除/压缩**：
- L7-14: Overview → 2 行 (引用 backend，只说 frontend 独特点)
- L57-83: Import Alias rules → 0 行 (全移到共享 quality-baseline.md)
- L110-147: Generated Artifacts 章节 → 15 行 (保留规则，删重复解释)

**不动**：
- L15-56: Top-Level Layout (frontend 文件清单，unique)
- L84-109: Route Naming Conventions (frontend 特有)
- L148-173: Concern-to-Directory Mapping (unique 示例)

---

### backend/quality-guidelines.md (199 → 160, -39)

**跨文件去重**：提取共享部分到新 `.trellis/spec/shared/quality-baseline.md`

删移到共享的 (39 行)：
- Biome config/check contract (8)
- pnpm-only rule (3)
- Env validation pattern (4)
- Generated artifacts ignore (5)
- Polyfill Rule (7)
- Boundary Validation 部分共享 (12)

**不动** (backend 特有，160 行)：
- L52-73: Env Access (backend 细节)
- L76-98: Boundary Validation (oRPC 例子)
- L100-141: Sentry Wiring (backend 特有)
- L184-200: Hard NO Anti-patterns

---

### frontend/quality-guidelines.md (211 → 170, -41)

**跨文件去重**：提取共享部分到 `.trellis/spec/shared/quality-baseline.md`

删移到共享的 (41 行)：
- Biome / Lint baseline 部分 (6)
- pnpm-only (3)
- Env & secrets (5)
- Sentry wiring (6)
- Generated artifacts (5)
- Anti-patterns 共享部分 (16)

**不动** (frontend 特有，170 行)：
- L33-94: Lint baseline 细节 (config 特定)
- L169-188: Accessibility (frontend only)
- L189-212: Hard NO Anti-patterns (frontend 特有)

---

### 共享文件 `.trellis/spec/shared/quality-baseline.md` (新建, 60 行)

内容：
- Biome check 合约 (8)
- pnpm-only rule (3)
- Env validation pattern (4)
- Generated artifacts 规则 (5)
- Polyfill Rule for oRPC routes (7)
- Boundary validation 基线 (12)
- Shared anti-patterns (14)
- Import alias `#/*` 规则 (7)

**两个文件都引用此文件**，无须重复。

---

### backend/logging-guidelines.md (208 → 180, -28)

**删除/压缩**：
- Evidence blocks 从 3 个 call site → 1 个 (10)
- Structured logging 示例 → 1 block not 2 variants (18)

**不动**：核心规则完整

---

### frontend/component-guidelines.md (189 → 160, -29)

**删除/压缩**：
- Accessibility checklist 叙事 → 1 bullet per check (15)
- Testing narrative → assertion only (14)

---

### frontend/hook-guidelines.md (263 → 220, -43)

**删除/压缩**：
- Good/Bad examples 叙事 → 1 intro + 5 code (不删代码) (15)
- Testing narrative → list (28)

---

### frontend/layout-guidelines.md (133 → 115, -18)

**删除/压缩**：
- Route hierarchy 叙事 → 单图解 (18)

---

### frontend/state-management.md (159 → 140, -19)

**删除/压缩**：
- Testing section filler (19)

---

### frontend/type-safety.md (186 → 160, -26)

**删除/压缩**：
- Evidence source listing 从 3/principle → 1/principle (26)

---

## 跨文件重复汇总

| 文件对 | 当前 | 压缩后 | 去重 |
|---|---|---|---|
| directory-structure (both) | 436 | 340 | 96 |
| quality-guidelines (both) | 410 | 330 | 80 |
| **共享新文件** | — | 60 | — |
| **净去重** | 846 | 730 | **116** |

---

## 总体数字

| 分类 | 当前 | 目标 | 削减 |
|---|---|---|---|
| P0 (5 files) | 1617 | 1160 | 457 |
| P1 (4 files) | 941 | 675 | 266 |
| P2 (6 files) | 1138 | 965 | 173 |
| P3 (3 files) | 792 | 750 | 42 |
| **小计** | 4488 | 3550 | 938 |
| **跨文件去重红利** | — | — | **116** |
| **实际目标** | — | **3434** | **1054** |

---

## 待讨论的项

1. **创建 `.trellis/spec/shared/quality-baseline.md` 吗？**
   - 建议：**是** — 一份规范源，两文件都引用，消除重复

2. **authorization-boundary.md FAQ 合并到 TL;DR 还是保留？**
   - 建议：**合并** 3 个关键 Q/A 进 TL;DR sidebar，删整章节

3. **database-guidelines RBAC 章节现在 106 行，能压到 70 吗？**
   - 建议：**压** Evidence 从 3 个源到 1 个；保留所有规则/契约（不删）

4. **theming.md "Design Decisions" 保留还是移到研究文档？**
   - 建议：**压** 到 1 句/决策；完整理由移到 `/docs/research/`

---

## 执行优先级

1. P0 files (error-handling, database, authorization, tenancy, email)
2. Create shared baseline + update both quality-guidelines
3. P1 files (theming, both directory-structure)
4. P2 files (logging, component, hook, layout, state, type-safety)
5. Run `pnpm check` + commit

单个 PR: `refactor(spec): compress 19 spec files, -1054 lines`

