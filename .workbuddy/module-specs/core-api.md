# 模块规格：core/api.js（前端统一请求层 · 共享内核）

## 1. 职责（单一）
- 这个模块只负责：前端到后端的 **HTTP 请求统一封装 + 认证令牌管理 + 会话过期处理**。
  - `apiLogin(username, password, cb)`：真实登录，调 `POST /api/auth/login`，写回 user/token/role/loggedIn。
  - `apiFetch(path, opts)`：统一 fetch，自动带 `Authorization: Bearer`；查 res.ok；401 统一触发会话过期；非 2xx reject 错误体；204/空体返回 null。
  - `apiGet(path)` / `apiSend(path, method, body)`：GET / POST·PUT·DELETE JSON 便捷封装。
  - `handleSessionExpired()`：401 统一处理（登出 + 回登录页 + 提示）。
  - `logout()`：登出，清认证态 + 通知后端。
- 不属于它的（明确排除）：业务状态（预算/审批/编制等，属 state.js）；纯计算（calc.js）；视图渲染（renderLogin/toast 晚绑定）；工具函数（el/esc/money，属 utils.js）。

## 2. 是否独立（限界上下文）
- [x] 独立共享模块（shared kernel）
- 独立理由/复用方：被 **桌面端**（`website/index.html`）与 **移动端**（`website/mobile/index.html`）共同复用；认证/请求语义会独立演进（换认证方式、加拦截器不影响调用方）。
- 现状问题：统一请求层错误地耦合在桌面 `core/state.js` 里，导致移动端（加载自己的 `mobile/core/state.js`）缺失 `apiLogin/apiGet/apiSend`，登录即崩（`BM.apiLogin is not a function`）。这是「共享内核未显式化」的违规。

## 3. 依赖入（我 FROM 谁）
| 被引入方 | 引入的符号 | 是否越层 | 是否反向（下层引上层） |
|---|---|---|---|
| window.BM（state.js 挂载） | BM.state（仅认证字段 token/user/role/loggedIn） | 否 | 否 |
| state.js | BM.saveState | 否 | 否 |
| view 层（晚绑定） | BM.renderLogin、BM.toast | 否 | 否（运行时才绑定，避免 core 反向依赖 view） |

- 加载顺序：api.js 在 state.js 之后加载（依赖 BM.state / BM.saveState 就绪）。

## 4. 依赖出（谁 FROM 我）
- 预期调用方：桌面各 view（basedata/rules/accounts/compile/unit-inbox/unit-summary/ai-config/monthly-split/roleSwitch 等）、桌面 app.js（notifications/copilot/auth-me）、移动端（login.js / app.js）。
- 扇出可控：仅经 `BM.apiGet` / `BM.apiSend` / `BM.apiLogin` / `BM.logout` 四个入口。

## 5. 共享资源（耦合最高来源，必须最小化）
- 数据库文件：无（不直接 connect，经 HTTP 走后端）。
- 共享表 / 配置：无。
- 全局状态：有 —— `BM.state`（**仅读写认证字段** token/user/role/loggedIn，不碰业务字段 approvals/plan/rules 等）。

## 6. 目标耦合度
- [x] 松（Loose）

## 7. 解耦措施
- 通过 `BM.state` 访问认证字段，不依赖 state.js 的闭包 `state` 变量（抽离后无闭包可用，需显式改引用）。
- `BM.renderLogin` / `BM.toast` 晚绑定（运行时取全局函数），避免 core 反向依赖 view 层。
- 从桌面 `core/state.js` 删除同名函数，消除双份实现（单一真源）。
