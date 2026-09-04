# 任务板｜三安光电 AI 费用预决算管理系统（BadgetManager）

> 最后刷新：2026-08-26 17:30　|　刷新人：Buddy
> 说明：原板停在 **B1–B7 pending**，与实际进度脱节。本板按 08-22~08-25 真实交付重建，08-26 追加 M18（db.js 解构工程）。
> 纪律：设计文档待定稿前不进开发；松哥未引导排序前不执行；改动必有回归测试 + 真机验证。

---

## 一、已完成模块（勿重复开发）

| # | 模块 | 关键交付 | 验证 |
|---|---|---|---|
| M1 | 角色·账户·权限体系 | 登录 / 角色切换器 / 组织树 / 账户管理（admin·finance·buHead·centerOwner·expense 等） | E2E 全通（08-23） |
| M2 | 基层编制工作流 | compile 8 列 / 经济事项·财务会计双视角 / monthly-split 双堆叠条 / AI 建议区间 | 真机全绿（08-23） |
| M3 | 上级部门汇总 | unit-inbox 收件箱 / unit-summary 矩阵 / 压降叠加 / 注释存库 | 真机全绿（08-23） |
| M4 | 预算看板 + 决算偏差 | kanban 三视图（科目/事项/人员）/ final-risk（决算·偏差·对标） | 真机全绿（08-23） |
| M5 | 基础数据管理（B1–B7） | `account_subject` 独立表 + 双 Tab CRUD + `requireBaseDataEditor` 权限 + 引用拦截 | E2E 12/12（08-23） |
| M6 | 消息模块 + 数据重建（D1–D4, T1–T6） | notification 表 + 过滤 API + 铃铛 / Excel 全量真实导入（42 公司·16 BU·17 中心） | E2E 全绿（08-24） |
| M7 | 财务规则 → 预算规则改名 | 导航 + 运行时文案统一（规则版本独立页不并入） | `node --check` 全过（08-24） |
| M8 | 基础数据溯源 + 范围收窄 | `method` 留空待填（不硬推）/ 业务金额移出基础数据页 / 客户逻辑只读参考块 | 真机验证（08-24） |
| M9 | 组织架构可编辑 + 图形化（C1–C5） | createOrg/updateOrg/deleteOrg + 环检测 + level 重算 / SVG 组织图（编辑+只读） | API 14/14 + E2E 10/10（08-24） |
| M10 | 看板 A+B 真实数据接入（T1–T7） | `unit_budget` 3402 行 / `budget_execution` 40824 行 / BU 映射推断 / 三层时间+组织下钻 | E2E 22/22（08-25） |
| M11 | 预算规则三 Tab 重构（D4 版本化） | `rules.js` 重写为「当前版本 / 历史版本 / 适用经济事项」三 Tab；版本 DELETE 守卫（active 不可删）；`rule_item_event` 整版本映射落库；全站「预算规则→预算规则」改名 | 真机 E2E 13/13（08-25）。**修复回归 bug：rules.js 与 basedata.js 全局函数 `renderEventsTab` 同名冲突（经典 script 后加载覆盖），用 IIFE 包裹 rules.js 隔离作用域** |
| M12 | 预算规则 Tab4 创建明年新规则 | 新增「创建明年新规则」Tab：上传政策文件（base64 JSON + markitdown 解析，图片 OCR 预留位）→ AI 抽取建议（`extractRuleProposals` 增强带 scopeKey 词典映射）→ 克隆明年 v2027 草案 + 应用抽取 → 复用 Tab1 卡片预览 → 人核对发布；新增 `policy_document` 审计表 + `policy-upload`/`policy-document` 端点；`nextVersionLabel(db, year)` 支持跨年版本号 | 真机 E2E 11/11（08-25） |
| M13 | 预算规则 Tab1/Tab4 分组归类 | `renderRuleCards` 加「编制规则 / 监督规则」两组容器：编制组=基线比例(scope-cards)+编制方式(planMode)，监督组=执行追踪(trackMode)+期末余量(surplusAction)+超预算(allowOverBudget)；抽 `renderFlowItem` 共用；CSS 加 `.rule-group`/`.rule-group-title` | 真机 E2E 8/8（08-25） |
| M14 | 预算规则 Tab4 三类管控规则下拉 + 发布同步 | 松哥拍板简化实现「就是下拉框选择一下」：Tab4 新增「监督规则设置」三下拉（trackMode/surplusAction/allowOverBudget，默认继承 active）；`genBtn` 用下拉值覆盖 flow 项（替代原样克隆）；草案内改下拉实时同步预览(`pushFlowOverrides`)；新增 `BM.syncStateRules` 修复隐藏双轨——`pubBtn` 发布后写回 `BM.state.rules`（含 planMode），报销/采购拦截随发布生效；CSS 加 `.cn-flow*` | 真机 E2E 18/18（08-25） |
| M15 | 经济事项映射纳入版本化（与 baseline/flow 同生命周期） | 松哥拍板「克隆继承+草案可编辑」：后端 `cloneEventMap` 在 `createRuleVersion` 克隆 `rule_item_event`（active→草案）；前端 Tab3 加版本切换器（`.evt-ver-sel`，默认 active，可切草案/历史），`target` 取代 `active` 驱动标题/规则卡/加载/保存，`saveEventMap` 按 target.id 写；CSS 加 `.evt-ver-bar`/`.evt-ver-sel` | 真机 E2E：create_next 19/19（克隆断言通过）+ event_map 16/16（切换器断言）+ grouping 9/9 无回归（08-25） |
| M16 | Tab3「适用经济事项」重布局 + 显示规则名 | 松哥指令"页面重新布局一下，根其他页面风格 一致。显示规则名，不要显示规则代码"：① Tab3 头部加 `.rule-version-card`（与 Tab1 风格一致，`.rv-title` + `statusBadge` + 描述）；② 新增 `.evt-toolbar` 工具栏（编辑版本 select + 「当前规则卡已选 X/60 科目」胶囊 + 「保存映射」btn-accent，与 compile `.filter-bar` 视觉语言一致）；③ 左侧规则卡显示规则名（`BM.RULE_EVENT_MAP[scopeKey].desc` = 总经办归口/按人数核定/阶梯压降…）+ 政策表述 + 弹性分类徽章（半刚性/弹性/项目型），**不显示 scopeKey 代码**；④ 右侧顶部加 `.evt-cur-info` 当前规则信息面板（规则名 + 政策）；⑤ `evt-map` 左栏 220→240px。E2E 修：保存按钮选择器 `.evt-right .btn-primary`→`.evt-toolbar .btn-accent`，版本切换断言查 `.rv-title`，新增工具栏/头卡/规则名/徽章 4 条断言 | 真机 E2E：event_map 22/22（重布局全验）+ grouping 9/9 + create_next 19/19 无回归（08-25） |

