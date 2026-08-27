# 模块规格：汇总平衡视图（balance.js）

- 日期：2026-08-27
- 模块路径：`website/views/balance.js`
- 样式路径：`website/styles/v02.css`（`.bal-*` / `.balance-table*` / `.wb-hero-card`）

## 1. 职责（单一）
展示「上级领导收到下级提交的预算后」所做的汇总平衡工作台：
- 汇总编制总额、偏高项数、偏高金额、刚性占比等 KPI；
- 按「规则4 弹性分类 + 规则2/6 偏离度」对下级提交的预算项做排序与平衡建议；
- 提供弹性分类筛选、建议压降标记、确认下发等交互。

本模块只负责**汇总平衡的呈现与轻量交互**，不处理编制保存、月度拆分、规则编辑。

## 2. 是否独立
是。从原 `compile.js` 中的「上级平衡预览」面板独立出来，成为独立视图 `balance`，由工作台/顶部导航进入。

## 3. 依赖入（是否越层·反向）
- `BM.buildCompileSource()` ← `website/views/compile.js`（同级视图层，非反向）。
- `BM.budgetAdvice()` / `BM.adviceDeviation()` / `BM.money()` ← `website/data/data.js`（数据层，向下依赖，正常）。
- `BM.renderRoleHint()` / `BM.openView()` / `BM.toast()` ← `website/core/` 与 `website/app.js`（基础设施，正常）。

无反向依赖（无核心层/数据层依赖本视图）。

## 4. 依赖出（扇出）
- `compile.js`：复用其 `buildCompileSource()`，避免重复构造经济事项数据源。
- `data.js`：预算建议、偏离度计算、金额格式化。
- `app.js` / `core/state.js`：视图路由、角色可见性、导航标签。
- `workbench.js`：工作台入口卡（`BM.openView("balance")`）。

扇出适中，全部为已存在的稳定依赖。

## 5. 共享资源
- 经济事项数据源：`BM.eventsData`（后端 API）或 `BM.RULES` 派生的 mock 列表，通过 `BM.buildCompileSource()` 统一访问。
- 弹性分类字典 `BAL_ELASTIC`：本模块内部维护，与 `compile.js` 原字典一致；后续若规则引擎暴露弹性分类，可改为读取 `BM.RULES` 元数据。
- 样式复用：`.badge`、`.hint-text`、`.page-title` 等全局原子类；`.bl-tip` 沿用原平衡预览提示样式。

## 6. 目标耦合度
松耦合。视图仅读取数据与调用已有工具函数，不修改共享状态；标记「建议压降」为纯前端演示状态，不下发持久化。

## 7. 解耦措施
- 不直接读取 `BM.eventsData` 或 `BM.RULES`，统一走 `BM.buildCompileSource()`，由 compile 视图负责数据源构造细节。
- 平衡计算逻辑（`buildBalanceRows`）封装在视图内部，不暴露给外部；若后续需要服务端汇总，可整体替换为 API 调用而不影响页面结构。
- 工作台入口卡通过 `BM.openView("balance")` 跳转，不直接操作 DOM。
- 顶部导航可见性由 `core/state.js` 的 `roleViews()` 统一控制，不硬编码在视图内。
