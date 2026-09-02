# 模块规格：frontend-utils（前端共享工具内核 + 统一请求层）

## 0. 背景与结论速览
前端为经典 vanilla JS（无框架/无构建/无模块系统），全部代码挂在 `window.BM`，
靠 `website/index.html` 的 `<script>` 标签顺序加载。评审发现两类问题：
1. `el` / `esc` / `money` / `fmtMoney` 在约 30 个 view 里重复定义，靠后加载覆盖先加载才不炸；`esc` 不转义 `"` `'`。
2. 多处 `fetch` 不查 `res.ok`，401/500 错误体被当成功数据渲染。

本规格定义两个共享内核模块的边界与依赖，作为 P0-2 / P0-3 加固的落点。

---

## 1. 模块 A：`website/core/utils.js`（唯一工具模块）

### 1.1 职责（单一）
- 只负责：DOM 创建 `el`、HTML 转义 `esc`、金额格式化 `money` / `fmtMoney`。
- 明确排除（不属于它）：业务计算（属 `core/calc.js`）、状态管理（属 `core/state.js`）、
  网络请求（属 `core/state.js` 的统一请求层，见 §2）、角色提示（属 `core/role-hint.js`）。

### 1.2 是否独立（限界上下文）
- [x] 独立共享内核（core 层）
- 独立理由：被全部桌面端 view + 移动端 view + role-hint.js + app.js 复用，是显式共享内核；
  与领域逻辑无耦合，纯函数、无状态、无网络。

### 1.3 依赖入（我 FROM 谁）
| 被引入方 | 引入的符号 | 是否越层 | 是否反向 |
|---|---|---|---|
| 无（仅依赖浏览器全局 `document` / `String` / `Number`） | — | 否 | 否 |

### 1.4 依赖出（谁 FROM 我）
- 所有 `views/*.js`（30+）、`core/role-hint.js`、`app.js`、`mobile/views/*.js`、`mobile/app.js`。
- 提供两类入口：全局函数 `el` / `esc` / `money` / `fmtMoney`（兼容既有裸调用），
  及 `BM.el` / `BM.esc` / `BM.money` / `BM.fmtMoney`（显式命名空间）。
- 扇出较大但属工具类预期；通过「全局 + BM 双挂载」避免改动所有调用点。

### 1.5 共享资源（耦合来源，必须最小化）
- 全局状态：仅向 `window.BM` 追加 4 个函数引用；不读写任何共享可变状态。
- 无数据库 / 无配置表 / 无 localStorage。

### 1.6 目标耦合度
- [x] 松（Loose）

### 1.7 关键实现约束
- `esc` 必须完整转义 `& < > " '`（顺序：`&` 优先，再 `<` `>` `"` `'`），并对 `null`/`undefined` 返回空串。
- `money` / `fmtMoney` 沿用 state.js 既有口径（亿/万缩写，`fmtMoney = "¥" + money`），保持两端一致。
- 加载顺序：`utils.js` 必须在 `core/state.js`、`core/role-hint.js`、所有 view 之前加载（见 §3）。

---

## 2. 模块 B：统一请求层（落点 `website/core/state.js`）

> 说明：请求层不新建独立文件，而是作为 `state.js` 的职责（状态 + 认证 + 网络同属一个限界上下文）。

### 2.1 职责（单一）
- 只负责：统一 fetch 封装 `BM.apiFetch` / `BM.apiGet` / `BM.apiSend`，
  以及 401 会话过期统一处理 `BM.handleSessionExpired`。
- 明确排除：具体业务数据组装（由各 view 的 `.then` 处理）。

### 2.2 是否独立
- [ ] 独立包/层
- [x] 现有模块（`core/state.js`）的私有内部部分；`BM.logout` / `state.token` 已在其中。

### 2.3 依赖入
| 被引入方 | 引入的符号 | 是否越层 | 是否反向 |
|---|---|---|---|
| 浏览器 `fetch` | fetch | 否 | 否 |
| 自身 `state.token` / `BM.logout` | 同文件 | 否 | 否 |
| 运行时（晚绑定）`BM.renderLogin` / `BM.toast` | 回调 | 否 | 否 |

### 2.4 依赖出
- 预期调用方：`views/*.js`、`app.js`、`data/data.js`。扇出可控（仅替换不查 `res.ok` 的裸 fetch）。

### 2.5 共享资源
- 全局状态：401 时调用 `BM.logout()` 清 `state.token`/`state.loggedIn`；不直接改其它状态。

### 2.6 目标耦合度
- [x] 松

### 2.7 关键实现约束（不破坏现有功能）
- `res.ok === false` → reject（非 2xx 一律不进数据渲染分支）。
- `res.status === 401` → 额外触发 `BM.handleSessionExpired()`（登出 + 回登录页 + toast）。
- 错误体若可解析为 JSON 且含 `error`，则 reject 该对象（供调用方 toast）；否则 reject `{ error: "HTTP <status>" }`。
- 所有调用方必须保留 `.catch` 降级（异常降级交给调用方）。

---

## 3. 加载顺序（desktop + mobile 均须满足）
- **desktop `website/index.html`**：在 `data/data.js` 之后、`core/state.js` 之前插入
  `<script src="core/utils.js"></script>`（务必早于 `core/role-hint.js` 与所有 `views/*.js`）。
- **mobile `website/mobile/index.html`**：在 `data/data.js` 之后、`core/state.js`（移动端自有）之前插入
  `<script src="../core/utils.js"></script>`（复用桌面共享内核，与 `../core/calc.js` / `../core/engine.js` 一致，避免第三份漂移）。
- `core/state.js`（桌面）与 `mobile/core/state.js` 删除各自的 `money`/`fmtMoney` 定义及 `BM.money`/`BM.fmtMoney` 赋值，改由 `utils.js` 提供。

## 4. 解耦措施
- `utils.js` 零依赖、零状态，保证任何加载顺序下都可安全先行加载。
- 请求层晚绑定 `BM.renderLogin` / `BM.toast`，避免 core 层反向依赖 view 层。
