/* ================================================================
 * pure-calc.js — 后端确定性计算纯函数（无副作用，可被 Node 单测直接 require）
 * 与 website/core/calc.js 的 decomposeMonthly 共用同一份合同口径，
 * 抽离到独立模块以避免 require 后端 db.js 时触发 node:sqlite 写库。
 *
 * ⚠️ 口径纪律：本文件的 MONTHLY_WEIGHTS 必须与 website/core/calc.js 的
 *    BM.MONTHLY_WEIGHTS 完全一致（同一字面量）。tests/unit/backend-consistency.test.js
 *   的跨端口径契约测试会锁定两端一致，修改任一侧都会让 CI 变红。
 * ================================================================ */

/* 三端共享的月度分解相对权重（canonical 合同口径）。
 * 注意：是「相对权重」而非百分比，运行期按 sum 归一化，与前端 calc.js 完全一致。 */
const MONTHLY_WEIGHTS = [1.1, 0.9, 1.0, 1.0, 1.05, 1.1, 0.85, 0.9, 1.15, 1.1, 1.05, 0.8];

/* 年度额按权重分解到 12 个月（确定性）。
 * total  年度总额；weights 可选 12 项覆盖权重。
 * 返回长度 12 的整数数组，和精确 = total（残差补到第 12 月）。 */
function decomposeMonthly(total, weights) {
  total = Math.round(total || 0);
  const w = weights && weights.length === 12 ? weights : MONTHLY_WEIGHTS;
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  const base = w.map((p) => Math.floor((total * p) / sum));
  const used = base.reduce((a, b) => a + b, 0);
  base[11] += total - used; /* 残差冲正，保证和 = 总额 */
  return base;
}

module.exports = { MONTHLY_WEIGHTS, decomposeMonthly };
