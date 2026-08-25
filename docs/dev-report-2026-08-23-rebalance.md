# 三安光电 AI 费用预决算管理系统 · 范围再平衡交付（2026-08-23）

> 撰写：PM（Buddy）
> 收件：Sponsor（松哥）
> 性质：导航收敛 + 看板合并 + 对标权限门禁（覆盖昨晚三点提议 + 今早约束）
> 运行：浏览器 `http://localhost:8123/`（静态根 `website/`），`?as=<角色>` + `#<视图>` 深链直达
> 服务：8123 HTTP 200（背景进程 iKPv5Y）

---

## 一、Sponsor 定稿的产品结构

| # | 核心功能 | 视图 | 入口 |
|---|---------|------|------|
| 工作台 | **首页**（功能导航 + 预算业务提醒窗口） | `wb-home` | 默认首屏 |
| 1 | **新预算编制**（含预算控制的方法 / 控制基线） | `compile` | 工作台导航卡 / 顶栏 |
| 2 | **预算看板**（预算总览 / 预算执行进展 / 偏差预警） | `kanban` | 工作台导航卡 / 顶栏 |
| 3 | **财务规则**（各级财务部门） | `rules` | 工作台导航卡 / 顶栏 |

> 导航从 14 视图 + 首页 **收敛到 3 功能 + 首页**。原"审批/决策/计划/调整/碰撞/导入/总览/追踪/决算/风险/对标"等视图不再作为独立导航项——其中**对标并入看板·总览面板、决算并入看板·执行进展面板、风险并入看板·偏差预警面板**，由看板统一承载。

---

## 二、对标权限门禁（按"只能给更高一级的领导或部门"）

- 看板·总览面板内，对标子面板**仅集团层可见**（`boss / ceo / finance / cooLead / cooAnalyst`）。
- 同级（兄弟单位）/ 下级**看不到**对标面板，显示 `🔒 横向对标仅对直接上级（集团层）开放，同级 / 下级不可查看`。
- 谓词：`BM.canViewBenchmark(roleId)`（`core/state.js`），单点控制。

---

## 三、关键改动文件

| 文件 | 改动 |
|------|------|
| `core/state.js` | `roleViews` 收敛为 3 功能 + 首页；新增 `canViewBenchmark` 谓词；`NAV_LABELS` 加 `kanban`、compile 改"新预算编制" |
| `app.js` | `VIEWS` 注册表加 `kanban: BM.renderKanban` |
| `index.html` | 加载 `views/kanban.js`（在风险视图之后） |
| `views/kanban.js` | **新建**——看板视图，组合 dashboard / benchmark / track / final / risk-view，零重复逻辑 |
| `views/workbench.js` | 首页重写：核心功能导航卡（3 张）+ 预算业务提醒窗口（编制 / 偏差 / 执行(对标)） |
| `views/dashboard.js` | 自渲染回调改回渲到传入容器（避免嵌入看板时跳脱框架） |
| `views/final.js` | 同上（确认决算回渲到容器） |
| `styles/views.css` | 新增 `kb-*` 看板样式 + `wn-title/wn-sub` 导航卡样式 |
| `tests/smoke_kanban.js` | **新建**——看板渲染冒烟（DOM 桩） |

---

## 四、回归总览（全绿）

| 项目 | 命令 | 结果 |
|------|------|------|
| 语法 | `node --check` × 9 文件 | ✅ 9/9 OK |
| 确定性引擎 | `node tests/test_calc.js` | ✅ 16/16 |
| 原有烟囱 | `node tests/smoke_dom.js` | ✅ 12/12 零异常 |
| **看板烟囱**（新） | `node tests/smoke_kanban.js` | ✅ 4/4（boss 含对标 / expense 锁定 / 谓词 / 导航收敛） |
| 本地服务 | `curl http://127.0.0.1:8123/` | ✅ HTTP 200 |
| **真机渲染** | Playwright Chromium 截图 | ✅ 3 张视觉验证（见下） |

---

## 五、真机视觉证据（Playwright）

### ① 工作台首页 · 基层费用责任岗（expense）
![首页](output/rebalance-2026-08-23-home-expense.png)
- 顶栏导航已收敛为 4 项（工作台首页 / 新预算编制 / 预算看板 / 财务规则）
- 「核心功能」3 张导航卡 + 「预算业务提醒」窗口（编制进行中 / 执行超标预警）
- 旧的"全部工作台 / 运营监控中枢 / 编制季"已移除

### ② 看板 · 总经理（boss · 上级）
![看板对标](output/rebalance-2026-08-23-kanban-boss-benchmark.png)
- 看板总览渲染正常（公司·科目预算）
- **清晰显示「横向对标（仅上级可见）」面板**（8 家子公司 · 集团均值 93.4 万 · 最高 132.0 万 · 最低 69.0 万）

### ③ 看板 · 基层费用责任岗（expense · 锁定）
![看板锁定](output/rebalance-2026-08-23-kanban-expense-locked.png)
- 看板总览渲染正常（项目视角）
- **显示「🔒 横向对标仅对直接上级（集团层）开放，同级 / 下级不可查看」锁定提示**
- 紧接着"预算执行进展"面板

---

## 六、预览

- 工作台首页：`http://localhost:8123/?as=expense`
- 看板（上级）：`http://localhost:8123/?as=boss#kanban`
- 看板（基层·锁定）：`http://localhost:8123/?as=expense#kanban`
- 编制：`http://localhost:8123/?as=expense#compile`
- 财务规则：`http://localhost:8123/?as=finance#rules`

---

## 七、未尽事项（待 Sponsor 拍板）

1. V1 设计稿要不要同步加一节"对标权限门禁"（我之前在状态续报里备的草稿还没落）
2. 后端 agent（M7 风险 / 压降）启动仍待 Sponsor 决定
3. 看板三面板中的 track / final / risk-view / dashboard 是直接复用，文件未删——要不要归档到 `archive/views/`（保持代码库精简）？还是先留档可回滚？
