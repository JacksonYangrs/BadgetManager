# AI 行政预算智能管理平台 · 手机版 Demo

> 移动端独立目录 · 纯前端 · 无后端 · 无依赖
> 设计依据：桌面版 Demo（`../`）+ [Demo 设计方案 v0.5](../../docs/product/demo-design-v0.5.md)
> 核心逻辑（数据 / 状态 / 引擎）与桌面版完全一致，保证两端表现一致

## 启动

```bash
python3 -m http.server 4175 --directory .
```

浏览器访问 `http://localhost:4175/`（建议在移动端或 DevTools 移动视口下打开）

## 一句话总结

**4 角色 × 4 底部 Tab（首页 / 预算 / 审批 / AI 助手）**——专为手机尺寸重做的交互，
桌面版「左 Copilot + 顶横排菜单」不再适用，全部改为卡片流 + 单列布局。

## 4 角色入口

| 角色 | URL |
|---|---|
| 总经理 | `?as=boss` |
| 财务经理 | `?as=finance` |
| 部门经理 | `?as=manager&dept=admin` |
| 员工 | `?as=staff` |

## 底部 Tab 导航

```text
首页 ─ 预算 ─ 审批 ─ AI 助手
```

| Tab | 内容 |
|---|---|
| **首页** | 角色欢迎 + 今日待办 + 重点项目 AI 预警 + AI 关注 |
| **预算** | 子视图 chips：预算总览 / 编制 / 追踪 / 决算 / 财务规则（财务）/ 预算调整（boss/finance） |
| **审批** | 审批中心（AI 初审 → 终审）+ 决策中心（boss/finance）+ 员工报销入口 |
| **AI 助手** | 全屏对话 + 推荐问题 + 风险卡 + 输入框 |

## 手机版 vs 桌面版

| 维度 | 桌面版 | 手机版 |
|---|---|---|
| 入口布局 | 左 Copilot + 顶横排菜单 + 右内容 | 顶栏 + 底部 4 Tab + 单列内容流 |
| 内容布局 | 双栏（左 Copilot 右工作台） | 单列卡片流 |
| 视角切换 | 顶部 Tab chips | 同（横向滚动 chips） |
| Copilot | 常驻左侧 25-30% | Tab 4 全屏 |
| 核心逻辑 | data.js + state.js + engine.js | **完全复用**（拷贝到本目录 core/data） |
| URL deep-link | `?as=boss#dashboard` | `?as=boss#budget/track`（Tab/sub） |

## 演示建议

1. **首页**：进入即看到角色欢迎 + 今日待办 + AI 预警（不滚动）
2. **预算 Tab**：横向滑动 chips 切总览/编制/追踪/决算；多视角 chips 切科目/项目/物料
3. **审批 Tab**：员工看到"发起报销"入口 + 我的申请；经理看到 AI 初审 + 终审按钮
4. **AI 助手 Tab**：默认 3 推荐问题 + 3 风险卡；输入框回车发送；卡片带证据链

## 端到端

| 文件 | 大小 | 说明 |
|---|---|---|
| `index.html` | ~1.6 KB | 顶栏 + 内容 + 底部 Tab + 弹层 |
| `styles/mobile.css` | ~14 KB | 移动端视觉系统 |
| `data/data.js` | 拷贝自桌面版 | Mock 数据（300 人企业） |
| `core/state.js` | 拷贝自桌面版 | 状态管理 + localStorage |
| `core/engine.js` | 拷贝自桌面版 | 对话引擎 + 意图解析 |
| `views/login.js` | 新写 | 4 角色卡 + 部门选择 |
| `views/home.js` | 新写 | 角色工作台首页 |
| `views/budget.js` | 新写 | 总览多视角 + 编制 + 追踪 + 决算 + 规则 + 调整 |
| `views/approval.js` | 新写 | 审批 + 决策 + 报销弹层 |
| `views/copilot.js` | 新写 | 移动端对话 + 卡片 + 证据链 |
| `app.js` | 新写 | 路由（Tab + sub）+ 登录 + 重置 + 弹层 |
| 总计 | **172 KB** / 11 个文件 |

## URL deep-link（演示/截图）

| 演示场景 | URL |
|---|---|
| 总经理首页 | `?as=boss` |
| 财务规则页 | `?as=finance#budget/rules` |
| 部门经理追踪页 | `?as=manager&dept=admin#budget/track` |
| 员工报销入口 | `?as=staff#approval` |
| Copilot 对话 | `?as=boss#copilot` |

## 兼容性

iOS Safari / Chrome Android / 微信内置浏览器；viewport-fit=cover 支持刘海屏；
底部安全区 padding 自动适配（env(safe-area-inset-bottom)）。