| M17 | 移动端预算规则概念对齐桌面版 | 松哥指令"手机端代码没有跟桌面版同步"→ 拍板"概念对齐（不带版本化）"：移动端 `website/mobile` 是独立纯前端 demo，将其 4 个规则开关（`renderRules`, budget.js:643）字段名/取值/默认值/语义对齐桌面版 flow 项——`surplus`→`surplusAction`、`recover/hold/carry`→`reclaim/suspend/carry`、`apply`→`advance`、修掉 `allowOverBudget` 语义反的 bug（旧 v:true=不允许/v:false=允许，与 state.js 拦截逻辑矛盾；改为 false=不允许/拦截、true=允许）；`DEFAULT_RULES`(data.js:543) 默认值对齐桌面版 seed（surplusAction:reclaim、allowOverBudget:false）。`RULES_LABELS`/`isPurchaseBlocked` 已是对齐版，不动 | 真机冒烟（Playwright 开 mobile + 注入登录态进规则页）：4 标题正确 + 默认值对齐（自下而上/实际报销为准/收回/不允许）+ 点"允许超预算"→state 切 true + UI 高亮联动；无 JS 报错（08-25） |

---

| M18 | **db.js God Object 解构（工程重构）** | 松哥拍板"按业务拆成不同文件"。把 1435 行 `server/db.js`（77 函数单点耦合枢纽）拆为 11 文件：9 业务模块（`server/modules/`：organization/auth/subjects/events/budget-compile/budget-execution/rules/ai-policy-extract/notifications）+ AI 三件套（ai-gateway 占位 LLM 网关 / ai-budget-decision 决策分析 / 费控导入 expense-import 从 import_module.js 迁入）；`db.js` 退化为组合根，仅 `Object.assign` 合并 ≥91 个导出，公开 API 不变。`aiSuggestion` 下沉到 ai-budget-decision（内部依赖，不进根）。配套新测试 `tests/integration/db-interface.test.cjs` 锁定接口。**顺带修复前端 bug**：`website/core/state.js` 演示通道 BASE 误含 `importView`（与 389 行注释"不作为菜单项"矛盾），致 `roleViews('staff')` 多出一个菜单项，已移除。 | 单元 124/0、集成 API 7/0、接口回归 12/0、e2e 3/0，全绿（08-26） |
| M19 | **前端上帝文件拆分重构（方案 A）** | 松哥令「审计过 600 行 / 紧耦合 / 模块未文件级对应」→ 拍板**方案 A**（保持 BM 命名空间、按职责域拆分 + IIFE 隔离、不改 40+ 视图 BM.xxx 调用、预留 ES Module 边界）。**影响评估 + 规格**：`docs/plans/2026-09-04-前端上帝文件拆分重构设计.md`。**拆分**：`data/data.js`(1486)→5 文件（organization/budget/transactions/rules-engine/kanban）；`core/state.js`(803)→3 文件（state 核心 / access 查询权限 / actions 业务动作，access+actions 内 `state.`→`BM.state.`）；`views/plan.js`(1120)→4 文件（plan 主入口 + plan-topdown/bottomup/client 经 `BM.plan.*` 子命名空间共享）；`views/dashboard.js`(653)→整文件 IIFE（不拆）；`views/rules.js`(829) 已 IIFE 不动。原 data.js 删除。**加载清单同步**：`index.html` + `tests/unit/harness.js` + 4 个 `website/tests/smoke_*.js`。**回归全绿**：单测 124/0、smoke 4/4、集成 69/0、E2E 真机 smoke 3/0 + rules_event_map 22/0 + wb-home-diff 21/0 + role-convergence 22/0 + basedata_tree 10/0（v1.5.3） | 前端拆分零回归（09-04） |

