# 单元测试执行报告 · 三安光电 AI 费用预决算管理系统

> 最后更新：2026-08-26 ｜ 范围：单元层（确定性内核 + 跨端口径契约）+ 集成层 + E2E 层
> 配套文档：`docs/testing/MODULE_MAP.md`（模块↔文件:行映射）、`docs/testing/UNIT_TEST_PLAN.md`（测试计划）

---

## 一、整体结果

| 单元套件 | 范围 | 结果 |
|---|---|---|
| **Suite A** | `calc.js` 边界/异常/确定性分支 | 26 通过 / 0 失败 |
| **Suite B** | `state.js` 预算派生/权限/审批/采购/调整/报销 + roleViews | 32 通过 / 0 失败 |
| **Suite C** | `engine.js` 意图路由 | 9 通过 / 0 失败 |
| **Suite D** | 前后端 + 移动端 decomposeMonthly 口径一致性（真实跨端校验） | 5 通过 / 0 失败 |
| **Suite F** | `state.js` 跨端共享纯函数漂移护栏（desktop vs mobile，vm 沙箱） | 29 通过 / 0 失败 |
| **Suite E** | 规则基线口径一致性（前端 `applyRule`/`compileByMethod` vs 后端 `compileBaseline`/`aiSuggestion`） | 23 通过 / 0 失败 |
| **既有基线** | `website/tests/test_calc.js` | 16 通过 / 0 失败 |

**单元合计：124 通过 / 0 失败**（`run.js` 退出码 0，CI 红即 exit 1）。

| 集成/E2E 层 | 文件 | 状态 |
|---|---|---|
| 后端 API 回归 | `tests/integration/backend-api.test.cjs` | **7 通过 / 0 失败**（真实绿） |
| 关键路径 E2E | `tests/e2e/smoke.e2e.cjs` | **3 通过 / 0 失败**（真实绿，自包含起服+真实 Chromium） |

---

## 二、首轮执行建议（P1→P3）落地情况（回顾）

按用户指令"按你的建议执行"，完成 P1/P2 真实缺陷修复 + P3 防御性统一与测试骨架搭建。

### P1 · 统一 `decomposeMonthly` 月度权重（三端口径漂移 · 真实 bug 已修）

**根因**：同一"年度额→12 月分解"存在两份不一致实现：
- 前端 `website/core/calc.js` 用相对权重 `[1.1,0.9,1.0,1.0,1.05,1.1,0.85,0.9,1.15,1.1,1.05,0.8]`（和≈12，运行期归一化）；
- 后端 `server/db.js` 原 `BASE_MONTHLY_RATIO` 用百分比 `[0.07,…,0.09]`（和=1.0）。

两者**比例不同** → 同年度额逐月分布不一致，前端 Demo 编制与后端经济事项编制会对不上。

**修复**：
- 新增 `server/pure-calc.js`：导出无副作用的 `MONTHLY_WEIGHTS`（canonical 相对权重）与 `decomposeMonthly(total, weights)`，运行期归一化 + 残差补第 12 月；
- `server/db.js` 改为 `require("./pure-calc")`，删除本地 `BASE_MONTHLY_RATIO` 与副本函数；
- `website/core/calc.js` 把默认权重提升为命名常量 `BM.MONTHLY_WEIGHTS`（同字面量），`decomposeMonthly` 引用它；
- 移动端 `website/mobile/index.html` 引入 `../core/calc.js`，复用同一内核。

**验证**：Suite D 真实 `require` 后端 `pure-calc.js` 与前端 `calc.js` 的 `decomposeMonthly`，对同一年度额（含 0、负数、奇数、自定义权重）逐月分布 `deepStrictEqual` 全绿。

### P2a · `roleViews` 真实登录补 BASE 兜底

**问题**：真实登录分支只返回"角色 views 并集 + wb-home"，不补 `compile/kanban/rules`；若后端某真实角色 `views` 未含这三项，用户看不到三大核心入口。

**修复**：真实登录分支兜底 `BASE = ["wb-home","compile","kanban","rules"]`，并按演示通道对齐 —— BD 角色补 `basedata`、`admin` 补 `accounts`。新增两条用例锁死：① 真实登录 finance+centerOwner 角色仍可见 compile/kanban/rules+basedata，无 accounts；② 真实登录 admin 角色补 accounts+basedata。

### P2b · 导出后端纯函数 + Suite D 升级为真实跨端校验

