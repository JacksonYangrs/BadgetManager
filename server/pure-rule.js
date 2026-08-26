/* ================================================================
 * pure-rule.js — 规则基线 / AI 建议 确定性纯函数
 * 抽离自 server/db.js，与 website/data/data.js 的 BM.applyRule /
 * BM.calc.compileByMethod 同一合同口径（规则基线因子一致）。
 * 抽出的目的：无需 node:sqlite 即可被单元测试 require（与 server/pure-calc.js 同思路）。
 * 因子来源：
 *   - 默认 HARDCODED_FACTORS（与前端 BM.applyRule 的 RULES 因子完全一致）；
 *   - DB 驱动的 active 规则版本因子经 compileBaseline/aiSuggestion 的 factors 参数注入
 *     （server/db.js 传入 RULE_FACTORS；无 active 版本时取 null → 回退 HARDCODED_FACTORS）。
 * ================================================================ */
const HARDCODED_FACTORS = { down5: 0.95, canteen: 0.97, dorm: 0.90, revenue: 0.98, green: 0.92, actual: 1.0, volume: 0.98, qtyPrice: 0.92, history: 1.0, manual: 1.0 };
const EXEC_RATE = { down5: 0.95, canteen: 0.97, dorm: 0.9, revenue: 0.98, green: 0.92, actual: 1 };

function resolveFactor(type, factors) {
  if (factors && factors[type] != null) return factors[type];
  if (HARDCODED_FACTORS[type] != null) return HARDCODED_FACTORS[type];
  return 1;
}

function applyRuleBase(type, lastYear, factors) {
  const ly = lastYear || 0;
  return Math.round(ly * resolveFactor(type, factors));
}

/* 控制基线：按上级定义方法 */
function compileBaseline(method, type, lastYear, factors) {
  const ly = lastYear || 0;
  if (method === "manageStd") return applyRuleBase(type, ly, factors);
  if (method === "volume") return Math.round(ly * 0.98);
  if (method === "qtyPrice") return Math.round(ly * 0.92);
  if (method === "history" || method === "manual") return ly;
  return applyRuleBase(type, ly, factors);
}

/* AI 建议：lo/hi/mid + 依据（与前端 BM.aiSuggestion 一致） */
function aiSuggestion(cat, type, lastYear, factors) {
  const base = compileBaseline("manageStd", type, lastYear, factors);
  const lo = Math.round(base * 0.9);
  const hi = Math.round(base * 1.05);
  const mid = Math.round((lo + hi) / 2);
  const execRate = lastYear != null ? (EXEC_RATE[type] != null ? EXEC_RATE[type] : 1) : null;
  return {
    lo, hi, mid,
    policy: "预算政策：规则基线（" + (lastYear != null ? Math.round(((base / lastYear) - 1) * 1000) / 10 + "% 相对上年" : "据实申报") + "）",
    basis: lastYear != null ? "往年预算：" + lastYear + "（上年决算）" : "往年预算：无历史",
    exec: execRate != null ? "上年执行：执行率约 " + Math.round(execRate * 100) + "%" : "上年执行：—",
  };
}

module.exports = { HARDCODED_FACTORS, EXEC_RATE, resolveFactor, applyRuleBase, compileBaseline, aiSuggestion };
