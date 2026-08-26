# 模块 → 文件/行 映射（三安光电 AI 费用预决算管理系统）

> 生成日期：2026-08-26 · 基于实际 grep/read 行号，非推断。
> 加载顺序：桌面端 `website/index.html` 依次加载 `data/data.js → core/state.js → core/engine.js → core/calc.js → views/* → app.js`。
> 关键事实：**移动端 `website/mobile/` 未加载 `core/calc.js`**，其压降/编制计算依赖 `mobile/data/data.js` 内联逻辑，与桌面端口径可能不一致。

## 1. 功能模块总览

| 模块 | 职责 | 桌面端文件:行 | 移动端文件:行 | 核心逻辑文件:行 |
|---|---|---|---|---|
| 登录鉴权 | 演示通道 + 后端真实登录/登出/会话 | `views/login.js:38`；`core/state.js:325-376`；`server.js:70-84` | `mobile/views/login.js:20` | `core/state.js:342-359` |
| 工作台首页 | 角色化首页/待办/通知 | `views/workbench.js:19-123` | `mobile/views/home.js:82` | `core/state.js:392-442` |
| 预算总览/看板 | 科目/部门/人员多维 + 执行率看板 | `views/dashboard.js:44-661`；`views/kanban.js:26-207` | `mobile/views/budget.js:59-248` | `core/state.js:114-164` |
| 预算编制(M3) | 九法编制/分解/双轨/规则引擎 | `views/compile.js:108-516`；`views/plan.js:120-1029` | `mobile/views/budget.js:277-543` | `core/calc.js:109-164`；`data.js:621,783,841` |
| 月度分解 | 年度额按权重分解 12 月 | `views/monthly-split.js:22-300` | `mobile/views/budget.js:478` | `core/calc.js:156-164` |
| 碰撞/压降协商(M5) | 差异识别/证据/调参即时反馈 | `views/collision.js:33-172`；`views/collision-tune.js:48-352`；`views/tune.js:47-165` | 无 | `core/calc.js:25-93`；`core/state.js:771-784` |
| 预算规则/规则引擎 | 编制/监督规则、版本化、事项映射 | `views/rules.js:58-791` | `mobile/views/budget.js:643-701` | `core/state.js:675-693`；`server.js:109-192` |
| 审批中心 | 采购/调整/合同单据审批流 | `views/approval.js:21-160` | `mobile/views/approval.js:22-170` | `core/state.js:146-153,291-294` |
| AI Copilot | 对话式预测/归因/建议/执行 | `core/engine.js:22-290`；`views/copilot.js:88-326` | `mobile/core/engine.js:22-290` | `core/engine.js:22-290` |
| 组织/架构 | 组织树/SVG 架构图/管理中心归口 | `views/org.js:9-35`；`views/orgchart.js:42-119`；`views/basedata.js:340-469` | 无 | `server.js:198-206,317-340`；`server/db.js:233-385` |
| 科目/基础数据 | 会计科目 + 经济事项主数据 | `views/basedata.js:50-469` | 无 | `server.js:265-313`；`server/db.js:1292-1414` |
| 预算工作人员/账户 | 用户账户与角色/部门绑定 | `views/accounts.js:216-252` | 无 | `server.js:209-221`；`server/db.js:886-924` |
| 采购项目 | 项目级采购发起与预算检查 | `views/projects.js:29-138` | `mobile/views/budget.js:150` | `core/state.js:248-310,632-668` |
| 预算调整/调剂 | 追加/调减/调剂申请与生效 | `views/adjust.js:19-143` | `mobile/views/budget.js:670-785` | `core/state.js:180-265,586-668` |
| AI 风险筛查(M7) | 风险识别/等级/可压降汇总 | `views/risk-view.js:40-171`；`views/final-risk.js:32-70` | 无 | `core/calc.js:181-205`；`core/state.js:754-761` |
| 决算 | 全年实际 vs 预算确认 | `views/final.js:20-106` | `mobile/views/budget.js:606-635` | `core/state.js:576-579` |
| 预算追踪 | 月度执行/偏差归因/报销 | `views/track.js:19-170` | `mobile/views/budget.js:550-605` | `core/state.js:791-835` |
| 对标(Benchmark) | 同类公司横向对标（集团层） | `views/benchmark.js:24-131` | 无 | `core/state.js:439-442`；`core/calc.js:46-54` |
| 决策中心 | 建议卡片采纳/驳回汇总 | `views/decisions.js:24-103` | 无 | `core/state.js:180-265` |
| 单位预算/上级汇总 | 多单位按事项汇总/压降留痕 | `views/unit-inbox.js:53-129`；`views/unit-summary.js:31-311` | 无 | `server.js:343-363`；`server/db.js:418-476` |
| 经济事项(后端) | 8 列经济事项编制/月度拆分 | 经 `basedata.js:101` events Tab 编辑 | 无 | `server/db.js:141-178,1395-1414` |
| 费控导入 | 实际执行数据导入 | `views/import-view.js:95-253` | 无 | `server/db.js:498-547` |
| 角色切换 | 轻量角色切换面板 | `views/roleSwitch.js:21-147`；`app.js:99-115` | 走重新登录 | `core/state.js:392-442` |
| 消息通知(D2) | 铃铛/已读 | `app.js:206-316` | 无 | `server.js:87-107`；`server/db.js:929-1003` |