- 将 `decomposeMonthly` 抽成 `server/pure-calc.js`（独立于 `db.js` 顶层 `new DatabaseSync` 副作用），使后端纯函数可被 Node 单测直接 `require`；
- Suite D 升级为"真实执行两端 `decomposeMonthly` 比对逐月分布 + 权重字面量"，并新增移动端 `index.html` 引用一致性锁死。

### P3 · 移动端引入 calc.js + 集成/E2E 测试骨架

- 移动端 `index.html` 接入桌面 `core/calc.js`（见 P1）；
- 新增 `tests/integration/backend-api.test.cjs` 与 `tests/e2e/smoke.e2e.cjs` 骨架（首轮因缺 `express`/`puppeteer` 优雅 SKIP，不阻断 CI）。

---

## 三、后续三项建议落地情况（"进行这些建议"）

用户指令"进行这些建议"后，三项后续建议均已实施并转真实绿：

### ① 装依赖跑通集成/E2E，把 SKIP 变真实绿

- `npm i express puppeteer`：`package.json` 已固化 `"express":"^4.19.2"`、`"puppeteer":"^25.9.0"`（CI 可复现）。
- **集成层（7/0 真实绿）**：`tests/integration/backend-api.test.cjs` 由 SKIP 转真实执行 —— 健康检查 + 无认证 GET + 登录 + 事件 GET 回归 + **新增合同级断言**：PUT 测试金额 → 断言后端月度分布 `=== pure-calc.decomposeMonthly(AMT)`，验证后还原原金额（不污染开发库）。
- **E2E 层（3/0 真实绿）**：`tests/e2e/smoke.e2e.cjs` 重写为自包含流程——spawn `node --experimental-sqlite server/server.js`（端口 `E2E_PORT||8401`），launch 真实无头 Chromium，经全局 `BM` 驱动桌面 SPA，断言：
  - **A)** 真实登录 admin → `BM.roleViews()` 含核心入口 `wb-home/compile/kanban/rules`（P2a 修复生效）；
  - **B)** 真实登录 admin → `roleViews` 含 `accounts` + `basedata`（P2a 修复生效）；
  - **C)** 前端 `BM.calc.decomposeMonthly(amount)` ≡ 后端 API 月度分布（实时跨端合同；写后还原金额）。
- puppeteer v24+ 注意点：`executablePath()` 返回 **Promise**，需 `.then` 解析；Chromium 缓存于 `~/.cache/puppeteer/chrome/mac_arm-<ver>/...`，已确认存在。

### ② 移动端 `engine.js` 副本收敛 + 跨端漂移护栏（Suite F）

- grep + diff 实证：`website/mobile/core/engine.js` 与桌面 `website/core/engine.js` **字节一致** → 删除移动端副本，`website/mobile/index.html` 改为 `<script src="../core/engine.js">` 复用共享内核（消除"第三份实现"隐患）。
- `website/mobile/core/state.js` 与桌面 `core/state.js` **属不同应用域**（视图键、数据模型、登录模型均不同：移动端为"三安光电 AI 费用预决算手机版"，桌面端为"经济事项编制模块"）→ **判定不可直接合并**，否则破坏移动端导航。改以"护栏"替代"合并"：
- **新增 Suite F（29/0）**：用 `vm` 沙箱加载移动端 `state.js`（注入 BM stub 全局），跨 9 组数值样本比对两端共享纯函数 `money`/`fmtMoney`/`pct`/`uid`（29 项校验），把"二次漂移风险"转为"漂移可捕获"。

### ③ 规则基线口径对账（`db.js` vs 前端 `applyRule`）→ 抽 `pure-rule.js` + Suite E

- **新增 `server/pure-rule.js`**：从 `db.js` 抽取无副作用纯函数，使 `compileBaseline`/`aiSuggestion` 可被 Node 单测直接 `require`（不触发 `node:sqlite`）；因子表与前端 `BM.applyRule`（`data.js` 的 type→factor 映射）逐一对齐：
  - `HARDCODED_FACTORS = { down5:0.95, canteen:0.97, dorm:0.90, revenue:0.98, green:0.92, actual:1.0, volume:0.98, qtyPrice:0.92, history:1.0, manual:1.0 }`；
  - `EXEC_RATE`（后端执行率）同源。