---

## 二、待办 / 可选后续（非阻塞，等松哥点将）

| # | 任务 | 状态 | 说明 |
|---|---|---|---|
| O1 | 2 家公司 BU 推断纠偏 | ⚪ 待启动 | 2170 泉州三安半导体、2160 厦门三安半导体被 `inferBuCode` 错归 BU-09 光通讯；可在「基础数据 → 组织架构」UI 改 `bu_code`（运行时已推断初值，松哥可纠偏） |
| O2 | 预算执行数据录入 UI | ⚪ 待启动 | `PUT /api/executions` 已有后端，前端录入表单待补（之前拍板「先只接数据层+种子」，表单列为后续迭代） |
| D3 | 内网/专网部署 · LLM 出口申请 | ⚪ 待启动 | 松哥 2026-09-02 记录：**内网部署需申请「调用 LLM 的出口」**——内网环境默认不通外网，AI Copilot / 费用诊断 / 规则引擎等 LLM 能力依赖外部大模型 API，须先申请出口放行才能跑通。关联 §0「财务数据披露前很机密」→ D3 专网部署方向，作为部署前置条件排进 D3 实施清单 |
| R1–R7 | **角色模型重构（14 角色收敛）** | ✅ T1–T6b 全部完成 · 全量回归绿 | 松哥 2026-09-02 拍板「决策二 = A 完整重构 14 角色」。**已完成**：T1 后端角色收敛（9 code + 幂等迁移）、T2 权限闸门、T3 前端字典、T4 状态闸门、T5 切换器/登录、**T6a 桌面端 ~50 处旧角色死分支清理**、**T7 回归 E2E 22/0**（`role-convergence.e2e.cjs`）。**顺手修 F1**：`views/roleSwitch.js` 孤儿文件未接线 → 加入 `index.html` + `app.js` 实现 `BM.switchRole`（轻量切换，写回 centerId/expenseType/scopeCompany）+ roleLabel 点击入口 + `refreshRoleLabel` 改用当前激活角色名；新增回归 `smoke_roleswitch.js`（11/0）。**T6b wb-home 差异化首页**：`workbench.js` 的 `renderHome` 重构为 5 层骨架（hello 9 分支责任叙事 → roleHint → 预算业务提醒 → scope 分组专属面板 → AI 关注），总览卡接真实表 `/api/workbench-overview`、roleTips 走 Copilot 动态接口（`/api/copilot/ask`）+ 降级占位；新增 `smoke_workbench.js`（40/0）+ `wb-home-diff.e2e.cjs`（21/0） |
| E1–E6 | **经济事项 4 级分类重构** | ✅ 开发完成 · 验收通过 · 遗留 major 已清理 | 松哥 2026-09-02 令：经济事项 1 级 → 4 级（方案 A 拍板）。后端 account_subject 加 level/path 建 4 级树（146 节点 L1=18/L2=64/L3=58/L4=6）+ 叶子经济事项 300；抽取脚本 `scripts/extract_subject_tree.py` → `server/seeds/subject-tree.json`；`GET /api/subjects?tree=1`；前端 `basedata.js` 树形 + 级联表单；测试 seed-integrity 10/0 + basedata_tree.e2e 10/0 真机 + 修 3 陈旧 E2E。全量零回归。**语义修正**：费用类型可挂中间科目节点（全库仅「物料消耗」1 条）。**遗留 major（2026-09-04 已清理）**：科目数不稳定 → 松哥拍板「删旧保新」（真实金额表 unit_budget/budget_execution 后面重新导入），删 60 旧平铺费控科目 + 81 旧事项 + 6 demo 样例 seed，科目数稳定为 **146 树 / 300 事项**（v1.5.1） |

