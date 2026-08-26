/* ================================================================
 * ai-budget-decision.js — AI 预算决策分析模块
 * 职责：对经济事项产出 lo/hi/mid 建议 + 依据（你说的「预算决策分析」）。
 * 当前走确定性规则口径（与前端 BM.aiSuggestion 一致）；
 * AI 接入（ai-gateway）落地后，可由大模型直出建议，此处改为调用 ai-gateway。
 * 依赖：规则因子来自 rules 模块（loadActiveFactors 刷新）。
 * ================================================================ */
const { aiSuggestion: pureAiSuggestion } = require("../pure-rule");
const rules = require("./rules");

/* 预算建议：lo/hi/mid + 依据。因子取自当前 active 规则版本（无则回退 pure-rule 硬编码）。 */
function aiSuggestion(cat, type, lastYear) {
  return pureAiSuggestion(cat, type, lastYear, rules.getRuleFactors());
}

/* 后续升级点（不破坏现有确定性口径）：
 *   const gw = require("./ai-gateway");
 *   async function aiSuggestionLLM(cat, type, lastYear) {
 *     const r = await gw.chatCompletion([{ role: "user", content: `...` }]);
 *     return JSON.parse(r.content); // 模型直出 lo/hi/mid
 *   } */
module.exports = { aiSuggestion };