- **`server/db.js` 改造**：删除本地 `HARDCODED_FACTORS`/`applyRuleBase` 与内联 `compileBaseline`/`aiSuggestion`，改为转发 `pure-rule.js` 并注入 DB 驱动的 `RULE_FACTORS`。
- **新增 Suite E（23/0）**：锁定前端 `BM.applyRule`/`BM.calc.compileByMethod` vs 后端 `compileBaseline`/`aiSuggestion`（经 `pure-rule.js`，无 sqlite）。4 类校验：
  1. 各规则基线相等（跳过 `lastYear==null` 的规则）；
  2. `aiSuggestion` 的 lo/hi/mid 推导（lo=base×0.9、hi=base×1.05、mid=(lo+hi)/2）；
  3. `compileByMethod("manageStd")` 透传基线；
  4. 因子表锁死（down5 0.95 … actual 1.0）；
  5. **显式约定**：据实类（无历史）前端基线为 `null`（无基线）、后端经 `createEvent` 的 `lastYear||0` 回退 `0`（占位）——**非因子漂移**，单独文档化。
- 改造后回归确认：unit 124/0、integration 7/0、E2E 3/0 全绿（db.js 重构安全）。

---

## 四、复现命令

```bash
# 单元套件（124 通过 / 0 失败，CI 红即 exit 1）
node tests/unit/run.js

# 既有基线（16/0）
node website/tests/test_calc.js

# 集成 API 回归（7/0，需 express；已装）
node --experimental-sqlite tests/integration/backend-api.test.cjs

# 关键路径 E2E（3/0，需 puppeteer + 真实 Chromium；已装）
node tests/e2e/smoke.e2e.cjs
```

> 一键全量（含集成/E2E）：`npm i && npm run test:unit && npm run test:integration && npm run test:e2e`

---

## 五、关键文件改动清单

| 文件 | 改动 |
|---|---|
| `server/pure-calc.js` | **新增**：三端共享 `MONTHLY_WEIGHTS` + 无副作用 `decomposeMonthly` |
| `server/pure-rule.js` | **新增**：`HARDCODED_FACTORS`/`EXEC_RATE`/`compileBaseline`/`aiSuggestion` 纯函数（规则基线口径，可单测） |
| `server/db.js` | 删本地 `BASE_MONTHLY_RATIO`/副本 `decomposeMonthly`（改 require pure-calc）；删本地 `HARDCODED_FACTORS`/内联 `compileBaseline`/`aiSuggestion`（改转发 pure-rule 并注入 `RULE_FACTORS`） |
| `website/core/calc.js` | 默认权重提升为命名常量 `BM.MONTHLY_WEIGHTS`，`decomposeMonthly` 引用之 |
| `website/core/state.js` | `roleViews` 真实登录分支补 BASE 兜底 + BD/admin 角色补 basedata/accounts |
| `website/mobile/index.html` | 引入 `../core/calc.js` 复用共享内核；引入 `../core/engine.js`（见下） |
| `website/mobile/core/engine.js` | **删除**：与桌面字节一致，改为引用 `../core/engine.js` |
| `tests/unit/backend-consistency.test.js` | Suite D 升级为真实跨端校验 + 移动端引用锁死（5 用例） |
| `tests/unit/state.test.js` | 修正 roleViews 真实登录断言 + 新增 admin/basedata 用例 |
| `tests/unit/state-drift.test.js` | **新增**：Suite F，vm 沙箱跨端共享纯函数漂移护栏（29 用例） |
| `tests/unit/rule-baseline.test.js` | **新增**：Suite E，规则基线口径一致性（23 用例） |
| `tests/unit/run.js` | require 列表加入 Suite E / Suite F |
| `tests/integration/backend-api.test.cjs` | 后端 API 回归（7/0 真实绿 + pure-calc 合同断言） |
| `tests/e2e/smoke.e2e.cjs` | 自包含真实浏览器 E2E（3/0 真实绿） |
| `package.json` | **新增**（项目根无 package.json）：固化 express/puppeteer 依赖 + start/test 脚本 |

---

## 六、测试层级总览与覆盖结论

- **单元层（124/0）**：确定性内核（calc/state/engine）+ 跨端口径契约（D/F/E）全绿，含边界/异常/负值/奇数/自定义权重。
- **集成层（7/0）**：真实起服，验证 API 健康/认证/事件读写 + 后端月度分解符合 pure-calc 合同（验证后还原，不污染开发库）。
- **E2E 层（3/0）**：真实浏览器驱动桌面 SPA，验证 P2a 核心入口修復 + 前端/后端 decomposeMonthly 实时合同。
- **既有基线（16/0）**：`website/tests/test_calc.js` 无回归。

**结论**：三端口径（桌面/后端/移动）在"月度分解"与"规则基线"两条确定性主链上已用契约测试锁死；移动端因属不同应用域未强制合并 `state.js`，但用 Suite F 把共享纯函数漂移转为可捕获。三项后续建议全部完成。
