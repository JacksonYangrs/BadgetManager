# 模块规格：统一 async 错误处理（server/middleware/error.js）

- 日期：2026-09-02
- 模块路径：`server/middleware/error.js`
- 同层参考：`server/middleware/auth.js`

## 1. 职责（单一）
消除「async 路由漏写 try/catch → Node 15+ unhandled rejection → 单进程服务整体崩溃」的风险：
- `asyncHandler(fn)`：包装 async 路由回调，`fn` 返回的 Promise reject 时调用 `next(err)`，把异常交给全局中间件兜底；
- `errorMiddleware(err, req, res, next)`：4 参全局错误中间件，统一返回 `500 { error }` JSON，`console.error` 记录 stack，不向客户端泄漏内部细节。

本模块只做「错误传导 + 兜底回包」，不参与业务逻辑、不解析参数、不鉴权。

## 2. 是否独立
是。与 `middleware/auth.js` 同层，是纯 Express 中间件基础设施，不依赖任何业务模块（`db`/`dbm`/`modules/*` 均不引用）。

## 3. 依赖入（是否越层·反向）
- 仅依赖 Express 中间件约定（`(req, res, next)` 签名、4 参 arity 识别错误中间件），无项目内依赖。
- 无反向依赖：业务层不会反向依赖本模块（仅 `server.js` 组合根 import）。

## 4. 依赖出（扇出）
- 仅被 `server/server.js` 组合根引用：`require("./middleware/error")` 后
  1. 用 `asyncHandler` 包装 3 个既有 async 路由回调；
  2. `app.use(errorMiddleware)` 作为全局兜底。
- 扇出为 0（被 1 处引用，自身不引用他人）。

## 5. 共享资源
- 无共享状态、无数据库句柄、无全局变量。
- `errorMiddleware` 仅写 `console.error` 日志，读取 `err.stack` 与 `req.method`/`req.originalUrl`，不修改共享状态。

## 6. 目标耦合度
零耦合（纯函数式中间件工厂）。`asyncHandler` 是通用包装器，`errorMiddleware` 是无状态兜底。

## 7. 解耦措施
- 不依赖 `db`/`dbm`，避免把错误处理与业务装配耦合，`server.js` 组合根负责注入时机（所有路由之后、`express.static` 之前）。
- 通过 `res.headersSent` 守卫：响应已发出时仅 `next(err)` 交给 Express 默认处理，不重复写响应头。
- 不泄漏内部细节：客户端仅收到固定文案，stack 只在服务端日志输出。
