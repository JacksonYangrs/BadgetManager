# 阶段一 · 目标一（编制统计自动化）前端交付报告

> 日期：2026-08-21 夜间
> 执行：前端开发 agent（兼 UI 设计）
> 派单：PM（本会话 AI）；Sponsor（松哥）已休息，授权 PM 全权决策
> 范围：按「阶段一 目标一 编制统计自动化」完成 7 项前端界面 + 角色差异化 + 移动端核查
> 运行约定：浏览器访问 `http://localhost:8123/`（本地静态服务根目录指向 `website/`），`?as=<角色>` 指定角色，`#<视图>` 深链直达。

---

## 一、完成模块清单

### 1. 编制工作台（M3 + M6 规则预填）· P0
- **预览路径**：`http://localhost:8123/?as=staff#compile` / `?as=manager#compile`
- **设计要点**
  - 顶部常驻「九种编制方法」说明条（`BM.COMPILE_METHODS`，9 法：历史参考/同比/固定/数量×单价/人均标准/业务量/管理标准/关键事件/人工）。
  - 以客户规则科目（经济事项最细事实源）为行，一次填报：2025 实际、规则、编制方法下拉、规则基线（来自 M6 `BM.applyRule` 确定性预填）、申报额、偏离徽标、月度分解 1~12、偏离原因。
  - 实时联动：`申报额` 改动即时刷新「偏离」状态（基线内/偏离）与「月度合计 = 申报额」校验；「按法计算」按钮走 `BM.calc.compileByMethod` 预填。
  - 偏离基线必须填原因才能提交（提交拦截 + Toast 提示）。
  - 压降试算复用 M5 滑块调参（`BM.renderReductionTune`）：选经济事项 → 拖「申报额/压降比率」滑块 → 右侧即时刷新压降后金额与基线差异 → 「采用」写回该事项申报额。
  - 保存草稿（localStorage 持久化 `BM.compileSaveDraft`/`compileSaveSubject`），刷新可恢复；提交进入汇总/审批流。
- **改动文件**：`views/compile.js`（新建）、`data/data.js`、`core/calc.js`、`core/state.js`、`styles/views.css`
- **单测结果**：`node --check` 通过；`node tests/smoke_dom.js` 渲染无异常；`BM.calc.compileByMethod` 9 法 + `BM.calc.decomposeMonthly`（12 项和=年度额）+ `BM.calc.applyReduction` 全部单测通过（见 `tests/test_calc.js`）。

### 2. 费控 Excel 导入入口（M8 集成层 · D4 单向导入）· P1
- **预览路径**：`http://localhost:8123/?as=finance#importView`
- **设计要点**
  - 五步流程条（下载模板 → 上传 → 映射/对账 → 错误修正 → 导入预算追踪）。
  - 模板下载：前端生成 CSV（含 BOM）并 Blob 下载，列 = 费控导出规范（公司代码/部门/科目/经济事项/金额/日期/供应商/类型/说明）。
  - 上传解析：CSV 走 `FileReader` 真解析；Excel 一期不接（用内置样例模拟，明确提示）。
  - 映射/对账：`reconcile()` 按组织字典映射部门/科目，检测「部门未匹配/科目未匹配/金额非法/金额缺失」，确定性输出可映射行数、错误行数、可导入金额。
  - 错误行提示表 + 导入按钮（存在错误行时禁用），避免脏数据进入追踪。
- **改动文件**：`views/import-view.js`（新建）、`styles/views.css`
- **单测结果**：`node --check` 通过；烟囱测试默认样例对账生成无异常；`reconcile` 逻辑由样例 8 行（4 正常 + 4 异常）验证。

### 3. 审批中心（审批流视图增强）
- **预览路径**：`http://localhost:8123/?as=boss#approval` / `?as=finance#approval` / `?as=manager#approval`
- **设计要点**
  - 顶部 Tab（待审/已审/全部）+ 角色范围说明（全集团 / 本部门 / 我发起的申请），按 `a.status==="pending"` 过滤。
  - 审批卡片 `renderApprovalCard` 沿用既有结构，新增角色相关范围提示，体现「按角色过滤」差异化。
- **改动文件**：`views/approval.js`（增强）
- **单测结果**：`node --check` 通过；既有结构未破坏。