---

## 三、设计文档状态（顺手提示，非本次改动）

- `docs/plans/2026-08-24-看板真实数据(A+B)设计.md` 头部仍标 🟡 待定稿，但对应实现 T1–T7 已于 08-25 完成（E2E 22/22）。**建议把该 doc 头部改为 ✅ 已定稿/开发完成**——是否要我改，等你确认。
- 其余 `docs/plans/*.md`（基础数据管理 / 消息模块 / 组织架构可编辑 / 预算工作人员与归口 / 预算看板重构）均已定稿或仅作历史参考。

---

## 四、下一步建议

**角色模型重构（R1–R7）与经济事项 4 级分类重构（E1–E6，含遗留 major 清理）均已交付**（2026-09-02 / 09-04）。当前可选后续：

1. **O1**：2 家公司 BU 推断纠偏（2170/2160 错归 BU-09 光通讯）。
2. **O2**：预算执行数据录入 UI（`PUT /api/executions` 后端已有，前端表单待补）。
3. ~~测试卫生遗留~~ ✅ **已修复（v1.5.2）**：`p02_fetch_convergence_regression.e2e.cjs` 原连开发库（共享 8300）跑写操作会污染真实数据 + 潜在 SQLITE_BUSY；已改为自启独立后端（端口 8403 + 独立临时 DB_FILE，模式同 role-convergence），35/0 全绿，开发库零污染。

**⚠️ 系统性隐患（已于 v1.5.3 闭环）**：各视图是经典 `<script>`（非 module），顶层 `function` 声明会污染全局，`index.html` 后加载的文件覆盖先加载的同名函数。本次 `renderEventsTab` 冲突已用 IIFE 修掉。**2026-09-04 已按方案 A 把 3 个上帝文件（data/state/plan）拆分 + dashboard IIFE 隔离，从根上消除全局污染**（见 M19）。剩余：`app.js` 及部分小视图仍是顶层裸函数，可后续随 ES Module 迁移一并收编。

**🔧 4 个陈旧 E2E（2026-09-04 发现，非拆分引入，属 08-23/24 导航收敛遗留，待修）**：
1. `compile_dynamic_advice.e2e.cjs` — stale 导航选择器「新预算编制」→ 现为「预算编制」。
2. `kanban_restructure.e2e.cjs` — stale 导航「预算看板」→ 现为「预算跟踪」。
3. `rules_grouping.e2e.cjs` — 注入 token 后未设 `BM.state.loggedIn=true`，`openView('rules')` 提前返回，`.rule-group` 永不出现。
4. `create_next_rule.e2e.cjs` — stale 标题断言「预算规则管理」→ 现为「预算规划」（18 通过 / 1 失败）。
