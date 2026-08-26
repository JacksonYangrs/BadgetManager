# 模块梳理与耦合度分析（BadgetManager / 经济事项预算编制平台）

> 分析日期：2026-08-26
> 结论先行：代码**尚未落地**架构文档 §2.3 / §9.2 规划的"按业务能力分模块"，
> 当前形态是「模块化单体 + 两个 God Object（后端 `db.js`、前端 `window.BM`）」。
> 解耦做得好的只有**纯计算层**和**测试分层**；权限中间件、计算口径、移动端存在复制。

---

## 一、模块盘点

### 后端 `server/`
| 文件 | 行数 | 角色 | 耦合评价 |
|---|---|---|---|
| `server.js` | 403 | HTTP 路由 + 认证 + 业务编排（单体路由层） | 是 `db.js` 的薄 HTTP 壳，内联了部分业务规则 |
| `db.js` | 1435 | 数据访问 **+** 全部业务逻辑（组织/用户/角色/科目/经济事项/执行/通知/规则版本/政策文档/事件映射） | **God Object**：77 个函数，单点耦合枢纽 |
| `pure-calc.js` | 28 | 纯计算 `decomposeMonthly`，零依赖 | ✅ 已解耦，可单测 |
| `pure-rule.js` | 50 | 纯计算（规则基线/AI 建议因子），零依赖 | ✅ 已解耦，可单测 |
| `import_module.js` | 81 | 费控导入（M8），`buildImportModule(dbm).attach(app,db)` | 伪模块：闭包注入同一 `dbm`，内部直接 `dbm.*` |
| `policy_rules.js` | 75 | 政策→规则生成，`buildPolicyRules(dbm).attach(app,db)` | 伪模块：同上 |

### 前端 `website/`
| 文件 | 行数 | 角色 | 耦合评价 |
|---|---|---|---|
| `app.js` | 385 | 入口/路由/通知铃铛 | 全挂在 `BM` 上 |
| `core/state.js` | 843 | 状态 + 权限 + 审批 + 采购 + 报销 + 编制 + 碰撞 + 风险…… | **God Object**：`window.BM` 单例 |
| `core/calc.js` | 217 | 纯计算 `BM.calc` | ✅ 已解耦（但与后端各写一份） |
| `core/engine.js` | 291 | Copilot 对话引擎 | 强依赖 `BM` 全局（CATEGORIES/DEPTS/requestPurchase…） |
| `views/*.js` | 30+ 文件 | 页面渲染 | 全部读写 `window.BM`，无 import/DI |
| `mobile/` | — | 桌面端功能副本 | **独立复制** state.js/data.js/views，非共享 core |

### 测试 `tests/`
按 `unit / integration / e2e` 分层，与代码同仓 ✅（耦合度最低的一块）。

---

## 二、耦合度评估

### 两个耦合枢纽（High）
- **后端 `db.js`**：`server.js` 的全部路由 + `import_module` + `policy_rules` 都直接调 `dbm.*`；
  14+ 组 API 直接依赖它。改任意领域都可能动到这个文件。
- **前端 `window.BM`**：`app.js` + 30+ 视图 + `engine.js` 全部挂在 `BM` 上互相通信；
  视图隐式依赖 `BM` 上任意字段（`BM.RULES`、`BM.CATEGORIES`、`BM.applyRule`…）。
  无法单独测某个视图，状态变更无追踪。

### 具体耦合问题
1. **God Object 聚合（高）**：`db.js` 把 10+ 领域塞进一个 1435 行文件；`state.js` 同理。
2. **认证中间件重复（中-高，违反 DRY）**：`auth` + 5 个 `requireXxx` 权限检查在 `server.js` 定义；
   `import_module.js`、`policy_rules.js` **各自又复制一份** `auth()` 和权限判断（共 3 处）。
   改权限语义要改 3 个文件。
3. **"模块"伪解耦（中）**：`import_module`/`policy_rules` 仅是 `buildX(dbm).attach(app,db)` 闭包注入同一个 `dbm`，
   边界只是"attach 函数签名"，**无接口隔离**，运行期共享同一 db 连接。
4. **前后端计算口径重复（中，但有契约测试护栏）**：`decomposeMonthly` / `applyRule` / `compileBaseline`
   在前端 `calc.js` 与后端 `pure-calc.js`/`pure-rule.js` **各写一份**，
   靠 `tests/unit/backend-consistency.test.js` 锁一致性；改一侧必须同步另一侧，否则 CI 红。
5. **前端全局命名空间（高）**：无 `import`/DI，所有视图经 `window.BM` 单例通信。
6. **移动端代码复制（中-高）**：`website/mobile` 是桌面端功能副本，桌面修 bug 移动端要手动同步。
7. **路由与业务混杂（中）**：`server.js` 把认证、权限、CRUD、静态服务、markitdown 调用全堆一个文件；
   部分业务规则（org 过滤、month 解析）内联在路由里而非 `db` 层，导致 `server.js` 与 `db.js` 两边都懂规则。

### 解耦做得好的部分 ✅
- 纯计算层 `pure-calc.js` / `pure-rule.js` / `calc.js`：无副作用、可单测。
- 测试按 `unit / integration / e2e` 分层，且与代码同仓。
- 视图文件按页面物理拆分（文件边界清晰）。
- `import`/`policy` 通过闭包注入 `dbm`，至少物理分离了路由注册。

---

## 三、耦合度量化（粗估）
- `db.js` 扇入：被 `server.js` + `import_module` + `policy_rules` 调用，约 14+ 组 API 直接依赖。
- `BM` 扇入：被 `app.js` + 30+ 视图 + `engine.js` 依赖。
- 重复代码：auth 逻辑 3 份；`decomposeMonthly` 2 份（有测试护栏）；`applyRule` 2 份。

---

## 四、改进建议（与架构文档 §9.2 对齐）
架构文档已规划 `backend/modules/{organization,masterData,budgeting,negotiation,diagnostics,reduction,execution,settlement,audit}` + `calculation`，
以及前端 `pages/components/api/stores/permissions` 拆分。实际代码尚未落地。

优先级：
1. **[高]** 抽 `server/middleware`（auth + 权限）到独立文件，消除 3 份重复，统一权限语义。
2. **[高]** 拆分 `db.js` → `server/modules/*.js`，每个模块持有自己的 db 访问 + 路由注册，`server.js` 只做装配。
3. **[中]** 移动端复用 desktop core（或抽共享 domain 包），消除双份 `state`。
4. **[中]** 计算口径单一来源：`pure-calc`/`pure-rule` 作唯一事实，前端 `calc.js` 改为构建期复用同包，去掉手动同步。
5. **[低]** 前端 `BM` 全局 → 轻量 store / 模块导入（架构文档 §9.2 已规划）。
