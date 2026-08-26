# 单元测试计划（三安光电 AI 费用预决算管理系统）

> 制定日期：2026-08-26 · 配合 `docs/testing/MODULE_MAP.md` 使用。
> 本计划聚焦**确定性单元层**（前端内核 + 业务规则 + 意图路由 + 前后端口径契约）。端到端浏览器测试（E2E）属另一范畴，见 `tests/e2e/`。

## 1. 目标与范围

- **目标**：在无需浏览器、无需起后端的前提下，对系统的「确定性计算内核 / 业务规则 / 权限闸门 / AI 意图路由」建立可重复、可 CI 的单测基线，并交叉校验前后端计算口径一致性。
- **范围（In）**：`website/core/calc.js`（7 函数）、`website/core/state.js`（预算派生/审批/采购/调整/报销/权限）、`website/core/engine.js`（意图路由）、前端/后端 `decomposeMonthly` 口径契约。
- **范围（Out）**：DOM 渲染、真实后端 API（HTTP）、数据库读写副作用、移动端视图、E2E 交互。这些由 `tests/api/*.cjs` 与 `tests/e2e/*.cjs` 覆盖，不在本计划内。

## 2. 环境与桩

- **运行时**：Node ≥ 22（用托管版本 `/Users/yangjackson/.workbuddy/binaries/node/versions/22.22.2/bin/node`，无需安装依赖）。
- **不依赖浏览器**：通过 `tests/unit/harness.js` 注入内存桩：
  - `global.window.BM`：按 `data → calc → state → engine` 顺序加载前端模块（复用浏览器同款源码，非副本）。
  - `global.localStorage`：内存 Map 桩（不落盘，不污染真实状态）。
  - `global.fetch`：一律 reject（单测不触网）。
  - `global.document`：最小空桩（防止潜在引用）。
- **账户/登录**：使用演示数据（`BM.DEPTS`/`CATEGORIES`/`PROJECTS`/`SUGGESTIONS`），不调用真实登录；角色通过 `BM.state.role` / `BM.state.user` 直接设定。
- **隔离**：每个用例前 `BM.resetState()`，保证互不污染。

## 3. 测试入口与命令

```bash
# 新单测套件（4 套，68 用例）
node tests/unit/run.js

# 既有 calc 内核基线（16 用例）
node website/tests/test_calc.js
```

## 4. 策略

| 策略 | 说明 |
|---|---|
| 纯函数直接断言 | `calc.js` 7 函数：边界值、夹紧、确定性可复现、共识阈值、对标分布。 |
| 状态集成（内存桩） | `state.js`：注入 `transfers`/`role`/`user`/`rules` 后断言派生与副作用（采购/调整/报销/调剂）。 |
| 意图路由 | `engine.js`：`reply()` 各关键词分支命中正确子类（`type` 判别）。 |
| 前后端契约（只读） | 抽取两端默认权重，真实执行 `decomposeMonthly` 并逐月比对，捕获口径漂移。 |

## 5. 用例清单（按套件）

### Suite A — `calc.js` 边界/异常分支扩展（`tests/unit/calc.test.js`，26 例，优先级 P1）
补充既有 `test_calc.js` 未覆盖的边界：零值/负值夹紧、超大值、共识阈值精确边界（5% vs 5.01%）、对标位置越界夹紧、均值偏离符号、单元素对标、`tuneBounds` baseline=0、九法缺参/未知方法、`decomposeMonthly` 零/负/非 12 权重、`applyReduction` 负比率、`riskLevel` confidence=null、风险汇总负可压降。

### Suite B — `state.js` 业务规则/权限/单据（`tests/unit/state.test.js`，31 例，优先级 P0/P1）
- P0：预算派生含调剂（`getCatBudget/Remain/ExecRate`）、审批链各档边界、`requestPurchase` 充足/不足、`createAdjustment`+`approveAdjustment` 追加/调减/驳回生效、`submitReimburse` 入账与超预算检出、`adopt/ignore/revertSuggestion` 调剂写入与撤回。
- P1：`roleViews`（admin/boss/staff/真实登录并集）、`canEditBaseData/Accounts/Org`、`canViewBenchmark`、`scopedData` 角色→层级、`scopedApprovals` 按角色过滤、`isPurchaseBlocked` 规则拦截。

### Suite C — `engine.js` 意图路由（`tests/unit/engine.test.js`，9 例，优先级 P1）
项目/采购(显示器·服务器)/为什么/怎么办/超预算/还剩/问候/兜底 八分支命中正确 `type` 与关键字段。

### Suite D — 前后端 `decomposeMonthly` 口径一致性契约（`tests/unit/backend-consistency.test.js`，4 例，优先级 P1）
只读抽取两端默认权重数组并逐月比对。**当前预期 FAIL**——前端 `calc.js` 权重 `[1.1,0.9,...]`（和≈12）与后端 `db.js` `BASE_MONTHLY_RATIO` 百分比（和=1.0）形状不同，属真实口径漂移，需产品/研发决策统一。

## 6. 优先级与修复排序

| 优先级 | 项 | 处置 |
|---|---|---|
| P0 | Suite B 业务规则正确性 | 已全覆盖且通过；作为回归基线固化。 |
| P1 | Suite D 前后端口径漂移 | 真实 bug：统一 `decomposeMonthly` 默认权重（建议抽共享常量，前端/后端/移动端三端引用同一份）。 |
| P1 | Suite A / C 扩展覆盖 | 已通过；补充边界，防回归。 |
| P2 | `roleViews` 真实登录不隐式补 BASE 视图 | 设计一致性待复核（见报告），非硬失败。 |
| P2 | 后端 `db.js` 纯函数未导出 | 建议导出 `decomposeMonthly` 等，使后端可独立单测。 |
| P3 | 移动端内核对齐 | 移动端引入 `calc.js`，消除内联重复。 |

## 7. 覆盖缺口与下一步

- 后端 API 回归：经济事项/科目/用户/规则版本/执行流水/单位预算/消息通知（复用 `tests/api/` 模式，需起 8300）。
- 移动端计算逻辑单测（引入 `calc.js` 后）。
- E2E 关键路径补强：登录、工作台、碰撞、压降模拟器、审批、调整、决算、追踪、对标。