## 2. 确定性可单测单元清单

判定：纯函数、无 DOM、无随机、无 `Date`，可在 Node `require` 直接断言。

| 函数 | 文件:行 | Node 可单测 | 单测覆盖 |
|---|---|---|---|
| `BM.calc.tuneNegotiation` | `core/calc.js:25-77` | ✅（已导出） | ✅ Suite A + 既有 |
| `BM.calc.tuneBounds` | `core/calc.js:83-93` | ✅ | ✅ |
| `BM.calc.compileByMethod` | `core/calc.js:109-149` | ✅ | ✅ |
| `BM.calc.decomposeMonthly` | `core/calc.js:156-164` | ✅ | ✅ |
| `BM.calc.applyReduction` | `core/calc.js:170-174` | ✅ | ✅ |
| `BM.calc.riskLevel` / `riskSummary` | `core/calc.js:181-205` | ✅ | ✅ |
| `BM.getCat*` / `getApprovalChain` | `core/state.js:114-164,291-294` | ⚠️需 BM 桩 | ✅ Suite B |
| `BM.roleViews` / `canEdit*` / `canViewBenchmark` / `scopedData` / `scopedApprovals` | `core/state.js:392-534` | ⚠️需 BM 桩 | ✅ Suite B |
| `BM.adopt/ignore/revertSuggestion` / `requestPurchase*` / `createAdjustment` / `submitReimburse` | `core/state.js:180-835` | ⚠️需 BM 桩 | ✅ Suite B |
| `BM.engineReply`（意图路由） | `core/engine.js:22-290` | ⚠️需 BM 桩 | ✅ Suite C |
| `server/db.js: decomposeMonthly` / `applyRuleBase` / `compileBaseline` / `aiSuggestion` | `server/db.js:20-72` | ⚠️未导出 + 需 SQLite | ⚠️只读契约（Suite D 检出漂移） |

图例：✅ 已覆盖；⚠️ 可测但需桩/未导出。

## 3. 后端模块与测试入口

- 服务：`server/server.js`（单端口默认 8300）。路由分组：Auth `:70-84`、通知 `:87-107`、规则版本 `:116-188`、组织/角色 `:195-206`、用户 `:209-221`、经济事项/科目 `:223-313`、组织 CRUD `:317-336`、单位预算 `:343-363`、执行流水 `:366-377`。
- 数据层：`server/db.js`（1463 行，用 `node:sqlite`）。计算口径 `decomposeMonthly:20` / `applyRuleBase:32` / `compileBaseline:49` / `aiSuggestion:59`。
- 既有测试：
  - Node 单测：`website/tests/test_calc.js`（calc 内核 7 函数，16/0）、`website/tests/smoke_dom.js`、`website/tests/smoke_kanban.js`（DOM 桩冒烟）。
  - 后端 API 回归（需起 8300）：`tests/api/org_crud.test.cjs`、`tests/api/org_center.test.cjs`。
  - 前端 E2E（需 8300 + Playwright）：`tests/e2e/*.cjs` 共 10 个（规则分组/事项映射/下一年草案/编制动态建议/看板/月度分解/组织可编辑/账户归口/导航收敛/账户入口）。

## 4. 覆盖缺口（按优先级）

**A. 高价值纯逻辑、当前零单测**
- 后端 `db.js` 计算口径（与前端 `calc.js` 双份实现，**已检出漂移**，见报告 Suite D）。
- 移动端 `mobile/core/engine.js`、`mobile/data/data.js` 计算逻辑（与桌面端同源未对齐）。

**B. 零 E2E/单测的视图模块**
- 登录流程、工作台 `workbench.js`、预算总览 `dashboard.js`（看板有 E2E）、碰撞 `collision.js`、压降模拟器 `tune.js`、审批 `approval.js`、决策 `decisions.js`、调整 `adjust.js`、项目 `projects.js`、风险 `risk-view.js`/`final-risk.js`、决算 `final.js`、追踪 `track.js`、对标 `benchmark.js`、导入 `import-view.js`、角色切换 `roleSwitch.js`、移动端全部视图。

**C. 零 API 回归的后端模块**
- 经济事项 CRUD、会计科目 CRUD、用户 CRUD、规则版本 CRUD/发布/抽取、执行流水导入、单位预算/汇总、消息通知、认证独立用例。

## 5. 关键架构观察
1. **计算口径双份实现**：前端 `core/calc.js` 与后端 `server/db.js:20-59` 各自实现 `decomposeMonthly` 等，无共享、无交叉单测 → 预算一致性风险（**本次已实锤漂移**）。
2. **移动端未引入 calc 内核**：`mobile/index.html` 未加载 `calc.js`，移动端压降/编制计算依赖 `mobile/data/data.js` 内联逻辑。
3. **state/engine/data 未做 Node 导出**：仅 `window.BM`，单测需「全局桩 + 加载顺序」改造（本次 `tests/unit/harness.js` 已沉淀该模式，可复用）。
4. **唯一已验证可信基线**：`calc.js` 7 函数 + 两 DOM 桩冒烟 + 两组织 API 回归；其余模块依赖起服务 E2E，CI 成本高、单测真空大。