### 4. AI 风险筛查视图（M7 · 提示非判定）· P2
- **预览路径**：`http://localhost:8123/?as=boss#riskView`
- **设计要点**
  - KPI 汇总（`BM.calc.riskSummary`）：筛查对象数、高/中风险数、建议可压降合计（确定性统计）。
  - 风险卡片：异常类型 + 风险等级徽标、原因、基线、建议金额（确定性计算，标注偏差%）、置信度条、可追溯证据链。
  - 人工复核「采纳/驳回」→ 写入审计留痕（`BM.reviewRisk`，M10 闭环）；等级 + 公司双筛选（部门经理默认归口厦门三安 2010）。
  - 严格遵循 D3：模型只解释与候选，建议金额来自确定性计算，不替代人工判定。
- **改动文件**：`views/risk-view.js`（新建）、`core/calc.js`、`core/state.js`、`data/data.js`
- **单测结果**：`node --check` 通过；烟囱测试风险卡片/置信度/证据/复核生成无异常；`BM.calc.riskLevel`/`riskSummary` 单测通过（样例 6 项：高 2 / 中 3 / 低 1，建议可压降 80.0 万）。

### 5. 角色工作台差异化（角色默认视图 + 导航 + 提示）
- **预览路径**：`http://localhost:8123/?as=staff`（默认进 `#compile`）/ `?as=manager` / `?as=finance` / `?as=boss`
- **设计要点**
  - `BM.roleViews(role)` 扩展：boss/finance 拥有全部 14 个视图；manager/staff 聚焦 `compile` + `riskView`（员工默认首屏 = 编制工作台）。
  - `BM.defaultView()`：员工 → `compile`，其余 → `wb-home`。
  - `BM.NAV_LABELS` 增补 `compile/importView/riskView`；`ROLE_HINTS` 增补三个新视图的按角色提示语。
  - 工作台首页（`wb-home`）新增「全部工作台」导航网格（`wb-nav-grid`），既作为移动端 ≤860px 的隐藏顶栏的主入口，也作为桌面端次级导航。
- **改动文件**：`core/state.js`、`app.js`、`views/workbench.js`、`data/data.js`、`styles/views.css`
- **单测结果**：`node --check` 通过；角色视图数组经脚本核验正确（boss 14 项、staff 6 项）。

### 6. 智能调参复用组件（M5 滑块调参 + 实时结果）
- **预览路径**：`http://localhost:8123/?as=boss#collisionTune`（本体） / 嵌套于 `#compile` 压降试算
- **设计要点**
  - 抽取 `BM.renderReductionTune(container, {subject, baseline, apply, onApply})` 可嵌入组件，复用 M5 即时反馈模式：左滑块（申报额/压降比率）、右实时 KPI（压降幅度/压降后金额/与基线差异额）+ 两条差异条 + 共识判定提示。
  - 底层统一走 `BM.calc.tuneNegotiation` / `tuneBounds`（确定性纯函数），已在 `tests/test_calc.js` 覆盖。
  - 编制工作台「压降参数试算」直接挂载该组件，确认后写回对应经济事项申报额。
- **改动文件**：`views/tune.js`（新建）、`views/compile.js`、`styles/views.css`
- **单测结果**：`node --check` 通过；烟囱测试渲染与实时结果区生成无异常。

### 7. 移动端核查（≤860px 可查看 / 可操作）
- **预览路径**：浏览器窗口收窄至 ≤860px，或移动视口访问任意 `#<视图>` 深链
- **设计要点**
  - 复用桌面 `BM` 与数据/状态/计算内核，无需独立 `mobile/` 工程；所有新视图在窄屏可渲染可操作。
  - 基础响应式（`base.css` `@media(max-width:860px)`）：布局转纵向、Copilot 面板降至 46vh、顶栏横排菜单隐藏。
  - 新增「全部工作台」导航网格（顶栏隐藏时的主入口），保证移动端可切换到任意视图。
  - `styles/views.css` 补充：九法网格、月度分解 12 格（≤860px 转 4 列）、压降组件网格转单列、风险卡片标签换行、宽表 `tbl-wrap` 横向滚动（base.css 已 `overflow:auto`，移动端强化 `overflow-x`）。
