/* ================================================================
 * server/middleware/error.js — 统一 async 错误处理（P0-1 防单进程崩溃）
 *
 * 背景：Node 15+ 对 async 路由中 reject 且未捕获的 Promise 会触发
 *   unhandled rejection，直接崩掉单进程一体化服务。
 * 本模块消除该风险：
 *   - asyncHandler(fn)：包装 async 路由回调，reject 时 next(err)，
 *     交由全局错误中间件兜底，避免每次手写 try/catch 漏写。
 *   - errorMiddleware：4 参全局错误中间件（Express 按 arity 识别），
 *     统一返回 500 JSON，console.error 记录 stack，不泄漏内部细节。
 * 依赖：仅 Express 中间件约定，不依赖 db / dbm / 任何业务模块。
 * ================================================================ */

/* 包装 async 回调：fn 返回的 Promise reject → next(err) 交给全局中间件 */
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/* 4 参全局错误中间件：只兜「漏网」错误（正常 4xx 响应不会走到这里） */
function errorMiddleware(err, req, res, next) {
  console.error(
    "[error] 未捕获异常 | " + req.method + " " + req.originalUrl + "\n" +
    (err && err.stack ? err.stack : String(err))
  );
  if (res.headersSent) return next(err); /* 响应已发出 → 交给 Express 默认处理 */
  res.status(500).json({ error: "服务器内部错误，请稍后重试" });
}

module.exports = { asyncHandler, errorMiddleware };
