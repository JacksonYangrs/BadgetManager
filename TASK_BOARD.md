# 任务板｜三安光电 AI 费用预决算管理系统（BadgetManager）

> 最后刷新：2026-08-25 14:55　|　刷新人：Buddy
> 说明：原板停在 **B1–B7 pending**，与实际进度脱节。本板按 08-22~08-25 真实交付重建。
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

---

## 二、待办 / 可选后续（非阻塞，等松哥点将）

| # | 任务 | 状态 | 说明 |
|---|---|---|---|
| O1 | 2 家公司 BU 推断纠偏 | ⚪ 待启动 | 2170 泉州三安半导体、2160 厦门三安半导体被 `inferBuCode` 错归 BU-09 光通讯；可在「基础数据 → 组织架构」UI 改 `bu_code`（运行时已推断初值，松哥可纠偏） |
| O2 | 预算执行数据录入 UI | ⚪ 待启动 | `PUT /api/executions` 已有后端，前端录入表单待补（之前拍板「先只接数据层+种子」，表单列为后续迭代） |

---

## 三、设计文档状态（顺手提示，非本次改动）

- `docs/plans/2026-08-24-看板真实数据(A+B)设计.md` 头部仍标 🟡 待定稿，但对应实现 T1–T7 已于 08-25 完成（E2E 22/22）。**建议把该 doc 头部改为 ✅ 已定稿/开发完成**——是否要我改，等你确认。
- 其余 `docs/plans/*.md`（基础数据管理 / 消息模块 / 组织架构可编辑 / 预算工作人员与归口 / 预算看板重构）均已定稿或仅作历史参考。

---

## 四、下一步建议

当前**无硬阻塞任务**。M1–M12 全部交付。O1 / O2 为可选增强，建议顺序 **O1（小，顺手纠偏）→ O2（中，补录入表单）**，均由你点将后再动。

**⚠️ 系统性隐患（建议后续排期）**：各视图是经典 `<script>`（非 module），顶层 `function` 声明会污染全局，`index.html` 后加载的文件覆盖先加载的同名函数。本次 `renderEventsTab` 冲突已用 IIFE 修掉；`el`/`esc`/`companyName` 等同名是逻辑一致的副本（无害）。但同类地雷仍可能在其他视图间出现——建议统一把视图文件改为 IIFE 包裹或 ES Module，从根上消除全局污染。