- **改动文件**：`styles/views.css`、`views/workbench.js`
- **单测结果**：静态校验通过；交互路径在烟囱测试中覆盖渲染层。

---

## 二、后端接口 TODO 清单（一期不接，前端仅采集/展示，全部以 `TODO` 标注）

| 模块 | 位置 | 待接入后端接口 | 说明 |
|---|---|---|---|
| 编制工作台 | `views/compile.js` 提交分支 / `core/state.js#compileSaveDraft` | `POST /api/budget-cycles/{id}/compile`（保存编制草稿/提交汇总） | 草稿建议后端持久化；提交后触发财务汇总与审批流 |
| 费控导入 | `views/import-view.js#renderResult` 导入按钮 | `POST /api/actual/import` `{rows: 已映射行}` | 后端按五维+月度归集对齐预算口径，写入 M8 执行跟踪并触发超标预警；真实 xlsx 解析在后端 |
| 费控导入 | 上传分支 | `GET /api/actual/sample`（可选） | 一期用内置样例；二期可改由后端拉取费控导出样例 |
| AI 风险筛查 | `core/state.js#reviewRisk` | `POST /api/risk-screening/{id}/review` `{decision, note}` | 复核结论（采纳/驳回）写入 M10 审计：谁/何时/旧值/新值/证据 |
| 审批中心 | `views/approval.js`（沿用） | `GET /api/approvals?scope=` + `POST /api/approvals/{id}/decide` | 待审/已审按角色 scope 过滤；审批动作回流 |
| 调参/压降 | `views/tune.js` `onApply` | `POST /api/budget/reduction`（可选） | 压降方案确认后如需留痕可上报 |

> 前端所有金额/比率/风险等级/可压降额均来自确定性纯函数（`core/calc.js`），不依赖后端即可复算；后端仅负责持久化与真实数据源接入。

---

## 三、已知限制 / 后续建议

### 已知限制
1. **数据源为 mock**：编制基线、风险筛查、费控样例均为本地假数据（`BM.RULES`/`BM.RISK_SCREENING`/样例 8 行），未接真实费控/预算系统。
2. **Excel 解析未接**：导入入口仅对 CSV 真解析，`.xlsx/.xls` 一期模拟（用样例），真实解析与模板校验由后端完成。
3. **零报错验证方式**：通过 `node --check` + 自建 DOM 桩烟囱测试（`tests/smoke_dom.js`）验证渲染/计算无运行时异常；未接入真实无头浏览器（环境无 Chromium），建议上线前用浏览器 DevTools Console 复检一次。
4. **无独立 mobile 工程**：移动端依赖桌面响应式（`≤860px`），未建立独立 `mobile/` 应用；若需原生壳或离线能力需另立项。
5. **审批/编制流转为本地模拟**：提交后仅切换状态与 Toast，未打通真实审批链与多级汇总。

### 后续建议
1. 后端就上方 TODO 清单提供契约（字段/状态码），前端移除 `TODO` 标注并接 `fetch`；建议先接 `POST /api/actual/import` 与 `/api/risk-screening/{id}/review`（价值最高）。
2. 编制工作台增加「按部门批量填报 + 汇总对比」与「版本快照」，支撑目标二追踪。
3. 风险视图接入真实模型输出时，保持「建议金额确定性计算 + 模型仅解释」的 D3 边界，避免前端出现不可解释数字。
4. 移动端建议补充底部 Tabbar + 关键操作手势，提升现场核查体验（可复用现有 `BM` 内核）。
5. 加 CI：PR 触发 `node --check` + `test_calc.js` + `smoke_dom.js`，保证回归零报错。

---

## 四、验证总览

- `node --check`（全部 25 个 JS 文件）：✅ 通过
- `node tests/test_calc.js`：✅ 16/16 通过（tuneNegotiation + 编制/分解/压降/风险）
- `node tests/smoke_dom.js`：✅ 渲染/交互/计算零运行时异常（含 4 个新视图）
- 新增/改动文件：`views/compile.js`、`views/import-view.js`、`views/risk-view.js`、`views/tune.js`、`views/approval.js`、`views/workbench.js`、`core/calc.js`、`core/state.js`、`data/data.js`、`app.js`、`styles/views.css`、`tests/test_calc.js`、`tests/smoke_dom.js`
